import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";

// Reaproveita a infra de upload dos comprovantes de vendas: multipart -> storage em /app/storage.
// Foto do documento (nota/cupom) de despesas e mercadorias: o gerente fotografa ao lancar, a
// retaguarda discrimina depois olhando a foto.
const tiposPermitidos = [
  {
    mimeType: "application/pdf",
    extensao: ".pdf",
    confere: (b: Buffer) => b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-"
  },
  {
    mimeType: "image/jpeg",
    extensao: ".jpg",
    confere: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    mimeType: "image/png",
    extensao: ".png",
    confere: (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  },
  {
    mimeType: "image/webp",
    extensao: ".webp",
    confere: (b: Buffer) =>
      b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  },
  {
    mimeType: "image/heic",
    extensao: ".heic",
    confere: (b: Buffer) =>
      b.length >= 12 &&
      b.toString("ascii", 4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "hevx"].includes(b.toString("ascii", 8, 12))
  },
  {
    mimeType: "image/heif",
    extensao: ".heif",
    confere: (b: Buffer) =>
      b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" && ["mif1", "msf1"].includes(b.toString("ascii", 8, 12))
  }
] as const;
const storageRoot = path.resolve(process.cwd(), "storage");

// Salva o arquivo em storage/<tipo>/<id>/<uuid>.ext e devolve o caminho RELATIVO (persistido em
// foto_documento_url) + o mime.
export async function salvarFotoDocumento(
  tipo: "mercadorias" | "despesas" | "retiradas",
  id: string,
  arquivo: MultipartFile
): Promise<{ caminhoRelativo: string; mimeType: string }> {
  let dados: Buffer;
  try {
    dados = await arquivo.toBuffer();
  } catch {
    throw new Error("Arquivo maior que o limite permitido");
  }
  if (arquivo.file.truncated) throw new Error("Arquivo maior que o limite permitido");
  const tipoDetectado = tiposPermitidos.find((candidato) => candidato.confere(dados));
  if (
    !tipoDetectado ||
    (arquivo.mimetype !== tipoDetectado.mimeType &&
      !(arquivo.mimetype === "image/heif" && tipoDetectado.mimeType === "image/heic"))
  ) {
    throw new Error("Tipo de arquivo nao permitido");
  }
  const pasta = path.join(storageRoot, tipo, id);
  await mkdir(pasta, { recursive: true });
  const nomeArquivo = `${randomUUID()}${tipoDetectado.extensao}`;
  const caminho = path.join(pasta, nomeArquivo);
  await writeFile(caminho, dados, { flag: "wx" });
  return {
    caminhoRelativo: path.relative(storageRoot, caminho).replaceAll("\\", "/"),
    mimeType: tipoDetectado.mimeType
  };
}

// Resolve o caminho absoluto para servir o arquivo, barrando path traversal (o relativo vem do banco).
export function caminhoAbsolutoDocumento(caminhoRelativo: string): string {
  const absoluto = path.resolve(storageRoot, caminhoRelativo);
  const raizComBarra = storageRoot.endsWith(path.sep) ? storageRoot : storageRoot + path.sep;
  if (absoluto !== storageRoot && !absoluto.startsWith(raizComBarra)) throw new Error("Caminho invalido");
  return absoluto;
}

const mimePorExtensao: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif"
};

export function mimePorCaminho(caminhoRelativo: string): string {
  return mimePorExtensao[path.extname(caminhoRelativo).toLowerCase()] ?? "application/octet-stream";
}
