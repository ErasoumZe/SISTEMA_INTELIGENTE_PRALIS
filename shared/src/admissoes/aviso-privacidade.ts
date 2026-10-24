/**
 * ADM-003 V2 — o aviso de privacidade que o candidato aceita antes de preencher a ficha.
 *
 * **A versao vigente mora AQUI, em constante versionada** (decisao de Marco, 01/09/2026 — D-8).
 * Nao em variavel de ambiente e nao em tabela configuravel pela tela. O motivo e simples: mudar o
 * aviso e mudar a base juridica da coleta, e isso tem de passar por revisao, commit e deploy. Uma
 * variavel de ambiente muda sem revisor; uma tabela deixa o DP alterar sozinho o texto que a pessoa
 * ja aceitou. Nenhum dos dois e aceitavel para consentimento.
 *
 * O que a FICHA grava e a `versao` — a string, nao o texto. Assim o registro diz exatamente a que a
 * pessoa consentiu, e o texto de cada versao continua recuperavel aqui, no historico do arquivo.
 */

/** O prefixo e o marcador PERMANENTE de aceite de teste. Ver `ehAvisoDeTeste`. */
const PREFIXO_TESTE = "AVISO-TESTE-";

export type AvisoPrivacidade = {
  /** Identificador gravado na ficha e na trilha. Imutavel depois do primeiro aceite. */
  readonly versao: string;
  /** O texto exibido a pessoa. Fica no codigo para o aceite ser auditavel anos depois. */
  readonly texto: string;
};

/**
 * O REGISTRO. Nunca se apaga uma entrada: um aceite antigo aponta para a versao que ele aceitou, e
 * remover a entrada tornaria esse aceite ilegivel. Versoes novas entram no fim.
 */
export const avisosPrivacidade: readonly AvisoPrivacidade[] = [
  {
    versao: "AVISO-TESTE-ADMISSAO-V1",
    texto: [
      "Ambiente de teste — não use dados pessoais reais.",
      "",
      "Esta tela existe para exercitar o fluxo tecnico de admissao. Os dados digitados aqui sao",
      "sinteticos, servem apenas para teste e podem ser apagados a qualquer momento.",
      "",
      "Este NAO e o aviso de privacidade da Pralis e nao vale como base juridica para tratamento de",
      "dados pessoais reais. Para este teste, use somente arquivos e imagens sinteticos."
    ].join("\n")
  }
];

/**
 * A versao VIGENTE — a unica que pode ser emitida.
 *
 * Hoje e a de teste, porque o aviso oficial ainda nao existe (BLOQUEIO 1 do PROJECT_BRAIN/35).
 * Quando ele chegar, entra no registro acima e vira o valor daqui. Os aceites anteriores continuam
 * validos como historico e seguem identificaveis pelo prefixo — nao se convertem em consentimento
 * real, e nao se apagam.
 */
export const avisoPrivacidadeVigente = "AVISO-TESTE-ADMISSAO-V1";

/** Aceite de teste se reconhece pelo prefixo, e nao por coluna, flag ou memoria de quem estava la. */
export function ehAvisoDeTeste(versao: string): boolean {
  return versao.startsWith(PREFIXO_TESTE);
}

export function avisoPorVersao(versao: string): AvisoPrivacidade | null {
  return avisosPrivacidade.find((aviso) => aviso.versao === versao) ?? null;
}

/**
 * **G-1** — a guarda de configuracao, e a primeira das tres.
 *
 * Devolve a versao vigente, ou `null` quando ela nao pode vigorar no ambiente. Aviso de teste em
 * producao e exatamente o caso que nao pode existir: o texto diz "nao use dados reais" e estaria
 * coletando dados reais.
 *
 * Devolver `null` — em vez de lancar — e deliberado: quem chama decide o status (a emissao responde
 * 409, a configuracao pode falhar na carga). O importante e que a resposta seja FECHADA por padrao.
 */
export function avisoVigenteDoAmbiente(producao: boolean): string | null {
  if (producao && ehAvisoDeTeste(avisoPrivacidadeVigente)) return null;
  return avisoPrivacidadeVigente;
}

/**
 * **G-3** — a guarda do aceite. Separada da emissao de proposito: um convite emitido antes de uma
 * promocao de ambiente continuaria coletando aceite depois dela, e a guarda da emissao ja teria
 * passado. Esta olha o momento de gravar.
 */
export function aceiteDeAvisoPermitido(versao: string, producao: boolean): boolean {
  if (avisoPorVersao(versao) === null) return false;
  return !(producao && ehAvisoDeTeste(versao));
}
