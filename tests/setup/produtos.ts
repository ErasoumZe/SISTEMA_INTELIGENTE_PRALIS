import type { FastifyInstance } from "fastify";
import { json } from "./integracao.js";

type Resposta = Awaited<ReturnType<FastifyInstance["inject"]>>;
type RespostaDeCadastro = Pick<Resposta, "statusCode" | "headers" | "body" | "json">;

/** Campos que so existem na loja: a BASE nao os guarda (oficial) e a loja completa depois. */
const CAMPOS_DA_LOJA = [
  "promocoes",
  "conversoes",
  "areaVenda",
  "quantidadeVariavel",
  "toleranciaQuantidadePercentual",
  "curvaAbc",
  "areaEstoque"
] as const;

/**
 * Produto de LOJA para os testes, pelo caminho real do modelo BASE (R-222, igual ao app oficial):
 * o administrador cria na BASE, a loja importa a copia e completa o que e dela (PUT na copia).
 *
 * A primeira etapa que falhar devolve a propria resposta, para o teste conferir status e codigo.
 * Sucesso devolve 201 com `{ data: { id } }` — o id e o da COPIA na loja.
 */
export async function cadastrarProdutoNaLoja(
  app: FastifyInstance,
  cookie: string,
  payload: Record<string, unknown> & { empresaId: string }
): Promise<RespostaDeCadastro> {
  const daBase = { ...payload };
  for (const campo of CAMPOS_DA_LOJA) delete daBase[campo];
  const base = await app.inject({ method: "POST", url: "/api/produtos/base", headers: { cookie }, payload: daBase });
  if (base.statusCode !== 201) return base;
  const produtoBaseId = json<{ data: { id: string } }>(base).data.id;

  const importacao = await app.inject({
    method: "POST",
    url: `/api/produtos/catalogo-base/${produtoBaseId}/importar`,
    headers: { cookie },
    payload: { empresaId: payload.empresaId }
  });
  const copia = json<{ data?: { estado?: string; produtoId?: string } }>(importacao).data;
  if (importacao.statusCode !== 200 || copia?.estado !== "importado" || !copia.produtoId) return importacao;

  // A tela devolve os codigos que carregou; sem eles o PUT apagaria o EAN e o codigo externo da copia.
  const detalhe = await app.inject({ method: "GET", url: `/api/produtos/${copia.produtoId}`, headers: { cookie } });
  const { codigo, codigoBarras } = json<{ data: { codigo: string | null; codigoBarras: string | null } }>(detalhe).data;
  const loja = await app.inject({
    method: "PUT",
    url: `/api/produtos/${copia.produtoId}`,
    headers: { cookie },
    payload: { codigo, codigoBarras, ...payload }
  });
  if (loja.statusCode !== 204) return loja;

  const corpo = JSON.stringify({ ok: true, data: { id: copia.produtoId } });
  return {
    statusCode: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: corpo,
    json: () => JSON.parse(corpo)
  };
}
