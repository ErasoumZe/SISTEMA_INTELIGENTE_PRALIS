import type { DadosExternos } from "@padaria/shared/api";
import type {
  CargoPayload,
  ColaboradorCargoPayload,
  ColaboradorCargoStatusPayload,
  FaltaJustificadaPayload,
  JornadaPayload
} from "@padaria/shared/colaboradores";
import {
  colaboradorPayloadSchema,
  type ColaboradorPayload as ColaboradorDadosPayload,
  type ExportarCargoPayload,
  type ExportarColaboradorPayload,
  type ImportarCargosPayload,
  type ImportarColaboradoresPayload
} from "@padaria/shared/colaboradores";
import { diasSemana } from "@padaria/shared/colaboradores";
import { diaNegocio } from "@padaria/shared/datas";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { temAlgumaPermissao, type PerfilUsuario } from "@padaria/shared";
import { apenasDigitos, falharValidacao } from "../utils.js";
import { copiarAreasSetoresRepository } from "../areas/areas.repository.js";
import {
  atualizarCargoRepository,
  atualizarStatusCargoColaboradorRepository,
  bloquearCargoRepository,
  bloquearColaboradorRepository,
  bloquearVinculoCargoRepository,
  contarCargosAtivosColaboradorRepository,
  copiarCargosRepository,
  copiarColaboradoresRepository,
  criarCargoColaboradorRepository,
  criarCargoRepository,
  criarFaltaJustificadaRepository,
  criarJornadasColaboradorRepository,
  existeCargoAtivoColaboradorRepository,
  existeCargoNaEmpresaRepository,
  existeSetorNaEmpresaRepository,
  existeTurnoNaEmpresaRepository,
  listarColaboradoresRepository,
  listarCargosColaboradorRepository,
  listarCargosRepository,
  listarFaltasJustificadasRepository,
  listarJornadasColaboradorRepository,
  salvarCargoColaboradorRepository,
  salvarColaboradorRepository
} from "./colaboradores.repository.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, naoEncontrado, proibido } from "../erros.js";

// --- Fronteira de empresa (CX-M05) --------------------------------------------------------------
//
// Ate aqui o modulo inteiro decidia autorizacao pelo `empresaId` do CORPO, escolhido por quem
// edita, e nenhuma rota lia a empresa REAL do alvo. Estas quatro funcoes sao o contrato novo.

// Fail-closed antes de qualquer leitura, no espirito do `exigirAtor` da PR #145
// (usuarios.service.ts:173-176). Nao ha rota que chegue aqui sem perfil hoje (o hook default-deny
// de app.ts:153-159 responde antes), mas seguranca nao pode depender de nenhum chamador lembrar.
function exigirAtor(perfil?: PerfilComEmpresa): PerfilComEmpresa {
  if (!perfil) throw proibido("Perfil de usuario nao configurado", "PROFILE_NOT_CONFIGURED");
  return perfil;
}

