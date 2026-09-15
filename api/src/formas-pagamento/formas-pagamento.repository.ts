import { and, asc, eq, inArray } from "drizzle-orm";
import { contas, formasPagamento, regrasRecebimento } from "@padaria/db/schema/cadastro";
import type {
  DisponibilidadeRoteamento,
  RegraRecebimentoPayload,
  RoteamentoDaForma
} from "@padaria/shared/formas-pagamento";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

// Projecao CONDICIONAL (R-176 / doc 32 §13): as colunas de roteamento carregam id de CONTA, e a
// listagem e liberada tambem para `relatorio_vendas_visualizar` e `entradas_visualizar` — o operador
// de caixa precisa do NOME da forma no detalhe da venda, nao do destino do dinheiro. Sem este corte,
// o id da conta financeira vazaria para quem so pode ver entradas.
export async function listarFormasPagamentoRepository(escopoEmpresas: string[], incluirRoteamento: boolean) {
  const colunasBase = {
    id: formasPagamento.id,
    empresaId: formasPagamento.empresaId,
    nome: formasPagamento.nome
  };
  const colunas = incluirRoteamento
    ? {
        ...colunasBase,
        adquirente: formasPagamento.adquirente,
        usaContaDoPdv: formasPagamento.usaContaDoPdv,
        contaRecebivelId: formasPagamento.contaRecebivelId,
        contaFinalId: formasPagamento.contaFinalId,
        disponibilidade: formasPagamento.disponibilidade,
        atualizadoPor: formasPagamento.atualizadoPor
      }
    : colunasBase;

  return banco
    .select(colunas)
    .from(formasPagamento)
    .where(inArray(formasPagamento.empresaId, escopoEmpresas))
    .orderBy(asc(formasPagamento.nome));
}

// Roteamento atual de UMA forma, para o guard comparar antes/depois. Escopado pela empresa: sem
// isso, um id de outra empresa serviria de sonda para descobrir se a forma existe.
export async function buscarRoteamentoDaFormaRepository(
  id: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<RoteamentoDaForma | null> {
  const [linha] = await db
    .select({
      adquirente: formasPagamento.adquirente,
      usaContaDoPdv: formasPagamento.usaContaDoPdv,
      contaRecebivelId: formasPagamento.contaRecebivelId,
      contaFinalId: formasPagamento.contaFinalId,
      disponibilidade: formasPagamento.disponibilidade
    })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.id, id), eq(formasPagamento.empresaId, empresaId)))
    .limit(1);
  if (!linha) return null;
  return { ...linha, disponibilidade: linha.disponibilidade as DisponibilidadeRoteamento | null };
}

// Roteamento das formas de UMA empresa, indexado por id — o que a ingestao le para decidir o destino
// de cada pagamento. Uma consulta por venda, nunca uma por pagamento.
export async function buscarRoteamentosDaEmpresaRepository(
  empresaId: string,
  formaIds: string[],
  db: ExecutorBanco = banco
): Promise<Map<string, RoteamentoDaForma>> {
  const unicas = [...new Set(formaIds.filter(Boolean))];
  if (!unicas.length) return new Map();
  const linhas = await db
    .select({
      id: formasPagamento.id,
      adquirente: formasPagamento.adquirente,
      usaContaDoPdv: formasPagamento.usaContaDoPdv,
      contaRecebivelId: formasPagamento.contaRecebivelId,
      contaFinalId: formasPagamento.contaFinalId,
      disponibilidade: formasPagamento.disponibilidade
    })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.empresaId, empresaId), inArray(formasPagamento.id, unicas)));

  return new Map(
    linhas.map((linha) => [
      linha.id,
      {
        adquirente: linha.adquirente,
        usaContaDoPdv: linha.usaContaDoPdv,
        contaRecebivelId: linha.contaRecebivelId,
        contaFinalId: linha.contaFinalId,
        disponibilidade: linha.disponibilidade as DisponibilidadeRoteamento | null
      }
    ])
  );
}

