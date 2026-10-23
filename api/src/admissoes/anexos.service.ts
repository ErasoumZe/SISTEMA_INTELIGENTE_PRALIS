import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { AnexoAdmissaoDto, TipoAnexoAdmissao } from "@padaria/shared";
import { tipoAnexoAdmissaoSchema } from "@padaria/shared";
import { caminhoAbsolutoDocumento, salvarFotoDocumento } from "../lancamentos/foto-documento.js";
import { conflito, naoEncontrado } from "../erros.js";
import {
  buscarAnexoFichaRepository,
  criarAnexoFichaRepository,
  listarAnexosFichaRepository,
  removerAnexoFichaRepository
} from "./anexos.repository.js";
import { conviteDoToken } from "./ficha.service.js";
import { obterFichaRepository } from "./ficha.repository.js";

async function lerArquivoAnexo(caminho: string) {
  try {
    return await readFile(caminhoAbsolutoDocumento(caminho));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw naoEncontrado("Arquivo do anexo indisponivel", "ANEXO_ARQUIVO_AUSENTE");
    }
    throw error;
  }
}

function anexoDto(anexo: Awaited<ReturnType<typeof criarAnexoFichaRepository>>): AnexoAdmissaoDto {
  if (!anexo) throw naoEncontrado("Anexo nao encontrado", "ANEXO_AUSENTE");
  return {
    id: anexo.id,
    tipo: tipoAnexoAdmissaoSchema.parse(anexo.tipo),
    nomeOriginal: anexo.nomeOriginal,
    mimeType: anexo.mimeType,
    tamanhoBytes: anexo.tamanhoBytes,
    criadoEm: anexo.criadoEm.toISOString()
  };
}

export async function listarAnexosFicha(processoId: string, empresaId: string, fichaId: string) {
  return (await listarAnexosFichaRepository(fichaId, empresaId)).map((anexo) => anexoDto(anexo));
}

async function contextoPublico(token: string | undefined) {
  const convite = await conviteDoToken(token);
  const ficha = await obterFichaRepository(convite.processoId, convite.empresaId);
  if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");
  return { convite, ficha };
}

export async function enviarAnexoFicha(token: string | undefined, tipo: string, arquivo: MultipartFile | undefined) {
  const { convite, ficha } = await contextoPublico(token);
  if (ficha.situacao === "enviada" || ficha.situacao === "aprovada") {
    throw conflito("Esta ficha ja foi enviada e esta em analise.", "FICHA_NAO_EDITAVEL");
  }
  const tipoSeguro: TipoAnexoAdmissao = tipoAnexoAdmissaoSchema.parse(tipo);
  if (!arquivo) throw new Error("Arquivo obrigatorio");

  const existentes = await listarAnexosFichaRepository(ficha.id, convite.empresaId);
  if (existentes.some((anexo) => anexo.tipo === tipoSeguro)) {
    throw conflito("Este documento ja foi enviado. Remova o anterior antes de substituir.", "ANEXO_DUPLICADO");
  }

  const salvo = await salvarFotoDocumento("admissoes", `${convite.empresaId}/${ficha.id}`, arquivo);
  const caminhoAbsoluto = caminhoAbsolutoDocumento(salvo.caminhoRelativo);
  const tamanhoBytes = (await stat(caminhoAbsoluto)).size;
  try {
    const criado = await criarAnexoFichaRepository({
      empresaId: convite.empresaId,
      fichaId: ficha.id,
      processoId: convite.processoId,
      tipo: tipoSeguro,
      nomeOriginal: arquivo.filename || "anexo",
      nomeArquivo: path.basename(salvo.caminhoRelativo),
      caminho: salvo.caminhoRelativo,
      mimeType: salvo.mimeType,
      tamanhoBytes
    });
    return anexoDto(criado);
  } catch (error) {
    const { unlink } = await import("node:fs/promises");
    await unlink(caminhoAbsoluto).catch(() => undefined);
    throw error;
  }
}

export async function removerAnexoPublico(token: string | undefined, anexoId: string) {
  const { convite, ficha } = await contextoPublico(token);
  if (ficha.situacao === "enviada" || ficha.situacao === "aprovada") {
    throw conflito("Esta ficha ja foi enviada e esta em analise.", "FICHA_NAO_EDITAVEL");
  }
  const removido = await removerAnexoFichaRepository(anexoId, ficha.id, convite.empresaId);
  if (!removido) throw naoEncontrado("Anexo nao encontrado", "ANEXO_AUSENTE");
  const { unlink } = await import("node:fs/promises");
  await unlink(caminhoAbsolutoDocumento(removido.caminho)).catch(() => undefined);
}

export async function lerAnexoPublico(token: string | undefined, anexoId: string) {
  const { convite, ficha } = await contextoPublico(token);
  const anexo = await buscarAnexoFichaRepository(anexoId, ficha.id, convite.empresaId);
  if (!anexo) throw naoEncontrado("Anexo nao encontrado", "ANEXO_AUSENTE");
  return {
    dados: await lerArquivoAnexo(anexo.caminho),
    mimeType: anexo.mimeType,
    nomeOriginal: anexo.nomeOriginal
  };
}

export async function lerAnexoInterno(processoId: string, empresaId: string, anexoId: string) {
  const ficha = await obterFichaRepository(processoId, empresaId);
  if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");
  const anexo = await buscarAnexoFichaRepository(anexoId, ficha.id, empresaId);
  if (!anexo || anexo.processoId !== processoId) throw naoEncontrado("Anexo nao encontrado", "ANEXO_AUSENTE");
  return {
    dados: await lerArquivoAnexo(anexo.caminho),
    mimeType: anexo.mimeType,
    nomeOriginal: anexo.nomeOriginal
  };
}
