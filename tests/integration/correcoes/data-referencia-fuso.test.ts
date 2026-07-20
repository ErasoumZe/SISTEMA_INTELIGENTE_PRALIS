import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

// TESTE DE ACEITE do script db/correcoes/2026-07-17-data-referencia-fuso.sql (BUG B).
//
// Reproduz o caso real levantado em producao: a venda CREARE:524245 (VOUCHER, R$ 3,90), feita em
// 15/07 as 22:00 locais, foi gravada com data_referencia = 2026-07-16 porque a data contabil saia
// de toISOString() (UTC). O script tem de move-la para 2026-07-15.
//
// O UPDATE nao e reescrito aqui: e LIDO do proprio arquivo .sql, entao este teste valida o script
// que sera executado em producao — nao uma copia que pode divergir dele.
const arquivoScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/correcoes/2026-07-17-data-referencia-fuso.sql"
);

async function updateDoScript(): Promise<string> {
  const conteudo = await readFile(arquivoScript, "utf8");
  const bloco = conteudo.split(">>>UPDATE-INICIO")[1]?.split(">>>UPDATE-FIM")[0];
  if (!bloco) throw new Error("Marcadores >>>UPDATE-INICIO/FIM nao encontrados no script de correcao");
  const sql = bloco
    .split("\n")
    .map((linha) => linha.replace(/^\s*--\s?/u, "").trim())
    .filter((linha) => linha.length > 0)
    .join(" ");
  if (!sql.toUpperCase().startsWith("UPDATE VENDAS")) throw new Error(`Bloco extraido nao e o UPDATE: ${sql}`);
  return sql;
}

// 15/07/2026 22:00 em America/Sao_Paulo == 16/07/2026 01:00 UTC.
const INSTANTE_DA_VENDA = "2026-07-16T01:00:00.000Z";
const DIA_CORRETO = "2026-07-15";
const DIA_ERRADO = "2026-07-16";

const ID_VOUCHER = "55555555-5555-4555-8555-555555550001"; // CREARE:524245, o caso do aceite
const ID_MANUAL = "55555555-5555-4555-8555-555555550002"; // venda manual no mesmo instante
const ID_JA_CORRETA = "55555555-5555-4555-8555-555555550003"; // integrada, data ja certa

describe("aceite: script de correcao de fuso da data contabil", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await executarSql(
      `insert into vendas (id, empresa_id, integracao_chave_id, pdv_id, data_referencia, data_venda,
         descricao, valor_original, valor_desconto, valor_acrescimo, status, computar)
       values
         -- O caso do aceite: integrada, 22:00 local, gravada no dia seguinte (o bug).
         ($1,$4,$5,$6,$7,$8,'Venda CREARE:524245','3.90','0','0','aprovado',true),
         -- Venda MANUAL no mesmo instante: nao passou pela derivacao em UTC, nao pode ser tocada.
         ($2,$4,null,$6,$7,$8,'Venda manual do balcao','10.00','0','0','aprovado',true),
         -- Integrada ja com a data certa: o script nao pode mexer nela.
         ($3,$4,$5,$6,$9,$8,'Venda integrada ja correta','5.00','0','0','aprovado',true)`,
      [
        ID_VOUCHER,
        ID_MANUAL,
        ID_JA_CORRETA,
        idsTeste.empresaA,
        idsTeste.integracaoChave,
        idsTeste.pdvA,
        DIA_ERRADO,
        INSTANTE_DA_VENDA,
        DIA_CORRETO
      ]
    );
  }, 120_000);

  afterAll(async () => {
    await executarSql("delete from vendas where id in ($1,$2,$3)", [ID_VOUCHER, ID_MANUAL, ID_JA_CORRETA]);
    await contexto.fechar();
  });

  it("PASSO 1 (diagnostico) enxerga a venda do aceite e ignora a manual", async () => {
    const linhas = await consultarTodos<{ data_atual_errada: string; data_correta: string; vendas: string }>(
      `SELECT v.data_referencia::text AS data_atual_errada,
              (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_correta,
              count(*)::text AS vendas
         FROM vendas v
        WHERE v.integracao_chave_id IS NOT NULL
          AND v.data_venda IS NOT NULL
          AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date
        GROUP BY 1, 2`
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ data_atual_errada: DIA_ERRADO, data_correta: DIA_CORRETO, vendas: "1" });
  });

  it("ACEITE: apos o script, CREARE:524245 fica em 2026-07-15", async () => {
    await executarSql(await updateDoScript());

    const venda = await consultarUm<{ data_referencia: string; valor_original: string }>(
      `select data_referencia::text as data_referencia, valor_original from vendas where id = $1`,
      [ID_VOUCHER]
    );

    expect(venda!.data_referencia).toBe(DIA_CORRETO);
    expect(Number(venda!.valor_original)).toBe(3.9); // o valor nao e tocado, so a data contabil
  });

  it("o instante real da venda continua intacto (so a data contabil muda)", async () => {
    const venda = await consultarUm<{ data_venda: Date }>(`select data_venda from vendas where id = $1`, [ID_VOUCHER]);
    expect(new Date(venda!.data_venda).toISOString()).toBe(INSTANTE_DA_VENDA);
  });

  it("nao toca venda manual nem venda integrada que ja estava correta", async () => {
    const manual = await consultarUm<{ d: string }>(`select data_referencia::text as d from vendas where id = $1`, [
      ID_MANUAL
    ]);
    const jaCorreta = await consultarUm<{ d: string }>(`select data_referencia::text as d from vendas where id = $1`, [
      ID_JA_CORRETA
    ]);

    // A manual tem data_venda preenchida no fixture, mas sem integracao_chave_id o script a ignora:
    // ela nunca passou pela derivacao em UTC, entao sua data e a que o operador digitou.
    expect(manual!.d).toBe(DIA_ERRADO);
    expect(jaCorreta!.d).toBe(DIA_CORRETO);
  });

  it("e idempotente: rodar de novo nao muda mais nada", async () => {
    await executarSql(await updateDoScript());

    const restantes = await consultarTodos<{ c: string }>(
      `SELECT count(*)::text AS c FROM vendas v
        WHERE v.integracao_chave_id IS NOT NULL AND v.data_venda IS NOT NULL
          AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date`
    );
    expect(restantes[0]!.c).toBe("0");
  });

  it("o valor migra de dia: o liquido de 15/07 ganha os 3,90 que estavam em 16/07", async () => {
    // Segundo criterio do aceite, no mecanismo: o total do dia 15 passa a incluir a venda.
    // (O numero absoluto de producao — 22.663,32 — so pode ser conferido la, com os dados reais.)
    const totalDoDia = async (dia: string) => {
      const linha = await consultarUm<{ liquido: string | null }>(
        `select sum(v.valor_original - v.valor_desconto + v.valor_acrescimo)::text as liquido
           from vendas v
          where v.empresa_id = $1 and v.data_referencia = $2 and v.status <> 'cancelado'
            and v.id in ($3,$4,$5)`,
        [idsTeste.empresaA, dia, ID_VOUCHER, ID_MANUAL, ID_JA_CORRETA]
      );
      return Number(linha?.liquido ?? 0);
    };

    // 15/07: a venda do aceite (3,90) + a integrada ja correta (5,00).
    expect(await totalDoDia(DIA_CORRETO)).toBe(8.9);
    // 16/07: sobra so a manual (10,00) — os 3,90 sairam de la.
    expect(await totalDoDia(DIA_ERRADO)).toBe(10);
  });
});
