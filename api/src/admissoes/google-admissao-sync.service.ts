import { readFile } from "node:fs/promises";
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";
import { env } from "../env.js";
import { obterProcessoRepository } from "./processos.repository.js";
import { obterFichaRepository } from "./ficha.repository.js";
import { listarDependentesRepository } from "./dependentes.repository.js";
import { listarAnexosFichaRepository } from "./anexos.repository.js";
import { listarAnexosDependenteRepository } from "./dependentes-anexos.repository.js";
import { GoogleDriveService, type GoogleDriveFile } from "../google/google-drive.service.js";
import {
  GoogleSheetsService,
  normalizarCabecalho,
  prepararRegistroPorCabecalho,
  validarCabecalhos
} from "../google/google-sheets.service.js";
import {
  CABECALHOS_DEPENDENTE_OBRIGATORIOS,
  localizarCabecalhoDinamico,
  prepararLinhaColaboradorParaSheets,
  primeiraLinhaDadosColaborador,
  validarCabecalhosColaborador,
  mapearDependenteParaSheets
} from "./google-mapping.service.js";
import { GoogleSyncService, type GoogleSyncContext } from "./google-sync.service.js";
import { idsGoogleConfigurados } from "../google/google-auth.js";

const COLABORADORES = "colab.tnp (filter)";
const DEPENDENTES = "dependentes.tnp (filter)";
const PLANILHA_HOMOLOGACAO_ID = "1GS3izhVhUcosFJ46P2WEw2QVA1BJL-MYowIQJvAP8Nk";
const TITULO_PLANILHA_HOMOLOGACAO = "HOMOLOGACAO PRALIS - ADMISSOES";
const TITULO_PLANILHA = "CICLUZ GP - TNP - LANÇAMENTOS GESTÃO DE PESSOAS (DES)";

type Valor = string | number | boolean | null;
type Cabecalho = readonly string[];
type Anexo = {
  id: string;
  tipo: string;
  nomeOriginal: string;
  caminho: string;
  mimeType: string;
};

export type GoogleAdmissaoSyncResultado = {
  sincronizacaoId: string;
  colaboradorLinha: number;
  dependentesLinhas: number[];
  arquivos: number;
};

function colunaA1(indice: number): string {
  let n = indice + 1;
  let resultado = "";
  while (n > 0) {
    resultado = String.fromCharCode(65 + ((n - 1) % 26)) + resultado;
    n = Math.floor((n - 1) / 26);
  }
  return resultado;
}

function dataIso(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}

