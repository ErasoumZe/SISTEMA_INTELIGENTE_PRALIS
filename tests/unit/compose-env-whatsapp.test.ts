import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// R-235: o WhatsApp de Compras saiu da Meta Cloud API para a Evolution API. O compose do Coolify so injeta
// no container o que esta listado no `environment` da api (o mesmo furo de 28/10 do Cadastro de Produtos):
// toda variavel WHATSAPP_ que o env.ts le precisa estar la, e nada da Meta pode sobrar.
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envTs = readFileSync(join(raiz, "api", "src", "env.ts"), "utf8");
const composes = ["docker-compose.coolify.yml", "docker-compose.prod.yml", "docker-compose.dev.yml"].map((nome) => ({
  nome,
  texto: readFileSync(join(raiz, "infra", nome), "utf8")
}));
const lidasPeloEnv = [...envTs.matchAll(/^\s{2}(WHATSAPP_[A-Z_]+):/gm)].map((m) => m[1]!);

describe("variaveis do WhatsApp (Evolution) no compose", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("o env.ts le as variaveis da Evolution", () => {
    for (const nome of [
      "WHATSAPP_PROVEDOR",
      "WHATSAPP_EVOLUTION_URL",
      "WHATSAPP_EVOLUTION_API_KEY",
      "WHATSAPP_EVOLUTION_INSTANCIA",
      "WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO"
    ]) {
      expect(lidasPeloEnv).toContain(nome);
    }
  });

  it.each(composes)("$nome entrega toda variavel WHATSAPP_ lida pelo env.ts", ({ texto }) => {
    for (const nome of lidasPeloEnv) expect(texto, nome).toMatch(new RegExp(`^\\s{6}${nome}:`, "m"));
  });

  it.each(composes)("$nome nao tem mais nada da Meta e o envio nasce desligado", ({ texto }) => {
    expect(texto).not.toMatch(/WHATSAPP_META_/u);
    expect(texto).toContain("WHATSAPP_PROVEDOR: ${WHATSAPP_PROVEDOR:-desligado}");
  });

  it("o env.ts nao le mais variavel da Meta", () => {
    expect(envTs).not.toMatch(/WHATSAPP_META_/u);
  });

  it("ambiente que ainda tenha WHATSAPP_PROVEDOR=meta sobe com o envio desligado, sem derrubar a API", async () => {
    vi.stubEnv("WHATSAPP_PROVEDOR", "meta");
    vi.resetModules();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { env } = await import("../../api/src/env.js");
    expect(env.WHATSAPP_PROVEDOR).toBe("desligado");
    expect(aviso.mock.calls.some(([texto]) => String(texto).includes("R-235"))).toBe(true);
    aviso.mockRestore();
  });
});
