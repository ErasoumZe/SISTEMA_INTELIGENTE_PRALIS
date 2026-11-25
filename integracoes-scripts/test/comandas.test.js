import test from "node:test";
import assert from "node:assert/strict";
import { buscarInicioBackfill, dividirEmLotes, montarComandas, sincronizarComandas } from "../src/comandas.js";

// Banco CREARE falso: responde por trecho do SQL e registra tudo o que foi executado (para provar que so le).
function poolFalso(tabela) {
  const executados = [];
  const conexao = {
    async query(sql) {
      executados.push(sql);
      return [[]];
    },
    async execute(sql, parametros) {
      executados.push(sql);
      const regra = tabela.find(([trecho]) => sql.includes(trecho));
      return [regra ? regra[1](parametros) : []];
    },
    release() {
      executados.push("RELEASE");
    }
  };
  return { executados, pool: { getConnection: async () => conexao } };
}

const comanda = (id, status, extra = {}) => ({
  idComanda: id,
  numero: id % 1000,
  mesa: null,
  status,
  abertaEm: "2026-11-25 08:00:00",
  ultimoLancamentoEm: "2026-11-25 08:05:00",
  fechadaEm: status === 5 ? "2026-11-25 08:10:00" : null,
  valorSubtotal: 12.5,
  valorDesconto: 0,
  valorTotal: 12.5,
  nomeCliente: "",
  observacao: null,
  ...extra
});

test("buscarInicioBackfill: acha o 1o ID aberto no dia pedido so pela PK", async () => {
  // IDs 1..100; o ID n abre no dia 2026-11-(n <= 60 ? 10 : 20).
  const aberturaNoId = async (id) =>
    id > 100 ? null : { idComanda: id, abertaEm: id <= 60 ? "2026-11-10 10:00:00" : "2026-11-20 10:00:00" };
  assert.equal(await buscarInicioBackfill({ menor: 1, maior: 100 }, "2026-11-19 00:00:00", aberturaNoId), 61);
  assert.equal(await buscarInicioBackfill({ menor: 1, maior: 100 }, "2026-11-01 00:00:00", aberturaNoId), 1);
  assert.equal(await buscarInicioBackfill({ menor: 1, maior: 100 }, "2026-11-30 00:00:00", aberturaNoId), null);
  assert.equal(await buscarInicioBackfill({ menor: null, maior: null }, "2026-11-19 00:00:00", aberturaNoId), null);
});

test("montarComandas: data local vira instante, cancelado e S, texto vazio vira null", () => {
  const [c] = montarComandas(
    [comanda(7, 2, { nomeCliente: "  Ana ", observacao: "  " })],
    [
      {
        idItem: 1,
        idComanda: 7,
        produtoCodigo: 55,
        descricao: "Pao",
        quantidade: 2,
        valorTotal: 5,
        funcionarioCodigo: 9,
        itemCancelado: "N",
        lancadoEm: "2026-11-25 08:01:00"
      },
      {
        idItem: 2,
        idComanda: 7,
        produtoCodigo: 56,
        descricao: "",
        quantidade: 1,
        valorTotal: 7.5,
        funcionarioCodigo: null,
        itemCancelado: "S",
        lancadoEm: "0000-00-00 00:00:00"
      }
    ]
  );
  assert.equal(c.abertaEm, "2026-11-25T11:00:00.000Z");
  assert.equal(c.nomeCliente, "Ana");
  assert.equal(c.observacao, null);
  assert.equal(c.puxadaEm, null);
  assert.equal(c.itens[0].funcionarioCodigo, "9");
  assert.equal(c.itens[0].cancelado, false);
  assert.equal(c.itens[1].cancelado, true);
  assert.equal(c.itens[1].descricao, "Produto 56");
  assert.equal(c.itens[1].lancadoEm, null);
});

test("montarComandas: hora de puxar e venda da importacao; valor da venda so na fechada; nome do funcionario", () => {
  const [fechada, puxada] = montarComandas(
    [comanda(20, 5), comanda(21, 2)],
    [
      {
        idItem: 9,
        idComanda: 20,
        descricao: "PAO",
        quantidade: 1,
        valorTotal: 5,
        funcionarioCodigo: 3,
        funcionarioNome: " ANA ",
        itemCancelado: "N"
      }
    ],
    {
      importacoes: [
        { idComanda: 20, puxadaEm: "2026-11-25 08:09:30", vendaCreareId: 777 },
        { idComanda: 21, puxadaEm: "2026-11-25 09:00:00", vendaCreareId: 778 }
      ],
      vendas: [
        { idVendaBalcao: 777, valorTotal: 13.4 },
        { idVendaBalcao: 778, valorTotal: 99 }
      ]
    }
  );
  assert.equal(fechada.puxadaEm, "2026-11-25T11:09:30.000Z");
  assert.equal(fechada.vendaCreareId, 777);
  assert.equal(fechada.vendaValorTotal, 13.4);
  assert.equal(fechada.itens[0].funcionarioNome, "ANA");
  assert.equal(puxada.vendaCreareId, 778);
  assert.equal(puxada.vendaValorTotal, null);
});

