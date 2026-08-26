import {
  cancelarTestePayloadSchema,
  criarTestePayloadSchema,
  cpfTotalmenteMascarado,
  editarTestePayloadSchema,
  encerrarTestePayloadSchema,
  situacaoDoTeste,
  statusDaSituacao,
  verificarCpfPayloadSchema,
  type PrazoTeste,
  type StatusTeste,
  type TesteDetalheDto,
  type TesteListaDto,
  type TestesQuery
} from "@padaria/shared/admissoes";
import type { DadosExternos, PaginationQuery } from "@padaria/shared/api";
import { diaNegocio, janelaDiaNegocio } from "@padaria/shared/datas";
import type { PerfilUsuario } from "@padaria/shared";
import { conflito, naoEncontrado } from "../erros.js";
import { falharValidacao } from "../utils.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import {
  atualizarTesteRepository,
  bloquearTesteRepository,
  cancelarTesteRepository,
  criarTesteRepository,
  encerrarTesteRepository,
  obterFuncaoDaEmpresaRepository,
  existeColaboradorPorCpfRepository,
  existeTesteAbertoPorCpfRepository,
  existeTesteAbertoPorCpfSemTransacaoRepository,
  listarFuncoesDaEmpresaRepository,
  listarHistoricoRepository,
  listarTestesRepository,
  obterCpfDoTesteRepository,
  obterTesteRepository,
  registrarEventoRepository,
  type TesteDetalheLinha,
  type TesteLinha
} from "./admissoes.repository.js";
import { atorDoPerfil, empresaDoAtor } from "./ator.js";
import { criarProcessoDaEfetivacao } from "./processos.service.js";
import { obterProcessoPorTesteRepository } from "./processos.repository.js";

function testeNaoEncontrado(): never {
  // MESMA resposta para "nao existe" e para "e de outra empresa", de proposito: distinguir os dois
  // transformaria a rota num oraculo de existencia sobre pessoa fisica de outro tenant.
  throw naoEncontrado("Periodo de teste nao encontrado", "TESTE_NAO_ENCONTRADO");
}

// --- Prazo ----------------------------------------------------------------------------------------
// Derivado no fuso do negocio, nunca gravado. Somente dois alertas existem; `no_prazo` e a ausencia
// de alerta. O sistema NAO encerra, nao efetiva e nao avisa ninguem por conta do prazo.
//
// A comparacao e de DIA de negocio ("yyyy-MM-dd", ordenavel como texto), nao de instante: um fim
// combinado para hoje as 08:00 continua "vence hoje" as 18:00, e nao "vencido".
function prazoDoTeste(status: StatusTeste, fimCombinadoEm: Date, agora: Date): PrazoTeste | null {
  if (status !== "em_teste") return null;
  const hoje = diaNegocio(agora);
  const fim = diaNegocio(fimCombinadoEm);
  if (fim < hoje) return "vencido";
  if (fim === hoje) return "vence_hoje";
  return "no_prazo";
}

function paraListaDto(linha: TesteLinha, agora: Date): TesteListaDto {
  return {
    id: linha.id,
    nomeCompleto: linha.nomeCompleto,
    // Constante. A lista nunca carrega digito nenhum do CPF — nem parcial.
    cpfMascarado: cpfTotalmenteMascarado(),
    funcaoId: linha.funcaoId,
    funcaoNome: linha.funcaoNome,
    funcaoCbo: linha.funcaoCbo,
    jornadaHorario: linha.jornadaHorario,
    inicioEm: linha.inicioEm.toISOString(),
    fimCombinadoEm: linha.fimCombinadoEm.toISOString(),
    status: linha.status,
    situacao: situacaoDoTeste(linha.status),
    resultado: linha.resultado,
    prazo: prazoDoTeste(linha.status, linha.fimCombinadoEm, agora),
    versao: linha.versao
  };
}

function paraDetalheDto(linha: TesteDetalheLinha, agora: Date): TesteDetalheDto {
  return {
    ...paraListaDto(linha, agora),
    motivoCancelamento: linha.motivoCancelamento,
    criadoPorNome: linha.criadoPorNome,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoPorNome: linha.atualizadoPorNome,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    encerradoPorNome: linha.encerradoPorNome,
    encerradoEm: linha.encerradoEm?.toISOString() ?? null,
    canceladoPorNome: linha.canceladoPorNome,
    canceladoEm: linha.canceladoEm?.toISOString() ?? null,
    processoId: linha.processoId
  };
}

// --- Leitura --------------------------------------------------------------------------------------