function nomeSeguro(valor: string): string {
  const nome = valor.replace(/[\\/:*?"<>|]/gu, "_").trim();
  if (!nome) throw new Error("Nome do processo ausente");
  return nome.slice(0, 140);
}

function valorCelula(linha: readonly (string | number | boolean | null)[] | undefined, indice: number): string {
  const valor = linha?.[indice];
  if (valor === null || valor === undefined) return "";
  return typeof valor === "string" ? valor.trim() : String(valor);
}

function atualizacoesDaLinha(
  sheet: string,
  numeroLinha: number,
  cabecalhos: Cabecalho,
  valores: readonly Valor[],
  ignorarColunas: ReadonlySet<number> = new Set()
): Array<{ range: string; valores: Valor[][] }> {
  return valores.flatMap((valor, indice) => {
    if (valor === null || ignorarColunas.has(indice) || !cabecalhos[indice]) return [];
    return [{ range: `${sheet}!${colunaA1(indice)}${numeroLinha}`, valores: [[valor]] }];
  });
}

function linhaPorId(
  linhas: readonly (readonly (string | number | boolean | null)[])[],
  indice: number,
  id: string,
  inicio: number
) {
  if (indice < 0) return null;
  const posicao = linhas.findIndex((linha) => valorCelula(linha, indice) === id);
  return posicao < 0 ? null : inicio + posicao;
}

function linhaDisponivel(
  linhas: readonly (readonly (string | number | boolean | null)[])[],
  colunasUsadas: readonly number[],
  inicio: number
): number {
  const offset = linhas.findIndex((linha) => colunasUsadas.every((indice) => !valorCelula(linha, indice)));
  return offset < 0 ? inicio + linhas.length : inicio + offset;
}

async function enviarArquivo(
  drive: GoogleDriveService,
  contexto: GoogleSyncContext,
  sincronizacaoId: string,
  empresaId: string,
  processoId: string,
  anexo: Anexo,
  pastaId: string,
  origem: "colaborador" | "dependente",
  dependenteId?: string
): Promise<string> {
  const controle = await contexto.salvarArquivo({
    sincronizacaoId,
    empresaId,
    processoId,
    dependenteId: dependenteId ?? null,
    origem,
    colaboradorAnexoId: origem === "colaborador" ? anexo.id : null,
    dependenteAnexoId: origem === "dependente" ? anexo.id : null,
    tipoDocumento: anexo.tipo
  });
  if (!controle) throw new Error("Controle do anexo Google indisponivel");
  if (controle.driveFileId && controle.driveWebViewLink) return controle.driveWebViewLink;

  const nome = `${anexo.tipo}-${anexo.nomeOriginal}`;
  const existente = await drive.localizarArquivo(nome, pastaId, anexo.mimeType);
  const arquivo: GoogleDriveFile =
    existente ??
    (await drive.enviarArquivo({
      parentFolderId: pastaId,
      fileName: nome,
      mimeType: anexo.mimeType,
      data: await readFile(caminhoAbsolutoDocumento(anexo.caminho))
    }));
  await contexto.salvarResultadoArquivo(controle.id, {
    pastaId,
    arquivoId: arquivo.id,
    link: arquivo.link
  });
  return arquivo.link;
}

export class GoogleAdmissaoSyncService {
  constructor(
    private readonly drive = new GoogleDriveService(),
    private readonly sheets = new GoogleSheetsService(),
    private readonly controle = new GoogleSyncService()
  ) {}

  async executar(processoId: string, empresaId: string): Promise<GoogleAdmissaoSyncResultado> {
    if (!env.GOOGLE_ADMISSAO_SYNC_ENABLED) throw new Error("Sincronizacao Google de admissao desabilitada");
    const ids = idsGoogleConfigurados();
    const processo = await obterProcessoRepository(processoId, empresaId);
    const ficha = await obterFichaRepository(processoId, empresaId);
    if (!processo || !ficha || !processo.nomeCompleto || !processo.cpf)
      throw new Error("Dados da admissao incompletos");
    const nomeCompleto = processo.nomeCompleto;
    const cpf = processo.cpf;
    const dependentes = ficha.semDependentes ? [] : await listarDependentesRepository(processoId, empresaId);
    const anexosColaborador = await listarAnexosFichaRepository(ficha.id, empresaId);
    const anexosDependentes = new Map<string, Anexo[]>();
    for (const dependente of dependentes) {
      anexosDependentes.set(dependente.id, await listarAnexosDependenteRepository(dependente.id, empresaId));
    }

    return this.controle
      .executarTentativa({ empresaId, processoId, driveRootFolderId: ids.driveFolderId }, async (contexto) => {
        if (!contexto.sincronizacao) throw new Error("Controle de sincronizacao Google indisponivel");
        await this.sheets.validarIdentidade(
          ids.spreadsheetId === PLANILHA_HOMOLOGACAO_ID ? TITULO_PLANILHA_HOMOLOGACAO : TITULO_PLANILHA
        );
        const colabEstrutura = localizarCabecalhoDinamico(
          await this.sheets.lerLinhasParaCabecalho(COLABORADORES, "A1:ZZ20"),
          "NOME COMPLETO",
          validarCabecalhosColaborador
        );
        const depEstrutura = localizarCabecalhoDinamico(
          await this.sheets.lerLinhasParaCabecalho(DEPENDENTES, "A1:ZZ20"),
          "Nome do dependente",
          (cabecalhos) => validarCabecalhos(cabecalhos, CABECALHOS_DEPENDENTE_OBRIGATORIOS)
        );
        const colabCabecalhos = colabEstrutura.cabecalhos;
        const depCabecalhos = depEstrutura.cabecalhos;
        const linhaInicialColaborador = primeiraLinhaDadosColaborador(colabEstrutura.linha);
        const linhaInicialDependente = depEstrutura.linha + 1;

        const processoPasta = await this.drive.localizarOuCriarPasta(
          `ADMISSÃO - ${nomeSeguro(nomeCompleto)} - ${processoId}`,
          ids.driveFolderId
        );
        const pastaColaborador = await this.drive.localizarOuCriarPasta("Colaborador", processoPasta.id);
        await contexto.salvarPastaColaborador(pastaColaborador.id);
        const pastaDependentes = await this.drive.localizarOuCriarPasta("Dependentes", processoPasta.id);

        const documentosColaborador: Record<string, string> = {};
        for (const anexo of anexosColaborador) {
          documentosColaborador[anexo.tipo] = await enviarArquivo(
            this.drive,
            contexto,
            contexto.sincronizacao.id,
            empresaId,
            processoId,
            anexo,
            pastaColaborador.id,
            "colaborador"
          );
        }
        const fichaDados = {
          processoId,
          nomeCompleto,
          cpf,
          nomeSocial: ficha.nomeSocial,
          nascimento: dataIso(ficha.nascimento),
          sexo: ficha.sexo ?? "",
          estadoCivil: ficha.estadoCivil ?? "",
          racaCor: ficha.racaCor ?? "",
          nacionalidade: ficha.nacionalidade ?? "",
          naturalidade: ficha.naturalidade ?? "",
          nomeMae: ficha.nomeMae ?? "",
          nomePai: ficha.nomePai,
          cep: ficha.cep ?? "",
          logradouro: ficha.logradouro ?? "",
          numero: ficha.numero ?? "",
          complemento: ficha.complemento,
          bairro: ficha.bairro ?? "",
          municipio: ficha.municipio ?? "",
          uf: ficha.uf ?? "",
          telefone: ficha.telefone ?? "",
          email: ficha.email,
          documentos: documentosColaborador
        };
        const linhaColaborador = prepararLinhaColaboradorParaSheets(colabCabecalhos, fichaDados);
        const colabId = colabCabecalhos.findIndex((cabecalho) => normalizarCabecalho(cabecalho) === "id");
        const colabGrid = await this.sheets.lerLinhas(COLABORADORES, `A${linhaInicialColaborador}:ZZ`);
        const colabLinha =
          linhaPorId(colabGrid, colabId, processoId, linhaInicialColaborador) ??
          linhaDisponivel(
            colabGrid,
            linhaColaborador.map((v, i) => (v === null || i === 1 ? -1 : i)).filter((i) => i >= 0),
            linhaInicialColaborador
          );
        await this.sheets.atualizarValoresEmLote(
          atualizacoesDaLinha(COLABORADORES, colabLinha, colabCabecalhos, linhaColaborador, new Set([1]))
        );
        await contexto.salvarLinhaColaborador(colabLinha);

        const depGrid = await this.sheets.lerLinhas(DEPENDENTES, `A${linhaInicialDependente}:ZZ`);
        const depProcessoId = depCabecalhos.findIndex(
          (cabecalho) => normalizarCabecalho(cabecalho) === "identificador do colaborador"
        );
        const depNome = depCabecalhos.findIndex((cabecalho) => normalizarCabecalho(cabecalho) === "nome do dependente");
        const dependentesLinhas: number[] = [];
        let arquivos = anexosColaborador.length;
        for (const dependente of dependentes) {
          const controleDep = await contexto.salvarDependente({
            sincronizacaoId: contexto.sincronizacao.id,
            empresaId,
            processoId,
            dependenteId: dependente.id
          });
          if (!controleDep) throw new Error("Controle do dependente Google indisponivel");
          const pasta = await this.drive.localizarOuCriarPasta(
            nomeSeguro(`${dependente.nomeCompleto} - ${dependente.id}`),
            pastaDependentes.id
          );
          await contexto.salvarResultadoDependente(controleDep.id, { pastaId: pasta.id });
          const documentos: Record<string, string> = {};
          for (const anexo of anexosDependentes.get(dependente.id) ?? []) {
            documentos[anexo.tipo] = await enviarArquivo(
              this.drive,
              contexto,
              contexto.sincronizacao.id,
              empresaId,
              processoId,
              anexo,
              pasta.id,
              "dependente",
              dependente.id
            );
            arquivos += 1;
          }
          const registro = mapearDependenteParaSheets({
            processoId,
            nomeCompleto: dependente.nomeCompleto,
            nascimento: dataIso(dependente.nascimento),
            parentesco: dependente.parentesco,
            cpf: dependente.cpf,
            finalidades: dependente.finalidades,
            documentos
          });
          const linha = prepararRegistroPorCabecalho(depCabecalhos, registro);
          const existente = depGrid.findIndex(
            (row) =>
              valorCelula(row, depProcessoId) === processoId && valorCelula(row, depNome) === dependente.nomeCompleto
          );
          const numero =
            existente < 0
              ? linhaDisponivel(
                  depGrid,
                  linha.map((v, i) => (v === null || i === 0 ? -1 : i)).filter((i) => i >= 0),
                  linhaInicialDependente
                )
              : linhaInicialDependente + existente;
          await this.sheets.atualizarValoresEmLote(
            atualizacoesDaLinha(DEPENDENTES, numero, depCabecalhos, linha, new Set([0]))
          );
          await contexto.salvarResultadoDependente(controleDep.id, { linha: numero });
          await contexto.concluirDependente(controleDep.id);
          dependentesLinhas.push(numero);
        }
        return {
          sincronizacaoId: contexto.sincronizacao.id,
          colaboradorLinha: colabLinha,
          dependentesLinhas,
          arquivos
        };
      })
      .then((resultado) => {
        if (resultado.status !== "concluida") throw new Error("Sincronizacao Google em andamento");
        return resultado.resultado;
      });
  }
}

export async function sincronizarAdmissaoGoogle(processoId: string, empresaId: string) {
  return new GoogleAdmissaoSyncService().executar(processoId, empresaId);
}
