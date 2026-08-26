import {
  cancelarProcessoPayloadSchema,
  historicoProcessoQuerySchema,
  situacaoDoProcesso,
  type HistoricoProcessoDto,
  type ProcessoDetalheDto
} from "@padaria/shared/admissoes";
import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared";
import { conflito, naoEncontrado } from "../erros.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { empresaDoAtor, atorDoPerfil } from "./ator.js";
import {
  bloquearProcessoRepository,
  cancelarProcessoRepository,
  criarProcessoRepository,
  listarHistoricoProcessoRepository,
  obterProcessoPorTesteRepository,
  obterProcessoRepository,
  registrarEventoProcessoRepository,
  type ProcessoLinha
} from "./processos.repository.js";

function processoNaoEncontrado(): never {
  // MESMA resposta para inexistente e para outra empresa: distinguir entregaria a existencia de
  // processo de outro tenant de graca.
  throw naoEncontrado("Processo de admissao nao encontrado");
}

function paraDetalheDto(linha: ProcessoLinha): ProcessoDetalheDto {
  return {
    id: linha.id,
    status: linha.status,
    // Derivada pelo servidor. Viaja no DTO para a tela nao reimplementar a regra — e nao para ser
    // gravada: nao existe coluna de situacao.
    situacao: situacaoDoProcesso(linha.status),
    versao: linha.versao,
    testeId: linha.testeId,
    testeNomeCompleto: linha.testeNomeCompleto,
    motivoCancelamento: linha.motivoCancelamento,
    criadoPorNome: linha.criadoPorNome,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoPorNome: linha.atualizadoPorNome,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    canceladoPorNome: linha.canceladoPorNome,
    canceladoEm: linha.canceladoEm?.toISOString() ?? null
  };
}

/**
 * Cria o processo a partir de um teste efetivado. Chamado DENTRO da transacao que encerra o teste.
 *
 * Nao e exportado como acao: nao existe "iniciar admissao". Existe encerrar com
 * `aprovado_para_admissao`, e isto e consequencia disso.
 *
 * O `onConflictDoNothing` do repositorio cobre a corrida: se duas transacoes passarem juntas pelo
 * lock, a segunda nao grava e busca o processo que a primeira criou. Devolve sempre o mesmo id.
 */
export async function criarProcessoDaEfetivacao(
  input: { empresaId: string; testeId: string; atorUsuarioId: string },
  tx: TransacaoBanco
): Promise<{ id: string; versao: number }> {
  const criado = await criarProcessoRepository(input, tx);
  if (criado) {
    await registrarEventoProcessoRepository(
      {
        processoId: criado.id,
        empresaId: input.empresaId,
        versao: criado.versao,
        acao: "criado",
        atorUsuarioId: input.atorUsuarioId
      },
      tx
    );
    return criado;
  }

  const existente = await obterProcessoPorTesteRepository(input.testeId, input.empresaId, tx);
  if (!existente) {
    // Inalcancavel: o insert so nao grava por conflito na unique, e conflito significa que a linha
    // existe. Se chegar aqui, a atomicidade foi quebrada — falhar alto e melhor que criar por fora,
    // que repararia por efeito colateral e esconderia o defeito.
    throw new Error("Invariante quebrada: conflito na unique de processo sem linha correspondente");
  }
  return existente;
}

export async function obterProcesso(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const linha = await obterProcessoRepository(id, empresaId);
  if (!linha) processoNaoEncontrado();
  return paraDetalheDto(linha);
}

export async function listarHistoricoProcesso(id: string, query: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  // Autorizacao ANTES de listar: sem isto o historico de outra empresa responderia vazio em vez de
  // 404, e vazio x inexistente sao distinguiveis por quem tenta.
  const alvo = await obterProcessoRepository(id, empresaId);
  if (!alvo) processoNaoEncontrado();

  const paginacao = historicoProcessoQuerySchema.parse(query);
  const pagina = await listarHistoricoProcessoRepository(id, empresaId, paginacao);
  const itens: HistoricoProcessoDto[] = pagina.itens.map((linha) => ({
    id: linha.id,
    versao: linha.versao,
    acao: linha.acao,
    atorNome: linha.atorNome,
    camposAlterados: linha.camposAlterados,
    ocorridoEm: linha.ocorridoEm.toISOString()
  }));
  return { ...pagina, itens };
}

export async function cancelarProcesso(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = cancelarProcessoPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    // Autorizacao ANTES da validacao de regra: validar primeiro responderia "ja cancelado" para um
    // processo de outra empresa, entregando existencia de graca.
    const alvo = await bloquearProcessoRepository(id, empresaId, tx);
    if (!alvo) processoNaoEncontrado();
    if (alvo.status !== "iniciado") {
      throw conflito("Este processo de admissao ja foi cancelado", "PROCESSO_NAO_CANCELAVEL");
    }
    if (alvo.versao !== dados.versao) {
      throw conflito("Alguem alterou este processo enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const cancelado = await cancelarProcessoRepository(
      {
        id,
        empresaId,
        versaoAtual: alvo.versao,
        motivoCancelamento: dados.motivoCancelamento,
        atorUsuarioId: ator,
        canceladoEm: new Date()
      },
      tx
    );
    // Inalcancavel com o lock acima, e mantido de proposito: no minuto em que alguem remover o lock,
    // isto vira a defesa que sobra.
    if (!cancelado) {
      throw conflito("Alguem alterou este processo enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    await registrarEventoProcessoRepository(
      {
        processoId: id,
        empresaId,
        versao: cancelado.versao,
        acao: "cancelado",
        atorUsuarioId: ator
      },
      tx
    );
    return cancelado;
  });
}