export async function listarTestes(query: TestesQuery, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const agora = new Date();
  const resultado = await listarTestesRepository(
    empresaId,
    query,
    query.situacao ? statusDaSituacao(query.situacao) : [],
    janelaDiaNegocio(diaNegocio(agora))
  );
  return { ...resultado, itens: resultado.itens.map((linha) => paraListaDto(linha, agora)) };
}

export async function obterTeste(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const linha = await obterTesteRepository(id, empresaId);
  if (!linha) testeNaoEncontrado();
  return paraDetalheDto(linha, new Date());
}

export async function listarHistorico(id: string, query: PaginationQuery, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  // Confere o alvo antes: sem isto o historico de um teste de outra empresa responderia 200 vazio,
  // que e resposta diferente do 404 que a rota irma devolve — duas negacoes para a mesma coisa.
  const alvo = await obterTesteRepository(id, empresaId);
  if (!alvo) testeNaoEncontrado();
  const resultado = await listarHistoricoRepository(id, empresaId, query);
  return {
    ...resultado,
    itens: resultado.itens.map((evento) => ({
      id: evento.id,
      versao: evento.versao,
      acao: evento.acao,
      atorNome: evento.atorNome,
      camposAlterados: evento.camposAlterados,
      ocorridoEm: evento.ocorridoEm.toISOString()
    }))
  };
}

export async function listarFuncoesAdmissoes(perfil?: PerfilUsuario) {
  return listarFuncoesDaEmpresaRepository(empresaDoAtor(perfil));
}

// --- Verificacao de CPF ---------------------------------------------------------------------------
//
// POST, e nao GET com `?cpf=`: query string entra em log de acesso, historico do navegador e
// cabecalho `referer`. A resposta e de DOIS BOOLEANOS — sem id, sem nome, sem vinculo. Devolver o
// registro faria a rota virar oraculo sobre pessoa fisica.
export async function verificarCpf(body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const dados = verificarCpfPayloadSchema.parse(body);
  const [jaExisteColaborador, jaExisteTesteAberto] = await Promise.all([
    existeColaboradorPorCpfRepository(empresaId, dados.cpf),
    existeTesteAbertoPorCpfSemTransacaoRepository(empresaId, dados.cpf)
  ]);
  return { jaExisteColaborador, jaExisteTesteAberto };
}

/**
 * A funcao existe nesta empresa e pode ser USADA agora?
 *
 * `permitirInativa` existe para a edicao: um teste antigo pode apontar para funcao desativada depois,
 * e recusar a edicao inteira por causa disso impediria corrigir um nome. Trocar PARA uma inativa
 * continua recusado — desativar existe justamente para tirar a funcao das escolhas novas.
 *
 * A mensagem nao distingue "nao existe" de "e de outra empresa": distinguir entregaria a existencia
 * de uma funcao de outro tenant de graca.
 */
async function exigirFuncaoUtilizavel(
  funcaoId: string,
  empresaId: string,
  tx: TransacaoBanco,
  permitirInativa: boolean
) {
  const funcao = await obterFuncaoDaEmpresaRepository(funcaoId, empresaId, tx);
  if (!funcao) falharValidacao("Funcao nao pertence a empresa");
  if (!funcao.ativo && !permitirInativa) falharValidacao("Esta funcao esta inativa e nao pode ser escolhida");
}

// --- Escrita --------------------------------------------------------------------------------------

export async function criarTeste(body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = criarTestePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    await exigirFuncaoUtilizavel(dados.funcaoId, empresaId, tx, false);
    // Pre-checagem para a mensagem ser exata. NAO e a garantia: a garantia e o indice unico parcial,
    // conferido logo abaixo pelo retorno nulo do insert.
    if (await existeTesteAbertoPorCpfRepository({ empresaId, cpf: dados.cpf }, tx)) {
      throw conflito("Ja existe um periodo de teste em andamento para este CPF", "TESTE_ABERTO_DUPLICADO");
    }

    const criado = await criarTesteRepository(
      {
        empresaId,
        nomeCompleto: dados.nomeCompleto,
        cpf: dados.cpf,
        funcaoId: dados.funcaoId,
        jornadaHorario: dados.jornadaHorario,
        inicioEm: new Date(dados.inicioEm),
        fimCombinadoEm: new Date(dados.fimCombinadoEm),
        atorUsuarioId: ator
      },
      tx
    );
    // Nulo aqui significa que o indice unico parcial recusou: duas criacoes simultaneas do mesmo CPF
    // passaram pela verificacao acima e so uma pode gravar. 409, nao 500.
    if (!criado) {
      throw conflito("Ja existe um periodo de teste em andamento para este CPF", "TESTE_ABERTO_DUPLICADO");
    }

    await registrarEventoRepository(
      { testeId: criado.id, empresaId, versao: criado.versao, acao: "criado", atorUsuarioId: ator },
      tx
    );
    return criado;
  });
}

