import type { ConferenciaEmissaoFolhaCreare, ConferenciaInicioFolhaCreare } from "@padaria/shared";

// R-225 · a folha "Relatorio de Venda Geral" do CREARE, na ordem e com os rotulos impressos no cupom.
// `compara`: a linha tem equivalente no Pralis e e conferida em centavos; as outras so sao exibidas.

export type CampoValorFolhaCreare =
  | "trocoInicial"
  | "saldoInicial"
  | "clientes"
  | "credito"
  | "debito"
  | "dinheiro"
  | "pix"
  | "voucher"
  | "total"
  | "despesas"
  | "sangria"
  | "saldoFinalDinheiro";
export type CampoDataFolhaCreare = "dataEmissao" | "periodoInicio";
export type SituacaoComparacaoCreare = "ok" | "pendente" | "divergente";

export type LeituraFolhaCreare = Record<CampoValorFolhaCreare | CampoDataFolhaCreare, string>;
export type SugestaoFolhaCreare = Record<CampoValorFolhaCreare, number | null> &
  Record<CampoDataFolhaCreare | "periodoFim" | "nomeLoja", string | null> & {
    documentoLegivel: boolean;
    camposDuvidosos: string[];
    observacoes: string[];
  };

export const GRUPOS_FOLHA_CREARE: ReadonlyArray<{
  titulo: string;
  campos: ReadonlyArray<{ chave: CampoValorFolhaCreare; rotulo: string; compara: boolean; negativo?: boolean }>;
}> = [
  {
    titulo: "Abertura",
    campos: [
      { chave: "trocoInicial", rotulo: "Troco Inicial", compara: true },
      { chave: "saldoInicial", rotulo: "Saldo Inicial", compara: false }
    ]
  },
  {
    titulo: "Forma pagamento",
    campos: [
      { chave: "clientes", rotulo: "CLIENTES (VND/TRANS)", compara: false },
      { chave: "credito", rotulo: "CREDITO (VND/TRANS)", compara: true },
      { chave: "debito", rotulo: "DEBITO (VND/TRAN)", compara: true },
      { chave: "dinheiro", rotulo: "DINHEIRO (VND)", compara: true },
      { chave: "pix", rotulo: "PIX (VND/TRANS)", compara: true },
      { chave: "voucher", rotulo: "VOUCHER (VND/TRANS)", compara: true },
      { chave: "total", rotulo: "Total", compara: true }
    ]
  },
  {
    titulo: "Saídas e saldo",
    campos: [
      { chave: "despesas", rotulo: "Despesas", compara: true },
      { chave: "sangria", rotulo: "Sangria", compara: true, negativo: true },
      { chave: "saldoFinalDinheiro", rotulo: "Saldo Final Dinheiro", compara: false }
    ]
  }
];

export const CAMPOS_VALOR_FOLHA_CREARE = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos.map((c) => c.chave));

export function leituraFolhaCreareVazia(): LeituraFolhaCreare {
  const leitura = { dataEmissao: "", periodoInicio: "" } as LeituraFolhaCreare;
  for (const chave of CAMPOS_VALOR_FOLHA_CREARE) leitura[chave] = "";
  return leitura;
}

function formatarValor(valor: number | null) {
  return valor === null ? "" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function leituraDaSugestao(sugestao: SugestaoFolhaCreare): LeituraFolhaCreare {
  const leitura = leituraFolhaCreareVazia();
  for (const chave of CAMPOS_VALOR_FOLHA_CREARE) leitura[chave] = formatarValor(sugestao[chave]);
  leitura.dataEmissao = sugestao.dataEmissao ?? "";
  leitura.periodoInicio = sugestao.periodoInicio ?? "";
  return leitura;
}

/** "1.234,56" ou "1234.56" -> 1234.56. Aceita o sinal so onde o cupom pode imprimir negativo. */
export function numeroDoCampoFolha(valor: string, aceitaNegativo = false) {
  const texto = valor.trim().replace(/^R\$\s*/u, "");
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;
  return aceitaNegativo || numero >= 0 ? numero : null;
}

/** Corpo `leituraCreare` do POST do relatorio, a partir do que o operador revisou na tela. */
export function leituraParaEnvio(leitura: LeituraFolhaCreare, sugestao: SugestaoFolhaCreare | null) {
  const valores = Object.fromEntries(
    CAMPOS_VALOR_FOLHA_CREARE.map((chave) => {
      // A sangria sai impressa como "-R$ 600,00": o operador pode digitar com ou sem o sinal.
      if (chave === "sangria") {
        const sangria = numeroDoCampoFolha(leitura[chave], true);
        return [chave, sangria === null ? null : Math.abs(sangria)];
      }
      return [chave, numeroDoCampoFolha(leitura[chave], chave === "saldoFinalDinheiro")];
    })
  );
  return {
    documentoLegivel: sugestao?.documentoLegivel ?? true,
    nomeLoja: sugestao?.nomeLoja ?? null,
    dataEmissao: leitura.dataEmissao.trim() || null,
    periodoInicio: leitura.periodoInicio.trim() || null,
    periodoFim: sugestao?.periodoFim ?? null,
    ...valores,
    camposDuvidosos: sugestao?.camposDuvidosos ?? [],
    observacoes: sugestao?.observacoes ?? []
  };
}

/** Quando a folha nao bate com o inicio e o ajuste nao cabe na janela, o que dizer ao operador. */
export function avisoInicioFolhaCreare(conferencia: ConferenciaInicioFolhaCreare | null) {
  if (!conferencia || conferencia.situacao !== "divergente" || conferencia.sugestaoInicio) return "";
  if (conferencia.motivoSemSugestao === "depois_da_abertura_oficial") {
    return "A folha do CREARE começa depois da abertura do caixa no sistema. Confira se é a folha deste turno.";
  }
  if (conferencia.motivoSemSugestao === "outro_dia")
    return "A data da folha do CREARE é de outro dia. Confira a folha.";
  return "A folha do CREARE começa mais de 60 minutos antes da abertura no sistema. Fale com a gerência.";
}

/** O que o relatorio de vendas (versao 4) grava da folha; lido no Relatorio final. */
export type FolhaCreareGerada = {
  leitura?: Partial<SugestaoFolhaCreare>;
  comparacao: Partial<Record<CampoValorFolhaCreare, SituacaoComparacaoCreare>>;
  pralis?: Partial<Record<CampoValorFolhaCreare, number>>;
  somaFormasConfereTotal?: boolean | null;
  horario?: { inicio: ConferenciaInicioFolhaCreare; emissao: ConferenciaEmissaoFolhaCreare };
};
