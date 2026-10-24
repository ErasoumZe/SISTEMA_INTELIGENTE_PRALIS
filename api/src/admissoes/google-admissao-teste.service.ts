import type { GoogleDriveFile } from "../google/google-drive.service.js";
import {
  CABECALHOS_DEPENDENTE_OBRIGATORIOS,
  prepararLinhaColaboradorParaSheets,
  mapearDependenteParaSheets,
  localizarCabecalhoDinamico,
  primeiraLinhaDadosColaborador,
  validarCabecalhosColaborador,
  type ColaboradorSheetsInput,
  type DependenteSheetsInput
} from "./google-mapping.service.js";
import {
  normalizarCabecalho,
  prepararRegistroPorCabecalho,
  validarCabecalhos
} from "../google/google-sheets.service.js";

export const TITULO_PLANILHA_ADMISSAO = "CICLUZ GP - TNP - LANÇAMENTOS GESTÃO DE PESSOAS (DES)";

export type GoogleTesteArquivo = {
  tipo: string;
  nome: string;
  mimeType: string;
  dados: Uint8Array;
};

export type GoogleTesteDependente = DependenteSheetsInput & { id: string; arquivos: GoogleTesteArquivo[] };

export type GoogleTesteEntrada = {
  testId: string;
  colaborador: ColaboradorSheetsInput;
  arquivosColaborador: GoogleTesteArquivo[];
  dependentes: GoogleTesteDependente[];
};

export type GoogleTestePlano = {
  processoFolderName: string;
  collaboratorFolderName: string;
  dependentsFolderName: string;
  collaboratorSheet: string;
  dependentSheet: string;
  collaboratorRows: number;
  dependentRows: number;
  files: Array<{ folder: string; name: string; mimeType: string }>;
};

export type GoogleAdmissionTestGateway = {
  lerLinhas: (sheet: string) => Promise<readonly (readonly (string | number | boolean | null)[])[]>;
  validarPlanilha: (tituloEsperado: string) => Promise<void>;
  localizarOuCriarPasta: (nome: string, parentId?: string) => Promise<GoogleDriveFile>;
  localizarArquivo: (nome: string, parentId: string, mimeType?: string) => Promise<GoogleDriveFile | null>;
  enviarArquivo: (input: {
    parentFolderId: string;
    fileName: string;
    mimeType: string;
    data: Uint8Array;
  }) => Promise<GoogleDriveFile>;
  inserirLinha: (
    sheet: string,
    linha: Array<string | number | boolean | null>,
    primeiraLinha?: number
  ) => Promise<{ updatedRange: string | null }>;
  rootFolderId: string;
};

const COLABORADOR_SHEET = "colab.tnp (filter)";
const DEPENDENTE_SHEET = "dependentes.tnp (filter)";
export const PRIMEIRA_LINHA_COLABORADOR = 12;