function empresaNaoPermitida(): never {
  throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

// MESMO codigo para "nao existe" e para "existe em outra empresa", de proposito: distinguir os dois
// transformaria a rota num oraculo de existencia sobre pessoa fisica de outro tenant. O ator que
// tem a empresa nunca ve este 404 por engano — para ele os dois casos sao igualmente inalcancaveis.
function colaboradorNaoEncontrado(): never {
  throw naoEncontrado("Colaborador nao encontrado", "COLLABORATOR_NOT_FOUND");
}

// Portao unico de TODA escrita que tem um colaborador no PATH. Trava a linha raiz, devolve a
// empresa real e recusa antes de qualquer validacao de payload — validar primeiro faria a mensagem
// de erro virar oraculo, que e o que a PR #145 removeu em usuarios.service.ts:283-286.
async function bloquearColaboradorDoAtor(
  colaboradorId: string,
  empresaInformada: string,
  perfil: PerfilComEmpresa,
  tx: TransacaoBanco
) {
  const colaborador = await bloquearColaboradorRepository(colaboradorId, empresasPermitidas(perfil), tx);
  if (!colaborador) colaboradorNaoEncontrado();
  // O corpo afirmou uma empresa que nao e a do alvo. Aqui o ator TEM as duas (o controller ja
  // barrou o que esta fora do escopo dele), entao 403 nao vaza nada — e recusar e mais honesto que
  // ignorar o campo e gravar em silencio na empresa certa.
  if (colaborador.empresaId !== empresaInformada) empresaNaoPermitida();
  return colaborador;
}

type FaixaJornada = {
  diaDaSemana: string;
  horaEntrada: string;
  cargaHorariaDiariaEmMinutos: number;
  intervaloMinutos: number;
  colaboradorCargoId: string | null;
};

function horaParaMinutos(valor: string) {
  const [horasRaw, minutosRaw] = valor.split(":");
  const horas = Number.parseInt(horasRaw ?? "", 10);
  const minutos = Number.parseInt(minutosRaw ?? "", 10);
  if (!Number.isFinite(horas) || !Number.isFinite(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    throw new Error("Hora invalida");
  }
  return horas * 60 + minutos;
}

function validarSobreposicaoJornada(faixas: FaixaJornada[]) {
  for (const dia of diasSemana) {
    const intervalos = faixas
      .filter((faixa) => faixa.diaDaSemana === dia && faixa.cargaHorariaDiariaEmMinutos > 0)
      .map((faixa) => {
        const inicio = horaParaMinutos(faixa.horaEntrada);
        const fim = inicio + faixa.cargaHorariaDiariaEmMinutos + faixa.intervaloMinutos;
        if (fim > 24 * 60) throw new Error("Faixa de horario ultrapassa o dia");
        return { inicio, fim };
      })
      .sort((a, b) => a.inicio - b.inicio);
    for (let index = 1; index < intervalos.length; index += 1) {
      const atual = intervalos[index];
      const anterior = intervalos[index - 1];
      if (atual && anterior && atual.inicio < anterior.fim) throw new Error("Faixas de horario sobrepostas");
    }
  }
}

export async function listarCargos(escopoDados: string[]) {
  return listarCargosRepository(escopoDados);
}

// Quem chega a `GET /api/colaboradores` SO por `caixa_operar` (colaboradores.controller.ts:70) usa
// a lista como opcao de formulario: credor de despesa/retirada
// (web-vue/components/operacoes/OperacaoLancamentoCredor.vue:42) e item da discriminacao
// (OperacaoLancamentoDiscriminacao.vue:89-90). Os dois leem SO `id` e `nome`; `empresaId` fica
// porque o recorte de empresa do cliente depende dele (web-vue/utils/domain.ts:684-688).
//
// Entregar CPF de todo o quadro a quem so opera caixa e minimizacao de dados que nunca existiu, e o
// `usuarioId` de cada colega e um identificador reaproveitavel em outras rotas. Quem cadastra
// colaborador ou edita usuario continua recebendo os 7 campos — retirar qualquer um deles apagaria
// dado no proximo PUT, porque o payload de cadastro e substituicao total
// (shared/src/cadastros/index.ts:405-413).
const PERMISSOES_CONTRATO_COMPLETO = ["cadastro_colaboradores_visualizar", "cadastro_usuarios_visualizar"] as const;

export async function listarColaboradores(escopoDados: string[], perfil?: PerfilUsuario) {
  const linhas = await listarColaboradoresRepository(escopoDados);
  if (perfil && temAlgumaPermissao(perfil.permissoes, [...PERMISSOES_CONTRATO_COMPLETO])) return linhas;
  return linhas.map((linha) => ({ id: linha.id, empresaId: linha.empresaId, nome: linha.nome }));
}

export async function salvarColaborador(id: string | null, body: DadosExternos, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  const dados: ColaboradorDadosPayload = colaboradorPayloadSchema.parse(body);
  if (!podeAcessarEmpresa(ator, dados.empresaId)) empresaNaoPermitida();

  return executarEmTransacao(async (tx) => {
    // PRIMEIRA instrucao da transacao, antes de qualquer INSERT em tabela filha: um INSERT em
    // `colaboradores_cargos` ja toma FOR KEY SHARE implicito na linha pai pela verificacao de FK, e
    // FOR KEY SHARE conflita com FOR UPDATE. Travando primeiro, o lock implicito vira upgrade
    // dentro da propria transacao; travando depois, duas edicoes simultaneas fecham um ciclo.
    const alvo = id ? await bloquearColaboradorDoAtor(id, dados.empresaId, ator, tx) : null;
    // A empresa REAL do alvo manda em tudo o que vem depois. Na criacao nao ha alvo, e a empresa e
    // a do corpo — ja conferida contra o escopo do ator acima.
    const empresaReal = alvo?.empresaId ?? dados.empresaId;

    const cargo = await existeCargoNaEmpresaRepository(dados.cargoId, empresaReal, tx);
    if (!cargo) falharValidacao("Cargo nao pertence a empresa");
    // `setorId` e `turnoPadraoId` nunca eram validados: as FKs apontam para `setores.id` e
    // `turnos.id` sem compor `empresa_id` (db/src/schema/app.schema.ts:327,330), entao gravar
    // setor/turno de outra empresa passava — e o UUID estrangeiro voltava pelo GET. O setor e o pior
    // dos dois: `perfil.repository.ts:88-93` resolve `permissoes_setores` por ele.
    if (dados.setorId && !(await existeSetorNaEmpresaRepository(dados.setorId, empresaReal, tx))) {
      falharValidacao("Setor nao pertence a empresa");
    }
    if (dados.turnoPadraoId && !(await existeTurnoNaEmpresaRepository(dados.turnoPadraoId, empresaReal, tx))) {
      falharValidacao("Turno nao pertence a empresa");
    }

    const colaborador = await salvarColaboradorRepository(
      {
        ...(id ? { id } : {}),
        empresaId: empresaReal,
        nome: dados.nome.trim(),
        cpf: apenasDigitos(dados.cpf),
        setorId: dados.setorId ?? null,
        turnoPadraoId: dados.turnoPadraoId ?? null
      },
      tx
    );
    // NAO E CODIGO MORTO, e tambem nao e um guard provado por teste — as duas coisas precisam estar
    // escritas aqui, senao o proximo leitor apaga.
    //
    // Hoje ele e INALCANCAVEL, e de proposito: o alvo esta travado e `empresaReal` saiu da propria
    // linha travada, entao o `where id AND empresa_id` do UPDATE sempre casa. Uma mutacao que faca o
    // repositorio voltar a fabricar o retorno nao derruba teste nenhum — foi medido.
    //
    // Ele existe como DETECTOR DE REGRESSAO: no minuto em que alguem trocar `empresaReal` por
    // `dados.empresaId` no `where`, ou remover o lock, este `if` volta a ser o que impede o falso
    // 204 que a CX-M05 corrigiu.
    if (!colaborador?.id) colaboradorNaoEncontrado();

    if (!id || !(await contarCargosAtivosColaboradorRepository(colaborador.id, empresaReal, tx))) {
      await salvarCargoColaboradorRepository(
        {
          empresaId: empresaReal,
          colaboradorId: colaborador.id,
          setorId: dados.setorId ?? null,
          cargoId: dados.cargoId,
          remuneracaoMinuto: 1,
          dataInicio: diaNegocio(new Date()),
          ativo: true
        },
        tx
      );
    }
    return colaborador;
  });
}

// `validarImportacaoEntreEmpresas`/`validarExportacaoParaEmpresa` (api/src/utils.ts:53-66) sao
// compartilhadas com outros modulos e sao `if (perfil && ...)` — sem ator elas nao validam nada.
// Aqui o ator e exigido antes e a negacao vira `ErroDominio` com codigo, para a rota nao ter duas
// formas de negar a mesma coisa (uma com `code`, outra sem).
function exigirEmpresasDaTransferencia(origemId: string, destinoId: string, perfil: PerfilComEmpresa) {
  if (origemId === destinoId) falharValidacao("Escolha empresas diferentes");
  if (!podeAcessarEmpresa(perfil, origemId) || !podeAcessarEmpresa(perfil, destinoId)) empresaNaoPermitida();
}

export async function importarColaboradores(body: ImportarColaboradoresPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  exigirEmpresasDaTransferencia(body.empresaOrigemId, body.empresaDestinoId, ator);
  const permitidas = empresasPermitidas(ator);
  return executarEmTransacao(async (tx) => {
    let inseridos = 0;
    if (body.modo === "completo") {
      inseridos += (
        await copiarAreasSetoresRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
    }
    inseridos += (
      await copiarColaboradoresRepository(
        { empresaOrigemId: body.empresaOrigemId },
        body.empresaDestinoId,
        permitidas,
        body.modo,
        tx
      )
    ).inseridos;
    return { tipo: "colaboradores", modo: body.modo, inseridos };
  });
}

export async function exportarColaborador(id: string, body: ExportarColaboradorPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, body.empresaDestinoId)) empresaNaoPermitida();
  // A ORIGEM tambem precisa de veredito explicito. Antes um id de outra empresa era recortado em
  // silencio pelo repositorio e a rota respondia 200 `inseridos: 0` — indistinguivel de sucesso.
  return executarEmTransacao(async (tx) => {
    const origem = await bloquearColaboradorRepository(id, empresasPermitidas(ator), tx);
    if (!origem) colaboradorNaoEncontrado();
    if (origem.empresaId === body.empresaDestinoId) falharValidacao("Escolha empresas diferentes");
    return copiarColaboradoresRepository({ id }, body.empresaDestinoId, empresasPermitidas(ator), body.modo, tx);
  });
}

export async function importarCargos(body: ImportarCargosPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  exigirEmpresasDaTransferencia(body.empresaOrigemId, body.empresaDestinoId, ator);
  return copiarCargosRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    empresasPermitidas(ator),
    body.modo
  );
}

