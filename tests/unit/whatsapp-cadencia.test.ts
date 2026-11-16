import { describe, expect, it } from "vitest";
import { LIMITE_DIARIO_EVOLUTION, loteDoTick } from "../../api/src/compras/compras-whatsapp.service.js";

// 16/11/2026: o WhatsApp baniu o numero da padaria depois de rajadas de ate 20 mensagens com link. Pela Evolution
// sai uma mensagem por tick (60 s) e no maximo LIMITE_DIARIO_EVOLUTION em 24 h; o resto espera na fila.
describe("cadencia da fila do WhatsApp", () => {
  it("pela Evolution manda uma por tick", () => {
    expect(loteDoTick("evolution", 0)).toBe(1);
    expect(loteDoTick("evolution", LIMITE_DIARIO_EVOLUTION - 1)).toBe(1);
  });

  it("pela Evolution para no limite de 24 h", () => {
    expect(LIMITE_DIARIO_EVOLUTION).toBe(40);
    expect(loteDoTick("evolution", LIMITE_DIARIO_EVOLUTION)).toBe(0);
    expect(loteDoTick("evolution", LIMITE_DIARIO_EVOLUTION + 5)).toBe(0);
  });

  it("gateway por webhook e provedor de teste seguem em lote", () => {
    expect(loteDoTick("webhook", 999)).toBe(20);
    expect(loteDoTick("teste", 999)).toBe(20);
  });
});
