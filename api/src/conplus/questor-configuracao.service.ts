import type { PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import {
  ERROS_QUESTOR,
  codigoQuestorAtualizacaoSchema,
  codigoQuestorPayloadSchema,
  codigosQuestorQuerySchema,
  configuracaoQuestorPayloadSchema,
  referenciasDaConfiguracaoQuestor,
  type CodigoQuestorDto,
  type ConfiguracaoQuestorDto
} from "@padaria/shared/conplus";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import { conflito, naoEncontrado } from "../erros.js";
import {
  comMigrationQuestor,
  exigirCodigosAtivosNoCatalogo,
  versaoQuestorDesatualizada
} from "./questor-comum.service.js";
import {
  atualizarCodigoQuestorRepository,
  atualizarConfiguracaoQuestorRepository,
  inserirCodigoQuestorRepository,
  inserirConfiguracaoQuestorRepository,
  listarCodigosQuestorRepository,
  obterConfiguracaoQuestorRepository,
  type ConfiguracaoQuestorLinha
} from "./questor-configuracao.repository.js";

/** E2 — configuração Questor da empresa e catálogo de códigos. Empresa sempre do perfil. */

const CONFIGURACAO_VAZIA: ConfiguracaoQuestorDto = {
  versao: 0,
  codigoEstabelecimento: null,
  classificacaoOrganograma: null,
  utilizaHoraCentesimal: null,
  codigoEmpresaQuestor: null,
  razaoSocialQuestor: null,
  padroes: {},
  atualizadoEm: null,
  atualizadoPorNome: null
};

function dtoConfiguracao(linha: ConfiguracaoQuestorLinha | null): ConfiguracaoQuestorDto {
  if (!linha) return CONFIGURACAO_VAZIA;
  return { ...linha, atualizadoEm: linha.atualizadoEm.toISOString() };
}

export async function obterConfiguracaoQuestor(perfil?: PerfilUsuario): Promise<ConfiguracaoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => dtoConfiguracao(await obterConfiguracaoQuestorRepository(empresaId)));
}

export async function salvarConfiguracaoQuestor(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ConfiguracaoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  const { versao, ...dados } = configuracaoQuestorPayloadSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atual = await obterConfiguracaoQuestorRepository(empresaId);
    await exigirCodigosAtivosNoCatalogo(empresaId, referenciasDaConfiguracaoQuestor(dados));
    const gravada =
      versao === 0
        ? atual
          ? null
          : await inserirConfiguracaoQuestorRepository(empresaId, dados, usuarioId)
        : await atualizarConfiguracaoQuestorRepository(empresaId, versao, dados, usuarioId);
    if (!gravada) throw versaoQuestorDesatualizada();
    return dtoConfiguracao(await obterConfiguracaoQuestorRepository(empresaId));
  });
}

type CodigoLinha = Omit<CodigoQuestorDto, "atualizadoEm"> & { atualizadoEm: Date };
const dtoCodigo = (linha: CodigoLinha): CodigoQuestorDto => ({
  ...linha,
  atualizadoEm: linha.atualizadoEm.toISOString()
});

export async function listarCodigosQuestor(query: DadosExternos, perfil?: PerfilUsuario): Promise<CodigoQuestorDto[]> {
  const empresaId = empresaDoAtor(perfil);
  const filtro = codigosQuestorQuerySchema.parse(query ?? {});
  return comMigrationQuestor(async () => (await listarCodigosQuestorRepository(empresaId, filtro)).map(dtoCodigo));
}

export async function criarCodigoQuestor(body: DadosExternos, perfil?: PerfilUsuario): Promise<CodigoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  const dados = codigoQuestorPayloadSchema.parse(body);
  return comMigrationQuestor(async () => {
    const criado = await inserirCodigoQuestorRepository(empresaId, dados, usuarioId);
    if (!criado) {
      throw conflito(
        `O código ${dados.codigo} já existe no catálogo "${dados.tabela}". Reative-o em vez de cadastrar de novo.`,
        ERROS_QUESTOR.codigoDuplicado
      );
    }
    return dtoCodigo(criado);
  });
}

export async function atualizarCodigoQuestor(
  id: string,
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<CodigoQuestorDto> {
  const empresaId = empresaDoAtor(perfil);
  const dados = codigoQuestorAtualizacaoSchema.parse(body);
  return comMigrationQuestor(async () => {
    const atualizado = await atualizarCodigoQuestorRepository(empresaId, id, dados);
    if (!atualizado) throw naoEncontrado("Código Questor não encontrado");
    return dtoCodigo(atualizado);
  });
}
