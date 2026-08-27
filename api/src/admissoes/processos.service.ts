import {
  cancelarProcessoPayloadSchema,
  criarProcessoDiretoPayloadSchema,
  dadosInternosPayloadSchema,
  exameExigeAtencao,
  exameProcessoPayloadSchema,
  historicoProcessoQuerySchema,
  processosQuerySchema,
  situacaoDoProcesso,
  type HistoricoProcessoDto,
  type ProcessoDetalheDto,
  type ProcessoListaDto
} from "@padaria/shared/admissoes";
import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared";
import { conflito, erroValidacao, naoEncontrado } from "../erros.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { empresaDoAtor, atorDoPerfil } from "./ator.js";
import {
  atualizarExameRepository,
  avancarVersaoProcessoRepository,
  atualizarInternosRepository,
  bloquearInternosRepository,
  bloquearProcessoRepository,
  cancelarProcessoRepository,
  criarInternosRepository,
  criarProcessoDiretoRepository,
  criarProcessoRepository,
  listarHistoricoProcessoRepository,
  listarProcessosRepository,
  obterFuncaoAtivaRepository,
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
    origem: linha.origem,
    testeId: linha.testeId,
    // NULO no processo direto ate o candidato responder. Quem exibe decide o rotulo — o servidor
    // nao inventa identidade para preencher o vazio.
    nomeCompleto: linha.nomeCompleto,
    funcaoNome: linha.funcaoNome,
    jornadaHorario: linha.jornadaHorario,
    internos: {
      versao: linha.internosVersao,
      dataAdmissao: linha.internosDataAdmissao,
      ctpsNumero: linha.ctpsNumero,
      ctpsSerie: linha.ctpsSerie,
      ctpsUf: linha.ctpsUf,
      pisPasepNit: linha.pisPasepNit,
      observacoesRh: linha.observacoesRh,
      exameSituacao: linha.exameSituacao,
      // Derivado aqui, como a situacao. A tela nao reimplementa a regra, e o banco nao a guarda.
      exameExigeAtencao: exameExigeAtencao(linha.exameSituacao),
      exameAtualizadoPorNome: linha.exameAtualizadoPorNome,
      exameAtualizadoEm: linha.exameAtualizadoEm?.toISOString() ?? null
    },
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
    // O bloco interno nasce JUNTO, nas duas origens: assim a tela nunca precisa decidir entre criar
    // e atualizar, e o exame ja comeca em `pendente` no primeiro instante do processo.
    await criarInternosRepository(
      { empresaId: input.empresaId, processoId: criado.id, dataAdmissao: null },
      tx
    );
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

/**
 * ADMISSAO DIRETA — a UNICA entrada de processo sem teste.
 *
 * Nao aceita `testeId`: o contrato Zod nem tem o campo, e quem tem teste chega pela efetivacao. Nao
 * aceita nome nem CPF: identidade e do formulario do candidato, e o CHECK do banco impede que o
 * processo passe a ter a sua propria.
 */
export async function criarProcessoDireto(body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = criarProcessoDiretoPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const funcao = await obterFuncaoAtivaRepository(dados.funcaoId, empresaId, tx);
    // "Nao existe nesta empresa" e "existe e esta inativa" sao recusas diferentes. A FK composta ja
    // impediria a primeira no banco, mas a mensagem certa vale mais que um 23503 cru.
    if (!funcao) throw erroValidacao("Funcao operacional nao encontrada nesta empresa");
    if (!funcao.ativo) throw erroValidacao("Esta funcao operacional esta inativa");

    const criado = await criarProcessoDiretoRepository(
      {
        empresaId,
        funcaoId: dados.funcaoId,
        jornadaHorario: dados.jornadaHorario,
        atorUsuarioId: ator
      },
      tx
    );
    await criarInternosRepository(
      { empresaId, processoId: criado.id, dataAdmissao: dados.dataAdmissao },
      tx
    );
    await registrarEventoProcessoRepository(
      {
        processoId: criado.id,
        empresaId,
        versao: criado.versao,
        acao: "criado",
        atorUsuarioId: ator
      },
      tx
    );
    return criado;
  });
}

