import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contas, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
import { transferencias } from "@padaria/db/schema/transferencia";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

// R-231 · transferencia sem lacre a caminho de um caixa: `suprimento` sem lacre, presa ao caixa do PDV de destino e
// ainda pendente. E o MESMO predicado em todas as consultas abaixo — lista, trava do fechamento, resolucao e a
// guarda da conferencia/edicao —, senao a tela poderia mostrar uma pendencia que o fechamento nao enxerga (ou o
// contrario). O retorno final do fechamento tambem nasce sem lacre e com caixa, mas e `retorno` e vai para o Cofre:
// por isso o tipo E o destino entram no predicado.
const semLacrePendente = and(
  eq(transferencias.status, "pendente"),
  eq(transferencias.tipo, "suprimento"),
  isNull(transferencias.nLacreDoc)
);

function recebimentoSemLacrePendente(caixaId: string, pdvContaId: string) {
  return and(eq(transferencias.caixaId, caixaId), eq(transferencias.contaDestinoId, pdvContaId), semLacrePendente);
}

// Guarda da conferencia comum e da edicao: esta linha e recebimento sem lacre (so o operador do Caixa resolve)?
export async function ehRecebimentoSemLacrePendenteRepository(transferenciaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .innerJoin(fechamentosCaixa, eq(fechamentosCaixa.id, transferencias.caixaId))
    .innerJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .where(
      and(eq(transferencias.id, transferenciaId), eq(transferencias.contaDestinoId, pdvs.contaId), semLacrePendente)
    )
    .limit(1);
  return Boolean(linha);
}

// R-028 · quem enviou o dinheiro nao confirma (nem recusa) o proprio envio.
export async function buscarRemetenteDoRecebimentoRepository(transferenciaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ criadoPor: transferencias.criadoPor })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1);
  return linha?.criadoPor ?? null;
}

const origem = alias(contas, "recebimento_origem");

export async function listarRecebimentosSemLacreRepository(
  caixaId: string,
  pdvContaId: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: transferencias.id,
      valor: transferencias.valorOriginal,
      valorEspecie: transferencias.valorEspecieDeclarado,
      valorMoedas: transferencias.valorMoedasDeclarado,
      origemNome: origem.nome,
      enviadoPorNome: perfisUsuarios.nome,
      enviadoEm: transferencias.criadoEm,
      observacao: textoDoMovimento(transferencias)
    })
    .from(transferencias)
    .innerJoin(origem, eq(origem.id, transferencias.contaOrigemId))
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, transferencias.criadoPor))
    .where(recebimentoSemLacrePendente(caixaId, pdvContaId))
    .orderBy(asc(transferencias.criadoEm), asc(transferencias.id));
}

export async function existeRecebimentoSemLacrePendenteRepository(
  caixaId: string,
  pdvContaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(recebimentoSemLacrePendente(caixaId, pdvContaId))
    .limit(1);
  return Boolean(linha);
}

// Confirmar (vira entrada do caixa) ou "Nao recebi" (cancela; a origem volta a ter o valor, porque cancelada nao
// conta como saida). O predicado atomico garante que so uma das duas acoes vence, mesmo com dois cliques.
export async function resolverRecebimentoSemLacreRepository(
  input: {
    transferenciaId: string;
    caixaId: string;
    pdvContaId: string;
    recebido: boolean;
    usuarioId: string;
    agora: Date;
  },
  tx: TransacaoBanco
) {
  const [linha] = await tx
    .update(transferencias)
    .set(
      input.recebido
        ? {
            status: "recebido",
            dataRecebimento: input.agora,
            confirmadoPor: input.usuarioId,
            atualizadoEm: input.agora
          }
        : // `transferencias_cancelamento_check`: quem, quando e por que andam juntos.
          {
            status: "cancelada",
            canceladoPor: input.usuarioId,
            canceladoEm: input.agora,
            motivoCancelamento: "Não recebido no PDV (transferência sem lacre)",
            atualizadoEm: input.agora
          }
    )
    .where(
      and(
        eq(transferencias.id, input.transferenciaId),
        recebimentoSemLacrePendente(input.caixaId, input.pdvContaId),
        or(isNull(transferencias.criadoPor), ne(transferencias.criadoPor, input.usuarioId))
      )
    )
    .returning({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      valor: transferencias.valorOriginal,
      criadoPor: transferencias.criadoPor
    });
  return linha ?? null;
}