export async function exportarCargo(id: string, body: ExportarCargoPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, body.empresaDestinoId)) empresaNaoPermitida();
  return executarEmTransacao(async (tx) => {
    const origem = await bloquearCargoRepository(id, empresasPermitidas(ator), tx);
    if (!origem) throw naoEncontrado("Cargo nao encontrado", "CARGO_NOT_FOUND");
    if (origem.empresaId === body.empresaDestinoId) falharValidacao("Escolha empresas diferentes");
    return copiarCargosRepository({ id }, body.empresaDestinoId, empresasPermitidas(ator), body.modo, tx);
  });
}

export async function criarCargo(payload: CargoPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  return criarCargoRepository({ empresaId: payload.empresaId, nome: payload.nome.trim() });
}

export async function atualizarCargo(id: string, payload: CargoPayload, perfil?: PerfilComEmpresa) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  return executarEmTransacao(async (tx) => {
    // 404 unico para inexistente e para cargo de outra empresa, pelo mesmo motivo do colaborador:
    // o escopo entra no proprio `where`, entao os dois casos sao indistinguiveis ja no banco.
    const alvo = await bloquearCargoRepository(id, empresasPermitidas(ator), tx);
    if (!alvo) throw naoEncontrado("Cargo nao encontrado", "CARGO_NOT_FOUND");
    if (alvo.empresaId !== payload.empresaId) empresaNaoPermitida();
    const atualizado = await atualizarCargoRepository({ id, empresaId: alvo.empresaId, nome: payload.nome.trim() }, tx);
    if (!atualizado) throw naoEncontrado("Cargo nao encontrado", "CARGO_NOT_FOUND");
    return atualizado;
  });
}

