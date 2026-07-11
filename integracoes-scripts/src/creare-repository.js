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

// Lista de dias "YYYY-MM-DD" de de..ate (inclusive). Ancorada em UTC (strings de data sao neutras
// de fuso); pura e testavel. Se ate < de, retorna [].
export function enumerarDias(deYMD, ateYMD) {
  const dias = [];
  const atual = new Date(`${deYMD}T00:00:00Z`);
  const fim = new Date(`${ateYMD}T00:00:00Z`);
  while (atual <= fim) {
    dias.push(atual.toISOString().slice(0, 10));
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return dias;
}

function hojeLocalYMD() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Janela incremental: varre os dias de date(desde) ate hoje (reusando buscarVendasDia por dia),
// junta e devolve so as vendas com dataHoraVenda >= desde. itens/pagamentos vem completos (o
// montador de payload seleciona por venda). Reprocessar o dia do cursor e barato (o servidor
// deduplica por idVenda + hash), garantindo que nenhuma venda do mesmo instante seja perdida.
export async function buscarVendasIncrementais(pool, dataHoraDesde) {
  const dias = enumerarDias(String(dataHoraDesde).slice(0, 10), hojeLocalYMD());
  const vendas = [];
  const itens = [];
  const pagamentos = [];
  for (const dia of dias) {
    const dados = await buscarVendasDia(pool, dia);
    vendas.push(...dados.vendas);
    itens.push(...dados.itens);
    pagamentos.push(...dados.pagamentos);
  }
  const vendasFiltradas = vendas.filter((venda) => String(venda.dataHoraVenda) >= String(dataHoraDesde));
  return { vendas: vendasFiltradas, itens, pagamentos };
}
