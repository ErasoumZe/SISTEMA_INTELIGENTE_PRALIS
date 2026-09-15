import { temPermissao, type PerfilUsuario } from "@padaria/shared";
import {
  situacaoDaEntrega,
  type CriarMensagemAdminPayload,
  type EntregaMensagemAdmin,
  type MensagemAdmin,
  type MensagemAdminDetalhe,
  type MensagemAdminDoOperador
} from "@padaria/shared/mensagens-admin";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { buscarPerfilUsuario } from "../auth/perfil.service.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  buscarEntregaRepository,
  caixasAbertosPorUsuarioRepository,
  carimbarEntregaRepository,
  criarAlvosRepository,
  criarEntregasRepository,
  criarMensagemRepository,
  encerrarMensagemRepository,
  listarAlvosRepository,
  listarEntregasDasMensagensRepository,
  listarEntregasDoUsuarioRepository,
  listarMensagensDoOperadorRepository,
  listarMensagensRepository,
  listarMensagensVigentesRepository,
  listarOperadoresComCaixaAbertoRepository,
  listarUsuariosDaEmpresaRepository,
  marcarEntregueRepository,
  promoverEntregasRepository,
  type EntregaResolvida
} from "./mensagens-admin.repository.js";

function exigirEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

/**
 * Quem, na empresa, é operador de caixa — decidido pela PERMISSÃO EFETIVA, nunca pelo nome do cargo.
 *
 * O projeto resolve "é Tesouraria?" por `ilike '%Tesouraria%'` em três lugares diferentes, e
 * renomear o cargo derruba aquelas notificações em silêncio. O alvo `empresa` da R-196 não repete
 * esse erro: um cargo renomeado continua recebendo, porque o que conta é `caixa_operar`.
 */
async function operadoresDaEmpresa(empresaId: string, db: ExecutorBanco): Promise<string[]> {
  const vinculados = await listarUsuariosDaEmpresaRepository(empresaId, db);
  const elegiveis = await Promise.all(
    vinculados.map(async ({ usuarioId }) => {
      const perfil = await buscarPerfilUsuario(usuarioId);
      if (!perfil || !podeAcessarEmpresa(perfil, empresaId)) return null;
      return temPermissao(perfil.permissoes, "caixa_operar") ? usuarioId : null;
    })
  );
  return elegiveis.filter((usuarioId): usuarioId is string => Boolean(usuarioId));
}

/**
 * Resolve os alvos em destinatários concretos, já deduplicados por usuário.
 *
 * O PDV não vem do alvo: vem do caixa ABERTO do destinatário no instante da resolução. Como
 * `fechamentos_caixa_operador_aberto_unico_idx` garante no máximo um caixa aberto por operador e
 * empresa, cada pessoa tem um PDV determinístico aqui — e é isso que impede a mesma pessoa de
 * ganhar duas linhas (uma com PDV, outra sem) quando casa com o alvo `empresa` e o alvo `pdv` ao
 * mesmo tempo.
 */
async function resolverDestinatarios(
  input: { empresaId: string; alvos: { tipo: string; pdvId: string | null; usuarioId: string | null }[] },
  db: ExecutorBanco
): Promise<EntregaResolvida[]> {
  const usuarios = new Set<string>();

  const pdvIds = input.alvos
    .filter((alvo) => alvo.tipo === "pdv")
    .map((alvo) => alvo.pdvId)
    .filter((pdvId): pdvId is string => Boolean(pdvId));

  if (input.alvos.some((alvo) => alvo.tipo === "caixas_abertos")) {
    for (const linha of await listarOperadoresComCaixaAbertoRepository(input.empresaId, null, db)) {
      if (linha.usuarioId) usuarios.add(linha.usuarioId);
    }
  }
  if (pdvIds.length) {
    for (const linha of await listarOperadoresComCaixaAbertoRepository(input.empresaId, pdvIds, db)) {
      if (linha.usuarioId) usuarios.add(linha.usuarioId);
    }
  }
  if (input.alvos.some((alvo) => alvo.tipo === "empresa")) {
    for (const usuarioId of await operadoresDaEmpresa(input.empresaId, db)) usuarios.add(usuarioId);
  }
  for (const alvo of input.alvos) {
    if (alvo.tipo !== "operador" || !alvo.usuarioId) continue;
    const perfil = await buscarPerfilUsuario(alvo.usuarioId);
    // Operador escolhido a dedo ainda precisa pertencer à empresa: sem esta conferência, o id de um
    // usuário de outra empresa gravaria uma entrega cruzando o isolamento.
    if (perfil && podeAcessarEmpresa(perfil, input.empresaId)) usuarios.add(alvo.usuarioId);
  }

  const lista = [...usuarios];
  const caixas = await caixasAbertosPorUsuarioRepository(input.empresaId, lista, db);
  return lista.map((usuarioId) => {
    const caixa = caixas.get(usuarioId);
    return {
      usuarioId,
      pdvId: caixa?.pdvId ?? null,
      fechamentoCaixaId: caixa?.fechamentoCaixaId ?? null
    };
  });
}