export async function listarCargosColaborador(colaboradorId: string, empresasPermitidasIds: string[]) {
  return listarCargosColaboradorRepository(colaboradorId, empresasPermitidasIds);
}

export async function criarCargoColaborador(
  colaboradorId: string,
  payload: ColaboradorCargoPayload,
  perfil?: PerfilComEmpresa
) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearColaboradorDoAtor(colaboradorId, payload.empresaId, ator, tx);
    // Tudo passa a ser conferido contra a empresa REAL do colaborador pai, nao contra o corpo.
    const cargoExiste = await existeCargoNaEmpresaRepository(payload.cargoId, alvo.empresaId, tx);
    const setorExiste = payload.setorId
      ? await existeSetorNaEmpresaRepository(payload.setorId, alvo.empresaId, tx)
      : true;
    if (!cargoExiste) throw new Error("Cargo inexistente");
    if (!setorExiste) throw new Error("Setor inexistente");

    const criado = await criarCargoColaboradorRepository(
      {
        empresaId: alvo.empresaId,
        colaboradorId,
        setorId: payload.setorId ?? null,
        cargoId: payload.cargoId,
        remuneracaoMinuto: payload.remuneracaoMinuto,
        dataInicio: payload.dataInicio,
        ativo: payload.ativo
      },
      tx
    );
    // 409, e nao o 500 de antes: repetir a mesma tupla e erro do pedido, nao queda do servidor.
    if (!criado) {
      throw conflito("Colaborador ja tem esse cargo nessa data de inicio", "CARGO_COLABORADOR_DUPLICADO");
    }
    return criado;
  });
}

