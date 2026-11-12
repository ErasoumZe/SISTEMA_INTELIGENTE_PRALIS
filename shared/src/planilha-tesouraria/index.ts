// Envio dos relatorios do fechamento para a planilha da Tesouraria (Marco, 12/11/2026). ADITIVO: nada aqui altera o
// fechamento, os calculos ou as validacoes do caixa. So le os relatorios ja anexados (cartao PagBank e folha CREARE),
// confere a matematica do que foi lido, monta as linhas no formato das abas e grava na proxima linha livre.
import { z } from "zod";

export const MODALIDADES_CARTAO = ["CRÉDITO", "DÉBITO", "VOUCHER", "PIX"] as const;
export type ModalidadeCartao = (typeof MODALIDADES_CARTAO)[number];

export const ABA_CARTOES = "API - LANÇAMENTOS_RELATÓRIO_CARTÕES_TNP_DADOS";
export const ABA_PDV = "API - LANÇAMENTOS_RELATÓRIO_PDV_TNP_DADOS";

const dinheiro = z.number().finite();
const dinheiroOuNulo = z.number().finite().nullable();
const inteiroOuNulo = z.number().int().nonnegative().nullable();

// ---------- O que a IA le (leitura propria da planilha, separada da leitura do fechamento) ----------

export const leituraCartaoPlanilhaSchema = z.object({
  data: z.string().nullable(), // dd/mm/aaaa (data das transacoes, nao a de emissao)
  numeroSerie: z.string().nullable(),
  totalEfetivado: z.object({ transacoes: inteiroOuNulo, valor: dinheiroOuNulo }),
  modalidades: z.array(
    z.object({
      modalidade: z.enum(MODALIDADES_CARTAO),
      totalTransacoes: inteiroOuNulo,
      totalValor: dinheiroOuNulo,
      bandeiras: z.array(z.object({ bandeira: z.string(), transacoes: inteiroOuNulo, valor: dinheiroOuNulo }))
    })
  ),
  camposDuvidosos: z.array(z.string())
});
export type LeituraCartaoPlanilha = z.infer<typeof leituraCartaoPlanilhaSchema>;

export const FORMAS_PDV = ["credito", "debito", "voucher", "pix", "dinheiro", "clientes"] as const;
export type FormaPdv = (typeof FORMAS_PDV)[number];

export const leituraPdvPlanilhaSchema = z.object({
  data: z.string().nullable(), // dd/mm/aaaa (data das vendas, nao a de emissao)
  formas: z.object({
    credito: dinheiroOuNulo,
    debito: dinheiroOuNulo,
    voucher: dinheiroOuNulo,
    pix: dinheiroOuNulo,
    dinheiro: dinheiroOuNulo,
    clientes: dinheiroOuNulo
  }),
  totalImpresso: dinheiroOuNulo,
  camposDuvidosos: z.array(z.string())
});
export type LeituraPdvPlanilha = z.infer<typeof leituraPdvPlanilhaSchema>;

// ---------- Linhas das abas (o que vai para a planilha; a Tesouraria pode corrigir na previa) ----------

export const linhaCartaoSchema = z.object({
  data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/u),
  numeroSerie: z.string().min(1),
  pdv: z.string().min(1),
  modalidade: z.enum(MODALIDADES_CARTAO),
  bandeira: z.string().min(1),
  transacoes: z.number().int().nonnegative(),
  valor: dinheiro
});
export type LinhaCartao = z.infer<typeof linhaCartaoSchema>;

export const linhaPdvSchema = z.object({
  data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/u),
  pdv: z.string().min(1),
  operador: z.string().min(1),
  credito: dinheiro,
  debito: dinheiro,
  voucher: dinheiro,
  pix: dinheiro,
  dinheiro: dinheiro,
  clientes: dinheiro
});
export type LinhaPdv = z.infer<typeof linhaPdvSchema>;

export const statusConferenciaSchema = z.enum(["CONCILIADO", "DIVERGENTE", "CONFERÊNCIA NECESSÁRIA"]);
export type StatusConferencia = z.infer<typeof statusConferenciaSchema>;
export const conferenciaSchema = z.object({ status: statusConferenciaSchema, avisos: z.array(z.string()) });
export type Conferencia = z.infer<typeof conferenciaSchema>;