// Nomes de campos alterados — nunca os valores. E o que a trilha guarda.
function camposAlterados(
  antes: { nomeCompleto: string; cpf: string; funcaoId: string; jornadaHorario: string; inicioEm: Date; fimCombinadoEm: Date },
  depois: { nomeCompleto: string; cpf: string; funcaoId: string; jornadaHorario: string; inicioEm: Date; fimCombinadoEm: Date }
) {
  const campos: string[] = [];
  if (antes.nomeCompleto !== depois.nomeCompleto) campos.push("nomeCompleto");
  if (antes.cpf !== depois.cpf) campos.push("cpf");
  if (antes.funcaoId !== depois.funcaoId) campos.push("funcaoId");
  if (antes.jornadaHorario !== depois.jornadaHorario) campos.push("jornadaHorario");
  if (antes.inicioEm.getTime() !== depois.inicioEm.getTime()) campos.push("inicioEm");
  if (antes.fimCombinadoEm.getTime() !== depois.fimCombinadoEm.getTime()) campos.push("fimCombinadoEm");
  return campos;
}

export async function editarTeste(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = editarTestePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    // Autorizacao ANTES da validacao de regra: validar primeiro responderia "funcao invalida" para
    // um teste de outra empresa, entregando existencia de graca.
    const alvo = await bloquearTesteRepository(id, empresaId, tx);
    if (!alvo) testeNaoEncontrado();
    if (alvo.status !== "em_teste") {
      throw conflito("Este periodo de teste ja foi encerrado ou cancelado e nao pode mais ser alterado", "TESTE_NAO_EDITAVEL");
    }
    if (alvo.versao !== dados.versao) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }
    // Manter a funcao que ja estava gravada e permitido mesmo se ela foi desativada depois; trocar
    // PARA uma inativa, nao.
    await exigirFuncaoUtilizavel(dados.funcaoId, empresaId, tx, dados.funcaoId === alvo.funcaoId);
    // `cpf` ausente PRESERVA o gravado: a tela nao tem o valor para reenviar, porque o detalhe
    // devolve mascarado. Quem quer trocar o CPF digita um novo, e so entao ele viaja.
    const cpfFinal = dados.cpf ?? alvo.cpf;
    if (
      cpfFinal !== alvo.cpf &&
      (await existeTesteAbertoPorCpfRepository({ empresaId, cpf: cpfFinal, ignorarId: id }, tx))
    ) {
      throw conflito("Ja existe um periodo de teste em andamento para este CPF", "TESTE_ABERTO_DUPLICADO");
    }

    const depois = {
      nomeCompleto: dados.nomeCompleto,
      cpf: cpfFinal,
      funcaoId: dados.funcaoId,
      jornadaHorario: dados.jornadaHorario,
      inicioEm: new Date(dados.inicioEm),
      fimCombinadoEm: new Date(dados.fimCombinadoEm)
    };
    const alterados = camposAlterados(alvo, depois);

    const atualizado = await atualizarTesteRepository(
      { id, empresaId, versaoAtual: alvo.versao, ...depois, atorUsuarioId: ator },
      tx
    );
    // Inalcancavel com o lock acima, e mantido de proposito: no minuto em que alguem remover o lock
    // ou tirar a versao do WHERE, este ramo volta a ser o que impede o falso 204.
    if (!atualizado) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    await registrarEventoRepository(
      {
        testeId: id,
        empresaId,
        versao: atualizado.versao,
        acao: "alterado",
        atorUsuarioId: ator,
        camposAlterados: alterados
      },
      tx
    );
    return atualizado;
  });
}

