// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// R-183 · guardiao da ORDEM de limpeza do `seed:dev`.
//
// A migration 0034 amarrou `quebras_caixa.transferencia_id` a `transferencias` com
// `ON DELETE RESTRICT` — de proposito: auditoria financeira nao some junto com o movimento. O efeito
// colateral cai no seed: ele apaga `transferencias` da empresa e nunca apagou `quebras_caixa`, entao
// a partir da primeira divergencia encerrada o `seed:dev` passa a estourar 23503 e o reset de
// desenvolvimento deixa de funcionar. Producao nao roda seed, mas dev e staging rodam todo dia.
//
// Este teste le o ARQUIVO, e nao o comportamento, pelo mesmo motivo de
// `web-vue/assets/main-css-guardiao-cor.test.ts`: provar a ordem de verdade exigiria subir banco,
// popular divergencia e rodar o seed inteiro — caro demais para uma invariante que e literalmente a
// posicao de tres linhas. Aqui ela falha em milissegundos, e falha exatamente quando alguem move.
const seed = readFileSync(fileURLToPath(new URL("../../db/seed.ts", import.meta.url)), "utf8");

function posicaoDoDelete(tabela: string): number {
  const indice = seed.indexOf(`delete(${tabela})`);
  if (indice < 0) throw new Error(`O seed nao apaga ${tabela} — a ordem de limpeza esta incompleta`);
  return indice;
}

describe("seed:dev - ordem de limpeza sob as FKs RESTRICT", () => {
  // As duas dependentes de `transferencias` que sao RESTRICT. Sem elas antes, o delete das
  // transferencias falha e o reset morre no meio, deixando a base pela metade.
  it("apaga quebras_caixa ANTES de transferencias", () => {
    expect(posicaoDoDelete("quebrasCaixa")).toBeLessThan(posicaoDoDelete("transferencias"));
  });

  it("apaga transferenciasConferenciasRecusadas ANTES de transferencias", () => {
    expect(posicaoDoDelete("transferenciasConferenciasRecusadas")).toBeLessThan(posicaoDoDelete("transferencias"));
  });

  // `fechamentos_caixa` vem DEPOIS de `transferencias` porque `transferencias.caixa_id` e NO ACTION:
  // inverter a ordem troca um 23503 por outro. Fica fixado para a correcao acima nao ser "resolvida"
  // movendo a linha errada.
  it("apaga fechamentosCaixa DEPOIS de transferencias", () => {
    expect(posicaoDoDelete("fechamentosCaixa")).toBeGreaterThan(posicaoDoDelete("transferencias"));
  });
});
