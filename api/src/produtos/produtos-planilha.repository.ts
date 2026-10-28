import { and, asc, count, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { produtosPlanilhaSincronizacoes } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * Fila (outbox) do espelho na planilha — porte de `product_sheet_sync` + `ReenvioSheetsService` do app
 * oficial (R-222), com a espera gravada em `proxima_tentativa_em` (padrao do ERP) e o contador zerado no
 * sucesso: no oficial ele contava a vida inteira do produto e um produto editado 8 vezes desistia na
 * primeira falha seguinte.
 */
export const TETO_TENTATIVAS_PLANILHA = 8;
/** Espera depois da n-esima falha seguida (oficial): 1, 2, 4, 8... ate 60 minutos. */
export const esperaEmMinutos = (tentativas: number): number => Math.min(2 ** Math.max(0, tentativas - 1), 60);

export type AlvoDaPlanilha = { empresaId: string; produtoId: string } | { produtoBaseId: string };

const doAlvo = (alvo: AlvoDaPlanilha) =>
  "produtoBaseId" in alvo
    ? eq(produtosPlanilhaSincronizacoes.produtoBaseId, alvo.produtoBaseId)
    : eq(produtosPlanilhaSincronizacoes.produtoId, alvo.produtoId);

/** Marca o produto como pendente de espelho (mesma transacao da gravacao). Repetir nao duplica. */
export async function registrarPendenciaRepository(
  tx: ExecutorBanco,
  alvo: AlvoDaPlanilha,
  destino: { planilhaId: string; aba: string }
): Promise<void> {
  const atualizados = await tx
    .update(produtosPlanilhaSincronizacoes)
    .set({ status: "pendente", proximaTentativaEm: null, atualizadoEm: new Date(), ...destino })
    .where(doAlvo(alvo))
    .returning({ id: produtosPlanilhaSincronizacoes.id });
  if (atualizados.length) return;
  await tx
    .insert(produtosPlanilhaSincronizacoes)
    .values({
      ...("produtoBaseId" in alvo
        ? { produtoBaseId: alvo.produtoBaseId }
        : { empresaId: alvo.empresaId, produtoId: alvo.produtoId }),
      ...destino
    })
    .onConflictDoNothing();
}

/** Quem esta na vez: pendente ou falhou, abaixo do teto e com a espera vencida. */
export async function filaDaPlanilhaRepository(limite: number) {
  return banco
    .select()
    .from(produtosPlanilhaSincronizacoes)
    .where(
      and(
        inArray(produtosPlanilhaSincronizacoes.status, ["pendente", "falhou"]),
        lt(produtosPlanilhaSincronizacoes.tentativas, TETO_TENTATIVAS_PLANILHA),
        or(
          isNull(produtosPlanilhaSincronizacoes.proximaTentativaEm),
          lte(produtosPlanilhaSincronizacoes.proximaTentativaEm, new Date())
        )
      )
    )
    .orderBy(asc(produtosPlanilhaSincronizacoes.atualizadoEm))
    .limit(limite);
}

/**
 * So conclui se a pendencia NAO mudou desde que foi lida: uma edicao no meio do reenvio volta a linha para
 * `pendente` (novo `atualizado_em`) e ela precisa sair de novo na proxima rodada. `lidoEm` vem do banco em
 * milissegundos; o `+1ms` cobre os microssegundos que o JS nao enxerga.
 */
const semMudancaDesde = (id: string, lidoEm: Date) =>
  and(
    eq(produtosPlanilhaSincronizacoes.id, id),
    lt(produtosPlanilhaSincronizacoes.atualizadoEm, new Date(lidoEm.getTime() + 1))
  );

export async function marcarSincronizadoRepository(id: string, linha: number | null, lidoEm: Date): Promise<void> {
  await banco
    .update(produtosPlanilhaSincronizacoes)
    .set({
      status: "sincronizado",
      tentativas: 0,
      ultimoErro: null,
      proximaTentativaEm: null,
      linha,
      sincronizadoEm: new Date(),
      atualizadoEm: new Date()
    })
    .where(semMudancaDesde(id, lidoEm));
}

export async function marcarFalhaRepository(
  id: string,
  tentativasAntes: number,
  erro: string,
  lidoEm: Date
): Promise<void> {
  const tentativas = tentativasAntes + 1;
  await banco
    .update(produtosPlanilhaSincronizacoes)
    .set({
      status: "falhou",
      tentativas,
      ultimoErro: erro.slice(0, 500),
      proximaTentativaEm: new Date(Date.now() + esperaEmMinutos(tentativas) * 60_000),
      atualizadoEm: new Date()
    })
    .where(semMudancaDesde(id, lidoEm));
}

/** Quem bateu no teto volta para a fila (acao manual do administrador). */
export async function reanimarDesistidosRepository(): Promise<number> {
  const reanimados = await banco
    .update(produtosPlanilhaSincronizacoes)
    .set({ tentativas: 0, proximaTentativaEm: null, atualizadoEm: new Date() })
    .where(
      and(
        inArray(produtosPlanilhaSincronizacoes.status, ["pendente", "falhou"]),
        gte(produtosPlanilhaSincronizacoes.tentativas, TETO_TENTATIVAS_PLANILHA)
      )
    )
    .returning({ id: produtosPlanilhaSincronizacoes.id });
  return reanimados.length;
}

export async function resumoDaFilaRepository() {
  const linhas = await banco
    .select({ status: produtosPlanilhaSincronizacoes.status, total: count() })
    .from(produtosPlanilhaSincronizacoes)
    .groupBy(produtosPlanilhaSincronizacoes.status);
  const [desistidos] = await banco
    .select({ total: count() })
    .from(produtosPlanilhaSincronizacoes)
    .where(
      and(
        inArray(produtosPlanilhaSincronizacoes.status, ["pendente", "falhou"]),
        gte(produtosPlanilhaSincronizacoes.tentativas, TETO_TENTATIVAS_PLANILHA)
      )
    );
  return {
    porStatus: Object.fromEntries(linhas.map((linha) => [linha.status, Number(linha.total)])),
    desistidos: Number(desistidos?.total ?? 0)
  };
}
