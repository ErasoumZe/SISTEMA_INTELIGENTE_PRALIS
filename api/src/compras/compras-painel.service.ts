import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { DecisaoPendenteDto, PainelComprasDto } from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { proibido } from "../erros.js";
import {
  convitesAbertosRepository,
  decisoesPendentesRepository,
  itensSemFornecedorRepository,
  totalItensDosConvitesRepository
} from "./compras-painel.repository.js";
import { ultimoEnvioDosConvitesRepository } from "./compras-whatsapp.repository.js";

/** Doc 57 §4: o que a matriz de Pedidos mostra alem dos pedidos (que vem de /api/pedidos). */
export async function obterPainelCompras(empresaId: string, perfil: PerfilUsuario): Promise<PainelComprasDto> {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  const [semFornecedor, decisoes, convites] = await Promise.all([
    itensSemFornecedorRepository(empresaId),
    decisoesPendentesRepository(empresaId),
    convitesAbertosRepository(empresaId)
  ]);
  const ids = convites.map((convite) => convite.conviteId);
  const [totais, envios] = await Promise.all([
    totalItensDosConvitesRepository(ids),
    ultimoEnvioDosConvitesRepository(ids)
  ]);
  // Uma solicitacao pode ter mais de uma cotacao fechada: a decisao vale para a mais recente.
  const ultimaPorSolicitacao = new Map<string, DecisaoPendenteDto>();
  for (const decisao of decisoes) {
    const atual = ultimaPorSolicitacao.get(decisao.solicitacaoId);
    if (atual && atual.rodadaNumero >= decisao.rodadaNumero) continue;
    ultimaPorSolicitacao.set(decisao.solicitacaoId, {
      solicitacaoId: decisao.solicitacaoId,
      rodadaId: decisao.rodadaId,
      rodadaNumero: decisao.rodadaNumero,
      observacao: decisao.observacao,
      fechadaEm: (decisao.fechadaEm ?? new Date(0)).toISOString()
    });
  }
  return {
    semFornecedor: semFornecedor.map((item) => ({ ...item, expiraEm: item.expiraEm.toISOString() })),
    decisoes: [...ultimaPorSolicitacao.values()],
    convites: convites.map((convite) => ({
      conviteId: convite.conviteId,
      rodadaId: convite.rodadaId,
      solicitacaoId: convite.solicitacaoId,
      rodadaNumero: convite.rodadaNumero,
      fornecedorId: convite.fornecedorId,
      fornecedorNome: convite.fornecedorNome,
      totalItens: totais.get(convite.conviteId) ?? 0,
      respondeu: convite.status === "aguardando_comprador",
      expiraEm: convite.expiraEm.toISOString(),
      whatsapp: (envios.get(convite.conviteId)?.status as "pendente" | "enviado" | "falhou" | undefined) ?? null
    }))
  };
}
