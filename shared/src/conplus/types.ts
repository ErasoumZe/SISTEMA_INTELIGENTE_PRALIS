export type ConplusTipoEvento = "H" | "R" | "V";

export type ConplusTipoRelatorio = "folha_05" | "adiantamento_20" | "rescisoes" | "ferias";

/** De onde veio uma importação: upload manual do DP ou busca automática na API Conplus. */
export type ConplusOrigemImportacao = "arquivo" | "api";

/** Estado da busca automática por empresa e tipo (`conplus_sincronizacao_estado`). */
export type ConplusSincronizacaoEstadoDto = {
  tipo: ConplusTipoRelatorio;
  status: "ociosa" | "executando" | "falhou" | "nunca_executada";
  ultimaCompetencia: string | null;
  tentativas: number;
  proximaTentativaEm: string | null;
  ultimaExecucaoEm: string | null;
  ultimoSucessoEm: string | null;
  ultimaImportacaoId: string | null;
  ultimoErroCodigo: string | null;
};

export type ConplusEvento = {
  codigo: string;
  natureza: string | null;
  referencia: string | null;
  valor: string | null;
  unidade: ConplusTipoEvento | null;
};

export type ConplusDiagnostico = {
  linha: number;
  mensagem: string;
};

export type ConplusRescisao = {
  contrato: string;
  empregado: string;
  admissao: string;
  avisoPrevio: string;
  demissao: string;
  sequencia: string;
  saldoFgts: string;
  salario: string;
  proventos: string;
  descontos: string;
  liquido: string;
  fgtsGrrf: string;
  causaDemissao: string;
};

export type ConplusPeriodoAquisitivo = {
  contrato: string;
  empregado: string;
  limiteSemDobra: string;
  admissao: string;
  periodoInicial: string;
  periodoFinal: string;
  faltas: string;
  afastamentos: string;
  saldo: string;
  pago: string;
  tipo: string;
  quantidade: string;
};

export type ConplusTabularColumn = {
  codigo?: string | null;
  campo?: string | null;
  natureza?: string | null;
  referencia?: string | null;
  valor?: string | null;
};

export type ConplusFolhaRow = {
  identificacao: Record<string, string | null>;
  eventos: ConplusEvento[];
  totais: Record<string, string | null>;
  bases: Record<string, string | null>;
  adicionais: Record<string, string | null>;
};