export const previaPlanilhaSchema = z.object({
  caixaId: z.string().uuid(),
  pdv: z.string().nullable(),
  turno: z.enum(["MANHÃ", "TARDE"]).nullable(),
  cartao: z
    .object({ linhas: z.array(linhaCartaoSchema), conferencia: conferenciaSchema, totalEfetivado: dinheiroOuNulo })
    .nullable(),
  relatorioPdv: z
    .object({ linha: linhaPdvSchema, conferencia: conferenciaSchema, totalImpresso: dinheiroOuNulo })
    .nullable(),
  avisos: z.array(z.string())
});
export type PreviaPlanilha = z.infer<typeof previaPlanilhaSchema>;

// O que a Tesouraria envia depois de conferir (e, se precisou, corrigir) a previa.
export const envioPlanilhaPayloadSchema = z.object({
  cartao: z.array(linhaCartaoSchema).max(80).nullable(),
  relatorioPdv: linhaPdvSchema.nullable()
});
export type EnvioPlanilhaPayload = z.infer<typeof envioPlanilhaPayloadSchema>;

export const resultadoAbaSchema = z.object({
  aba: z.string(),
  gravado: z.boolean(),
  linhaInicial: z.number().int().nullable(),
  linhas: z.number().int(),
  mensagem: z.string()
});
export const resultadoEnvioPlanilhaSchema = z.object({
  cartao: resultadoAbaSchema.nullable(),
  relatorioPdv: resultadoAbaSchema.nullable()
});
export type ResultadoEnvioPlanilha = z.infer<typeof resultadoEnvioPlanilhaSchema>;

// ---------- Regras puras ----------

const centavos = (valor: number) => Math.round(valor * 100);
const maiusculas = (texto: string) => texto.trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR");

/**
 * PDV da planilha: "VND CAIXA PDV - " + numero do PDV + M (manha) ou T (tarde). Vem SEMPRE do caixa em fechamento,
 * nunca da foto. Sem numero ou sem turno, nao ha PDV identificado e nada e gravado.
 */
export function rotuloPdvPlanilha(pdvNome: string | null | undefined, turno: string | null | undefined): string | null {
  const numero = pdvNome?.match(/\d+/u)?.[0];
  const sufixo = turno === "manha" ? "M" : turno === "tarde" ? "T" : null;
  if (!numero || !sufixo) return null;
  return `VND CAIXA PDV - ${Number(numero)}${sufixo}`;
}

/** "10/11/26" ou "10/11/2026" -> "10/11/2026". Outra forma: null (pede conferencia). */
export function normalizarData(texto: string | null | undefined): string | null {
  const partes = texto?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/u);
  if (!partes) return null;
  const [, dia, mes, ano] = partes;
  const anoCompleto = ano!.length === 2 ? `20${ano}` : ano!;
  return `${dia!.padStart(2, "0")}/${mes!.padStart(2, "0")}/${anoCompleto}`;
}

