import { describe, expect, it } from "vitest";
import { gerarUuidV7 } from "@padaria/shared/ids";

const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it.each([
    ["shared", gerarUuidV7]
  ])("Deve_GerarUuidVersao7_Quando_CriarIdNo%s", (_origem, gerarUuidV7) => {
    const id = gerarUuidV7();

    expect(id).toMatch(uuidV7Regex);
  });

  it.each([
    ["shared", gerarUuidV7]
  ])("Deve_UsarTimestampNoPrefixo_Quando_CriarUuidV7No%s", (_origem, gerarUuidV7) => {
    const id = gerarUuidV7(0x018ff2a7c3d4);

    expect(id.startsWith("018ff2a7-c3d4-7")).toBe(true);
  });
});

