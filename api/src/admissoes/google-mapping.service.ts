import { z } from "zod";
import {
  camposObrigatoriosDaFicha,
  cpfTesteSchema,
  tiposAnexoAdmissao,
  tiposAnexoAdmissaoObrigatorios,
  tiposAnexoDependente,
  tiposAnexoDependenteObrigatorios,
  type TipoAnexoAdmissao,
  type TipoAnexoDependente
} from "@padaria/shared/admissoes";
import { normalizarCabecalho, type RegistroPorCabecalho } from "../google/google-sheets.service.js";
import { GoogleSheetHeaderError } from "../google/google-errors.js";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/u;
const texto = (limite: number) => z.string().trim().max(limite);
const textoOpcional = (limite: number) => texto(limite).nullish();
const linkDrive = z
  .string()
  .trim()
  .url()
  .refine((valor) => /^https?:\/\//iu.test(valor), "O link do documento precisa ser HTTP ou HTTPS")
  .max(2_048);

const documentosColaboradorSchema = z.partialRecord(z.enum(tiposAnexoAdmissao), linkDrive.nullish());
const documentosDependenteSchema = z.partialRecord(z.enum(tiposAnexoDependente), linkDrive.nullish());
const documentosColaboradorObrigatorios: readonly string[] = tiposAnexoAdmissaoObrigatorios;
const documentosDependenteObrigatorios: readonly string[] = tiposAnexoDependenteObrigatorios;

const colaboradorSheetsSchema = z
  .object({
    processoId: texto(100).min(1),
    nomeCompleto: texto(200).min(1),
    cpf: cpfTesteSchema,
    nomeSocial: textoOpcional(120),
    nascimento: z.string().regex(DATA_ISO, "Data de nascimento invalida"),
    sexo: texto(60).min(1),
    estadoCivil: texto(80).min(1),
    racaCor: texto(60).min(1),
    nacionalidade: texto(80).min(1),
    naturalidade: texto(120).min(1),
    nomeMae: texto(240).min(1),
    nomePai: textoOpcional(240),
    cep: z.string().regex(/^\d{8}$/u, "CEP invalido"),
    logradouro: texto(240).min(1),
    numero: texto(20).min(1),
    complemento: textoOpcional(120),
    bairro: texto(120).min(1),
    municipio: texto(120).min(1),
    uf: z.string().regex(/^[A-Z]{2}$/u, "UF invalida"),
    telefone: z.string().regex(/^\d{10,11}$/u, "Telefone invalido"),
    email: z.string().email("E-mail invalido").max(240).nullish(),
    documentos: documentosColaboradorSchema.optional()
  })
  .strict()
  .superRefine((dados, contexto) => {
    for (const campo of camposObrigatoriosDaFicha) {
      const valor = dados[campo as keyof typeof dados];
      if (valor === undefined || valor === null || valor === "") {
        contexto.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: "Campo obrigatorio" });
      }
    }
  });

const dependenteSheetsSchema = z
  .object({
    processoId: texto(100).min(1),
    nomeCompleto: texto(180).min(1),
    nascimento: z.string().regex(DATA_ISO, "Data de nascimento invalida"),
    parentesco: texto(40).min(1),
    cpf: cpfTesteSchema.nullish(),
    finalidades: z.array(texto(60).min(1)).max(6),
    documentos: documentosDependenteSchema.optional()
  })
  .strict();

export type ColaboradorSheetsInput = z.input<typeof colaboradorSheetsSchema>;
export type DependenteSheetsInput = z.input<typeof dependenteSheetsSchema>;
type DocumentosColaborador = Partial<Record<TipoAnexoAdmissao, string | null | undefined>>;
type DocumentosDependente = Partial<Record<TipoAnexoDependente, string | null | undefined>>;

