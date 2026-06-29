import { eq } from "drizzle-orm";
import { vendas, vendasComprovantes } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

export async function buscarVendaComEmpresaRepository(vendaId: string) {
  const [venda] = await banco
    .select({ id: vendas.id, empresaId: vendas.empresaId })
    .from(vendas)
    .where(eq(vendas.id, vendaId))
    .limit(1);
  return venda ?? null;
}

export async function criarComprovanteVendaRepository(input: {
  vendaId: string;
  nomeOriginal: string;
  nomeArquivo: string;
  caminho: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoPor: string;
}) {
  const [criado] = await banco
    .insert(vendasComprovantes)
    .values(input)
    .returning({
      id: vendasComprovantes.id,
      vendaId: vendasComprovantes.vendaId,
      nomeOriginal: vendasComprovantes.nomeOriginal,
      nomeArquivo: vendasComprovantes.nomeArquivo,
      caminho: vendasComprovantes.caminho,
      mimeType: vendasComprovantes.mimeType,
      tamanhoBytes: vendasComprovantes.tamanhoBytes,
      criadoEm: vendasComprovantes.criadoEm
    });
  return criado;
}

export async function listarComprovantesVendaRepository(vendaId: string) {
  const linhas = await banco
    .select({
      id: vendasComprovantes.id,
      vendaId: vendasComprovantes.vendaId,
      nomeOriginal: vendasComprovantes.nomeOriginal,
      nomeArquivo: vendasComprovantes.nomeArquivo,
      caminho: vendasComprovantes.caminho,
      mimeType: vendasComprovantes.mimeType,
      tamanhoBytes: vendasComprovantes.tamanhoBytes,
      criadoEm: vendasComprovantes.criadoEm
    })
    .from(vendasComprovantes)
    .where(eq(vendasComprovantes.vendaId, vendaId));
  return linhas.map((linha) => ({ ...linha, criadoEm: linha.criadoEm.toISOString() }));
}
