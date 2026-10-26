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
  /** "YYYY-MM-DD"; vencida NAO aplica. Ausente = sem prazo. */
  validaAte?: string | null;
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

/** A promocao esta valendo AGORA: dentro do prazo, no dia marcado e na janela de horario. */
function promocaoAtiva(promo: PromocaoRegra, agora: Date): boolean {
  if (!promocaoDentroDaValidade(promo.validaAte, agora)) return false;
  const indiceDia = (agora.getDay() + 6) % 7; // seg = 0 ... dom = 6
  if (promo.dias && promo.dias[indiceDia] !== true) return false;
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const inicio = paraMinutos(promo.horaInicio);
  const fim = paraMinutos(promo.horaFim);
  if (inicio == null && fim == null) return true;
  return minutosAgora >= (inicio ?? Number.NEGATIVE_INFINITY) && minutosAgora <= (fim ?? Number.POSITIVE_INFINITY);
}

/** Preco que a promocao produz; `null` quando ela nao tem valor utilizavel. */
function precoDaPromocao(promo: PromocaoRegra, precoVenda: number): number | null {
  if (promo.tipo === "desconto" && promo.descontoFracao != null) {
    return arredondar(precoVenda * (1 - Number(promo.descontoFracao)));
  }
  if (promo.tipo === "valor" && promo.valor != null) return arredondar(Number(promo.valor));
  return null;
}

/**
 * Preco de venda com a promocao vigente. **A ordem em que o banco devolveu as promocoes NUNCA
 * decide o resultado.**
 *
 * A versao anterior aplicava a PRIMEIRA ativa do array — com duas promocoes validas ao mesmo tempo
 * (uma das 10h-12h e uma de "segunda o dia todo"), o preco dependia da ordem de insercao. Hoje o
 * cadastro impede sobreposicao (`validarPromocoesDoProduto`), mas o dado historico pode ter, e a
 * leitura precisa ser deterministica de qualquer jeito.
 *
 * Criterio de desempate: **vence o MENOR preco** — o cliente nunca paga mais por causa de um empate.
 * `validaAte` vencida nao entra.
 */
export function calcularPrecoVendaComPromocao(entrada: CalcularPrecoFinalEntrada): number {
  const precoVenda = Number(entrada.precoVenda) || 0;
  const agora = entrada.agora ?? new Date();

  const precos = (entrada.promocoes ?? [])
    .filter((promo) => promocaoAtiva(promo, agora))
    .map((promo) => precoDaPromocao(promo, precoVenda))
    .filter((preco): preco is number => preco != null);

  return precos.length ? Math.min(...precos) : arredondar(precoVenda);
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
  /** Quantidade de compra variável, indicada na frase como estimativa. */
  aproximado: boolean;
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
  const rotulo = (ROTULO_DA_EMBALAGEM[sigla] ?? sigla).toUpperCase();
  const preposicao = entrada.cDe === "C/" ? "COM" : "DE";
  const medida = maiusculo(entrada.medidaCompra);
  const descricao = String(entrada.descricao ?? "").trim();
  const quantidadeTexto = [entrada.aproximado ? "APROXIMADAMENTE" : "", `${entrada.quantidadeCaixa ?? ""}${medida}`]
    .filter(Boolean)
    .join(" ");
  return [descricao, "-", rotulo, preposicao, descricao, quantidadeTexto].filter(Boolean).join(" ");
}

/** Retorna a margem (fracao) do grupo de mercadoria pelo nome, ou 0 se nao encontrado. */
export function resolverMargemGrupo(nomeGrupo: string, grupos: readonly { nome: string; margem: number }[]): number {
  const grupo = grupos.find((item) => item.nome === nomeGrupo);
  return grupo ? Number(grupo.margem) || 0 : 0;
}

// --------------------------------------------------------------------------------------------
// Promocao: validacao de cadastro e desempate deterministico (P-04, ETAPA 7)
// --------------------------------------------------------------------------------------------

export interface PromocaoParaValidar {
  tipo: "valor" | "desconto";
  valor?: number | null;
  descontoFracao?: number | null;
  /** "HH:MM" ou vazio (o dia inteiro). */
  horaInicio?: string | null;
  horaFim?: string | null;
  /** [seg..dom]; ausente = todos os dias. */
  dias?: boolean[] | null;
  /** "YYYY-MM-DD" ou vazio (sem prazo). */
  validaAte?: string | null;
}

