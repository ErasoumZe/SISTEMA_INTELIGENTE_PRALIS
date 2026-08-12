import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";

/**
 * Foto do PRODUTO. Reaproveita a mesma infra dos comprovantes de lancamento — multipart gravando
 * em `/app/storage`, volume nomeado que sobrevive a redeploy e ja entra no backup. **Cloudinary
 * ficou de fora de proposito** (`30` §3.2): menos um servico externo, menos uma chave.
 *
 * Nao reusa `foto-documento.ts` porque as regras sao outras: aqui so imagem (o documento aceita
 * PDF e HEIC), o teto e 8 MB, e a extensao vem do MIME — nao do nome enviado pelo cliente.
 */

/** So imagem que o navegador exibe sem plugin. HEIC e PDF ficam de fora: foto de produto e vitrine. */
const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

export const TAMANHO_MAXIMO_DA_FOTO = 8 * 1024 * 1024;

const raizDoStorage = path.resolve(process.cwd(), "storage");
const PASTA = "produtos";

export class FotoInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "FotoInvalidaError";
  }
}

/**
 * Grava a foto em `storage/produtos/<produtoId>/<uuid>.<ext>` e devolve o caminho RELATIVO.
 *
 * A extensao vem do **MIME declarado**, nunca do nome do arquivo: aceitar `foto.php` porque o
 * cliente disse que e imagem seria confiar na extensao enviada. O nome final e um UUID, entao
 * nome de arquivo do cliente nunca chega ao disco — nem para path traversal, nem para colisao.
 */
export async function salvarFotoDeProduto(
  produtoId: string,
  arquivo: MultipartFile
): Promise<{ caminhoRelativo: string; mimeType: string }> {
  const extensao = EXTENSAO_POR_MIME[arquivo.mimetype];
  if (!extensao) throw new FotoInvalidaError("Formato nao aceito. Envie JPEG, PNG ou WebP.");

  const pasta = path.join(raizDoStorage, PASTA, produtoId);
  await mkdir(pasta, { recursive: true });
  const caminho = path.join(pasta, `${randomUUID()}${extensao}`);
  await pipeline(arquivo.file, createWriteStream(caminho));

  // O @fastify/multipart corta o stream no limite e marca a flag — sem isto, o arquivo truncado
  // ficaria no disco passando por foto valida.
  if (arquivo.file.truncated) {
    throw new FotoInvalidaError("Foto acima de 8 MB.");
  }

  return { caminhoRelativo: path.relative(raizDoStorage, caminho).replaceAll("\\", "/"), mimeType: arquivo.mimetype };
}

/**
 * Caminho absoluto para servir a foto, barrando path traversal. O relativo vem do banco, mas o
 * banco pode ter sido povoado por um caminho antigo — a checagem e sobre o resultado, nao sobre a
 * origem.
 */
export function caminhoAbsolutoDaFoto(caminhoRelativo: string): string {
  const absoluto = path.resolve(raizDoStorage, caminhoRelativo);
  const raizComBarra = raizDoStorage.endsWith(path.sep) ? raizDoStorage : raizDoStorage + path.sep;
  if (absoluto !== raizDoStorage && !absoluto.startsWith(raizComBarra)) {
    throw new FotoInvalidaError("Caminho invalido");
  }
  return absoluto;
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export function mimeDaFoto(caminhoRelativo: string): string {
  return MIME_POR_EXTENSAO[path.extname(caminhoRelativo).toLowerCase()] ?? "application/octet-stream";
}

/**
 * `foto_url` legado guarda URL externa (`https://...`), gravada quando o campo era texto livre.
 * Continua sendo LIDA — nunca escrita —, e nao passa pelo storage.
 */
export function ehFotoExternaLegada(fotoUrl: string): boolean {
  return /^https?:\/\//i.test(fotoUrl);
}