export async function atualizarStatusCargoColaborador(
  colaboradorId: string,
  cargoColaboradorId: string,
  payload: ColaboradorCargoStatusPayload,
  perfil?: PerfilComEmpresa
) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  return executarEmTransacao(async (tx) => {
    // Trava a linha RAIZ do colaborador antes de olhar o vinculo e os cargos. E a mesma linha que a
    // vinculacao de usuario trava (`bloquearColaboradorUsuarioRepository`), entao os dois fluxos ficam
    // serializados: sem isto, o guard abaixo lia `usuario_id` ainda nulo enquanto uma vinculacao em
    // andamento nao commitara, nao disparava, e o ultimo cargo ativo caia debaixo dela.
    //
    // A CX-M05 acrescentou a conferencia de empresa AQUI, antes de tudo: sem ela um ator de A
    // travava e inspecionava a linha de qualquer colaborador do banco, e o 409 abaixo virava um
    // oraculo ("este colaborador de outra empresa existe, tem usuario e esta no ultimo cargo").
    const colaborador = await bloquearColaboradorDoAtor(colaboradorId, payload.empresaId, ator, tx);

    // O vinculo e o alvo real do UPDATE e ate aqui nunca era lido — a unica verificacao era o
    // `where`, cujo resultado era descartado. Ler antes do guard tambem corrige a ORDEM: o 409
    // podia disparar por uma desativacao que jamais aconteceria.
    const vinculo = await bloquearVinculoCargoRepository({ colaboradorId, cargoColaboradorId }, tx);
    if (!vinculo || vinculo.empresaId !== colaborador.empresaId) {
      throw naoEncontrado("Cargo do colaborador nao encontrado", "COLLABORATOR_ROLE_NOT_FOUND");
    }

    if (!payload.ativo && vinculo.ativo && Boolean(colaborador.usuarioId)) {
      const cargosAtivos = await contarCargosAtivosColaboradorRepository(colaboradorId, colaborador.empresaId, tx);
      // `conflito` (409), e nao `new Error`: a rota nao tem try/catch (colaboradores.controller.ts),
      // entao um Error cru cai no handler global e vira 500 INTERNAL_ERROR com alerta no Sentry. Com o
      // lock recem-adicionado esta recusa deixou de ser teorica — ela dispara sempre que a desativacao
      // perde a corrida para uma vinculacao — e um 500 faria a regra de negocio parecer queda.
      if (cargosAtivos <= 1) {
        throw conflito("Colaborador com usuario precisa ter ao menos um cargo ativo", "ULTIMO_CARGO_ATIVO");
      }
    }

    const atualizado = await atualizarStatusCargoColaboradorRepository(
      {
        colaboradorId,
        cargoColaboradorId,
        empresaId: colaborador.empresaId,
        ativo: payload.ativo
      },
      tx
    );
    if (!atualizado) throw naoEncontrado("Cargo do colaborador nao encontrado", "COLLABORATOR_ROLE_NOT_FOUND");
    return atualizado;
  });
}

