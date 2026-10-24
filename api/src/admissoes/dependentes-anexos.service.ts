import { readFile, stat, unlink } from "node:fs/promises";
import type { MultipartFile } from "@fastify/multipart";
import { tiposAnexoDependente, type AnexoDependenteDto, type TipoAnexoDependente } from "@padaria/shared/admissoes";
import { admissoesProcessosDependentes } from "@padaria/db/schema";
import { eq, and } from "drizzle-orm";
import { banco, executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado } from "../erros.js";
import { caminhoAbsolutoDocumento, salvarFotoDocumento } from "../lancamentos/foto-documento.js";
import {
  buscarAnexoDependenteRepository,
  buscarAnexoPorTipoDependenteRepository,
  criarAnexoDependenteRepository,
  listarAnexosDependenteRepository,
  removerAnexoDependenteRepository
} from "./dependentes-anexos.repository.js";
import { listarDependentesRepository } from "./dependentes.repository.js";
import { conviteDoToken, travarFichaEditavel } from "./ficha.service.js";

function dto(anexo: Awaited<ReturnType<typeof criarAnexoDependenteRepository>>): AnexoDependenteDto {
  if (!anexo) throw new Error("Anexo de dependente nao criado");
  return {
    id: anexo.id,
    tipo: anexo.tipo as TipoAnexoDependente,
    nomeOriginal: anexo.nomeOriginal,
    mimeType: anexo.mimeType,
    tamanhoBytes: anexo.tamanhoBytes,
    criadoEm: anexo.criadoEm.toISOString()
  };
}

async function exigirDependente(token: string | undefined, dependenteId: string) {
  const convite = await conviteDoToken(token);
  const dependentes = await listarDependentesRepository(convite.processoId, convite.empresaId);
  const dependente = dependentes.find((item) => item.id === dependenteId);
  if (!dependente) throw naoEncontrado("Dependente nao encontrado", "DEPENDENTE_NAO_ENCONTRADO");
  return { convite, dependente };
}

export async function listarAnexosDependente(dependenteId: string, empresaId: string): Promise<AnexoDependenteDto[]> {
  return (await listarAnexosDependenteRepository(dependenteId, empresaId)).map(dto);
}

export async function enviarAnexoDependente(
  token: string | undefined,
  dependenteId: string,
  tipo: string,
  arquivo: MultipartFile
): Promise<AnexoDependenteDto> {
  const tipoSeguro = tiposAnexoDependente.find((opcao) => opcao === tipo);
  if (!tipoSeguro) throw erroValidacao("Tipo de documento do dependente invalido", "ANEXO_DEPENDENTE_TIPO_INVALIDO");
  const { convite } = await exigirDependente(token, dependenteId);
  await executarEmTransacao((tx) => travarFichaEditavel(convite, tx));
  const anterior = await buscarAnexoPorTipoDependenteRepository(dependenteId, convite.empresaId, tipoSeguro);
  const salvo = await salvarFotoDocumento("admissoes-dependentes", dependenteId, arquivo);
  const caminhoAbsoluto = caminhoAbsolutoDocumento(salvo.caminhoRelativo);
  const tamanhoBytes = (await stat(caminhoAbsoluto)).size;

  try {
    const criado = await executarEmTransacao(async (tx) => {
      if (anterior) {
        await removerAnexoDependenteRepository(dependenteId, convite.empresaId, anterior.id, tx);
      }
      return criarAnexoDependenteRepository(
        {
          empresaId: convite.empresaId,
          dependenteId,
          processoId: convite.processoId,
          tipo: tipoSeguro,
          nomeOriginal: arquivo.filename,
          nomeArquivo: salvo.caminhoRelativo.split("/").at(-1) ?? arquivo.filename,
          caminho: salvo.caminhoRelativo,
          mimeType: salvo.mimeType,
          tamanhoBytes
        },
        tx
      );
    });
    if (anterior) await unlink(caminhoAbsolutoDocumento(anterior.caminho)).catch(() => undefined);
    return dto(criado);
  } catch (falha) {
    await unlink(caminhoAbsoluto).catch(() => undefined);
    throw falha;
  }
}

export async function removerAnexoDependentePublico(token: string | undefined, dependenteId: string, anexoId: string) {
  const { convite } = await exigirDependente(token, dependenteId);
  await executarEmTransacao((tx) => travarFichaEditavel(convite, tx));
  const anexo = await buscarAnexoDependenteRepository(dependenteId, convite.empresaId, anexoId);
  if (!anexo) throw naoEncontrado("Documento do dependente nao encontrado", "ANEXO_DEPENDENTE_NAO_ENCONTRADO");
  await removerAnexoDependenteRepository(dependenteId, convite.empresaId, anexoId);
  await unlink(caminhoAbsolutoDocumento(anexo.caminho)).catch(() => undefined);
}

export async function lerAnexoDependentePublico(token: string | undefined, dependenteId: string, anexoId: string) {
  const { convite } = await exigirDependente(token, dependenteId);
  const anexo = await buscarAnexoDependenteRepository(dependenteId, convite.empresaId, anexoId);
  if (!anexo) throw naoEncontrado("Documento do dependente nao encontrado", "ANEXO_DEPENDENTE_NAO_ENCONTRADO");
  return {
    dados: await readFile(caminhoAbsolutoDocumento(anexo.caminho)),
    mimeType: anexo.mimeType,
    nomeOriginal: anexo.nomeOriginal
  };
}

export async function lerAnexoDependenteInterno(
  empresaId: string,
  processoId: string,
  dependenteId: string,
  anexoId: string
) {
  const [dependente] = await banco
    .select({ id: admissoesProcessosDependentes.id })
    .from(admissoesProcessosDependentes)
    .where(
      and(
        eq(admissoesProcessosDependentes.id, dependenteId),
        eq(admissoesProcessosDependentes.processoId, processoId),
        eq(admissoesProcessosDependentes.empresaId, empresaId)
      )
    )
    .limit(1);
  if (!dependente) throw naoEncontrado("Dependente nao encontrado", "DEPENDENTE_NAO_ENCONTRADO");
  const anexo = await buscarAnexoDependenteRepository(dependenteId, empresaId, anexoId);
  if (!anexo) throw naoEncontrado("Documento do dependente nao encontrado", "ANEXO_DEPENDENTE_NAO_ENCONTRADO");
  return {
    dados: await readFile(caminhoAbsolutoDocumento(anexo.caminho)),
    mimeType: anexo.mimeType,
    nomeOriginal: anexo.nomeOriginal
  };
}
