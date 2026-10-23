import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeConvidar } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { telefoneParaWhatsapp } from "../whatsapp/whatsapp-provedor.js";
import {
  conviteParaReenvioRepository,
  rodadaParaConviteRepository,
  travarRodadaRepository
} from "./compras-convidar.repository.js";
import { travarRodadaDaSolicitacao } from "./compras-rodadas.repository.js";
import { enfileirarEnviosRepository } from "./compras-whatsapp.repository.js";

// Reenvio do convite pelo WhatsApp. Ordem de travas igual a abertura: solicitacao -> rodada -> convite.

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