function minutosDe(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [horas, minutos] = String(hhmm).split(":");
  const total = (Number.parseInt(horas ?? "", 10) || 0) * 60 + (Number.parseInt(minutos ?? "", 10) || 0);
  return Number.isFinite(total) ? total : null;
}

function diasDe(promo: PromocaoParaValidar): boolean[] {
  return promo.dias && promo.dias.length === 7 ? promo.dias : [true, true, true, true, true, true, true];
}

/** Janela em minutos [inicio, fim] de uma promocao; o dia inteiro quando nao ha horario. */
function janelaDe(promo: PromocaoParaValidar): { inicio: number; fim: number } {
  return { inicio: minutosDe(promo.horaInicio) ?? 0, fim: minutosDe(promo.horaFim) ?? 24 * 60 - 1 };
}

/**
 * Valida a LISTA de promocoes de um produto. Devolve as mensagens; lista vazia = tudo certo.
 *
 * As regras, e o porque de cada uma:
 * - **valor exigido conforme o tipo**: promocao "valor" sem valor, ou "desconto" sem percentual,
 *   e um campo que aparece e nao vale nada;
 * - **desconto entre 0% e 100%**: acima de 100% o preco fica negativo;
 * - **fim anterior ao inicio e RECUSADO**, e a promocao que atravessa a meia-noite tem de ser
 *   dividida em duas (ex.: 22:00–23:59 e 00:00–02:00). Aceitar "22:00 as 02:00" como um intervalo
 *   so obrigaria toda leitura a saber que aquela janela e circular;
 * - **duas promocoes do mesmo produto nao podem se sobrepor** no mesmo dia da semana.
 */
export function validarPromocoesDoProduto(promocoes: readonly PromocaoParaValidar[]): string[] {
  const erros: string[] = [];

  promocoes.forEach((promo, indice) => {
    const posicao = `Promoção ${indice + 1}`;
    if (promo.tipo === "valor" && (promo.valor == null || promo.valor <= 0)) {
      erros.push(`${posicao}: informe o valor promocional.`);
    }
    if (promo.tipo === "desconto") {
      const fracao = promo.descontoFracao;
      if (fracao == null) erros.push(`${posicao}: informe o percentual de desconto.`);
      else if (fracao <= 0 || fracao > 1) erros.push(`${posicao}: o desconto precisa ficar entre 0% e 100%.`);
    }
    const inicio = minutosDe(promo.horaInicio);
    const fim = minutosDe(promo.horaFim);
    if (inicio != null && fim != null && fim < inicio) {
      erros.push(`${posicao}: o término é anterior ao início. Promoção que vira o dia precisa ser dividida em duas.`);
    }
    if (!diasDe(promo).some(Boolean)) erros.push(`${posicao}: marque ao menos um dia da semana.`);
  });

  for (let a = 0; a < promocoes.length; a += 1) {
    for (let b = a + 1; b < promocoes.length; b += 1) {
      if (promocoesSeSobrepoem(promocoes[a]!, promocoes[b]!)) {
        erros.push(`Promoções ${a + 1} e ${b + 1} se sobrepõem no mesmo dia e horário.`);
      }
    }
  }
  return erros;
}

/** Duas promocoes colidem quando dividem ao menos um dia da semana E as janelas se cruzam. */
export function promocoesSeSobrepoem(uma: PromocaoParaValidar, outra: PromocaoParaValidar): boolean {
  const diasA = diasDe(uma);
  const diasB = diasDe(outra);
  if (!diasA.some((marcado, indice) => marcado && diasB[indice])) return false;
  const janelaA = janelaDe(uma);
  const janelaB = janelaDe(outra);
  return janelaA.inicio <= janelaB.fim && janelaB.inicio <= janelaA.fim;
}

/** `validaAte` no passado NAO aplica. Comparacao por data local, no formato "YYYY-MM-DD". */
export function promocaoDentroDaValidade(validaAte: string | null | undefined, agora: Date): boolean {
  if (!validaAte) return true;
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  return validaAte >= hoje;
}
