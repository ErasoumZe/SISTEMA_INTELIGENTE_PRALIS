import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  listarDetalhesLancamentosNotificacaoRepository,
  listarNotificacoesRepository,
  verificarNotificacaoRepository
} from "./notificacoes.repository.js";
import { sincronizarAvisosDeVencimento } from "./vencimentos.service.js";

export async function listarNotificacoes(empresaId: string, perfil: PerfilUsuario, incluirVerificadas = false) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  await sincronizarAvisosDeVencimento(empresaId);
  const itens = await listarNotificacoesRepository(empresaId, perfil.usuarioId, incluirVerificadas);
  const detalhesPorReferencia = await listarDetalhesLancamentosNotificacaoRepository(
    empresaId,
    itens.filter((item) => item.tipo === "lancamento_vencimento").map((item) => item.referenciaId)
  );
  return itens.map((item) => ({
    ...item,
    valor: item.valor == null ? null : deCentavos(paraCentavos(item.valor)),
    verificadoEm: item.verificadoEm?.toISOString() ?? null,
    criadoEm: item.criadoEm.toISOString(),
    detalhes: detalhesPorReferencia.get(item.referenciaId)
  }));
}

export async function verificarNotificacao(notificacaoId: string, empresaId: string, perfil: PerfilUsuario) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const item = await verificarNotificacaoRepository(notificacaoId, empresaId, perfil.usuarioId);
  if (!item) throw new Error("Notificacao nao encontrada");
}
