import { randomBytes } from "node:crypto";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { ConvidarFornecedorPayload } from "@padaria/shared/compras";
import { podeConvidar } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { telefoneParaWhatsapp } from "../whatsapp/whatsapp-provedor.js";
import {
  acrescentarItensAoConviteRepository,
  aprovarVinculosRepository,
  conviteDoFornecedorNaRodadaRepository,
  conviteParaReenvioRepository,
  criarConviteRepository,
  itensDaRodadaRepository,
  rodadaParaConviteRepository,
  travarRodadaRepository
} from "./compras-convidar.repository.js";
import { buscarFornecedoresParaConviteRepository, travarRodadaDaSolicitacao } from "./compras-rodadas.repository.js";
import { hashTokenRodada } from "./compras-rodadas.service.js";
import { enfileirarEnviosRepository } from "./compras-whatsapp.repository.js";

// Doc 57 §2: produto sem fornecedor fica "A fazer"; o comprador escolhe o fornecedor e o sistema envia pelo
// WhatsApp, como no envio automatico. Ordem de travas igual a abertura: solicitacao -> rodada -> convite.

const CONVITE_ABERTO = new Set(["aberto", "aguardando_comprador"]);

function validarEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

async function exigirRodadaAberta(rodadaId: string, empresaId: string, tx: TransacaoBanco) {
  const rodada = await rodadaParaConviteRepository(rodadaId, empresaId, tx);
  if (!rodada) throw naoEncontrado("Rodada nao encontrada");
  await travarRodadaDaSolicitacao(rodada.solicitacaoId, tx);
  const travada = await travarRodadaRepository(rodadaId, tx);
  if (!travada || travada.status !== "aberta" || travada.expiraEm <= new Date())
    throw conflito("A cotacao ja fechou", "RODADA_FECHADA");
}

/** Convida o fornecedor para os itens escolhidos; se ele ja tem convite aberto nesta rodada, os itens entram nele. */
export async function convidarFornecedor(
  rodadaId: string,
  payload: ConvidarFornecedorPayload,
  perfil: PerfilUsuario
): Promise<{ conviteId: string }> {
  validarEmpresa(perfil, payload.empresaId);
  return executarEmTransacao(async (tx) => {
    await exigirRodadaAberta(rodadaId, payload.empresaId, tx);
    const [fornecedor] = await buscarFornecedoresParaConviteRepository(payload.empresaId, [payload.fornecedorId], tx);
    if (!fornecedor) throw erroValidacao("Fornecedor nao pertence a empresa informada", "INVALID_SUPPLIER");
    const motivo = podeConvidar({
      situacao: fornecedor.situacao as "ativo" | "inativo",
      whatsapp: fornecedor.whatsapp
    });
    if (motivo) throw naoProcessavel(`${fornecedor.nome}: ${motivo}`, "FORNECEDOR_NAO_CONVIDAVEL");

    const ids = [...new Set(payload.rodadaItemIds)];
    const itens = await itensDaRodadaRepository(rodadaId, ids, tx);
    if (itens.length !== ids.length) throw erroValidacao("Item nao e desta cotacao", "ITEM_FORA_DA_RODADA");

    const existente = await conviteDoFornecedorNaRodadaRepository(rodadaId, payload.fornecedorId, tx);
    if (existente && !CONVITE_ABERTO.has(existente.status))
      throw conflito(`${fornecedor.nome} ja respondeu ou saiu desta cotacao`, "CONVITE_NAO_ABERTO");
    // O token real sai na hora do envio (a fila troca o hash); este so ocupa o lugar.
    const conviteId =
      existente?.id ??
      (await criarConviteRepository(
        {
          empresaId: payload.empresaId,
          rodadaId,
          fornecedorId: payload.fornecedorId,
          tokenHash: hashTokenRodada(randomBytes(32).toString("hex")),
          criadoPor: perfil.usuarioId
        },
        tx
      ));
    await acrescentarItensAoConviteRepository({ empresaId: payload.empresaId, conviteId, rodadaItemIds: ids }, tx);
    await aprovarVinculosRepository(
      {
        empresaId: payload.empresaId,
        fornecedorId: payload.fornecedorId,
        produtoIds: [...new Set(itens.map((item) => item.produtoId))],
        usuarioId: perfil.usuarioId
      },
      tx
    );
    await enfileirarEnviosRepository(
      [
        {
          empresaId: payload.empresaId,
          tipo: "convite",
          conviteId,
          telefone: telefoneParaWhatsapp(fornecedor.whatsapp ?? "")
        }
      ],
      tx
    );
    return { conviteId };
  });
}

/** Manda de novo o link (gera um token novo; o anterior deixa de valer). */
export async function reenviarConvite(
  rodadaId: string,
  conviteId: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<void> {
  validarEmpresa(perfil, empresaId);
  await executarEmTransacao(async (tx) => {
    await exigirRodadaAberta(rodadaId, empresaId, tx);
    const convite = await conviteParaReenvioRepository(conviteId, rodadaId, empresaId, tx);
    if (!convite) throw naoEncontrado("Convite nao encontrado");
    if (!CONVITE_ABERTO.has(convite.status)) throw conflito("Convite nao esta mais aberto", "CONVITE_NAO_ABERTO");
    const motivo = podeConvidar({ situacao: convite.situacao, whatsapp: convite.whatsapp });
    if (motivo) throw naoProcessavel(`${convite.nome}: ${motivo}`, "FORNECEDOR_NAO_CONVIDAVEL");
    await enfileirarEnviosRepository(
      [{ empresaId, tipo: "convite", conviteId, telefone: telefoneParaWhatsapp(convite.whatsapp ?? "") }],
      tx
    );
  });
}
