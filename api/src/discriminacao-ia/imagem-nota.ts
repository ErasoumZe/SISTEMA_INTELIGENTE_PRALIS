import type { MultipartFile } from "@fastify/multipart";
import { ErroDominio, erroValidacao } from "../erros.js";

export const TAMANHO_MAXIMO_IMAGEM_IA = 8 * 1024 * 1024;

const tiposPorAssinatura = [
  { mimeType: "image/jpeg", confere: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mimeType: "image/png",
    confere: (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  },
  {
    mimeType: "image/webp",
    confere: (b: Buffer) =>
      b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  },
  {
    mimeType: "image/heic",
    confere: (b: Buffer) => {
      if (b.length < 12 || b.toString("ascii", 4, 8) !== "ftyp") return false;
      return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(b.toString("ascii", 8, 12));
    }
  }
] as const;

export type ImagemNotaValidada = { dados: Buffer; mimeType: string };

export async function lerImagemNota(arquivo: MultipartFile | undefined): Promise<ImagemNotaValidada> {
  if (!arquivo) throw erroValidacao("Selecione uma imagem da nota fiscal.", "IMAGEM_OBRIGATORIA");
  let dados: Buffer;
  try {
    dados = await arquivo.toBuffer();
  } catch {
    throw new ErroDominio("A imagem excede o limite de 8 MB.", 413, "IMAGEM_MUITO_GRANDE");
  }
  if (arquivo.file.truncated || dados.length > TAMANHO_MAXIMO_IMAGEM_IA) {
    throw new ErroDominio("A imagem excede o limite de 8 MB.", 413, "IMAGEM_MUITO_GRANDE");
  }
  if (!dados.length) throw erroValidacao("A imagem enviada esta vazia.", "IMAGEM_VAZIA");
  const detectado = tiposPorAssinatura.find((tipo) => tipo.confere(dados));
  if (!detectado) {
    throw erroValidacao("Use uma imagem JPEG, PNG, WebP, HEIC ou HEIF valida.", "IMAGEM_INVALIDA");
  }
  return { dados, mimeType: detectado.mimeType };
}