function textoNome(valor: string): string {
  const nome = valor.replace(/[\\/:*?"<>|]/gu, "_").trim();
  if (!nome) throw new Error("Nome de teste obrigatorio");
  return nome.slice(0, 140);
}

function exigirTestId(testId: string): string {
  const id = testId.trim();
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/iu.test(id)) {
    throw new Error("testId invalido: use somente letras, numeros e hifens");
  }
  return id;
}

export class GoogleAdmissionTestService {
  constructor(private readonly gateway: GoogleAdmissionTestGateway) {}

  prepararPlano(input: GoogleTesteEntrada): GoogleTestePlano {
    const testId = exigirTestId(input.testId);
    const processoFolderName = `TESTE ADMISSAO - ${testId}`;
    const files = [
      { folder: "Colaborador", files: input.arquivosColaborador },
      ...input.dependentes.map((dependente) => ({
        folder: `Dependentes/${textoNome(dependente.nomeCompleto)}`,
        files: dependente.arquivos
      }))
    ].flatMap(({ folder, files: arquivos }) =>
      arquivos.map((arquivo) => ({ folder, name: arquivo.nome, mimeType: arquivo.mimeType }))
    );
    return {
      processoFolderName,
      collaboratorFolderName: "Colaborador",
      dependentsFolderName: "Dependentes",
      collaboratorSheet: COLABORADOR_SHEET,
      dependentSheet: DEPENDENTE_SHEET,
      collaboratorRows: 1,
      dependentRows: input.dependentes.length,
      files
    };
  }

  async executar(
    input: GoogleTesteEntrada
  ): Promise<{ collaboratorRange: string | null; dependentRanges: Array<string | null> }> {
    const plano = this.prepararPlano(input);
    await this.gateway.validarPlanilha(TITULO_PLANILHA_ADMISSAO);
    const colabLinhas = await this.gateway.lerLinhas(COLABORADOR_SHEET);
    const depLinhas = await this.gateway.lerLinhas(DEPENDENTE_SHEET);
    const colabEstrutura = localizarCabecalhoDinamico(colabLinhas, "NOME COMPLETO", validarCabecalhosColaborador);
    const depEstrutura = localizarCabecalhoDinamico(depLinhas, "Nome do dependente", (cabecalhos) =>
      validarCabecalhos(cabecalhos, CABECALHOS_DEPENDENTE_OBRIGATORIOS)
    );
    const colabCabecalhos = colabEstrutura.cabecalhos;
    const depCabecalhos = depEstrutura.cabecalhos;
    const linhaInicialColaborador = primeiraLinhaDadosColaborador(colabEstrutura.linha);

    const testId = exigirTestId(input.testId);
    const colabIdIndex = colabCabecalhos.findIndex((cabecalho) => cabecalho.trim().toLowerCase() === "id");
    if (
      colabIdIndex >= 0 &&
      colabLinhas.some(
        (linha, indice) =>
          indice >= colabEstrutura.linha && String(linha[colabIdIndex] ?? "") === input.colaborador.processoId
      )
    ) {
      throw new Error(`Teste ${testId} ja possui linha de colaborador na planilha`);
    }
    const depIdIndex = depCabecalhos.findIndex(
      (cabecalho) => normalizarCabecalho(cabecalho) === normalizarCabecalho("Identificador do colaborador")
    );
    const depNameIndex = depCabecalhos.findIndex(
      (cabecalho) => normalizarCabecalho(cabecalho) === normalizarCabecalho("Nome do dependente")
    );
    for (const dependente of input.dependentes) {
      if (
        depLinhas.some(
          (linha, indice) =>
            indice >= depEstrutura.linha &&
            String(linha[depIdIndex] ?? "") === dependente.processoId &&
            String(linha[depNameIndex] ?? "") === dependente.nomeCompleto
        )
      ) {
        throw new Error(`Teste ${testId} ja possui o dependente ${dependente.nomeCompleto} na planilha`);
      }
    }
    const processo = await this.gateway.localizarOuCriarPasta(plano.processoFolderName, this.gateway.rootFolderId);
    const colaborador = await this.gateway.localizarOuCriarPasta(plano.collaboratorFolderName, processo.id);
    const dependentes = await this.gateway.localizarOuCriarPasta(plano.dependentsFolderName, processo.id);

    const documentosColaborador: Record<string, string> = {};
    for (const arquivo of input.arquivosColaborador) {
      const existente = await this.gateway.localizarArquivo(arquivo.nome, colaborador.id, arquivo.mimeType);
      const enviado =
        existente ??
        (await this.gateway.enviarArquivo({
          parentFolderId: colaborador.id,
          fileName: arquivo.nome,
          mimeType: arquivo.mimeType,
          data: arquivo.dados
        }));
      documentosColaborador[arquivo.tipo] = enviado.link;
    }
    const linhaColaborador = prepararLinhaColaboradorParaSheets(colabCabecalhos, {
      ...input.colaborador,
      documentos: documentosColaborador
    });
    const collaboratorRange = await this.gateway.inserirLinha(
      COLABORADOR_SHEET,
      linhaColaborador,
      linhaInicialColaborador
    );
    const dependentRanges: Array<string | null> = [];
    for (const dependente of input.dependentes) {
      const pastaDependente = await this.gateway.localizarOuCriarPasta(
        textoNome(dependente.nomeCompleto),
        dependentes.id
      );
      const documentos: Record<string, string> = {};
      for (const arquivo of dependente.arquivos) {
        const existente = await this.gateway.localizarArquivo(arquivo.nome, pastaDependente.id, arquivo.mimeType);
        const enviado =
          existente ??
          (await this.gateway.enviarArquivo({
            parentFolderId: pastaDependente.id,
            fileName: arquivo.nome,
            mimeType: arquivo.mimeType,
            data: arquivo.dados
          }));
        documentos[arquivo.tipo] = enviado.link;
      }
      const registro = mapearDependenteParaSheets({
        processoId: dependente.processoId,
        nomeCompleto: dependente.nomeCompleto,
        nascimento: dependente.nascimento,
        parentesco: dependente.parentesco,
        cpf: dependente.cpf,
        finalidades: dependente.finalidades,
        documentos
      });
      const linha = prepararRegistroPorCabecalho(depCabecalhos, registro);
      dependentRanges.push((await this.gateway.inserirLinha(DEPENDENTE_SHEET, linha)).updatedRange);
    }
    return { collaboratorRange: collaboratorRange.updatedRange, dependentRanges };
  }
}
