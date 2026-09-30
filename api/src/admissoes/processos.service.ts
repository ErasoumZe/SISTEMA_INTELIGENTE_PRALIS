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
  type ProcessoListaDto,
  type TurnoOpcaoDto
} from "@padaria/shared/admissoes";
import { cpfTotalmenteMascarado } from "@padaria/shared/admissoes";
import { turnoCompleto } from "@padaria/shared/turnos";
import type { DadosExternos } from "@padaria/shared/api";
import type { PerfilUsuario } from "@padaria/shared";
import { conflito, erroValidacao, naoEncontrado } from "../erros.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { empresaDoAtor, atorDoPerfil } from "./ator.js";
// A leitura do TESTE vem do repositorio da ADM-001: perguntar "existe teste aberto com este CPF?"
// e a mesma pergunta nas duas verticais, e reescreve-la aqui criaria a segunda resposta.
import { existeTesteAbertoPorCpfRepository } from "./admissoes.repository.js";
import {
  atualizarExameRepository,
  avancarVersaoProcessoRepository,
  definirStatusProcessoRepository,
  existeProcessoAtivoPorCpfRepository,
  obterCpfDoProcessoRepository,
  obterTurnoDaEmpresaRepository,
  travarPessoaRepository,
  atualizarInternosRepository,
  bloquearInternosRepository,
  bloquearProcessoRepository,
  cancelarProcessoRepository,
  criarInternosRepository,
  criarProcessoDiretoRepository,
  criarProcessoRepository,
  listarHistoricoProcessoRepository,
  listarProcessosRepository,
  listarTurnosDaEmpresaRepository,
  obterDestinoClinicaAtivoRepository,
  obterFuncaoAtivaRepository,
  obterProcessoPorTesteRepository,
  obterProcessoRepository,
  obterVinculoEfetivadoRepository,
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
    // Constante, nunca parcial: a projecao nao carrega digito de CPF. Revelar e ato proprio e
    // auditado, como na ADM-001.
    cpfMascarado: linha.cpf ? cpfTotalmenteMascarado() : null,
    funcaoNome: linha.funcaoNome,
    turnoEtiqueta: linha.turnoEtiqueta,
    turnoRotulo: linha.turnoRotulo,
    turnoHoraInicio: linha.turnoHoraInicio,
    turnoHoraFim: linha.turnoHoraFim,
    turnoDiasSemana: linha.turnoDiasSemana,
    jornadaHorario: linha.jornadaHorario,
    fichaSituacao: linha.fichaSituacao,
    efetivado: linha.vinculoId !== null,
    dataEfetivacao: linha.dataEfetivacao,
    internos: {
      versao: linha.internosVersao,
      dataAdmissao: linha.internosDataAdmissao,
      ctpsNumero: linha.ctpsNumero,
      ctpsSerie: linha.ctpsSerie,
      ctpsUf: linha.ctpsUf,
      pisPasepNit: linha.pisPasepNit,
      exameTipo: linha.exameTipo,
      exameClinicaId: linha.exameClinicaId,
      exameUnidadeId: linha.exameUnidadeId,
      exameClinica: linha.exameClinica,
      exameUnidade: linha.exameUnidade,
      exameComplementares: linha.exameComplementares,
      exameAgendadoPara: linha.exameAgendadoPara?.toISOString() ?? null,
      exameResponsavelNome: linha.exameResponsavelNome,
      exameResponsavelTelefone: linha.exameResponsavelTelefone,
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
    await criarInternosRepository({ empresaId: input.empresaId, processoId: criado.id, dataAdmissao: null }, tx);
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
    // PRIMEIRA coisa da transacao, antes de qualquer leitura: serializa esta pessoa nesta empresa.
    // Depois da leitura seria tarde — em READ COMMITTED, ler nao trava nada, e duas transacoes
    // simultaneas passariam pelas duas checagens e gravariam as duas.
    await travarPessoaRepository(empresaId, dados.cpf, tx);
    await recusarSeCpfJaEstaEmUso(dados.cpf, empresaId, tx);

    const funcao = await obterFuncaoAtivaRepository(dados.funcaoId, empresaId, tx);
    // "Nao existe nesta empresa" e "existe e esta inativa" sao recusas diferentes. A FK composta ja
    // impediria a primeira no banco, mas a mensagem certa vale mais que um 23503 cru.
    if (!funcao) throw erroValidacao("Funcao operacional nao encontrada nesta empresa");
    if (!funcao.ativo) throw erroValidacao("Esta funcao operacional esta inativa");

    const turno = await obterTurnoDaEmpresaRepository(dados.turnoId, empresaId, tx);
    if (!turno) throw erroValidacao("Turno nao encontrado nesta empresa");
    // Turno INCOMPLETO nao serve para admitir: a tela precisa mostrar etiqueta, dias e horarios, e
    // metade disso nao existiria. A tela ja nao oferece — isto recusa quem tentar forcar.
    if (!turnoCompleto(turno)) {
      throw erroValidacao(
        "Este turno esta incompleto: configure etiqueta (M/T/I) e dias da semana no cadastro de Turnos."
      );
    }

    const criado = await criarProcessoDiretoRepository(
      {
        empresaId,
        nomeCompleto: dados.nomeCompleto,
        cpf: dados.cpf,
        funcaoId: dados.funcaoId,
        turnoId: turno.id,
        // RETRATO tirado agora. O catalogo pode mudar depois; o combinado com esta pessoa, nao.
        turnoRotulo: turno.nome,
        turnoEtiqueta: turno.etiqueta!,
        turnoHoraInicio: turno.horaInicio,
        turnoHoraFim: turno.horaFim,
        turnoDiasSemana: turno.diasSemana!,
        atorUsuarioId: ator
      },
      tx
    );
    await criarInternosRepository({ empresaId, processoId: criado.id, dataAdmissao: dados.dataAdmissao }, tx);
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

/**
 * Recusa se o CPF ja esta em uso nesta empresa, nos DOIS caminhos — teste em andamento ou processo
 * nao cancelado.
 *
 * Chamada SEMPRE depois de `travarPessoaRepository`, nunca antes: sem o lock, isto e so uma leitura
 * que duas transacoes fazem ao mesmo tempo e as duas aprovam.
 *
 * A mensagem NAO diz de quem e o CPF, nem onde ele esta: quem pergunta ja sabe o numero que digitou,
 * e dizer mais entregaria a existencia de um cadastro alheio.
 */
async function recusarSeCpfJaEstaEmUso(cpf: string, empresaId: string, tx: TransacaoBanco) {
  if (await existeTesteAbertoPorCpfRepository({ empresaId, cpf }, tx)) {
    throw conflito("Ja existe um periodo de teste em andamento para este CPF nesta empresa.", "CPF_JA_EM_ADMISSAO");
  }
  if (await existeProcessoAtivoPorCpfRepository(cpf, empresaId, tx)) {
    throw conflito("Ja existe um processo de admissao em andamento para este CPF nesta empresa.", "CPF_JA_EM_ADMISSAO");
  }
}

/**
 * REVELAR o CPF do processo. Ato explicito e auditado, na mesma transacao da leitura: se a auditoria
 * falhar, o CPF nao sai. Mesma disciplina do D-4 do PROJECT_BRAIN/42.
 *
 * O evento NAO incrementa a versao — nada mudou no processo. Revelar e LEITURA, e leitura nao pode
 * escrever na linha raiz: `avancarVersaoProcessoRepository` gravava `atualizado_por` e disparava a
 * trigger de `atualizado_em`, entao o detalhe passava a mostrar como "Alterado por" quem apenas
 * tinha lido o documento. Nao havia como resolver so a autoria: a trigger e BEFORE UPDATE em
 * qualquer coluna.
 *
 * Por isso o evento pode repetir, e o indice unico do historico e PARCIAL (migration 0038) —
 * exatamente como o do periodo de teste desde a 0034. Sem ele, a segunda revelacao colidiria com o
 * primeiro evento da mesma versao.
 *
 * O LOCK fica. Ele nao existe para escrever: existe para a versao lida ser a mesma durante a
 * transacao inteira, para o 404 valer no instante da gravacao, e porque o INSERT no historico ja
 * toma `FOR KEY SHARE` na linha do processo pela FK — travar antes, na mesma ordem das demais
 * escritas, e o que impede inversao de lock com elas.
 */
export async function revelarCpfDoProcesso(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(id, empresaId, tx);
    if (!alvo) processoNaoEncontrado();

    const linha = await obterCpfDoProcessoRepository(id, empresaId, tx);
    // Processo vindo de teste nao tem CPF proprio — ele mora no teste, e e la que se revela.
    if (!linha?.cpf) {
      throw erroValidacao("Este processo nao tem CPF proprio: ele veio de um periodo de teste.");
    }

    await registrarEventoProcessoRepository(
      {
        processoId: id,
        empresaId,
        // A versao FUNCIONAL vigente no momento da leitura, vinda do lock. O evento registra "o que
        // estava valendo quando alguem leu", nao uma versao nova.
        versao: alvo.versao,
        acao: "cpf_revelado",
        atorUsuarioId: ator
      },
      tx
    );
    return { cpf: linha.cpf };
  });
}

