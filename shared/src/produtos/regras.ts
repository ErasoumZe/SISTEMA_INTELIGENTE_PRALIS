/**
 * Regras puras de precificacao/descricao de produto — porte das regras validadas do Pralis
 * (ver PROJECT_BRAIN 62_PRALIS_CADASTRO_PRODUTOS.md). Funcoes PURAS, sem I/O:
 * o front usa para preview ao vivo; a API usa para gravar/validar.
 *
 * Convencoes do dominio:
 *  - margem em FRACAO (0.30 = 30%).
 *  - preco de venda usa CUSTO UNITARIO (custo da caixa / quantidade da caixa).
 *  - preco de venda final aplica promocao por dia da semana + janela de horario.
 *  - preco calculado aqui e REFERENCIA de catalogo (as vendas seguem do CREARE).
 */

export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round((Number(valor) || 0) * fator) / fator;
}

export interface CalcularPrecoVendaEntrada {
  /** Liga o calculo automatico; se false, usa `precoManual`. */
  auto: boolean;
  /** Custo da caixa/embalagem. */
  custo: number;
  /** Quantidade de unidades por caixa (qtCad). */
  quantidadeCaixa: number;
  /** Margem pontual em fracao; se null, usa `margemGrupo`. */
  margem: number | null;
  /** Margem do grupo de mercadoria, em fracao. */
  margemGrupo: number;
  /** Preco manual, usado quando `auto` = false. */
  precoManual: number;
  /** Produto incompleto (sem descricao) => preco 0. Default: true. */
  temProduto?: boolean;
}

/** Preco de venda = custo unitario x (1 + margem). Margem pontual tem prioridade sobre a do grupo. */
export function calcularPrecoVenda(entrada: CalcularPrecoVendaEntrada): number {
  const { auto, custo = 0, quantidadeCaixa = 1, margem, margemGrupo = 0, precoManual = 0 } = entrada;
  const temProduto = entrada.temProduto ?? true;

  if (!auto) return arredondar(precoManual);
  if (!temProduto) return 0;

  const custoUnitario = custo / (quantidadeCaixa || 1);
  const margemUsada = margem != null ? margem : margemGrupo;
  return arredondar(custoUnitario * (1 + margemUsada));
}

export interface PromocaoRegra {
  tipo: "valor" | "desconto";
  /** Preco fixo, quando tipo = "valor". */
  valor?: number | null;
  /** Desconto em fracao (0.20 = 20%), quando tipo = "desconto". */
  descontoFracao?: number | null;
  /** "HH:MM". */
  horaInicio?: string | null;
  /** "HH:MM". */
  horaFim?: string | null;
  /** Dias marcados na ordem [seg, ter, qua, qui, sex, sab, dom]; ausente = todos os dias. */
  dias?: boolean[] | null;
}

export interface CalcularPrecoFinalEntrada {
  precoVenda: number;
  promocoes?: PromocaoRegra[];
  /** Momento de referencia (para testes); default = agora. */
  agora?: Date;
}

function paraMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [horas, minutos] = String(hhmm).split(":");
  return (Number.parseInt(horas ?? "0", 10) || 0) * 60 + (Number.parseInt(minutos ?? "0", 10) || 0);
}

/** Aplica a primeira promocao ativa (dia + janela de horario) sobre o preco de venda. */
export function calcularPrecoVendaComPromocao(entrada: CalcularPrecoFinalEntrada): number {
  const precoVenda = Number(entrada.precoVenda) || 0;
  const promocoes = entrada.promocoes ?? [];
  const agora = entrada.agora ?? new Date();

  const indiceDia = (agora.getDay() + 6) % 7; // seg = 0 ... dom = 6
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  for (const promo of promocoes) {
    const diaOk = !promo.dias || promo.dias[indiceDia] === true;
    const inicio = paraMinutos(promo.horaInicio);
    const fim = paraMinutos(promo.horaFim);
    const horaOk =
      (inicio == null && fim == null) ||
      (minutosAgora >= (inicio ?? Number.NEGATIVE_INFINITY) && minutosAgora <= (fim ?? Number.POSITIVE_INFINITY));

    if (diaOk && horaOk) {
      if (promo.tipo === "desconto" && promo.descontoFracao != null) {
        return arredondar(precoVenda * (1 - Number(promo.descontoFracao)));
      }
      if (promo.tipo === "valor" && promo.valor != null) {
        return arredondar(Number(promo.valor));
      }
    }
  }
  return arredondar(precoVenda);
}