export const CABECALHOS_COLABORADOR: readonly string[] = [
  "ID",
  "NOME COMPLETO",
  "NOME SOCIAL",
  "DATA DE NASCIMENTO",
  "CPF",
  "SEXO",
  "RAÇA/COR",
  "ESTADO CIVIL",
  "NACIONALIDADE",
  "NATURALIDADE",
  "NOME DA MÃE",
  "NOME DO PAI",
  "CEP",
  "ENDEREÇO",
  "N°/COMPLEMENTO",
  "BAIRRO",
  "CIDADE",
  "UF",
  "TELEFONE",
  "E-MAIL",
  ...[
    ["rg", "RG (LINK DO ANEXO)"],
    ["cpf", "CPF (LINK DO ANEXO)"],
    ["titulo_eleitor", "TÍTULO DE ELEITOR (LINK DO ANEXO)"],
    ["certidao_nascimento_casamento", "CERTIDÃO NASC./CASAMENTO (LINK DO ANEXO)"],
    ["comprovante_residencia", "COMPROVANTE RESIDÊNCIA (LINK DO ANEXO)"],
    ["foto_3x4", "FOTO 3X4 (LINK DO ANEXO)"],
    ["ctps_digital", "CTPS DIGITAL (LINK DO ANEXO)"],
    ["pis_pasep_nit", "PIS/PASEP/NIT (LINK DO ANEXO)"],
    ["certificado_reservista", "CERTIFICADO RESERVISTA (LINK DO ANEXO)"],
    ["comprovante_escolaridade", "COMPROVANTE ESCOLARIDADE (LINK DO ANEXO)"],
    ["certificados_profissionais", "CERTIFICADOS PROFISSIONAIS (LINK DO ANEXO)"],
    ["aso_admissional", "ASO ADMISSIONAL (LINK DO ANEXO)"]
  ]
    .map(([, cabecalho]) => cabecalho)
    .filter((cabecalho): cabecalho is string => Boolean(cabecalho)),
  "STATUS DOCUMENTOS"
] as const;

const CABECALHO_STATUS_DOCUMENTOS = "STATUS DOCUMENTOS";
const CABECALHO_INICIO_DEPENDENTES = "QUANTOS FILHOS ?";

function normalizarCabecalhoAdmissao(valor: string): string {
  return normalizarCabecalho(valor)
    .replace(/[\\/]+/gu, " ")
    .replace(/\\s+/gu, " ")
    .trim();
}

function indicesDoCabecalho(cabecalhos: readonly string[], alvo: string): number[] {
  const normalizado = normalizarCabecalhoAdmissao(alvo);
  return cabecalhos.reduce<number[]>((indices, cabecalho, indice) => {
    if (normalizarCabecalhoAdmissao(cabecalho) === normalizado) indices.push(indice);
    return indices;
  }, []);
}

function indiceStatusDocumentosColaborador(cabecalhos: readonly string[]): number {
  const indicesStatus = indicesDoCabecalho(cabecalhos, CABECALHO_STATUS_DOCUMENTOS);
  const indiceDependentes = indicesDoCabecalho(cabecalhos, CABECALHO_INICIO_DEPENDENTES)[0] ?? cabecalhos.length;
  const indicesDocumentos = tiposAnexoAdmissao.map(
    (tipo) => indicesDoCabecalho(cabecalhos, CABECALHO_POR_ANEXO_COLABORADOR[tipo])[0]
  );
  const ultimoDocumento = Math.max(...indicesDocumentos.filter((indice): indice is number => indice !== undefined));
  const candidatos = indicesStatus.filter((indice) => indice > ultimoDocumento && indice < indiceDependentes);
  if (candidatos.length !== 1) {
    throw new GoogleSheetHeaderError([], [CABECALHO_STATUS_DOCUMENTOS]);
  }
  return candidatos[0]!;
}

function indiceInicioBlocoLegadoDependentes(cabecalhos: readonly string[]): number {
  return indicesDoCabecalho(cabecalhos, CABECALHO_INICIO_DEPENDENTES)[0] ?? cabecalhos.length;
}

function ehCabecalhoDocumentoColaborador(normalizado: string): boolean {
  return tiposAnexoAdmissao.some(
    (tipo) => normalizarCabecalhoAdmissao(CABECALHO_POR_ANEXO_COLABORADOR[tipo]) === normalizado
  );
}

function ehColunaLegadaDoColaborador(cabecalhos: readonly string[], indice: number): boolean {
  const inicioLegado = indiceInicioBlocoLegadoDependentes(cabecalhos);
  const normalizado = normalizarCabecalhoAdmissao(cabecalhos[indice] ?? "");
  return (
    indice >= inicioLegado &&
    (normalizado === normalizarCabecalhoAdmissao(CABECALHO_STATUS_DOCUMENTOS) ||
      ehCabecalhoDocumentoColaborador(normalizado))
  );
}

export function validarCabecalhosColaborador(cabecalhos: readonly string[]): ReadonlyMap<string, number> {
  const statusColaborador = indiceStatusDocumentosColaborador(cabecalhos);
  const colunas = new Map<string, number>();
  const duplicados: string[] = [];
  for (const [indice, cabecalho] of cabecalhos.entries()) {
    const normalizado = normalizarCabecalhoAdmissao(cabecalho);
    if (!normalizado || (indice !== statusColaborador && ehColunaLegadaDoColaborador(cabecalhos, indice))) {
      continue;
    }
    if (colunas.has(normalizado)) duplicados.push(cabecalho.trim());
    else colunas.set(normalizado, indice);
  }
  const faltantes: string[] = CABECALHOS_COLABORADOR.filter(
    (cabecalho): cabecalho is string =>
      typeof cabecalho === "string" && !colunas.has(normalizarCabecalhoAdmissao(cabecalho))
  );
  if (faltantes.length > 0 || duplicados.length > 0) {
    throw new GoogleSheetHeaderError(faltantes, duplicados);
  }
  return colunas;
}