test("dividirEmLotes: no maximo 100 comandas por lote", () => {
  const muitas = Array.from({ length: 250 }, (_, i) => ({ idComanda: i + 1, itens: [] }));
  assert.deepEqual(
    dividirEmLotes(muitas).map((lote) => lote.length),
    [100, 100, 50]
  );
  assert.deepEqual(dividirEmLotes([]), []);
});

test("sincronizarComandas: retrato, novas pela PK, conferir e lotes — tudo em transacao READ ONLY", async () => {
  const { pool, executados } = poolFalso([
    ["STATUS_COMANDA IN (1, 2, 4)", () => [{ idComanda: 10 }, { idComanda: 30 }]],
    ["WHERE c.ID_COMANDA > ?", ([desde]) => (desde === 30 ? [{ idComanda: 31 }, { idComanda: 32 }] : [])],
    ["FROM comanda c\nWHERE c.ID_COMANDA IN", (ids) => ids.map((id) => comanda(id, id === 20 || id === 31 ? 5 : 1))],
    ["FROM item_comanda", () => []],
    [
      "FROM importacao_comanda_venda_balcao",
      (ids) =>
        ids
          .filter((id) => id === 20)
          .map((id) => ({ idComanda: id, puxadaEm: "2026-11-25 08:09:00", vendaCreareId: 555 }))
    ],
    ["FROM venda_balcao", (ids) => ids.map((id) => ({ idVendaBalcao: id, valorTotal: 12.5 }))]
  ]);
  const lotes = [];
  const resultado = await sincronizarComandas({
    pool,
    hoje: "2026-11-25",
    api: {
      retrato: async (abertasIds) => {
        assert.deepEqual(abertasIds, [10, 30]);
        return { maiorIdComanda: 30, conferirIds: [20] };
      },
      lote: async (comandas) => {
        lotes.push(comandas.map((c) => c.idComanda));
        const vinte = comandas.find((c) => c.idComanda === 20);
        if (vinte) assert.equal(vinte.vendaValorTotal, 12.5);
        return { gravadas: comandas.length, semMudanca: 0 };
      }
    }
  });
  assert.deepEqual(lotes, [[10, 20, 30, 31, 32]]);
  assert.deepEqual(resultado, { abertas: 2, conferir: 1, enviadas: 5, gravadas: 5, semMudanca: 0 });
  // So leitura: abre READ ONLY, so SELECT, fecha e devolve a conexao.
  assert.equal(executados.filter((sql) => sql === "START TRANSACTION READ ONLY").length, 2);
  assert.equal(executados.filter((sql) => sql === "COMMIT").length, 2);
  assert.equal(executados.filter((sql) => sql === "RELEASE").length, 2);
  for (const sql of executados.filter((s) => !["START TRANSACTION READ ONLY", "COMMIT", "RELEASE"].includes(s))) {
    assert.match(sql.replace(/^--.*$/gmu, "").trim(), /^SELECT/iu);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/iu);
  }
});

test("sincronizarComandas: sem comanda no sistema faz o backfill de 7 dias pela PK", async () => {
  const { pool } = poolFalso([
    ["STATUS_COMANDA IN (1, 2, 4)", () => []],
    ["MIN(c.ID_COMANDA)", () => [{ menor: 1, maior: 50 }]],
    [
      "WHERE c.ID_COMANDA >= ?",
      ([id]) => (id > 50 ? [] : [{ idComanda: id, abertaEm: id >= 40 ? "2026-11-20 09:00:00" : "2026-11-01 09:00:00" }])
    ],
    [
      "WHERE c.ID_COMANDA > ?",
      ([desde]) => (desde < 50 ? Array.from({ length: 50 - desde }, (_, i) => ({ idComanda: desde + i + 1 })) : [])
    ],
    ["FROM comanda c\nWHERE c.ID_COMANDA IN", (ids) => ids.map((id) => comanda(id, 5))],
    ["FROM item_comanda", () => []]
  ]);
  const enviados = [];
  await sincronizarComandas({
    pool,
    hoje: "2026-11-25",
    api: {
      retrato: async () => ({ maiorIdComanda: null, conferirIds: [] }),
      lote: async (comandas) => {
        enviados.push(...comandas.map((c) => c.idComanda));
        return {};
      }
    }
  });
  // 7 dias ate 25/11 = desde 19/11: comandas 40..50.
  assert.deepEqual(
    enviados,
    Array.from({ length: 11 }, (_, i) => 40 + i)
  );
});

test("sincronizarComandas: erro na leitura ainda fecha a transacao e devolve a conexao", async () => {
  const { pool, executados } = poolFalso([]);
  pool.getConnection = async () => ({
    query: async (sql) => executados.push(sql),
    execute: async () => {
      throw new Error("MySQL caiu");
    },
    release: () => executados.push("RELEASE")
  });
  await assert.rejects(
    sincronizarComandas({ pool, hoje: "2026-11-25", api: { retrato: async () => ({}), lote: async () => ({}) } }),
    /MySQL caiu/u
  );
  assert.deepEqual(executados, ["START TRANSACTION READ ONLY", "COMMIT", "RELEASE"]);
});
