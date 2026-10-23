import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  listarDetalhesLancamentosNotificacaoRepository,
  listarNotificacoesRepository,
  verificarNotificacaoRepository,
  verificarTodasNotificacoesRepository
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
    // Compras (R-221 decisao 14): a referencia e a rodada; o sino so precisa levar o Comprador a tela
    // de Pedidos, onde mora a fila de decisao.
    // Agendamento de pedido (doc 58 §2): chegou a data; o sino leva a Solicitacao de compra.
    // Conferencia de estoque agendada (doc 57 §1): leva a tela de conferencias.
    detalhes:
      item.tipo === "compras_decisao_pendente"
        ? { setor: "Compras", descricao: null, dataVencimento: null, rota: "/pedidos" }
        : item.tipo === "compras_agendamento_conferir"
          ? { setor: "Compras", descricao: null, dataVencimento: null, rota: "/solicitacao_compra" }
          : item.tipo === "conferencia_estoque_fazer"
            ? { setor: "Estoque", descricao: null, dataVencimento: null, rota: "/conferencias_estoque" }
            : detalhesPorReferencia.get(item.referenciaId)
  }));
}

export async function verificarNotificacao(notificacaoId: string, empresaId: string, perfil: PerfilUsuario) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  const item = await verificarNotificacaoRepository(notificacaoId, empresaId, perfil.usuarioId);
  if (!item) throw new Error("Notificacao nao encontrada");
}

/** "Li tudo" usa a mesma trilha auditavel da marcacao individual, sem declarar que a pendencia financeira foi resolvida. */
export async function verificarTodasNotificacoes(empresaId: string, perfil: PerfilUsuario) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
  return verificarTodasNotificacoesRepository(empresaId, perfil.usuarioId);
}