/** Turnos da empresa para o seletor. `completo` vem derivado, para a tela nao reimplementar a regra. */
export async function listarTurnosParaAdmissao(perfil?: PerfilUsuario): Promise<TurnoOpcaoDto[]> {
  const empresaId = empresaDoAtor(perfil);
  const linhas = await listarTurnosDaEmpresaRepository(empresaId);
  return linhas.map((turno) => ({
    id: turno.id,
    nome: turno.nome,
    etiqueta: turno.etiqueta,
    diasSemana: turno.diasSemana,
    horaInicio: turno.horaInicio,
    horaFim: turno.horaFim,
    ativo: turno.ativo,
    completo: turnoCompleto(turno)
  }));
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
    cpfMascarado: linha.cpf ? cpfTotalmenteMascarado() : null,
    funcaoNome: linha.funcaoNome,
    // Resumo do RETRATO, para a lista caber numa coluna. `null` quando veio do teste, que ainda nao
    // tem turno de catalogo — nesse caso a jornada legada aparece no detalhe.
    turnoResumo: linha.turnoEtiqueta
      ? `${linha.turnoEtiqueta} · ${linha.turnoHoraInicio?.slice(0, 5) ?? ""}–${linha.turnoHoraFim?.slice(0, 5) ?? ""}`
      : null,
    dataAdmissao: linha.internosDataAdmissao,
    exameSituacao: linha.exameSituacao,
    // Situacao, e so ela. Nenhum campo da ficha e nenhum dependente passam por aqui.
    fichaSituacao: linha.fichaSituacao,
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
    // PAUSADO continua editavel — e obrigatorio que continue: e registrando `aso_apto` num processo
    // pausado que ele volta a `iniciado`. Recusar aqui deixaria a pausa sem saida.
    if (alvo.status === "cancelado") {
      throw conflito("Este processo de admissao foi cancelado", "PROCESSO_NAO_EDITAVEL");
    }

    const internos = await bloquearInternosRepository(id, empresaId, tx);
    if (!internos) processoNaoEncontrado();
    if (internos.versao !== dados.versao) {
      throw conflito("Alguem alterou estes dados enquanto voce editava", "VERSAO_CONFLITANTE");
    }
    const vinculo = await obterVinculoEfetivadoRepository(id, empresaId, tx);
    if (vinculo && dados.dataAdmissao !== vinculo.admitidoEm) {
      throw conflito(
        "A data de efetivacao e historica e nao pode ser alterada apos efetivar o colaborador",
        "DATA_EFETIVACAO_IMUTAVEL"
      );
    }

    const destino =
      dados.destinoClinica === undefined
        ? {
            clinicaId: internos.exameClinicaId,
            clinicaNome: internos.exameClinica,
            unidadeId: internos.exameUnidadeId,
            unidadeNome: internos.exameUnidade
          }
        : dados.destinoClinica === null
          ? { clinicaId: null, clinicaNome: null, unidadeId: null, unidadeNome: null }
          : await obterDestinoClinicaAtivoRepository(
              { empresaId, clinicaId: dados.destinoClinica.clinicaId, unidadeId: dados.destinoClinica.unidadeId },
              tx
            );
    if (!destino) {
      throw erroValidacao("Selecione uma clinica ativa e uma unidade pertencente a ela", "DESTINO_CLINICA_INVALIDO");
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
        exameTipo: dados.exameTipo,
        exameClinicaId: destino.clinicaId,
        exameUnidadeId: destino.unidadeId,
        exameClinica: destino.clinicaNome,
        exameUnidade: destino.unidadeNome,
        exameComplementares: dados.exameComplementares,
        exameAgendadoPara: dados.exameAgendadoPara,
        exameResponsavelNome: dados.exameResponsavelNome,
        exameResponsavelTelefone: dados.exameResponsavelTelefone,
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
        camposAlterados: [
          "dataAdmissao",
          "ctpsNumero",
          "ctpsSerie",
          "ctpsUf",
          "pisPasepNit",
          "exameTipo",
          "destinoClinica",
          "exameComplementares",
          "exameAgendadoPara",
          "exameResponsavelNome",
          "exameResponsavelTelefone",
          "observacoesRh"
        ]
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
    // PAUSADO continua editavel — e obrigatorio que continue: e registrando `aso_apto` num processo
    // pausado que ele volta a `iniciado`. Recusar aqui deixaria a pausa sem saida.
    if (alvo.status === "cancelado") {
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

    /**
     * A PAUSA e a RETOMADA sao CONSEQUENCIA de registrar o ASO, na mesma transacao — nunca atos
     * proprios. Nao existe rota nem botao de retomar: um verbo separado para isto seria o segundo
     * caminho para o mesmo ato, que a regra-mae proibe.
     *
     * Retomar so acontece a partir de PAUSADO. Registrar apto num processo ja iniciado nao mexe no
     * status — nao ha nada de onde voltar.
     */
    const statusAlvo =
      dados.situacao === "aso_nao_apto" && alvo.status === "iniciado"
        ? ("pausado" as const)
        : dados.situacao === "aso_apto" && alvo.status === "pausado"
          ? ("iniciado" as const)
          : null;

    if (statusAlvo) {
      const transicao = await definirStatusProcessoRepository(
        { id, empresaId, versaoAtual: evento.versao, status: statusAlvo, atorUsuarioId: ator },
        tx
      );
      if (!transicao) {
        throw conflito("Alguem alterou este processo enquanto voce editava", "VERSAO_CONFLITANTE");
      }
      await registrarEventoProcessoRepository(
        {
          processoId: id,
          empresaId,
          versao: transicao.versao,
          acao: statusAlvo === "pausado" ? "pausado" : "retomado",
          atorUsuarioId: ator
        },
        tx
      );
    }

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
    // Pausado TAMBEM cancela: um processo parado por ASO nao apto e justamente um dos que o DP vai
    // querer encerrar. `cancelado` continua terminal — dali nao se volta.
    if (alvo.status === "cancelado") {
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
