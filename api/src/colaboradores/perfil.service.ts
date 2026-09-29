import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared";
import { atualizarPerfilCadastralPayloadSchema, type AtualizarPerfilCadastralPayload } from "@padaria/shared/colaboradores";
import { executarEmTransacao } from "../banco/conexao.js";
import { naoEncontrado } from "../erros.js";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import {
  atualizarNomePerfilRepository,
  bloquearColaboradorPerfilRepository,
  criarOnboardingDoVinculoRepository,
  obterDadosCadastraisDoColaboradorRepository,
  obterOnboardingDoVinculoRepository,
  listarEventosDoColaboradorRepository,
  listarVinculosDoColaboradorRepository,
  obterPerfilColaboradorRepository,
  registrarEdicaoPerfilRepository,
  salvarDadosBancariosRepository,
  salvarDadosPessoaisRepository,
  salvarEnderecoContatoRepository
} from "./perfil.repository.js";

function colaboradorNaoEncontrado(): never {
  throw naoEncontrado("Colaborador nao encontrado", "COLLABORATOR_NOT_FOUND");
}

export async function obterPerfilColaborador(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const colaborador = await obterPerfilColaboradorRepository(id, empresaId);
  if (!colaborador) colaboradorNaoEncontrado();
  const [vinculos, eventos, dadosCadastrais] = await Promise.all([
    listarVinculosDoColaboradorRepository(id, empresaId),
    listarEventosDoColaboradorRepository(id, empresaId),
    obterDadosCadastraisDoColaboradorRepository(id, empresaId)
  ]);
  const vinculoAtivo = vinculos.find((vinculo) => vinculo.status === "ativo") ?? null;
  const onboarding = vinculoAtivo ? await obterOnboardingDoVinculoRepository(vinculoAtivo.id, empresaId) : null;
  return {
    ...colaborador,
    // Ausência de vínculo não prova desligamento. Cadastros anteriores à E7
    // devem ser conciliados antes de qualquer recontratação.
    situacao: vinculoAtivo ? "ativo" : vinculos.length ? "inativo" : "conciliacao_pendente",
    vinculoAtivoId: vinculoAtivo?.id ?? null,
    ...dadosCadastrais,
    onboarding: onboarding
      ? {
          ...onboarding,
          cadastroCompletoEm: onboarding.cadastroCompletoEm?.toISOString() ?? null,
          enviadoContabilidadeEm: onboarding.enviadoContabilidadeEm?.toISOString() ?? null,
          retornoContabilidadeEm: onboarding.retornoContabilidadeEm?.toISOString() ?? null,
          configuradoEm: onboarding.configuradoEm?.toISOString() ?? null,
          atualizadoEm: onboarding.atualizadoEm.toISOString()
        }
      : null,
    vinculos: vinculos.map((vinculo) => ({
      ...vinculo,
      desligadoEm: vinculo.desligadoEm?.toISOString() ?? null,
      criadoEm: vinculo.criadoEm.toISOString()
    })),
    eventos: eventos.map((evento) => ({ ...evento, ocorridoEm: evento.ocorridoEm.toISOString() }))
  };
}

/**
 * Salva uma ou mais abas privadas, sem transportar empresa pelo navegador. O onboarding e criado
 * junto da primeira gravacao do dossie de um vinculo ativo; nao existe onboarding artificial para
 * cadastro legado ainda sem vinculo, que precisa passar pela conciliacao antes.
 */
export async function salvarPerfilCadastralDoColaborador(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = atualizarPerfilCadastralPayloadSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearColaboradorPerfilRepository(id, empresaId, tx);
    if (!alvo) colaboradorNaoEncontrado();
    const camposAlterados = await salvarBlocosDoPerfil(alvo, dados, empresaId, tx);
    if (!camposAlterados.length) return;
    const vinculos = await listarVinculosDoColaboradorRepository(id, empresaId);
    const vinculoAtivo = vinculos.find((vinculo) => vinculo.status === "ativo");
    if (vinculoAtivo) await criarOnboardingDoVinculoRepository({ empresaId, vinculoId: vinculoAtivo.id }, tx);
    await registrarEdicaoPerfilRepository({ empresaId, colaboradorId: id, atorUsuarioId: ator, camposAlterados }, tx);
  });
}

async function salvarBlocosDoPerfil(
  alvo: { nome: string; id: string },
  dados: AtualizarPerfilCadastralPayload,
  empresaId: string,
  tx: Parameters<Parameters<typeof executarEmTransacao>[0]>[0]
) {
  const camposAlterados: string[] = [];
  if (dados.nome !== undefined && dados.nome !== alvo.nome) {
    const atualizado = await atualizarNomePerfilRepository(alvo.id, empresaId, dados.nome, tx);
    if (!atualizado) colaboradorNaoEncontrado();
    camposAlterados.push("nome");
  }
  if (dados.dadosPessoais !== undefined) {
    await salvarDadosPessoaisRepository({ empresaId, colaboradorId: alvo.id, dados: dados.dadosPessoais }, tx);
    camposAlterados.push("dadosPessoais");
  }
  if (dados.enderecoContato !== undefined) {
    await salvarEnderecoContatoRepository({ empresaId, colaboradorId: alvo.id, dados: dados.enderecoContato }, tx);
    camposAlterados.push("enderecoContato");
  }
  if (dados.dadosBancarios !== undefined) {
    await salvarDadosBancariosRepository({ empresaId, colaboradorId: alvo.id, dados: dados.dadosBancarios }, tx);
    camposAlterados.push("dadosBancarios");
  }
  return camposAlterados;
}
