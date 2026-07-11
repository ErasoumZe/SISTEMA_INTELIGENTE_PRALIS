import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Cursor de sincronizacao persistido em disco: { ultimaDataHoraVenda, ultimoIdVendaBalcao,
// atualizadoEm }. ultimaDataHoraVenda esta no formato do CREARE ("YYYY-MM-DD HH:MM:SS").

export async function lerCursor(caminho) {
  try {
    const conteudo = await readFile(caminho, "utf8");
    const dados = JSON.parse(conteudo);
    return dados && typeof dados === "object" ? dados : null;
  } catch {
    return null;
  }
}

export async function gravarCursor(caminho, cursor) {
  await mkdir(path.dirname(caminho), { recursive: true });
  const conteudo = JSON.stringify({ ...cursor, atualizadoEm: new Date().toISOString() }, null, 2);
  await writeFile(caminho, conteudo, "utf8");
}
