import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { erro, ok, paginadoDeResultado } from "@padaria/shared/api";
import { vendasQuerySchema, type VendaDto } from "@padaria/shared/vendas";
import { env } from "../env.js";
import { listarPdvs } from "../pdvs/pdvs.service.js";
import { listarFormasPagamento } from "../formas-pagamento/formas-pagamento.service.js";
import { listarTurnos } from "../turnos/turnos.service.js";
import { listarVendasPaginadas, totaisVendas } from "./vendas.service.js";

/**
 * Leitura das vendas pelo S2 (sistema do Rodrigo). O S2 nao copia vendas: consulta aqui, ao vivo, com os
 * MESMOS filtros e a MESMA conta do Relatorio de Vendas (listarVendasPaginadas/totaisVendas), para os numeros
 * dos dois sistemas nunca divergirem. So GET. Autentica por `Authorization: Bearer <S2_LEITURA_TOKEN>` e
 * enxerga uma unica empresa, a de id `S2_LEITURA_EMPRESA_ID`. Sem token ou empresa, tudo responde 503.
 * Dados de cliente (nome/id) e comprovantes nao saem daqui (lista branca em paraOS2).
 * O token deve ser aleatorio e longo: `openssl rand -hex 32` (64 caracteres).
 */
// As tres rotas estao na allowlist de autenticacao propria do app.ts (fora do default-deny de sessao).

// O S2 nao escolhe empresa, cliente nem caixa: a empresa vem da configuracao e o resto nao e exposto.
const consultaS2Schema = vendasQuerySchema.omit({ empresaId: true, clienteId: true, caixaId: true });

// Limite por token (hash), nao por IP: sem trustProxy todos chegam com o IP do proxy, e quem nao tem token
// nao pode gastar o balde do S2. Pedido sem Bearer cai num balde proprio, pequeno.
function chaveDoLimite(request: FastifyRequest): string {
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.authorization ?? "")?.[1]?.trim();
  return bearer ? `s2:${createHash("sha256").update(bearer).digest("hex").slice(0, 16)}` : `s2-sem-token:${request.ip}`;
}
const limiteLeitura = {
  config: {
    rateLimit: {
      max: (request: FastifyRequest) => (request.headers.authorization ? 300 : 20),
      timeWindow: "1 minute",
      keyGenerator: chaveDoLimite
    }
  }
};

function mesmoToken(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Valida o Bearer do S2 e devolve a empresa configurada, ou responde o erro e devolve null. */
function empresaDoS2(request: FastifyRequest, reply: FastifyReply): string | null {
  if (env.S2_LEITURA_TOKEN.length < 32 || !env.S2_LEITURA_EMPRESA_ID) {
    erro(reply, 503, "Leitura do S2 não configurada.", "S2_LEITURA_DESLIGADA");
    return null;
  }
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.authorization ?? "")?.[1]?.trim() ?? "";
  if (!bearer || !mesmoToken(bearer, env.S2_LEITURA_TOKEN)) {
    erro(reply, 401, "Token de leitura inválido.", "S2_TOKEN_INVALIDO");
    return null;
  }
  return env.S2_LEITURA_EMPRESA_ID;
}

// Lista BRANCA: so sai o que a tela do S2 usa. Campo novo no VendaDto nao vaza sozinho para o outro sistema.
function paraOS2(venda: VendaDto) {
  return {
    id: venda.id,
    dataReferencia: venda.dataReferencia,
    dataVenda: venda.dataVenda ?? null,
    descricao: venda.descricao,
    valorOriginal: venda.valorOriginal,
    valorAcrescimo: venda.valorAcrescimo ?? "0",
    valorDesconto: venda.valorDesconto ?? "0",
    valorLiquido: venda.valorLiquido ?? venda.valorOriginal,
    status: venda.status,
    cancelamentoMotivo: venda.cancelamentoMotivo ?? null,
    cancelamentoJustificativa: venda.cancelamentoJustificativa ?? null,
    pdvId: venda.pdvId ?? null,
    pdvNome: venda.pdvNome ?? null,
    colaboradorNome: venda.colaboradorNome ?? null,
    pagamentos: venda.pagamentos.map((pagamento) => ({
      id: pagamento.id,
      formaPagamentoId: pagamento.formaPagamentoId,
      formaPagamentoNome: pagamento.formaPagamentoNome,
      tipoPagamentoAutomacao: pagamento.tipoPagamentoAutomacao ?? null,
      totalPago: pagamento.totalPago
    })),
    itensVenda: venda.itensVenda.map((item) => ({
      produtoAutomacaoCodigo: item.produtoAutomacaoCodigo ?? null,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal
    }))
  };
}

export async function registrarRotasLeituraS2(app: FastifyInstance): Promise<void> {
  app.get("/api/s2/vendas", limiteLeitura, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    const query = consultaS2Schema.parse(request.query);
    const resultado = await listarVendasPaginadas(query, [empresaId]);
    return paginadoDeResultado({ ...resultado, itens: resultado.itens.map(paraOS2) });
  });

  app.get("/api/s2/vendas/totais", limiteLeitura, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    const query = consultaS2Schema.parse(request.query);
    return ok(await totaisVendas(query, [empresaId]));
  });

  // Listas para os filtros do S2 (PDV, forma de pagamento, turno). Ids do S1: o S2 filtra por id, nunca por nome.
  app.get("/api/s2/vendas/opcoes", limiteLeitura, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    const [pdvs, formas, turnos] = await Promise.all([
      listarPdvs([empresaId]),
      listarFormasPagamento([empresaId], false),
      listarTurnos([empresaId])
    ]);
    return ok({
      pdvs: pdvs.map((pdv) => ({ id: pdv.id, nome: pdv.nome, codigo: pdv.codigo, ativo: pdv.ativo })),
      formasPagamento: formas.map((forma) => ({
        id: forma.id,
        nome: forma.nome,
        categoria: forma.categoriaFechamentoCaixa
      })),
      turnos: turnos.map((turno) => ({
        id: turno.id,
        nome: turno.nome,
        horaInicio: turno.horaInicio,
        horaFim: turno.horaFim,
        ativo: turno.ativo
      }))
    });
  });
}
