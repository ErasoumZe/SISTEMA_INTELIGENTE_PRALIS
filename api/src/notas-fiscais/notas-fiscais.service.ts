import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  ImportarNotasFiscaisPayload,
  ImportarNotasFiscaisResultado,
  NotaFiscalDetalheDto,
  NotaFiscalDto,
  NotasFiscaisQuery
} from "@padaria/shared/notas-fiscais";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { env } from "../env.js";
import { erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { parseNfe } from "./notas-fiscais.parser.js";
import {
  baixarXmlsDoWebhook,
  buscarCnpjEmpresaRepository,
  buscarNotaFiscalDetalheRepository,
  importarNotaFiscalRepository,
  listarNotasFiscaisRepository,
  type RegistroWebhook
} from "./notas-fiscais.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function configWebhook(): { url: string; token: string; company: string } {
  if (!env.NOTAS_FISCAIS_URL || !env.NOTAS_FISCAIS_TOKEN) {
    throw naoProcessavel(
      "Importacao de NF-e nao configurada (NOTAS_FISCAIS_URL/TOKEN ausentes)",
      "NOTAS_FISCAIS_NAO_CONFIGURADO"
    );
  }
  return { url: env.NOTAS_FISCAIS_URL, token: env.NOTAS_FISCAIS_TOKEN, company: env.NOTAS_FISCAIS_COMPANY };
}

// yyyy-MM-dd -> dd/MM/yyyy (formato exigido pelo webhook da contabilidade).
function isoParaBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function mensagemErro(erro: DadosExternos): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export async function importarNotasFiscais(
  payload: ImportarNotasFiscaisPayload,
  perfil: PerfilUsuario,
  log?: RegistroWebhook
): Promise<ImportarNotasFiscaisResultado> {
  validarEmpresa(perfil, payload.empresaId);
  const { url, token, company } = configWebhook();

  const cnpjEmpresa = await buscarCnpjEmpresaRepository(payload.empresaId);
  if (!cnpjEmpresa) {
    throw erroValidacao(
      "Empresa sem CNPJ cadastrado; informe o CNPJ em Empresas para importar NF-e",
      "EMPRESA_SEM_CNPJ"
    );
  }

  let xmls: string[];
  try {
    xmls = await baixarXmlsDoWebhook({
      url,
      token,
      companyContabilidade: company,
      cnpjEmpresa,
      dataInicioBr: isoParaBr(payload.dataInicio),
      dataFimBr: isoParaBr(payload.dataFim),
      log
    });
  } catch (erro) {
    // Falha ao falar com o webhook e fatal para a importacao: 422 com mensagem clara ao operador,
    // em vez de 500 generico. As falhas por-nota (parse/persistencia) sao tratadas no laco abaixo.
    throw naoProcessavel(
      `Falha ao consultar o webhook de notas fiscais: ${mensagemErro(erro)}`,
      "NOTAS_FISCAIS_WEBHOOK_ERRO"
    );
  }

  let importadas = 0;
  let puladas = 0;
  const detalhesErros: Array<{ chave: string | null; mensagem: string }> = [];

  for (const xml of xmls) {
    let chave: string | null = null;
    try {
      const nfe = parseNfe(xml);
      chave = nfe.chave || null;
      if (!nfe.chave) {
        detalhesErros.push({ chave: null, mensagem: "NF-e sem chave de acesso" });
        continue;
      }
      const resultado = await importarNotaFiscalRepository({
        empresaId: payload.empresaId,
        nfe,
        dataReferenciaFallback: payload.dataFim,
        criadoPor: perfil.usuarioId
      });
      if (resultado === "importada") importadas += 1;
      else puladas += 1;
    } catch (erro) {
      detalhesErros.push({ chave, mensagem: mensagemErro(erro) });
    }
  }

  return {
    totalNotas: xmls.length,
    importadas,
    puladas,
    erros: detalhesErros.length,
    periodo: { dataInicio: payload.dataInicio, dataFim: payload.dataFim },
    detalhesErros
  };
}

export async function listarNotasFiscais(
  query: NotasFiscaisQuery,
  empresasPermitidasIds: string[] | null
): Promise<NotaFiscalDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarNotasFiscaisRepository(query, empresasPermitidasIds);
}

export async function obterNotaFiscal(notaFiscalId: string, perfil: PerfilUsuario): Promise<NotaFiscalDetalheDto> {
  const nota = await buscarNotaFiscalDetalheRepository(notaFiscalId);
  if (!nota || !podeAcessarEmpresa(perfil, nota.empresaId)) throw naoEncontrado("Registro nao encontrado");
  return nota;
}