export const CABECALHOS_DEPENDENTE: readonly string[] = [
  "Identificador do colaborador",
  "Nome do dependente",
  "Data de nascimento",
  "Parentesco",
  "CPF",
  "Finalidades",
  "Links dos documentos",
  "Status dos documentos"
] as const;

/**
 * O layout real da aba de dependentes possui uma coluna técnica `id` antes do contrato
 * funcional e ainda não possui a coluna de status. A validação exige somente o contrato
 * que existe; o status continua sendo produzido pelo mapper quando a coluna aparecer.
 */
export const CABECALHOS_DEPENDENTE_OBRIGATORIOS = CABECALHOS_DEPENDENTE.filter(
  (cabecalho) => cabecalho !== "Status dos documentos"
);

export type CabecalhosLocalizados = {
  linha: number;
  cabecalhos: string[];
};

export function localizarCabecalhoDinamico(
  linhas: readonly (readonly (string | number | boolean | null)[])[],
  ancora: string,
  validar: (cabecalhos: readonly string[]) => void,
  limiteLinhas = 20
): CabecalhosLocalizados {
  const alvo = normalizarCabecalhoAdmissao(ancora);
  const candidatos = linhas.slice(0, limiteLinhas).flatMap((linha, indice) => {
    const cabecalhos = linha.map((celula) => (celula === null ? "" : String(celula)));
    return cabecalhos.some((cabecalho) => normalizarCabecalhoAdmissao(cabecalho) === alvo)
      ? [{ linha: indice + 1, cabecalhos }]
      : [];
  });
  if (candidatos.length === 0) throw new GoogleSheetHeaderError([ancora], []);
  if (candidatos.length > 1) {
    throw new GoogleSheetHeaderError([], [`${ancora} (linhas ${candidatos.map(({ linha }) => linha).join(", ")})`]);
  }
  const localizado = candidatos[0]!;
  validar(localizado.cabecalhos);
  return localizado;
}

export function primeiraLinhaDadosColaborador(linhaCabecalho: number): number {
  return linhaCabecalho === 5 ? 12 : linhaCabecalho + 1;
}

const CABECALHO_POR_ANEXO_COLABORADOR: Record<TipoAnexoAdmissao, string> = {
  rg: "RG (LINK DO ANEXO)",
  cpf: "CPF (LINK DO ANEXO)",
  titulo_eleitor: "TÍTULO DE ELEITOR (LINK DO ANEXO)",
  certidao_nascimento_casamento: "CERTIDÃO NASC./CASAMENTO (LINK DO ANEXO)",
  comprovante_residencia: "COMPROVANTE RESIDÊNCIA (LINK DO ANEXO)",
  foto_3x4: "FOTO 3X4 (LINK DO ANEXO)",
  ctps_digital: "CTPS DIGITAL (LINK DO ANEXO)",
  pis_pasep_nit: "PIS/PASEP/NIT (LINK DO ANEXO)",
  certificado_reservista: "CERTIFICADO RESERVISTA (LINK DO ANEXO)",
  comprovante_escolaridade: "COMPROVANTE ESCOLARIDADE (LINK DO ANEXO)",
  certificados_profissionais: "CERTIFICADOS PROFISSIONAIS (LINK DO ANEXO)",
  aso_admissional: "ASO ADMISSIONAL (LINK DO ANEXO)"
};

const ROTULO_ANEXO: Record<TipoAnexoDependente, string> = {
  certidao_nascimento_rg: "Certidão de nascimento ou RG",
  cpf: "CPF",
  cartao_vacina: "Cartão de vacina",
  comprovante_escolaridade: "Comprovante de escolaridade"
};

function conteudoSheetsSeguro(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  return /^[=+\-@]/u.test(valor) ? `'${valor}` : valor;
}

function statusDocumentos(
  documentos: Partial<Record<string, string | null | undefined>>,
  obrigatorios: readonly string[]
): string {
  return obrigatorios.every((tipo) => Boolean(documentos[tipo]?.trim())) ? "Completo" : "Pendente";
}

function linksDependente(documentos: Partial<Record<TipoAnexoDependente, string | null | undefined>>): string | null {
  const links = tiposAnexoDependente
    .map((tipo) => {
      const link = documentos[tipo]?.trim();
      return link ? `${ROTULO_ANEXO[tipo]}: ${conteudoSheetsSeguro(link)}` : null;
    })
    .filter((link): link is string => Boolean(link));
  return links.length > 0 ? links.join("\n") : null;
}

