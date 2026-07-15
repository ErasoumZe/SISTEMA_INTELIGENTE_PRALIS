import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";

// Reaproveita a infra de upload dos comprovantes de vendas: multipart -> storage em /app/storage.
// Foto do documento (nota/cupom) de despesas e mercadorias: o gerente fotografa ao lancar, a
// retaguarda discrimina depois olhando a foto.
const mimeTypesPermitidos = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const storageRoot = path.resolve(process.cwd(), "storage");

function extensaoSegura(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext.replace(/[^a-z0-9.]/g, "") || ".bin";
}

// Salva o arquivo em storage/<tipo>/<id>/<uuid>.ext e devolve o caminho RELATIVO (persistido em
// foto_documento_url) + o mime.
export async function salvarFotoDocumento(
  tipo: "mercadorias" | "despesas",
  id: string,
  arquivo: MultipartFile
): Promise<{ caminhoRelativo: string; mimeType: string }> {
  if (!mimeTypesPermitidos.has(arquivo.mimetype)) throw new Error("Tipo de arquivo nao permitido");
  const pasta = path.join(storageRoot, tipo, id);
  await mkdir(pasta, { recursive: true });
  const nomeArquivo = `${randomUUID()}${extensaoSegura(arquivo.filename)}`;
  const caminho = path.join(pasta, nomeArquivo);
  await pipeline(arquivo.file, createWriteStream(caminho));
  return { caminhoRelativo: path.relative(storageRoot, caminho).replaceAll("\\", "/"), mimeType: arquivo.mimetype };
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