/** Uma linha de sino por ENTREGA — `referencia_id` aponta para a entrega, nunca para a mensagem. */
async function criarNotificacoesDasEntregas(
  input: {
    empresaId: string;
    titulo: string;
    entregas: { id: string; destinatarioUsuarioId: string }[];
  },
  db: ExecutorBanco
) {
  for (const entrega of input.entregas) {
    await criarNotificacoesRepository(
      {
        empresaId: input.empresaId,
        tipo: "mensagem_admin",
        destinatariosUsuarioIds: [entrega.destinatarioUsuarioId],
        referenciaId: entrega.id,
        titulo: input.titulo
      },
      db
    );
  }
}

export async function criarMensagemAdmin(dados: CriarMensagemAdminPayload, perfil: PerfilUsuario) {
  exigirEmpresa(perfil, dados.empresaId);

  const validoAte = dados.validoAte ? new Date(dados.validoAte) : null;
  // Mensagem que nasce expirada não alcança ninguém e só polui o painel.
  if (validoAte && validoAte.getTime() <= Date.now()) {
    throw erroValidacao("A validade da mensagem precisa estar no futuro", "VALIDADE_NO_PASSADO");
  }

  return executarEmTransacao(async (tx) => {
    const mensagemId = await criarMensagemRepository(
      {
        empresaId: dados.empresaId,
        titulo: dados.titulo,
        corpo: dados.corpo,
        validoAte,
        criadoPor: perfil.usuarioId
      },
      tx
    );
    await criarAlvosRepository({ empresaId: dados.empresaId, mensagemId, alvos: dados.alvos }, tx);

    const destinatarios = await resolverDestinatarios(
      {
        empresaId: dados.empresaId,
        alvos: dados.alvos.map((alvo) => ({
          tipo: alvo.tipo,
          pdvId: alvo.tipo === "pdv" ? alvo.pdvId : null,
          usuarioId: alvo.tipo === "operador" ? alvo.usuarioId : null
        }))
      },
      tx
    );
    const entregas = await criarEntregasRepository({ empresaId: dados.empresaId, mensagemId, destinatarios }, tx);
    await criarNotificacoesDasEntregas({ empresaId: dados.empresaId, titulo: dados.titulo, entregas }, tx);

    return { id: mensagemId, destinatarios: entregas.length };
  });
}

/**
 * R-195/R-196 na abertura do caixa: promove a entrega que existia sem PDV e materializa a mensagem
 * de quem ainda não tinha sido alcançado. Roda DENTRO da transação da abertura e é idempotente nas
 * duas metades — a promoção só toca linha com `pdv_id` nulo, e a criação passa pelos uniques
 * parciais com `ON CONFLICT DO NOTHING`.
 *
 * Nunca lança: uma mensagem administrativa não pode impedir a padaria de abrir o caixa.
 */
