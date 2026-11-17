import type {
  AlinhamentoPeriodoFolhaCreare,
  ConferenciaEmissaoFolhaCreare,
  ConferenciaInicioFolhaCreare,
  MotivoSemAlinhamentoFolhaCreare
} from "@padaria/shared";

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
    correcaoManual?: { justificativa: string; campos: string[] } | null;
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
      // A folha do CREARE nao registra sangria nem suprimento: so exibe, nunca compara (Marco, 11/11/2026).
      { chave: "sangria", rotulo: "Sangria", compara: false, negativo: true },
      { chave: "saldoFinalDinheiro", rotulo: "Saldo Final Dinheiro", compara: false }
    ]
  }
];

export const CAMPOS_VALOR_FOLHA_CREARE = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos.map((c) => c.chave));

// Leitura (e correcoes do operador) por anexo, enquanto a pagina estiver aberta: voltar para a etapa Vendas
// nao chama a IA de novo nem apaga o que o operador corrigiu.
export const leiturasFolhaCreareEmMemoria = new Map<
  string,
  { leitura: LeituraFolhaCreare; sugestao: SugestaoFolhaCreare | null }
>();

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
export function leituraParaEnvio(
  leitura: LeituraFolhaCreare,
  sugestao: SugestaoFolhaCreare | null,
  correcao: { justificativa: string; campos: string[] } | null = null
) {
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
    observacoes: sugestao?.observacoes ?? [],
    // Mudou numero lido pela IA: vai a justificativa; senao mantem a correcao ja registrada.
    correcaoManual: correcao ?? sugestao?.correcaoManual ?? null
  };
}

/** Rotulos dos numeros travados (lidos pela IA) que o operador mudou depois de "Corrigir manualmente". */
export function camposAlteradosFolha(leitura: LeituraFolhaCreare, sugestao: SugestaoFolhaCreare | null): string[] {
  if (!sugestao) return [];
  const lida = leituraDaSugestao(sugestao);
  return numerosTravados(sugestao)
    .filter((chave) => {
      const negativo = chave === "sangria" || chave === "saldoFinalDinheiro";
      const atual = numeroDoCampoFolha(leitura[chave], negativo);
      const original = numeroDoCampoFolha(lida[chave], negativo);
      // A sangria vale com ou sem o sinal ("-600,00" e "600,00" sao o mesmo valor).
      if (chave === "sangria") return Math.abs(atual ?? Number.NaN) !== Math.abs(original ?? Number.NaN);
      return atual !== original;
    })
    .map(rotuloCampoFolha);
}

const MOTIVOS_SEM_ALINHAMENTO: Record<MotivoSemAlinhamentoFolhaCreare, string> = {
  sem_horario: "a hora não foi lida na folha",
  outro_dia: "a data da folha é de outro dia",
  no_futuro: "a hora da folha está no futuro",
  antes_do_caixa_anterior: "invadiria o caixa anterior deste PDV",
  depois_do_proximo_caixa: "invadiria o próximo caixa deste PDV",
  fim_antes_do_inicio: "o período ficaria invertido"
};

/**
 * R-244 · o que dizer quando um lado do periodo nao pode seguir a folha (o outro pode ter seguido).
 * Vazio quando os dois lados vieram da folha.
 */
export function avisoAlinhamentoFolhaCreare(alinhamento: AlinhamentoPeriodoFolhaCreare | null | undefined) {
  if (!alinhamento) return "";
  const lados = [
    { nome: "O início", lado: alinhamento.inicio },
    { nome: "O fim", lado: alinhamento.fim }
  ].filter(({ lado }) => lado && !lado.daFolha && lado.motivo);
  return lados
    .map(({ nome, lado }) => `${nome} ficou no horário do sistema: ${MOTIVOS_SEM_ALINHAMENTO[lado.motivo!]}.`)
    .join(" ");
}

/** O que o relatorio de vendas grava da folha; lido no Relatorio final. */
export type FolhaCreareGerada = {
  leitura?: Partial<SugestaoFolhaCreare>;
  comparacao: Partial<Record<CampoValorFolhaCreare, SituacaoComparacaoCreare>>;
  pralis?: Partial<Record<CampoValorFolhaCreare, number>>;
  somaFormasConfereTotal?: boolean | null;
  horario?: { inicio: ConferenciaInicioFolhaCreare; emissao: ConferenciaEmissaoFolhaCreare };
  /** R-244 (relatorios gerados desde 16/11/2026). */
  alinhamento?: AlinhamentoPeriodoFolhaCreare & { vendasAnexadas?: number; vendasDesanexadas?: number };
};

const ROTULOS_DATAS: Record<string, string> = {
  dataEmissao: "Data da emissão",
  periodoInicio: "Período de",
  periodoFim: "Período até",
  nomeLoja: "Nome da loja"
};

/** Rotulo do cupom para um campo da leitura (ex.: "saldoFinalDinheiro" -> "Saldo Final Dinheiro"). */
export function rotuloCampoFolha(chave: string) {
  const campo = GRUPOS_FOLHA_CREARE.flatMap((grupo) => grupo.campos).find((item) => item.chave === chave);
  return campo?.rotulo ?? ROTULOS_DATAS[chave] ?? chave;
}

/** Numeros que a IA leu com seguranca: ficam travados na tela (o resto o operador digita). */
export function numerosTravados(sugestao: SugestaoFolhaCreare | null): CampoValorFolhaCreare[] {
  if (!sugestao?.documentoLegivel) return [];
  return CAMPOS_VALOR_FOLHA_CREARE.filter(
    (chave) => sugestao[chave] !== null && sugestao[chave] !== undefined && !sugestao.camposDuvidosos.includes(chave)
  );
}
