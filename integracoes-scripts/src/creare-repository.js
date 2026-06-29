import { carregarQuery } from "./query-loader.js";

async function executar(pool, arquivo, parametros = []) {
  const sql = await carregarQuery(arquivo);
  const [linhas] = await pool.execute(sql, parametros);
  return linhas;
}

export async function buscarUltimoDiaComDados(pool) {
  const [linha] = await executar(pool, "ultimo-dia-com-dados.sql");
  return linha?.dataOrigem ?? null;
}

export async function buscarVendasDia(pool, dataOrigem) {
  const intervaloDia = [dataOrigem, dataOrigem];
  const [vendas, itens, pagamentos] = await Promise.all([
    executar(pool, "vendas-dia.sql", intervaloDia),
    executar(pool, "itens-dia.sql", intervaloDia),
    executar(pool, "pagamentos-dia.sql", intervaloDia)
  ]);

  return { vendas, itens, pagamentos };
}
