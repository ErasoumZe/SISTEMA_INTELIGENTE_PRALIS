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

// Agregado do dia por dispositivo (PDV) para a conciliacao: so venda fechada (STATUS='F').
// Os valores vem do MySQL como string/decimal; a API compara em centavos.
export async function buscarConciliacaoDia(pool, dataOrigem) {
  const linhas = await executar(pool, "conciliacao-dia.sql", [dataOrigem, dataOrigem]);
  return linhas.map((linha) => ({
    pdvIdentificador: String(linha.pdvIdentificador),
    quantidadeVendas: Number(linha.quantidadeVendas ?? 0),
    valorTotal: Number(linha.valorTotal ?? 0)
  }));
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

// Dia contabil no fuso do NEGOCIO (nao o da maquina): a API deriva data_referencia com a mesma
// regra (shared/src/datas), entao os dois lados da conciliacao usam a mesma regua mesmo se o
// agente rodar num host/container em UTC. Espelha diaNegocio() do shared — este pacote e standalone
// (JS puro, sem dependencia do shared), por isso a duplicacao consciente.
const formatadorDiaNegocio = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function diaNegocioHoje() {
  return formatadorDiaNegocio.format(new Date());
}

export function hojeLocalYMD() {
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