function maiusculo(texto: string | null | undefined): string {
  return String(texto ?? "")
    .trim()
    .toUpperCase();
}

/** Descricao automatica: NOME + QUANTIDADE (ate 3 casas) + MEDIDA. */
export function montarDescricao(nome: string, quantidade: number | string, medida: string): string {
  const nomeUp = maiusculo(nome);
  const medidaUp = maiusculo(medida);
  const quantidadeNumero = Number.parseFloat(String(quantidade).replace(",", ".")) || 0;
  const mostrarQuantidade = nomeUp !== "" || medidaUp !== "" || quantidadeNumero > 0;
  const quantidadeFmt = mostrarQuantidade
    ? quantidadeNumero.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
    : "";
  return [nomeUp, quantidadeFmt, medidaUp].filter(Boolean).join(" ");
}

/** Texto de validacao de quantidade (transformacao): "DENTRO DA EMB (descricao) TEM [precisao] [qtd] [unidade]". */
export function montarValidacaoQtd(descricao: string, precisao: string, qtd: number, unidade: string): string {
  const desc = String(descricao ?? "");
  if (!desc) return "";
  return `DENTRO DA EMB (${desc}) TEM ${maiusculo(precisao)} ${qtd ?? ""} ${maiusculo(unidade)}`;
}

/**
 * Rotulo legivel da sigla de embalagem. Sigla desconhecida devolve a propria sigla — o cadastro de
 * Unidades e livre, entao inventar rotulo para o que nao esta aqui produziria texto errado.
 */
const ROTULO_DA_EMBALAGEM: Record<string, string> = {
  SACO: "Saco",
  PCT: "Pacote",
  CX: "Caixa",
  UN: "Unidade",
  FD: "Fardo",
  POTE: "Pote",
  BAND: "Bandeja",
  EMB: "Embalagem",
  MIL: "Milheiro",
  KG: "Kg",
  LT: "Litro"
};

export interface ComoSeCompraEntrada {
  /** Sigla da embalagem de compra (vem do cadastro de Unidades). */
  embalagem: string | null;
  /** Preposicao: "C/" = com (caixa COM 12), "DE" = de (saco DE 25 kg). */
  cDe: "C/" | "DE" | null;
  /** Unidades/medidas que vem na embalagem de compra. */
  quantidadeCaixa: number | null;
  /** Sigla da medida de compra. */
  medidaCompra: string | null;
  /** Descricao do produto (a mesma que `montarDescricao` monta). */
  descricao: string;
}

/**
 * Texto "como se compra" (informativo). **Formato oficial, decidido em 12/08/2026:**
 *
 *     Saco de 25 KG — FARINHA DE TRIGO 25 KG
 *
 * Esta e a UNICA implementacao. Antes existiam duas divergentes — a regra compartilhada produzia
 * `"1 SACO DE25 (…)"` e a tela produzia o formato acima, sem teste. O ERP tinha herdado o defeito
 * do Pralis, que tambem tinha as duas. A da tela venceu porque e a que o Rodrigo le; a que morreu
 * era a que tinha teste, e o teste veio junto para ca.
 */
export function montarComoSeCompra(entrada: ComoSeCompraEntrada): string {
  const sigla = maiusculo(entrada.embalagem);
  if (!sigla) return "";
  const rotulo = ROTULO_DA_EMBALAGEM[sigla] ?? sigla;
  const preposicao = entrada.cDe === "C/" ? "com" : "de";
  const quantidade = Number(entrada.quantidadeCaixa) || 0;
  const medida = maiusculo(entrada.medidaCompra);
  const quantidadeTexto = quantidade ? [String(quantidade), medida].filter(Boolean).join(" ") : "";
  const descricao = String(entrada.descricao ?? "").trim();
  return [rotulo, preposicao, quantidadeTexto, descricao ? `— ${descricao}` : ""].filter(Boolean).join(" ");
}

/** Retorna a margem (fracao) do grupo de mercadoria pelo nome, ou 0 se nao encontrado. */
export function resolverMargemGrupo(nomeGrupo: string, grupos: readonly { nome: string; margem: number }[]): number {
  const grupo = grupos.find((item) => item.nome === nomeGrupo);
  return grupo ? Number(grupo.margem) || 0 : 0;
}
