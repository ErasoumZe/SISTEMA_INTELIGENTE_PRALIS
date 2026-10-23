import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";

/**
 * Arquivos exportados para o Questor, no mesmo storage dos documentos do sistema:
 * `questor-exportacoes/<empresa>/<sha256>.<ext>`.
 *
 * O nome é o SHA-256 do conteúdo: gravar de novo o mesmo arquivo é idempotente (mesmo caminho, mesmos
 * bytes) e o histórico pode conferir que o que está no disco é exatamente o que foi auditado.
 */

export function caminhoRelativoExportacaoQuestor(empresaId: string, sha256: string, extensao: "txt" | "csv"): string {
  if (!/^[0-9a-f-]{36}$/u.test(empresaId) || !/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new Error("Identificação inválida para arquivo de exportação Questor");
  }
  return `questor-exportacoes/${empresaId}/${sha256}.${extensao}`;
}

export async function gravarArquivoExportacaoQuestor(caminhoRelativo: string, conteudo: string): Promise<void> {
  const absoluto = caminhoAbsolutoDocumento(caminhoRelativo);
  await mkdir(path.dirname(absoluto), { recursive: true });
  await writeFile(absoluto, conteudo, "utf8");
}

/** `null` = o arquivo não está no storage (apagado, volume trocado): quem chama responde 404. */
export async function lerArquivoExportacaoQuestor(caminhoRelativo: string): Promise<Buffer | null> {
  try {
    return await readFile(caminhoAbsolutoDocumento(caminhoRelativo));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw erro;
  }
}