export async function materializarMensagensNaAberturaDeCaixa(
  input: { empresaId: string; usuarioId: string; pdvId: string; fechamentoCaixaId: string },
  db: ExecutorBanco
) {
  const agora = new Date();
  const vigentes = await listarMensagensVigentesRepository(input.empresaId, agora, db);
  if (!vigentes.length) return;
  const mensagemIds = vigentes.map((mensagem) => mensagem.id);

  const existentes = await listarEntregasDoUsuarioRepository(
    { empresaId: input.empresaId, usuarioId: input.usuarioId, mensagemIds },
    db
  );

  // Já tem linha NESTE PDV? Então não promove nem cria: a entrega dele aqui já existe.
  const comEstePdv = new Set(existentes.filter((e) => e.pdvId === input.pdvId).map((e) => e.mensagemId));
  const promoveveis = existentes.filter(
    (entrega) => entrega.pdvId === null && entrega.confirmadaEm === null && !comEstePdv.has(entrega.mensagemId)
  );
  await promoverEntregasRepository(
    {
      entregaIds: promoveveis.map((entrega) => entrega.id),
      pdvId: input.pdvId,
      fechamentoCaixaId: input.fechamentoCaixaId
    },
    db
  );

  const jaAlcancado = new Set(existentes.map((entrega) => entrega.mensagemId));
  const faltantes = mensagemIds.filter((mensagemId) => !jaAlcancado.has(mensagemId));
  if (!faltantes.length) return;

  for (const mensagemId of faltantes) {
    const alvos = await listarAlvosRepository(mensagemId, db);
    const alcanca = alvos.some(
      (alvo) =>
        alvo.tipo === "empresa" ||
        (alvo.tipo === "pdv" && alvo.pdvId === input.pdvId) ||
        (alvo.tipo === "operador" && alvo.usuarioId === input.usuarioId)
    );
    // `caixas_abertos` fica de fora de propósito (R-196): é foto do instante do envio.
    if (!alcanca) continue;

    const entregas = await criarEntregasRepository(
      {
        empresaId: input.empresaId,
        mensagemId,
        destinatarios: [{ usuarioId: input.usuarioId, pdvId: input.pdvId, fechamentoCaixaId: input.fechamentoCaixaId }]
      },
      db
    );
    const [mensagem] = await listarMensagensRepository(input.empresaId, db).then((linhas) =>
      linhas.filter((linha) => linha.id === mensagemId)
    );
    await criarNotificacoesDasEntregas(
      { empresaId: input.empresaId, titulo: mensagem?.titulo ?? "Mensagem da administracao", entregas },
      db
    );
  }
}

export async function listarMensagensDoOperador(
  empresaId: string,
  perfil: PerfilUsuario
): Promise<MensagemAdminDoOperador[]> {
  exigirEmpresa(perfil, empresaId);
  const agora = new Date();
  const linhas = await listarMensagensDoOperadorRepository({ empresaId, usuarioId: perfil.usuarioId, agora });

  // A leitura É a entrega: sem push, este é o único instante em que dá para afirmar que a mensagem
  // chegou ao operador. Idempotente — só carimba quem ainda não tinha `entregue_em`.
  const semCarimbo = linhas.filter((linha) => !linha.entregueEm).map((linha) => linha.entregaId);
  await marcarEntregueRepository(semCarimbo);

  return linhas.map((linha) => ({
    entregaId: linha.entregaId,
    mensagemId: linha.mensagemId,
    titulo: linha.titulo,
    corpo: linha.corpo,
    pdvId: linha.pdvId,
    entregueEm: (linha.entregueEm ?? (semCarimbo.includes(linha.entregaId) ? agora : null))?.toISOString() ?? null,
    visualizadaEm: linha.visualizadaEm?.toISOString() ?? null,
    confirmadaEm: linha.confirmadaEm?.toISOString() ?? null,
    fechadaEm: linha.fechadaEm?.toISOString() ?? null,
    criadoEm: linha.criadoEm.toISOString()
  }));
}

