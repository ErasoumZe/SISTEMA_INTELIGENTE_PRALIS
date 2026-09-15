import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sum } from "drizzle-orm";
import { campanhas, campanhasPdvs } from "@padaria/db/schema/campanhas";
import { pdvs } from "@padaria/db/schema/cadastro";
import { vendas } from "@padaria/db/schema/venda";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type CampanhaEscrita = {
  empresaId: string;
  titulo: string;
  mensagem: string;
  inicio: string;
  fim: string;
  metaValorCentavos: number;
  bonificacaoTipo: "dinheiro" | "percentual" | "recompensa";
  bonificacaoValorCentavos: number | null;
  bonificacaoTexto: string | null;
};

function valores(dados: CampanhaEscrita) {
  return {
    empresaId: dados.empresaId,
    titulo: dados.titulo,
    mensagem: dados.mensagem,
    inicio: dados.inicio,
    fim: dados.fim,
    metaValor: centavosParaDecimalBanco(dados.metaValorCentavos),
    bonificacaoTipo: dados.bonificacaoTipo,
    bonificacaoValor:
      dados.bonificacaoValorCentavos == null ? null : centavosParaDecimalBanco(dados.bonificacaoValorCentavos),
    bonificacaoTexto: dados.bonificacaoTexto
  };
}

export async function criarCampanhaRepository(
  dados: CampanhaEscrita & { criadoPor: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .insert(campanhas)
    .values({ ...valores(dados), criadoPor: dados.criadoPor })
    .returning({ id: campanhas.id });
  if (!linha) throw new Error("Campanha nao foi criada");
  return linha.id;
}

export async function atualizarCampanhaRepository(
  input: { campanhaId: string; empresaId: string; dados: CampanhaEscrita },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(campanhas)
    .set({ ...valores(input.dados), atualizadoEm: new Date() })
    .where(and(eq(campanhas.id, input.campanhaId), eq(campanhas.empresaId, input.empresaId)))
    .returning({ id: campanhas.id });
  return linha ?? null;
}

export async function atualizarStatusCampanhaRepository(
  input: { campanhaId: string; empresaId: string; status: "rascunho" | "ativa" | "encerrada" | "cancelada" },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(campanhas)
    .set({ status: input.status, atualizadoEm: new Date() })
    .where(and(eq(campanhas.id, input.campanhaId), eq(campanhas.empresaId, input.empresaId)))
    .returning({ id: campanhas.id });
  return linha ?? null;
}

/**
 * Troca a lista de PDVs inteira. Delete + insert em vez de diff: a lista e curta, a tabela e um
 * vinculo puro sem coluna propria que mereca ser preservada, e a PK composta ja impede duplicata.
 */
export async function substituirPdvsDaCampanhaRepository(
  input: { campanhaId: string; empresaId: string; pdvIds: string[] },
  db: ExecutorBanco = banco
) {
  await db.delete(campanhasPdvs).where(eq(campanhasPdvs.campanhaId, input.campanhaId));
  if (!input.pdvIds.length) return;
  await db
    .insert(campanhasPdvs)
    .values(input.pdvIds.map((pdvId) => ({ campanhaId: input.campanhaId, pdvId, empresaId: input.empresaId })));
}

export function listarCampanhasRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select()
    .from(campanhas)
    .where(eq(campanhas.empresaId, empresaId))
    .orderBy(desc(campanhas.inicio), desc(campanhas.criadoEm));
}

export async function buscarCampanhaRepository(campanhaId: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select()
    .from(campanhas)
    .where(and(eq(campanhas.id, campanhaId), eq(campanhas.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export function listarPdvsDasCampanhasRepository(campanhaIds: string[], db: ExecutorBanco = banco) {
  if (!campanhaIds.length) return Promise.resolve([]);
  return db
    .select({ campanhaId: campanhasPdvs.campanhaId, pdvId: campanhasPdvs.pdvId, pdvNome: pdvs.nome })
    .from(campanhasPdvs)
    .leftJoin(pdvs, eq(pdvs.id, campanhasPdvs.pdvId))
    .where(inArray(campanhasPdvs.campanhaId, campanhaIds));
}

/** Campanhas ATIVAS que cobrem o dia e incluem este PDV — o que o fechamento exibe. */
export function listarCampanhasDoPdvNoDiaRepository(
  input: { empresaId: string; pdvId: string; dia: string },
  db: ExecutorBanco = banco
) {
  return db
    .select({ id: campanhas.id })
    .from(campanhas)
    .innerJoin(campanhasPdvs, eq(campanhasPdvs.campanhaId, campanhas.id))
    .where(
      and(
        eq(campanhas.empresaId, input.empresaId),
        eq(campanhasPdvs.pdvId, input.pdvId),
        eq(campanhas.status, "ativa"),
        lte(campanhas.inicio, input.dia),
        gte(campanhas.fim, input.dia)
      )
    );
}

// --- Apuracao (R-197/R-198/R-199) ---------------------------------------------------------------
//
// Uma consulta, sempre AO VIVO. Nao existe tabela nem coluna de progresso: a venda do CREARE pode
// ser reenviada, trocar de caixa e ser cancelada depois, e saldo materializado exigiria uma regra de
// invalidacao que este sistema nao tem.
//
// O filtro e a R-197 literal e difere DE PROPOSITO da convencao do dinheiro do resto do projeto
// (`computar = true AND status <> 'cancelado'`): aqui o status e 'aprovado' ESTRITO, porque meta e
// bonificacao nao avancam com venda pendente de aprovacao. A divergencia esta registrada na R-197.
function filtrosDaApuracao(input: { empresaId: string; inicio: string; fim: string }) {
  return [
    eq(vendas.empresaId, input.empresaId),
    gte(vendas.dataReferencia, input.inicio),
    lte(vendas.dataReferencia, input.fim),
    // So CREARE: venda manual de retaguarda fica fora desta versao.
    isNotNull(vendas.integracaoChaveId),
    eq(vendas.computar, true),
    eq(vendas.status, "aprovado")
  ];
}

// Somamos as tres colunas separadas e combinamos no liquido em centavos, como `totaisVendas` ja faz.
// Soma e linear, entao o resultado e identico a SUM(original - desconto + acrescimo) — e evita
// expressao aritmetica no SQL.
const SOMAS = {
  somaOriginal: sum(vendas.valorOriginal),
  somaDesconto: sum(vendas.valorDesconto),
  somaAcrescimo: sum(vendas.valorAcrescimo)
};

export async function somarVendasPorPdvRepository(
  input: { empresaId: string; pdvIds: string[]; inicio: string; fim: string },
  db: ExecutorBanco = banco
) {
  if (!input.pdvIds.length) return [];
  return db
    .select({ pdvId: vendas.pdvId, ...SOMAS })
    .from(vendas)
    .where(and(...filtrosDaApuracao(input), inArray(vendas.pdvId, input.pdvIds)))
    .groupBy(vendas.pdvId);
}

/**
 * Venda do periodo SEM PDV. R-198: fica visivel para auditoria e NUNCA entra na meta — venda que
 * ninguem sabe de onde veio nao paga premio. Acontece quando o de-para do PDV do CREARE nao resolve.
 */
export async function somarVendasSemPdvRepository(
  input: { empresaId: string; inicio: string; fim: string },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select(SOMAS)
    .from(vendas)
    .where(and(...filtrosDaApuracao(input), isNull(vendas.pdvId)));
  return linha ?? { somaOriginal: null, somaDesconto: null, somaAcrescimo: null };
}