export async function listarProcessos(query: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const filtros = processosQuerySchema.parse(query);
  const pagina = await listarProcessosRepository(empresaId, filtros);
  const itens: ProcessoListaDto[] = pagina.itens.map((linha) => ({
    id: linha.id,
    origem: linha.origem,
    status: linha.status,
    situacao: situacaoDoProcesso(linha.status),
    nomeCompleto: linha.nomeCompleto,
    funcaoNome: linha.funcaoNome,
    dataAdmissao: linha.internosDataAdmissao,
    exameSituacao: linha.exameSituacao,
    criadoEm: linha.criadoEm.toISOString()
  }));
  return { ...pagina, itens };
}

/**
 * Bloco interno do DP. Concorrencia otimista PROPRIA (`internos.versao`): editar o bloco nao e
 * editar o processo, e usar a versao do processo faria uma tela invalidar a outra sem motivo.
 */
export async function salvarDadosInternos(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = dadosInternosPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    // Autorizacao ANTES da regra: sem isto, processo de outra empresa responderia "nao encontrado"
    // do bloco interno em vez do 404 do processo — dois textos distintos para quem tenta adivinhar.
    const alvo = await bloquearProcessoRepository(id, empresaId, tx);
    if (!alvo) processoNaoEncontrado();
    if (alvo.status !== "iniciado") {
      throw conflito("Este processo de admissao foi cancelado", "PROCESSO_NAO_EDITAVEL");
    }

    const internos = await bloquearInternosRepository(id, empresaId, tx);
    if (!internos) processoNaoEncontrado();
    if (internos.versao !== dados.versao) {
      throw conflito("Alguem alterou estes dados enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const atualizado = await atualizarInternosRepository(
      {
        processoId: id,
        empresaId,
        versaoAtual: internos.versao,
        dataAdmissao: dados.dataAdmissao,
        ctpsNumero: dados.ctpsNumero ?? null,
        ctpsSerie: dados.ctpsSerie ?? null,
        ctpsUf: dados.ctpsUf ?? null,
        pisPasepNit: dados.pisPasepNit ?? null,
        observacoesRh: dados.observacoesRh ?? null
      },
      tx
    );
    if (!atualizado) {
      throw conflito("Alguem alterou estes dados enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    // A trilha e indexada por (processo_id, versao): o evento precisa da PROPRIA versao do processo,
    // senao colide com o `criado`. Ver `avancarVersaoProcessoRepository`.
    const evento = await avancarVersaoProcessoRepository(
      { id, empresaId, versaoAtual: alvo.versao, atorUsuarioId: ator },
      tx
    );
    if (!evento) {
      throw conflito("Alguem alterou este processo enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    // NOMES de campo, nunca valores: gravar o conteudo duplicaria dado interno dentro da trilha.
    await registrarEventoProcessoRepository(
      {
        processoId: id,
        empresaId,
        versao: evento.versao,
        acao: "internos_alterados",
        atorUsuarioId: ator,
        camposAlterados: ["dataAdmissao", "ctpsNumero", "ctpsSerie", "ctpsUf", "pisPasepNit", "observacoesRh"]
      },
      tx
    );
    return atualizado;
  });
}

/** Situacao do exame admissional. Acao propria: quem corrige CTPS nao e quem acompanha o exame. */
export async function atualizarExame(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = exameProcessoPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(id, empresaId, tx);
    if (!alvo) processoNaoEncontrado();
    if (alvo.status !== "iniciado") {
      throw conflito("Este processo de admissao foi cancelado", "PROCESSO_NAO_EDITAVEL");
    }

    const internos = await bloquearInternosRepository(id, empresaId, tx);
    if (!internos) processoNaoEncontrado();
    if (internos.versao !== dados.versao) {
      throw conflito("Alguem alterou estes dados enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const atualizado = await atualizarExameRepository(
      {
        processoId: id,
        empresaId,
        versaoAtual: internos.versao,
        situacao: dados.situacao,
        atorUsuarioId: ator,
        atualizadoEm: new Date()
      },
      tx
    );
    if (!atualizado) {
      throw conflito("Alguem alterou estes dados enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const evento = await avancarVersaoProcessoRepository(
      { id, empresaId, versaoAtual: alvo.versao, atorUsuarioId: ator },
      tx
    );
    if (!evento) {
      throw conflito("Alguem alterou este processo enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    await registrarEventoProcessoRepository(
      {
        processoId: id,
        empresaId,
        versao: evento.versao,
        acao: "exame_alterado",
        atorUsuarioId: ator,
        camposAlterados: ["exameSituacao"]
      },
      tx
    );
    return atualizado;
  });
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