export async function carimbarEntrega(
  input: { entregaId: string; empresaId: string; campo: "visualizadaEm" | "confirmadaEm" | "fechadaEm" },
  perfil: PerfilUsuario
) {
  exigirEmpresa(perfil, input.empresaId);
  const entrega = await buscarEntregaRepository({
    entregaId: input.entregaId,
    empresaId: input.empresaId,
    usuarioId: perfil.usuarioId
  });
  if (!entrega) throw naoEncontrado("Entrega nao encontrada", "ENTREGA_NAO_ENCONTRADA");

  // `mensagens_admin_entregas_ordem_check` recusa confirmar o que não foi visualizado e visualizar o
  // que não foi entregue. Carimbar os anteriores aqui evita devolver um 500 de CHECK para um cliente
  // que só abriu o pop-up e clicou — o que acontece sempre que a tela pula a etapa de visualizar.
  if (!entrega.entregueEm) await marcarEntregueRepository([input.entregaId]);
  if (input.campo === "confirmadaEm" && !entrega.visualizadaEm) {
    await carimbarEntregaRepository({ ...input, usuarioId: perfil.usuarioId, campo: "visualizadaEm" });
  }

  await carimbarEntregaRepository({ ...input, usuarioId: perfil.usuarioId });
}

// --- Painel do administrador --------------------------------------------------------------------

function montarEntrega(linha: {
  id: string;
  destinatarioUsuarioId: string;
  destinatarioNome: string | null;
  pdvId: string | null;
  pdvNome: string | null;
  entregueEm: Date | null;
  visualizadaEm: Date | null;
  confirmadaEm: Date | null;
  fechadaEm: Date | null;
}): EntregaMensagemAdmin {
  const carimbos = {
    entregueEm: linha.entregueEm?.toISOString() ?? null,
    visualizadaEm: linha.visualizadaEm?.toISOString() ?? null,
    confirmadaEm: linha.confirmadaEm?.toISOString() ?? null,
    fechadaEm: linha.fechadaEm?.toISOString() ?? null
  };
  return {
    id: linha.id,
    destinatarioUsuarioId: linha.destinatarioUsuarioId,
    destinatarioNome: linha.destinatarioNome,
    pdvId: linha.pdvId,
    pdvNome: linha.pdvNome,
    situacao: situacaoDaEntrega(carimbos),
    ...carimbos
  };
}

export async function listarMensagensAdmin(empresaId: string, perfil: PerfilUsuario): Promise<MensagemAdmin[]> {
  exigirEmpresa(perfil, empresaId);
  const mensagens = await listarMensagensRepository(empresaId);
  const entregas = await listarEntregasDasMensagensRepository({
    empresaId,
    mensagemIds: mensagens.map((mensagem) => mensagem.id)
  });

  return mensagens.map((mensagem) => {
    const daMensagem = entregas.filter((entrega) => entrega.mensagemId === mensagem.id);
    return {
      id: mensagem.id,
      empresaId: mensagem.empresaId,
      titulo: mensagem.titulo,
      corpo: mensagem.corpo,
      validoAte: mensagem.validoAte?.toISOString() ?? null,
      status: mensagem.status,
      criadoPor: mensagem.criadoPor,
      criadoPorNome: mensagem.criadoPorNome,
      criadoEm: mensagem.criadoEm.toISOString(),
      totalDestinatarios: daMensagem.length,
      totalConfirmadas: daMensagem.filter((entrega) => entrega.confirmadaEm).length
    };
  });
}

export async function detalharMensagemAdmin(
  mensagemId: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<MensagemAdminDetalhe> {
  const mensagens = await listarMensagensAdmin(empresaId, perfil);
  const mensagem = mensagens.find((item) => item.id === mensagemId);
  if (!mensagem) throw naoEncontrado("Mensagem nao encontrada", "MENSAGEM_NAO_ENCONTRADA");

  const entregas = await listarEntregasDasMensagensRepository({ empresaId, mensagemIds: [mensagemId] });
  return { ...mensagem, entregas: entregas.map(montarEntrega) };
}

export async function encerrarMensagemAdmin(mensagemId: string, empresaId: string, perfil: PerfilUsuario) {
  exigirEmpresa(perfil, empresaId);
  const encerrada = await encerrarMensagemRepository({ mensagemId, empresaId });
  if (!encerrada) throw naoEncontrado("Mensagem ativa nao encontrada", "MENSAGEM_NAO_ENCONTRADA");
}
