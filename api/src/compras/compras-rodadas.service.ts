import { createHash, randomBytes } from "node:crypto";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  AbrirRodadaPayload,
  RodadaConviteDto,
  RodadaDto,
  RodadaItemDto,
  RodadaResumoDto,
  RodadasQuery
} from "@padaria/shared/compras";
import { expiracaoCotacao, podeConvidar } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { marcarOcorrenciaEnviadaRepository } from "./compras-agendamento.repository.js";
import { enfileirarEnviosRepository } from "./compras-whatsapp.repository.js";
import { provedorConfigurado, telefoneParaWhatsapp } from "../whatsapp/whatsapp-provedor.js";
import { ultimoEnvioDosConvitesRepository } from "./compras-whatsapp.repository.js";
import {
  buscarEmpresaComprasRepository,
  buscarFornecedoresParaConviteRepository,
  buscarPrecosBaseVigentesRepository,
  buscarSolicitacaoParaRodadaRepository,
  criarRodadaRepository,
  detalharRodadaRepository,
  listarRodadasRepository,
  marcarSolicitacaoEmCotacaoRepository,
  proximoNumeroRodadaRepository,
  travarRodadaDaSolicitacao,
  type ConviteParaCriar,
  type ItemEnvelope
} from "./compras-rodadas.repository.js";

const BYTES_DO_TOKEN = 32;

