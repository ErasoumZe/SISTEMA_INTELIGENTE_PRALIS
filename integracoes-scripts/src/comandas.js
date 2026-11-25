import { carregarQuery } from "./query-loader.js";
import { dataHoraParaIso } from "./payload.js";

// Comandas do CREARE para o Sistema Pralis (R-248), a cada ciclo, depois das vendas. SO LEITURA: cada leitura
// roda dentro de `START TRANSACTION READ ONLY` (o usuario do robo tem permissao de escrita; assim o MySQL recusa
// qualquer escrita). Nunca filtra por DTHR_ABERTURA (sem indice): so pela PK e pelo indice de STATUS_COMANDA.
//
// O ciclo, sem estado local:
//  1. le os IDs em aberto (status 1, 2, 4) e manda o retrato; o sistema responde o maior ID que ja tem e quais ele
//     ainda tem em aberto e o CREARE nao (fecharam ou foram canceladas);
//  2. le as novas (ID > maior; na 1a vez, os ultimos 7 dias, achados por busca binaria na PK), as em aberto e as
//     de conferir, com os itens (e o nome de quem lancou), a hora em que o caixa puxou e a venda que nasceu delas
//     (importacao_comanda_venda_balcao, pelo indice em ID_COMANDA; o log nao e lido, nao tem indice), e manda em lotes.

export const DIAS_BACKFILL_COMANDAS = 7;
const MAX_COMANDAS_POR_LOTE = 100;
const MAX_BYTES_POR_LOTE = 600_000;
const MAX_ITENS_POR_COMANDA = 300;
const MAX_NOVAS_POR_CICLO = 20_000;
const PAGINA_IDS = 500;
// Janela do log lida a cada ciclo (pela PK): ~20 mil linhas, perto de 10 dias de comandas.
export const JANELA_LOG = 20_000;

/* ---------- Leitura (so leitura) ---------- */

/** Roda `trabalho(executar)` numa conexao propria, dentro de START TRANSACTION READ ONLY. */
export async function lerSomenteLeitura(pool, trabalho) {
  const conexao = await pool.getConnection();
  try {
    await conexao.query("START TRANSACTION READ ONLY");
    try {
      const executar = async (arquivo, parametros = [], ids = null) => {
        let sql = await carregarQuery(arquivo);
        if (ids) sql = sql.replace("/*IDS*/", ids.map(() => "?").join(", "));
        const [linhas] = await conexao.execute(sql, ids ? [...parametros, ...ids] : parametros);
        return linhas;
      };
      return await trabalho(executar);
    } finally {
      await conexao.query("COMMIT");
    }
  } finally {
    conexao.release();
  }
}

function emPaginas(lista, tamanho) {
  const paginas = [];
  for (let i = 0; i < lista.length; i += tamanho) paginas.push(lista.slice(i, i + tamanho));
  return paginas;
}

async function porIds(executar, arquivo, ids, parametros = []) {
  const linhas = [];
  for (const pagina of emPaginas(ids, PAGINA_IDS)) linhas.push(...(await executar(arquivo, parametros, pagina)));
  return linhas;
}

/**
 * Primeiro ID aberto em `desdeLocal` ("YYYY-MM-DD HH:mm:ss") ou depois, por busca binaria na PK (os IDs crescem
 * com o tempo). `aberturaNoId(id)` devolve { idComanda, abertaEm } da 1a comanda com ID >= id. Comanda sem data de
 * abertura conta como antiga.
 */
export async function buscarInicioBackfill({ menor, maior }, desdeLocal, aberturaNoId) {
  if (menor == null || maior == null) return null;
  let baixo = Number(menor);
  let alto = Number(maior) + 1;
  while (baixo < alto) {
    const meio = Math.floor((baixo + alto) / 2);
    const linha = await aberturaNoId(meio);
    if (!linha) {
      alto = meio;
      continue;
    }
    if (linha.abertaEm && linha.abertaEm >= desdeLocal) alto = meio;
    else baixo = Number(linha.idComanda) + 1;
  }
  return baixo > Number(maior) ? null : baixo;
}

/* ---------- Montagem ---------- */

const textoOuNulo = (valor) => {
  const texto = valor == null ? "" : String(valor).trim();
  return texto || null;
};
const numero = (valor) => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const dinheiro = (valor) => Number(numero(valor).toFixed(2));
const instante = (valor, offset) => {
  const texto = textoOuNulo(valor);
  if (!texto || texto.startsWith("0000")) return null;
  return dataHoraParaIso(texto, offset) || null;
};

