import { describe, expect, it } from "vitest";
import type { MultipartFile } from "@fastify/multipart";
import { lerImagemNota } from "../../api/src/discriminacao-ia/imagem-nota.js";

function arquivo(dados: Buffer, mimetype = "image/jpeg", truncated = false): MultipartFile {
  return {
    mimetype,
    file: { truncated },
    toBuffer: async () => dados
  } as unknown as MultipartFile;
}

describe("validacao da imagem enviada para IA", () => {
  it("aceita JPEG pela assinatura real", async () => {
    const resultado = await lerImagemNota(arquivo(Buffer.from([0xff, 0xd8, 0xff, 0x00])));
    expect(resultado.mimeType).toBe("image/jpeg");
  });

  it("recusa arquivo disfarçado apenas pelo MIME", async () => {
    await expect(lerImagemNota(arquivo(Buffer.from("nao e imagem")))).rejects.toMatchObject({
      code: "IMAGEM_INVALIDA"
    });
  });

  it("recusa stream truncado pelo limite", async () => {
    await expect(lerImagemNota(arquivo(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg", true))).rejects.toMatchObject({
      status: 413,
      code: "IMAGEM_MUITO_GRANDE"
    });
  });
});
