import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import type { PerfilUsuario, VendaComprovanteDto } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import {
  buscarVendaComEmpresaRepository,
  criarComprovanteVendaRepository,
  listarComprovantesVendaRepository
} from "./comprovantes.repository.js";

const mimeTypesPermitidos = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const storageRoot = path.resolve(process.cwd(), "storage");

function extensaoSegura(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext.replace(/[^a-z0-9.]/g, "") || ".bin";
}

async function validarVenda(vendaId: string, perfil: PerfilUsuario) {
  const venda = await buscarVendaComEmpresaRepository(vendaId);
  if (!venda) throw new Error("Venda nao encontrada");
  if (!podeAcessarEmpresa(perfil, venda.empresaId)) throw new Error("Empresa nao permitida");
  return venda;
}

function dtoComprovante(input: Awaited<ReturnType<typeof criarComprovanteVendaRepository>>): VendaComprovanteDto {
  if (!input) throw new Error("Comprovante nao cadastrado");
  return {
    ...input,
    criadoEm: input.criadoEm.toISOString()
  };
}

export async function listarComprovantesVenda(vendaId: string, perfil: PerfilUsuario) {
  await validarVenda(vendaId, perfil);
  return listarComprovantesVendaRepository(vendaId);
}

export async function salvarComprovanteVenda(vendaId: string, arquivo: MultipartFile | undefined, perfil: PerfilUsuario) {
  await validarVenda(vendaId, perfil);
  if (!arquivo) throw new Error("Arquivo obrigatorio");
  if (!mimeTypesPermitidos.has(arquivo.mimetype)) throw new Error("Tipo de arquivo nao permitido");

  const pastaVenda = path.join(storageRoot, "vendas", vendaId);
  await mkdir(pastaVenda, { recursive: true });

  const nomeArquivo = `${randomUUID()}${extensaoSegura(arquivo.filename)}`;
  const caminho = path.join(pastaVenda, nomeArquivo);
  await pipeline(arquivo.file, createWriteStream(caminho));

  const tamanhoBytes = Number(arquivo.file.bytesRead ?? 0);
  return dtoComprovante(
    await criarComprovanteVendaRepository({
      vendaId,
      nomeOriginal: arquivo.filename,
      nomeArquivo,
      caminho: path.relative(storageRoot, caminho).replaceAll("\\", "/"),
      mimeType: arquivo.mimetype,
      tamanhoBytes,
      criadoPor: perfil.usuarioId
    })
  );
}