/**
 * `importacoes`: linhas de comandas-importacao-ids.sql (hora em que o caixa puxou e a venda que nasceu da comanda).
 * `vendas`: linhas de comandas-vendas-ids.sql (valor final da venda). O valor da venda so vai para comanda fechada
 * (status 5): enquanto esta no caixa a venda ainda esta sendo montada.
 */
export function montarComandas(
  comandas,
  itens,
  { offsetFuso = "-03:00", importacoes = [], vendas = [], puxadasDoLog = [] } = {}
) {
  const importacaoPorComanda = new Map(importacoes.map((linha) => [Number(linha.idComanda), linha]));
  const logPorComanda = new Map(puxadasDoLog.map((linha) => [Number(linha.idComanda), linha.puxadaEm]));
  const valorPorVenda = new Map(vendas.map((linha) => [Number(linha.idVendaBalcao), dinheiro(linha.valorTotal)]));
  const itensPorComanda = new Map();
  for (const item of itens) {
    const lista = itensPorComanda.get(Number(item.idComanda)) ?? [];
    lista.push(item);
    itensPorComanda.set(Number(item.idComanda), lista);
  }
  return comandas.map((comanda) => {
    const id = Number(comanda.idComanda);
    const brutos = itensPorComanda.get(id) ?? [];
    const importacao = importacaoPorComanda.get(id);
    const vendaId = importacao?.vendaCreareId ? Number(importacao.vendaCreareId) : null;
    const status = Math.trunc(numero(comanda.status));
    if (brutos.length > MAX_ITENS_POR_COMANDA) {
      console.warn(
        `[comandas] comanda ${comanda.numero} (id ${id}) com ${brutos.length} itens: mandando os ${MAX_ITENS_POR_COMANDA} primeiros.`
      );
    }
    return {
      idComanda: id,
      numero: Math.max(0, Math.trunc(numero(comanda.numero))),
      mesa: comanda.mesa == null ? null : Math.max(0, Math.trunc(numero(comanda.mesa))),
      status,
      abertaEm: instante(comanda.abertaEm, offsetFuso),
      ultimoLancamentoEm: instante(comanda.ultimoLancamentoEm, offsetFuso),
      // A mais recente entre a importacao (venda fechada) e o "IMPORTOU A COMANDA" do log (comanda no caixa).
      puxadaEm: maisRecente(instante(importacao?.puxadaEm, offsetFuso), instante(logPorComanda.get(id), offsetFuso)),
      fechadaEm: instante(comanda.fechadaEm, offsetFuso),
      valorSubtotal: dinheiro(comanda.valorSubtotal),
      valorDesconto: dinheiro(comanda.valorDesconto),
      valorTotal: dinheiro(comanda.valorTotal),
      nomeCliente: textoOuNulo(comanda.nomeCliente),
      observacao: textoOuNulo(comanda.observacao),
      vendaCreareId: vendaId,
      vendaValorTotal:
        status === 5 && vendaId !== null && valorPorVenda.has(vendaId) ? valorPorVenda.get(vendaId) : null,
      itens: brutos.slice(0, MAX_ITENS_POR_COMANDA).map((item) => ({
        idItem: Number(item.idItem),
        produtoCodigo: textoOuNulo(item.produtoCodigo),
        descricao: textoOuNulo(item.descricao) ?? `Produto ${item.produtoCodigo ?? ""}`.trim(),
        quantidade: Number(numero(item.quantidade).toFixed(3)),
        valorTotal: dinheiro(item.valorTotal),
        funcionarioCodigo: textoOuNulo(item.funcionarioCodigo),
        funcionarioNome: textoOuNulo(item.funcionarioNome),
        cancelado:
          String(item.itemCancelado ?? "")
            .trim()
            .toUpperCase() === "S",
        motivoCancelamento: null,
        lancadoEm: instante(item.lancadoEm, offsetFuso)
      }))
    };
  });
}