export async function encerrarTeste(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = encerrarTestePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearTesteRepository(id, empresaId, tx);
    if (!alvo) testeNaoEncontrado();

    // --- RAMO IDEMPOTENTE (ADM-002 C-1.1) --------------------------------------------------------
    //
    // "Efetivar para admissao" e o unico caminho para iniciar a admissao, mas caminho unico nao e
    // chamada unica: duplo clique e resposta de rede perdida sao o caso normal, e o segundo envio
    // chega com payload identico.
    //
    // Ele vem ANTES da checagem de `versao` de proposito. A repeticao carrega a versao ANTERIOR a
    // transicao — o cliente nao recebeu a resposta que a incrementaria. Checar versao primeiro
    // recusaria a repeticao com VERSAO_CONFLITANTE, e o erro ambiguo voltaria com outro nome.
    //
    // Este ramo NAO ESCREVE, entao dispensa guarda de concorrencia. O que ele exige e igualdade de
    // INTENCAO: o mesmo resultado que ja foi gravado.
    if (alvo.status === "encerrado" && dados.resultado === "aprovado_para_admissao") {
      if (alvo.resultado !== "aprovado_para_admissao") {
        throw conflito("Este periodo de teste foi encerrado com outro desfecho", "TESTE_NAO_EDITAVEL");
      }
      const existente = await obterProcessoPorTesteRepository(id, empresaId, tx);
      if (!existente) {
        // INVARIANTE: teste encerrado como aprovado SEMPRE tem processo — os dois nascem na mesma
        // transacao e ha unique(teste_id). Chegar aqui significa atomicidade quebrada. Falhar alto e
        // melhor que criar o processo agora, que repararia por efeito colateral e esconderia o
        // defeito.
        throw new Error("Invariante quebrada: teste aprovado sem processo de admissao");
      }
      return { ...alvo, processoId: existente.id };
    }

    // Fora do ramo acima, encerrar ja encerrado NAO e idempotente: trocar o desfecho de um teste
    // terminado exigiria uma decisao que ninguem tomou. Recusa explicita.
    if (alvo.status !== "em_teste") {
      throw conflito("Este periodo de teste ja foi encerrado ou cancelado", "TESTE_NAO_EDITAVEL");
    }
    if (alvo.versao !== dados.versao) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const encerrado = await encerrarTesteRepository(
      { id, empresaId, versaoAtual: alvo.versao, resultado: dados.resultado, atorUsuarioId: ator, encerradoEm: new Date() },
      tx
    );
    if (!encerrado) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    await registrarEventoRepository(
      { testeId: id, empresaId, versao: encerrado.versao, acao: "encerrado", atorUsuarioId: ator },
      tx
    );

    // A admissao nasce AQUI, na mesma transacao. Nao ha acao "iniciar admissao": um segundo caminho
    // para o mesmo ato e o defeito que a regra-mae do PROJECT_BRAIN/16 proibe. Falha de qualquer
    // parte desfaz o encerramento junto.
    if (dados.resultado !== "aprovado_para_admissao") return { ...encerrado, processoId: null };

    const processo = await criarProcessoDaEfetivacao(
      { empresaId, testeId: id, atorUsuarioId: ator },
      tx
    );
    return { ...encerrado, processoId: processo.id };
  });
}

/**
 * "Excluir" da tela E este cancelamento.
 *
 * Nao existe DELETE fisico nesta vertical, e nao e so uma escolha de produto: o historico referencia
 * a raiz com `on delete cascade`, entao apagar a linha apagaria a propria auditoria junto.
 */
export async function cancelarTeste(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = cancelarTestePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearTesteRepository(id, empresaId, tx);
    if (!alvo) testeNaoEncontrado();
    // Repetir o MESMO cancelamento e idempotente: devolve o estado ja cancelado e NAO grava segundo
    // evento. E o caso do duplo clique e do retry de rede, nao um erro do operador.
    if (alvo.status === "cancelado") return { versao: alvo.versao };
    if (alvo.status === "encerrado") {
      throw conflito("Este periodo de teste ja foi encerrado e nao pode ser cancelado", "TESTE_NAO_EDITAVEL");
    }
    if (alvo.versao !== dados.versao) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    const cancelado = await cancelarTesteRepository(
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
    if (!cancelado) {
      throw conflito("Alguem alterou este periodo de teste enquanto voce editava", "VERSAO_CONFLITANTE");
    }

    await registrarEventoRepository(
      { testeId: id, empresaId, versao: cancelado.versao, acao: "cancelado", atorUsuarioId: ator },
      tx
    );
    return cancelado;
  });
}

/**
 * Revela o CPF do detalhe e REGISTRA o ato.
 *
 * Leitura e evento na MESMA transacao: se a auditoria falhar, o CPF nao sai. Revelacao sem trilha
 * seria pior do que nao ter a funcao.
 *
 * O evento nao incrementa a versao (nada mudou no teste) e por isso pode repetir — o indice unico do
 * historico e PARCIAL justamente para nao recusar a segunda revelacao.
 */
export async function revelarCpf(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);

  return executarEmTransacao(async (tx) => {
    const linha = await obterCpfDoTesteRepository(id, empresaId, tx);
    if (!linha) testeNaoEncontrado();
    await registrarEventoRepository(
      { testeId: id, empresaId, versao: linha.versao, acao: "cpf_revelado", atorUsuarioId: ator },
      tx
    );
    return { cpf: linha.cpf };
  });
}
