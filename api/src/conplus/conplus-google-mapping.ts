import { normalizarCabecalho, type RegistroPorCabecalho } from "../google/google-sheets.service.js";

export const CONPLUS_ABAS = {
  folha_05: "CONPLUS FOLHA DE PAGAMENTO 05",
  adiantamento_20: "CONPLUS FOLHA DE PAGAMENTO ADIANTAMENTO 20",
  rescisoes: "CONPLUS FOLHA DE PAGAMENTO RECIS\u00c3O",
  ferias: "CONPLUS FOLHA DE PAGAMENTO F\u00c9RIAS"
} as const;

export const CONPLUS_RESCISOES_ENTRADA = "CONPLUS RESCISOES - ENTRADA";

export const CABECALHOS_RESCISOES_ENTRADA = [
  "Código (Funcionário)",
  "Nome",
  "Adm (Data de Admissão)",
  "Aviso Prev",
  "Dem (Data de Demissão)",
  "Seq",
  "Saldo FGTS",
  "Salário",
  "Proventos",
  "Descontos",
  "Líquido",
  "FGTS-GRRF",
  "Causa Demissão",
  "ID_IMPORTACAO",
  "ID_REGISTRO",
  "HASH_REGISTRO",
  "STATUS_SINCRONIZACAO",
  "CRIADO_EM",
  "ATUALIZADO_EM"
] as const;

export type ConplusAba = keyof typeof CONPLUS_ABAS;

export type AtualizacaoConplus = {
  coluna: number;
  valor: string | number | boolean;
};

/**
 * Resolve os valores somente para cabeçalhos realmente presentes. Não cria colunas, não usa
 * posições fixas e ignora campos internos que não estejam no registro aprovado.
 */
export function prepararAtualizacoesConplus(
  cabecalhos: readonly string[],
  registro: RegistroPorCabecalho,
  camposPermitidos: readonly string[]
): AtualizacaoConplus[] {
  const permitidos = new Set(camposPermitidos.map(normalizarCabecalho));
  const ocorrencias = new Map<string, number>();
  cabecalhos.forEach((cabecalho) => {
    const normalizado = normalizarCabecalho(cabecalho);
    if (permitidos.has(normalizado)) ocorrencias.set(normalizado, (ocorrencias.get(normalizado) ?? 0) + 1);
  });
  const ambiguos = [...ocorrencias.entries()].filter(([, quantidade]) => quantidade > 1).map(([campo]) => campo);
  if (ambiguos.length) throw new Error(`Cabeçalhos Conplus ambíguos: ${ambiguos.join(", ")}`);
  const valores = new Map(
    Object.entries(registro).map(([campo, valor]) => [normalizarCabecalho(campo), valor] as const)
  );
  const atualizacoes: AtualizacaoConplus[] = [];
  const usados = new Set<string>();
  cabecalhos.forEach((cabecalho, coluna) => {
    const normalizado = normalizarCabecalho(cabecalho);
    if (!normalizado || usados.has(normalizado) || !permitidos.has(normalizado) || !valores.has(normalizado)) return;
    const valor = valores.get(normalizado);
    if (valor === null || valor === undefined || valor === "") return;
    if (typeof valor === "object") return;
    usados.add(normalizado);
    atualizacoes.push({ coluna, valor });
  });
  return atualizacoes;
}

export function validarAbaConplus(nomeAba: string, esperado: ConplusAba): void {
  if (nomeAba.trim() !== CONPLUS_ABAS[esperado]) {
    throw new Error(`Aba Conplus não corresponde ao destino autorizado: ${esperado}`);
  }
}

export function mapearRegistroConplus(
  tipo: ConplusAba,
  registro: Record<string, string | number | null>
): { valores: RegistroPorCabecalho; camposPermitidos: readonly string[] } {
  if (tipo === "rescisoes") {
    const valores: RegistroPorCabecalho = {
      "C\u00F3digo (Funcion\u00E1rio)": registro["contrato"] ?? null,
      Nome: registro["empregado"] ?? null,
      "Adm (Data de Admiss\u00E3o)": registro["admissao"] ?? null,
      "Aviso Prev": registro["avisoPrevio"] ?? null,
      "Dem (Data de Demiss\u00E3o)": registro["demissao"] ?? null,
      Seq: registro["sequencia"] ?? null,
      "Saldo FGTS": registro["saldoFgts"] ?? null,
      "Sal\u00E1rio": registro["salario"] ?? null,
      Proventos: registro["proventos"] ?? null,
      Descontos: registro["descontos"] ?? null,
      "L\u00EDquido": registro["liquido"] ?? null,
      "FGTS-GRRF": registro["fgtsGrrf"] ?? null,
      "Causa Demiss\u00E3o": registro["causaDemissao"] ?? null
    };
    return { valores, camposPermitidos: Object.keys(valores) };
  }
  if (tipo === "ferias") {
    const valores: RegistroPorCabecalho = {
      "C\u00F3digo": registro["contrato"] ?? null,
      Colaborador: registro["empregado"] ?? null,
      "Limite s/ dobra": registro["limiteSemDobra"] ?? null,
      "Admiss\u00E3o": registro["admissao"] ?? null,
      "Per\u00EDodo inicial": registro["periodoInicial"] ?? null,
      "Per\u00EDodo final": registro["periodoFinal"] ?? null,
      Faltas: registro["faltas"] ?? null,
      "Afast.": registro["afastamentos"] ?? null,
      Saldo: registro["saldo"] ?? null,
      Pago: registro["pago"] ?? null,
      Tipo: registro["tipo"] ?? null,
      "Qtd.": registro["quantidade"] ?? null
    };
    return { valores, camposPermitidos: Object.keys(valores) };
  }
  throw new Error("O layout de folha 05 e adiantamento ainda aguarda validação do arquivo oficial Conplus");
}

export type MetadadosRescisaoTecnica = {
  idImportacao: string;
  idRegistro: string;
  hashRegistro: string;
  statusSincronizacao: "pendente" | "processando" | "concluida" | "falhou";
  criadoEm: string;
  atualizadoEm: string;
};

export function mapearRescisaoTecnica(
  registro: Record<string, string | number | null>,
  metadados: MetadadosRescisaoTecnica
): { valores: RegistroPorCabecalho; camposPermitidos: readonly string[] } {
  const oficial = mapearRegistroConplus("rescisoes", registro);
  const valores: RegistroPorCabecalho = {
    ...oficial.valores,
    ID_IMPORTACAO: metadados.idImportacao,
    ID_REGISTRO: metadados.idRegistro,
    HASH_REGISTRO: metadados.hashRegistro,
    STATUS_SINCRONIZACAO: metadados.statusSincronizacao,
    CRIADO_EM: metadados.criadoEm,
    ATUALIZADO_EM: metadados.atualizadoEm
  };
  return { valores, camposPermitidos: [...CABECALHOS_RESCISOES_ENTRADA] };
}