export function mapearColaboradorParaSheets(input: ColaboradorSheetsInput): RegistroPorCabecalho {
  const dados = colaboradorSheetsSchema.parse(input);
  const documentos: DocumentosColaborador = dados.documentos ?? {};
  const registro: RegistroPorCabecalho = {
    ID: conteudoSheetsSeguro(dados.processoId),
    "NOME COMPLETO": conteudoSheetsSeguro(dados.nomeCompleto),
    "NOME SOCIAL": conteudoSheetsSeguro(dados.nomeSocial),
    "DATA DE NASCIMENTO": dados.nascimento,
    CPF: conteudoSheetsSeguro(dados.cpf),
    SEXO: conteudoSheetsSeguro(dados.sexo),
    "RAÇA/COR": conteudoSheetsSeguro(dados.racaCor),
    "ESTADO CIVIL": conteudoSheetsSeguro(dados.estadoCivil),
    NACIONALIDADE: conteudoSheetsSeguro(dados.nacionalidade),
    NATURALIDADE: conteudoSheetsSeguro(dados.naturalidade),
    "NOME DA MÃE": conteudoSheetsSeguro(dados.nomeMae),
    "NOME DO PAI": conteudoSheetsSeguro(dados.nomePai),
    CEP: conteudoSheetsSeguro(dados.cep),
    ENDEREÇO: conteudoSheetsSeguro(dados.logradouro),
    "N°/COMPLEMENTO": conteudoSheetsSeguro([dados.numero, dados.complemento].filter(Boolean).join(" / ")),
    BAIRRO: conteudoSheetsSeguro(dados.bairro),
    CIDADE: conteudoSheetsSeguro(dados.municipio),
    UF: conteudoSheetsSeguro(dados.uf),
    TELEFONE: conteudoSheetsSeguro(dados.telefone),
    "E-MAIL": conteudoSheetsSeguro(dados.email),
    "STATUS DOCUMENTOS": statusDocumentos(documentos, documentosColaboradorObrigatorios)
  };
  for (const tipo of tiposAnexoAdmissao) {
    const link = documentos[tipo];
    if (link) registro[CABECALHO_POR_ANEXO_COLABORADOR[tipo]] = conteudoSheetsSeguro(link);
  }
  return registro;
}

/**
 * Prepara a linha do colaborador respeitando os blocos da aba.
 *
 * A aba legada possui dois cabeçalhos `STATUS DOCUMENTOS`. O primeiro, situado entre os
 * documentos do colaborador e o bloco de dependentes, é o único destino permitido para este
 * registro. O segundo permanece nulo para não reativar o bloco antigo de dependentes.
 */
export function prepararLinhaColaboradorParaSheets(
  cabecalhos: readonly string[],
  input: ColaboradorSheetsInput
): Array<string | number | boolean | null> {
  const registro = mapearColaboradorParaSheets(input);
  const statusColaborador = indiceStatusDocumentosColaborador(cabecalhos);
  validarCabecalhosColaborador(cabecalhos);
  const valoresNormalizados = new Map(
    Object.entries(registro).map(([chave, valor]) => [normalizarCabecalhoAdmissao(chave), valor] as const)
  );
  const statusNormalizado = normalizarCabecalhoAdmissao(CABECALHO_STATUS_DOCUMENTOS);
  return cabecalhos.map((cabecalho, indice) => {
    const normalizado = normalizarCabecalhoAdmissao(cabecalho);
    if (
      (normalizado === statusNormalizado && indice !== statusColaborador) ||
      (indice !== statusColaborador && ehColunaLegadaDoColaborador(cabecalhos, indice))
    ) {
      return null;
    }
    return valoresNormalizados.get(normalizado) ?? null;
  });
}

export function mapearDependenteParaSheets(input: DependenteSheetsInput): RegistroPorCabecalho {
  const dados = dependenteSheetsSchema.parse(input);
  const documentos: DocumentosDependente = dados.documentos ?? {};
  return {
    "Identificador do colaborador": conteudoSheetsSeguro(dados.processoId),
    "Nome do dependente": conteudoSheetsSeguro(dados.nomeCompleto),
    "Data de nascimento": dados.nascimento,
    Parentesco: conteudoSheetsSeguro(dados.parentesco),
    CPF: conteudoSheetsSeguro(dados.cpf),
    Finalidades: conteudoSheetsSeguro(dados.finalidades.join(", ")),
    "Links dos documentos": linksDependente(documentos),
    "Status dos documentos": statusDocumentos(documentos, documentosDependenteObrigatorios)
  };
}