// Quais das contas informadas realmente pertencem a empresa. Existe para o cadastro responder 400
// dizendo o que esta errado, em vez de deixar a FK COMPOSTA estourar 23503 e virar erro tecnico
// sanitizado. A FK continua sendo a ultima porta — esta checagem e a primeira.
export async function contasDaEmpresaRepository(
  contaIds: string[],
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<Set<string>> {
  const unicas = [...new Set(contaIds.filter(Boolean))];
  if (!unicas.length) return new Set();
  const linhas = await db
    .select({ id: contas.id })
    .from(contas)
    .where(and(eq(contas.empresaId, empresaId), inArray(contas.id, unicas)));
  return new Set(linhas.map((linha) => linha.id));
}

export async function listarRegrasRecebimentoRepository(formaPagamentoId: string, empresaId: string) {
  return banco
    .select({
      id: regrasRecebimento.id,
      parcelasDe: regrasRecebimento.parcelasDe,
      parcelasAte: regrasRecebimento.parcelasAte,
      taxaPercentual: regrasRecebimento.taxaPercentual,
      taxaFixa: regrasRecebimento.taxaFixa,
      prazoDias: regrasRecebimento.prazoDias,
      status: regrasRecebimento.status,
      fonteReferencia: regrasRecebimento.fonteReferencia,
      observacao: regrasRecebimento.observacao,
      vigenciaInicio: regrasRecebimento.vigenciaInicio,
      vigenciaFim: regrasRecebimento.vigenciaFim,
      criadoEm: regrasRecebimento.criadoEm,
      atualizadoEm: regrasRecebimento.atualizadoEm
    })
    .from(regrasRecebimento)
    .where(and(eq(regrasRecebimento.formaPagamentoId, formaPagamentoId), eq(regrasRecebimento.empresaId, empresaId)))
    .orderBy(asc(regrasRecebimento.criadoEm));
}

export async function formaPagamentoExisteRepository(id: string, empresaId: string): Promise<boolean> {
  const [forma] = await banco
    .select({ id: formasPagamento.id })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.id, id), eq(formasPagamento.empresaId, empresaId)))
    .limit(1);
  return Boolean(forma);
}

export async function salvarRegraRecebimentoRepository(input: {
  id?: string;
  empresaId: string;
  formaPagamentoId: string;
  regra: RegraRecebimentoPayload;
  usuarioId: string | null;
}) {
  const valores = {
    parcelasDe: input.regra.parcelasDe ?? null,
    parcelasAte: input.regra.parcelasAte ?? null,
    taxaPercentual: input.regra.taxaPercentual == null ? null : String(input.regra.taxaPercentual),
    taxaFixa: input.regra.taxaFixa == null ? null : String(input.regra.taxaFixa),
    prazoDias: input.regra.prazoDias ?? null,
    status: input.regra.status ?? "rascunho",
    fonteReferencia: input.regra.fonteReferencia ?? null,
    observacao: input.regra.observacao ?? null,
    vigenciaInicio: input.regra.vigenciaInicio ?? null,
    vigenciaFim: input.regra.vigenciaFim ?? null
  };
  if (input.id) {
    const atualizadas = await banco
      .update(regrasRecebimento)
      .set({ ...valores, atualizadoEm: new Date() })
      .where(
        and(
          eq(regrasRecebimento.id, input.id),
          eq(regrasRecebimento.formaPagamentoId, input.formaPagamentoId),
          eq(regrasRecebimento.empresaId, input.empresaId)
        )
      )
      .returning({ id: regrasRecebimento.id });
    return atualizadas[0] ?? null;
  }
  const [criada] = await banco
    .insert(regrasRecebimento)
    .values({
      empresaId: input.empresaId,
      formaPagamentoId: input.formaPagamentoId,
      criadoPor: input.usuarioId,
      ...valores
    })
    .returning({ id: regrasRecebimento.id });
  return criada;
}

export async function salvarFormaPagamentoRepository(
  input: {
    id?: string;
    empresaId: string;
    nome: string;
    // Ausente = o chamador NAO esta mexendo em roteamento. Nao e o mesmo que "limpar o roteamento":
    // um PUT sem a permissao dedicada preserva o que ja estava gravado, em vez de zerar o destino do
    // dinheiro em silencio.
    roteamento?: RoteamentoDaForma;
    atualizadoPor?: string | null;
  },
  db: ExecutorBanco = banco
) {
  const camposRoteamento = input.roteamento
    ? {
        adquirente: input.roteamento.adquirente,
        usaContaDoPdv: input.roteamento.usaContaDoPdv,
        contaRecebivelId: input.roteamento.contaRecebivelId,
        contaFinalId: input.roteamento.contaFinalId,
        disponibilidade: input.roteamento.disponibilidade,
        // Trilha da R-176: quem mudou o destino do dinheiro. So e escrito quando o roteamento muda —
        // renomear a forma nao reescreve o autor da decisao financeira.
        atualizadoPor: input.atualizadoPor ?? null
      }
    : {};

  if (input.id) {
    await db
      .update(formasPagamento)
      .set({ nome: input.nome, atualizadoEm: new Date(), ...camposRoteamento })
      .where(and(eq(formasPagamento.id, input.id), eq(formasPagamento.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(formasPagamento)
    .values({ empresaId: input.empresaId, nome: input.nome, ...camposRoteamento })
    .returning({ id: formasPagamento.id });
  return criada;
}