function maisRecente(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** Lotes de ate 100 comandas e ~600 KB (o limite do corpo na API e 1 MB). */
export function dividirEmLotes(comandas) {
  const lotes = [];
  let atual = [];
  let bytes = 0;
  for (const comanda of comandas) {
    const tamanho = JSON.stringify(comanda).length;
    if (atual.length && (atual.length >= MAX_COMANDAS_POR_LOTE || bytes + tamanho > MAX_BYTES_POR_LOTE)) {
      lotes.push(atual);
      atual = [];
      bytes = 0;
    }
    atual.push(comanda);
    bytes += tamanho;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

function subtrairDiasLocal(diaYmd, dias) {
  const data = new Date(`${diaYmd}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return `${data.toISOString().slice(0, 10)} 00:00:00`;
}

/* ---------- Ciclo ---------- */

/**
 * Um ciclo das comandas. `api.retrato(abertasIds)` -> { maiorIdComanda, conferirIds };
 * `api.lote(comandas)` -> { recebidas, gravadas, semMudanca }. `hoje` = dia do negocio ("YYYY-MM-DD").
 */
export async function sincronizarComandas({ pool, api, hoje, offsetFuso }) {
  const abertasIds = await lerSomenteLeitura(pool, async (executar) =>
    (await executar("comandas-abertas-ids.sql")).map((linha) => Number(linha.idComanda))
  );
  const { maiorIdComanda, conferirIds } = await api.retrato(abertasIds);

  const comandas = await lerSomenteLeitura(pool, async (executar) => {
    let desde = maiorIdComanda;
    if (desde == null) {
      const [faixa] = await executar("comandas-faixa-ids.sql");
      const inicio = await buscarInicioBackfill(
        faixa ?? {},
        subtrairDiasLocal(hoje, DIAS_BACKFILL_COMANDAS - 1),
        async (id) => (await executar("comandas-abertura-no-id.sql", [id]))[0] ?? null
      );
      desde = inicio == null ? null : inicio - 1;
    }
    const novas = [];
    while (desde != null && novas.length < MAX_NOVAS_POR_CICLO) {
      const pagina = (await executar("comandas-novas-ids.sql", [desde])).map((linha) => Number(linha.idComanda));
      if (!pagina.length) break;
      novas.push(...pagina);
      desde = pagina[pagina.length - 1];
    }
    // Corte por ciclo atingido: nao manda nenhuma comanda acima da ultima nova lida, senao o "maior ID" do sistema
    // pularia as do meio. O resto vem no proximo ciclo.
    const teto = novas.length >= MAX_NOVAS_POR_CICLO ? desde : Infinity;
    const ids = [...new Set([...abertasIds, ...novas, ...conferirIds.map(Number)])]
      .filter((id) => id <= teto)
      .sort((a, b) => a - b);
    if (!ids.length) return [];
    const linhas = await porIds(executar, "comandas-ids.sql", ids);
    const itens = await porIds(executar, "comandas-itens-ids.sql", ids);
    const importacoes = await porIds(executar, "comandas-importacao-ids.sql", ids);
    const idsVendas = [...new Set(importacoes.map((linha) => Number(linha.vendaCreareId)).filter((id) => id > 0))];
    const vendas = idsVendas.length ? await porIds(executar, "comandas-vendas-ids.sql", idsVendas) : [];
    // Comandas no caixa (status 2): a hora de puxar vem do log, pela faixa da PK.
    const noCaixa = linhas.filter((linha) => Number(linha.status) === 2).map((linha) => Number(linha.idComanda));
    let puxadasDoLog = [];
    if (noCaixa.length) {
      const [faixa] = await executar("comandas-log-maior-id.sql");
      const maior = Number(faixa?.maior ?? 0);
      if (maior > 0) {
        puxadasDoLog = await porIds(executar, "comandas-log-puxada-ids.sql", noCaixa, [
          Math.max(0, maior - JANELA_LOG)
        ]);
      }
    }
    return montarComandas(linhas, itens, { offsetFuso, importacoes, vendas, puxadasDoLog });
  });

  const contagem = {
    abertas: abertasIds.length,
    conferir: conferirIds.length,
    enviadas: 0,
    gravadas: 0,
    semMudanca: 0
  };
  for (const lote of dividirEmLotes(comandas)) {
    const resposta = await api.lote(lote);
    contagem.enviadas += lote.length;
    contagem.gravadas += Number(resposta?.gravadas ?? 0);
    contagem.semMudanca += Number(resposta?.semMudanca ?? 0);
  }
  return contagem;
}