export async function listarJornadasColaborador(colaboradorId: string, empresasPermitidasIds: string[]) {
  return listarJornadasColaboradorRepository(colaboradorId, empresasPermitidasIds);
}

export async function criarJornadasColaborador(
  colaboradorId: string,
  payload: JornadaPayload,
  perfil?: PerfilComEmpresa
) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  const faixas = payload.dias.flatMap((dia) =>
    dia.faixas.map((faixa) => ({
      diaDaSemana: dia.diaDaSemana,
      horaEntrada: faixa.horaEntrada,
      cargaHorariaDiariaEmMinutos: faixa.cargaHorariaDiariaEmMinutos,
      intervaloMinutos: faixa.intervaloMinutos,
      colaboradorCargoId: faixa.colaboradorCargoId ?? null
    }))
  );

  return executarEmTransacao(async (tx) => {
    // Autorizacao ANTES da validacao de payload: `validarSobreposicaoJornada` rodava primeiro e
    // respondia "faixas sobrepostas" para um colaborador de outra empresa — oraculo de graca.
    const alvo = await bloquearColaboradorDoAtor(colaboradorId, payload.empresaId, ator, tx);
    validarSobreposicaoJornada(faixas);

    for (const faixa of faixas) {
      if (faixa.cargaHorariaDiariaEmMinutos <= 0) continue;
      if (!faixa.horaEntrada) throw new Error("Horario de entrada obrigatorio");
      if (!faixa.colaboradorCargoId) throw new Error("Cargo obrigatorio na jornada");
      const cargoExiste = await existeCargoAtivoColaboradorRepository(
        {
          colaboradorCargoId: faixa.colaboradorCargoId,
          colaboradorId,
          empresaId: alvo.empresaId
        },
        tx
      );
      if (!cargoExiste) throw new Error("Cargo ativo do colaborador inexistente");
    }

    return criarJornadasColaboradorRepository(
      colaboradorId,
      {
        empresaId: alvo.empresaId,
        dataInicio: payload.dataInicio,
        faixas
      },
      tx
    );
  });
}

export async function listarFaltasJustificadas(colaboradorId: string, empresasPermitidasIds: string[]) {
  return listarFaltasJustificadasRepository(colaboradorId, empresasPermitidasIds);
}

export async function criarFaltaJustificada(
  colaboradorId: string,
  payload: FaltaJustificadaPayload,
  perfil?: PerfilComEmpresa
) {
  const ator = exigirAtor(perfil);
  if (!podeAcessarEmpresa(ator, payload.empresaId)) empresaNaoPermitida();
  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearColaboradorDoAtor(colaboradorId, payload.empresaId, ator, tx);
    if (new Date(payload.fim).getTime() <= new Date(payload.inicio).getTime()) {
      throw new Error("Fim deve ser posterior ao inicio");
    }
    return criarFaltaJustificadaRepository(
      {
        empresaId: alvo.empresaId,
        colaboradorId,
        inicio: payload.inicio,
        fim: payload.fim,
        motivo: payload.motivo.trim()
      },
      tx
    );
  });
}