/** Mesmo hash da cotacao (R-216): so o SHA-256 vive no banco; o token em claro sai uma vez. */
export function hashTokenRodada(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

/**
 * Abre a rodada e poe os convites na fila do WhatsApp (doc 57 §3: o sistema envia, ninguem copia link).
 * `permitirSemConvites`: o agendamento abre a rodada mesmo quando nenhum produto tem fornecedor — os itens
 * ficam "A fazer" para o comprador escolher o fornecedor.
 */
export async function abrirRodada(payload: AbrirRodadaPayload, perfil: PerfilUsuario): Promise<RodadaDto> {
  validarEmpresa(perfil, payload.empresaId);
  return executarEmTransacao((tx) => abrirRodadaNaTransacao(payload, perfil.usuarioId, tx));
}

/**
 * O miolo de abrirRodada, dentro de uma transacao que ja existe: o agendador (doc 57 §2) abre a rodada na
 * MESMA transacao da data do agendamento. Quem chama ja validou a empresa.
 */
export async function abrirRodadaNaTransacao(
  payload: AbrirRodadaPayload,
  usuarioId: string,
  tx: TransacaoBanco,
  opcoes: { permitirSemConvites?: boolean } = {}
): Promise<RodadaDto> {
  if (!payload.convites.length && !opcoes.permitirSemConvites)
    throw erroValidacao("Convide ao menos um fornecedor", "SEM_CONVITES");
  // Fornecedor repetido no mesmo convite-set e erro de montagem.
  const fornecedorIds = payload.convites.map((convite) => convite.fornecedorId);
  if (new Set(fornecedorIds).size !== fornecedorIds.length) {
    throw erroValidacao("O mesmo fornecedor aparece duas vezes", "FORNECEDOR_DUPLICADO");
  }

  await travarRodadaDaSolicitacao(payload.solicitacaoId, tx);
  const solicitacao = await buscarSolicitacaoParaRodadaRepository(payload.solicitacaoId, payload.empresaId, tx);
  if (!solicitacao) throw naoEncontrado("Solicitacao nao encontrada");
  if (solicitacao.status !== "rascunho") {
    throw erroValidacao("So e possivel abrir rodada de solicitacao em rascunho", "SOLICITACAO_NAO_ABRIVEL");
  }

  const itensValidos = new Set(solicitacao.itens.map((item) => item.id));
  for (const convite of payload.convites) {
    for (const solicitacaoItemId of convite.solicitacaoItemIds) {
      if (!itensValidos.has(solicitacaoItemId)) {
        throw erroValidacao("Item do convite nao pertence a solicitacao", "ITEM_FORA_DA_SOLICITACAO");
      }
    }
  }

  // Convidar exige fornecedor ativo e WhatsApp valido (R-221 decisao 11); o erro nomeia o campo.
  const fornecedores = await buscarFornecedoresParaConviteRepository(payload.empresaId, fornecedorIds, tx);
  const fornecedorPorId = new Map(fornecedores.map((fornecedor) => [fornecedor.id, fornecedor]));
  for (const fornecedorId of fornecedorIds) {
    const fornecedor = fornecedorPorId.get(fornecedorId);
    if (!fornecedor) throw erroValidacao("Fornecedor nao pertence a empresa informada", "INVALID_SUPPLIER");
    const motivo = podeConvidar({
      situacao: fornecedor.situacao as "ativo" | "inativo",
      whatsapp: fornecedor.whatsapp
    });
    if (motivo) throw naoProcessavel(`${fornecedor.nome}: ${motivo}`, "FORNECEDOR_NAO_CONVIDAVEL");
  }

  // Snapshot do preco-base vigente por produto (envelope congelado).
  const produtoIds = solicitacao.itens.map((item) => item.produtoId);
  const precoBasePorProduto = await buscarPrecosBaseVigentesRepository(payload.empresaId, produtoIds, tx);
  const itensEnvelope: ItemEnvelope[] = solicitacao.itens.map((item) => {
    const base = precoBasePorProduto.get(item.produtoId);
    return {
      solicitacaoItemId: item.id,
      quantidade: item.quantidade,
      precoBaseId: base?.id ?? null,
      precoBaseValor: base?.valor ?? null
    };
  });

  const empresa = await buscarEmpresaComprasRepository(payload.empresaId, tx);
  const abertaEm = new Date();
  // Precedencia do prazo (decisao 3): override da rodada > config da empresa > 2 dias uteis (R-216).
  const horas = payload.prazoRespostaHoras ?? empresa?.comprasPrazoRespostaHoras ?? null;
  const expiraEm = horas !== null ? new Date(abertaEm.getTime() + horas * 3_600_000) : expiracaoCotacao(abertaEm);
  const fusoHorario = empresa?.fusoHorario ?? "America/Sao_Paulo";
  const numero = await proximoNumeroRodadaRepository(payload.solicitacaoId, tx);

  // Token por convite: em claro so aqui; o banco guarda o hash.
  const tokenPorFornecedor = new Map(fornecedorIds.map((id) => [id, randomBytes(BYTES_DO_TOKEN).toString("hex")]));
  const convitesParaCriar: ConviteParaCriar[] = payload.convites.map((convite) => ({
    fornecedorId: convite.fornecedorId,
    tokenHash: hashTokenRodada(tokenPorFornecedor.get(convite.fornecedorId)!),
    solicitacaoItemIds: convite.solicitacaoItemIds
  }));

  const criada = await criarRodadaRepository(
    {
      empresaId: payload.empresaId,
      solicitacaoId: payload.solicitacaoId,
      numero,
      prazoRespostaHoras: payload.prazoRespostaHoras ?? null,
      expiraEm,
      fusoHorario,
      tetoValor: payload.tetoValor ?? null,
      margemVariacaoPercentual: payload.margemVariacaoPercentual ?? 10,
      recebimentoInicio: payload.recebimentoInicio ?? null,
      recebimentoFim: payload.recebimentoFim ?? null,
      abertaPor: usuarioId,
      itens: itensEnvelope,
      convites: convitesParaCriar
    },
    tx
  );
  await enfileirarEnviosRepository(
    criada.convites.map((convite) => ({
      empresaId: payload.empresaId,
      tipo: "convite" as const,
      conviteId: convite.id,
      telefone: telefoneParaWhatsapp(fornecedorPorId.get(convite.fornecedorId)!.whatsapp ?? "")
    })),
    tx
  );
  await marcarSolicitacaoEmCotacaoRepository(payload.solicitacaoId, payload.empresaId, tx);
  // Solicitacao que nasceu de um agendamento (doc 56): o pedido do dia passa a "enviado" na MESMA
  // transacao da rodada — nunca fica "para conferir" com a cotacao ja na rua.
  await marcarOcorrenciaEnviadaRepository(payload.solicitacaoId, usuarioId, tx);

  // Monta o DTO de resposta (com os itens do envelope e os convites, incluindo o token em claro).
  const rodadaItemIdPorSolicitacaoItem = new Map(criada.itens.map((item) => [item.solicitacaoItemId, item.id]));
  const produtoPorSolicitacaoItem = new Map(solicitacao.itens.map((item) => [item.id, item]));
  const solicitacaoItemPorConvite = new Map(
    payload.convites.map((convite) => [convite.fornecedorId, convite.solicitacaoItemIds])
  );

  const itens: RodadaItemDto[] = criada.itens.map((item) => {
    const origem = produtoPorSolicitacaoItem.get(item.solicitacaoItemId)!;
    const base = precoBasePorProduto.get(origem.produtoId);
    return {
      id: item.id,
      solicitacaoItemId: item.solicitacaoItemId,
      produtoId: origem.produtoId,
      descricaoProduto: origem.descricaoProduto,
      quantidade: origem.quantidade,
      precoBaseValor: base?.valor ?? null
    };
  });
  const convites: RodadaConviteDto[] = criada.convites.map((convite) => {
    const fornecedor = fornecedorPorId.get(convite.fornecedorId)!;
    const solicitacaoItemIds = solicitacaoItemPorConvite.get(convite.fornecedorId) ?? [];
    return {
      id: convite.id,
      fornecedorId: convite.fornecedorId,
      fornecedorNome: fornecedor.nome,
      fornecedorWhatsapp: fornecedor.whatsapp,
      status: "aberto",
      enviadoEm: null,
      respondidoEm: null,
      rodadaItemIds: solicitacaoItemIds
        .map((solicitacaoItemId) => rodadaItemIdPorSolicitacaoItem.get(solicitacaoItemId))
        .filter((id): id is string => Boolean(id)),
      whatsapp: { status: "pendente", erro: null },
      token: tokenPorFornecedor.get(convite.fornecedorId)!
    };
  });

  return {
    id: criada.rodadaId,
    empresaId: payload.empresaId,
    solicitacaoId: payload.solicitacaoId,
    numero,
    status: "aberta",
    prazoRespostaHoras: payload.prazoRespostaHoras ?? null,
    expiraEm: expiraEm.toISOString(),
    fusoHorario,
    tetoValor: payload.tetoValor !== null && payload.tetoValor !== undefined ? String(payload.tetoValor) : null,
    abertaEm: abertaEm.toISOString(),
    itens,
    convites,
    whatsappConectado: provedorConfigurado()
  };
}

export async function listarRodadas(query: RodadasQuery, perfil: PerfilUsuario): Promise<RodadaResumoDto[]> {
  validarEmpresa(perfil, query.empresaId);
  const cabecalhos = await listarRodadasRepository(query.empresaId, {
    solicitacaoId: query.solicitacaoId,
    status: query.status
  });
  if (!cabecalhos.length) return [];
  // Totais vem do detalhe de cada rodada seria caro; a lista nao os exibe de forma critica, entao
  // derivamos por detalhe leve. Para manter a lista barata, totalItens/totalConvites vem 0 aqui e a
  // tela busca o detalhe ao abrir a rodada.
  return cabecalhos.map((cabecalho) => ({
    id: cabecalho.id,
    empresaId: cabecalho.empresaId,
    solicitacaoId: cabecalho.solicitacaoId,
    numero: cabecalho.numero,
    status: cabecalho.status,
    expiraEm: cabecalho.expiraEm.toISOString(),
    fusoHorario: cabecalho.fusoHorario,
    abertaEm: cabecalho.abertaEm.toISOString(),
    totalItens: 0,
    totalConvites: 0
  }));
}

export async function obterRodada(rodadaId: string, empresaId: string, perfil: PerfilUsuario): Promise<RodadaDto> {
  validarEmpresa(perfil, empresaId);
  const detalhe = await detalharRodadaRepository(rodadaId, empresaId);
  if (!detalhe) throw naoEncontrado("Rodada nao encontrada");
  const { cabecalho, itens, convites, rodadaItensPorConvite } = detalhe;
  const envios = await ultimoEnvioDosConvitesRepository(convites.map((convite) => convite.id));
  return {
    id: cabecalho.id,
    empresaId: cabecalho.empresaId,
    solicitacaoId: cabecalho.solicitacaoId,
    numero: cabecalho.numero,
    status: cabecalho.status,
    prazoRespostaHoras: cabecalho.prazoRespostaHoras,
    expiraEm: cabecalho.expiraEm.toISOString(),
    fusoHorario: cabecalho.fusoHorario,
    tetoValor: cabecalho.tetoValor,
    abertaEm: cabecalho.abertaEm.toISOString(),
    itens: itens.map((item) => ({
      id: item.id,
      solicitacaoItemId: item.solicitacaoItemId,
      produtoId: item.produtoId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      precoBaseValor: item.precoBaseValor
    })),
    convites: convites.map((convite) => ({
      id: convite.id,
      fornecedorId: convite.fornecedorId,
      fornecedorNome: convite.fornecedorNome,
      fornecedorWhatsapp: convite.fornecedorWhatsapp,
      status: convite.status,
      enviadoEm: convite.enviadoEm ? convite.enviadoEm.toISOString() : null,
      respondidoEm: convite.respondidoEm ? convite.respondidoEm.toISOString() : null,
      rodadaItemIds: rodadaItensPorConvite.get(convite.id) ?? [],
      whatsapp: envios.has(convite.id)
        ? {
            status: envios.get(convite.id)!.status as "pendente" | "enviado" | "falhou",
            erro: envios.get(convite.id)!.ultimoErro
          }
        : null
    })),
    whatsappConectado: provedorConfigurado()
  };
}