/** "2026-11-10" -> "10/11/2026" (data do movimento do caixa, usada so quando a foto nao deixa ler a data). */
export function dataIsoParaPlanilha(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Confere o relatorio de cartao: a soma das bandeiras bate com o total de cada modalidade (valor e transacoes) e a
 * soma das modalidades bate com o TOTAL EFETIVADO. Nunca ajusta valor para a soma fechar: so classifica.
 */
export function conferirCartao(leitura: LeituraCartaoPlanilha): Conferencia {
  const avisos: string[] = [];
  let ilegivel = leitura.camposDuvidosos.length > 0;
  if (!leitura.data) avisos.push("DATA DO RELATÓRIO NÃO LIDA.");
  if (!leitura.numeroSerie) avisos.push("NÚMERO DE SÉRIE NÃO LIDO.");
  if (!leitura.data || !leitura.numeroSerie) ilegivel = true;
  let divergente = false;
  // Com bandeira ilegivel a soma fica incompleta: comparar com o total viraria "divergente" por falta de leitura.
  let modalidadeIncompleta = false;
  let somaValor = 0;
  let somaTransacoes = 0;
  for (const modalidade of leitura.modalidades) {
    const valores = modalidade.bandeiras.map((b) => b.valor);
    const transacoes = modalidade.bandeiras.map((b) => b.transacoes);
    if (valores.some((v) => v === null) || transacoes.some((t) => t === null)) {
      ilegivel = true;
      modalidadeIncompleta = true;
      avisos.push(`${modalidade.modalidade}: BANDEIRA COM VALOR OU QUANTIDADE ILEGÍVEL.`);
      continue;
    }
    const somaBandeiras = valores.reduce<number>((soma, v) => soma + centavos(v!), 0);
    const somaQtd = transacoes.reduce<number>((soma, t) => soma + t!, 0);
    somaValor += somaBandeiras;
    somaTransacoes += somaQtd;
    if (modalidade.totalValor !== null && somaBandeiras !== centavos(modalidade.totalValor)) {
      divergente = true;
      avisos.push(`${modalidade.modalidade}: SOMA DAS BANDEIRAS DIFERENTE DO SUBTOTAL.`);
    }
    if (modalidade.totalTransacoes !== null && somaQtd !== modalidade.totalTransacoes) {
      divergente = true;
      avisos.push(`${modalidade.modalidade}: QUANTIDADE DE TRANSAÇÕES DIFERENTE DO SUBTOTAL.`);
    }
  }
  const total = leitura.totalEfetivado;
  if (total.valor === null || total.transacoes === null) {
    ilegivel = true;
    avisos.push("TOTAL EFETIVADO NÃO LIDO.");
  } else if (!modalidadeIncompleta) {
    if (somaValor !== centavos(total.valor)) {
      divergente = true;
      avisos.push("SOMA DAS MODALIDADES DIFERENTE DO TOTAL EFETIVADO.");
    }
    if (somaTransacoes !== total.transacoes) {
      divergente = true;
      avisos.push("QUANTIDADE TOTAL DE TRANSAÇÕES DIFERENTE DO TOTAL EFETIVADO.");
    }
  }
  if (leitura.camposDuvidosos.length) avisos.push(`CONFERIR: ${leitura.camposDuvidosos.map(maiusculas).join(", ")}.`);
  return { status: divergente ? "DIVERGENTE" : ilegivel ? "CONFERÊNCIA NECESSÁRIA" : "CONCILIADO", avisos };
}

/** Confere o relatorio do PDV: CREDITO + DEBITO + VOUCHER + PIX + DINHEIRO + CLIENTES = TOTAL impresso. */
export function conferirPdv(leitura: LeituraPdvPlanilha): Conferencia {
  const avisos: string[] = [];
  const valores = FORMAS_PDV.map((forma) => leitura.formas[forma]);
  let ilegivel = leitura.camposDuvidosos.length > 0 || !leitura.data || valores.some((v) => v === null);
  if (!leitura.data) avisos.push("DATA DAS VENDAS NÃO LIDA.");
  if (valores.some((v) => v === null)) avisos.push("FORMA DE PAGAMENTO ILEGÍVEL.");
  let divergente = false;
  if (leitura.totalImpresso === null) {
    ilegivel = true;
    avisos.push("TOTAL IMPRESSO NÃO LIDO.");
  } else if (!valores.some((v) => v === null)) {
    const soma = valores.reduce<number>((total, v) => total + centavos(v!), 0);
    if (soma !== centavos(leitura.totalImpresso)) {
      divergente = true;
      avisos.push("SOMA DAS FORMAS DIFERENTE DO TOTAL IMPRESSO.");
    }
  }
  if (leitura.camposDuvidosos.length) avisos.push(`CONFERIR: ${leitura.camposDuvidosos.map(maiusculas).join(", ")}.`);
  return { status: divergente ? "DIVERGENTE" : ilegivel ? "CONFERÊNCIA NECESSÁRIA" : "CONCILIADO", avisos };
}

type BandeiraLida = { modalidade: ModalidadeCartao; bandeira: string; transacoes: number; valor: number };

function bandeirasLidas(leitura: LeituraCartaoPlanilha): BandeiraLida[] {
  return leitura.modalidades.flatMap((modalidade) =>
    modalidade.bandeiras.map((b) => ({
      modalidade: modalidade.modalidade,
      bandeira: maiusculas(b.bandeira),
      transacoes: b.transacoes ?? 0,
      valor: b.valor ?? 0
    }))
  );
}

/**
 * TARDE (Marco, 12/11/2026): a maquininha e a mesma nos dois turnos e o relatorio da tarde vem acumulado do dia. A
 * tarde grava, por bandeira, ACUMULADO MENOS A MANHA (valor e transacoes). Bandeira que nao mexeu a tarde nao gera
 * linha; diferenca negativa e impossivel e pede conferencia.
 */
export function subtrairManha(
  acumulado: LeituraCartaoPlanilha,
  manha: LeituraCartaoPlanilha
): { bandeiras: BandeiraLida[]; avisos: string[] } {
  const daManha = new Map(bandeirasLidas(manha).map((b) => [`${b.modalidade}|${b.bandeira}`, b]));
  const avisos: string[] = [];
  const bandeiras: BandeiraLida[] = [];
  for (const b of bandeirasLidas(acumulado)) {
    const anterior = daManha.get(`${b.modalidade}|${b.bandeira}`);
    const valor = (centavos(b.valor) - centavos(anterior?.valor ?? 0)) / 100;
    const transacoes = b.transacoes - (anterior?.transacoes ?? 0);
    if (valor < 0 || transacoes < 0) {
      avisos.push(`${b.modalidade} ${b.bandeira}: TARDE MENOR QUE A MANHÃ.`);
      continue;
    }
    if (valor === 0 && transacoes === 0) continue;
    bandeiras.push({ ...b, valor, transacoes });
  }
  for (const chave of daManha.keys()) {
    if (!bandeirasLidas(acumulado).some((b) => `${b.modalidade}|${b.bandeira}` === chave)) {
      avisos.push(`${chave.replace("|", " ")}: ESTÁ NO RELATÓRIO DA MANHÃ, MAS FALTA NO ACUMULADO.`);
    }
  }
  return { bandeiras, avisos };
}

export function linhasCartao(
  bandeiras: BandeiraLida[],
  contexto: { data: string; numeroSerie: string; pdv: string }
): LinhaCartao[] {
  return bandeiras.map((b) => ({
    data: contexto.data,
    numeroSerie: maiusculas(contexto.numeroSerie),
    pdv: contexto.pdv,
    modalidade: b.modalidade,
    bandeira: maiusculas(b.bandeira),
    transacoes: b.transacoes,
    valor: b.valor
  }));
}

export function bandeirasDaLeitura(leitura: LeituraCartaoPlanilha): BandeiraLida[] {
  return bandeirasLidas(leitura);
}

/** Linhas como vao para a planilha (colunas F em diante), texto em MAIUSCULAS e numero como numero. */
export function celulasCartao(linha: LinhaCartao): Array<string | number> {
  return [
    linha.data,
    maiusculas(linha.numeroSerie),
    maiusculas(linha.pdv),
    linha.modalidade,
    maiusculas(linha.bandeira),
    linha.transacoes,
    linha.valor
  ];
}
export function celulasPdv(linha: LinhaPdv): Array<string | number> {
  return [
    linha.data,
    maiusculas(linha.pdv),
    maiusculas(linha.operador),
    linha.credito,
    linha.debito,
    linha.voucher,
    linha.pix,
    linha.dinheiro,
    linha.clientes
  ];
}

/** Chave de duplicidade: o mesmo registro nao entra duas vezes (cartao: data+serie+pdv+modalidade+bandeira). */
export function chaveCartao(celulas: ReadonlyArray<string | number>): string {
  return celulas
    .slice(0, 5)
    .map((c) => maiusculas(String(c)))
    .join("|");
}
/** PDV: um registro por data + PDV (o turno ja esta no PDV, ex.: 2T). */
export function chavePdv(celulas: ReadonlyArray<string | number>): string {
  return celulas
    .slice(0, 2)
    .map((c) => maiusculas(String(c)))
    .join("|");
}
