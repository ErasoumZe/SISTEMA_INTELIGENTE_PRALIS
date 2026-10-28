import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import {
  gruposMercadorias,
  produtos,
  produtosCatalogoBase,
  produtosCentralCargas,
  produtosCentralFontes,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco, executarEmTransacao } from "../banco/conexao.js";

function normalizarChave(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

function lerTexto(dados: Record<string, JsonValue>, ...nomes: string[]): string | null {
  const chaves = new Map(Object.keys(dados).map((chave) => [normalizarChave(chave), chave]));
  for (const nome of nomes) {
    const chave = chaves.get(normalizarChave(nome));
    const valor = chave ? dados[chave] : null;
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  }
  return null;
}

export type ResultadoImportacaoCatalogoBase =
  | { estado: "nao_encontrada" | "nao_validada" | "sem_base" | "fonte_invalida" }
  | { estado: "ok"; total: number; novos: number; atualizados: number };

/** Persiste apenas os itens BASE da carga validada; não remove itens ausentes do arquivo. */
export async function importarCatalogoBaseRepository(cargaId: string): Promise<ResultadoImportacaoCatalogoBase> {
  return executarEmTransacao(async (tx) => {
    const [carga] = await tx
      .select({ estado: produtosCentralCargas.estado })
      .from(produtosCentralCargas)
      .where(eq(produtosCentralCargas.id, cargaId))
      .for("update");
    if (!carga) return { estado: "nao_encontrada" };
    if (!["validada", "ativa", "substituida"].includes(carga.estado)) return { estado: "nao_validada" };

    const fontes = await tx
      .select({
        idSistema: produtosCentralFontes.idSistema,
        codigoInterno: produtosCentralFontes.codigoInterno,
        codigoBarras: produtosCentralFontes.codigoBarras,
        nome: produtosCentralFontes.nome,
        ativo: produtosCentralFontes.ativo,
        dados: produtosCentralFontes.dadosOriginais
      })
      .from(produtosCentralFontes)
      .where(
        and(
          eq(produtosCentralFontes.cargaId, cargaId),
          eq(produtosCentralFontes.fonte, "pralis"),
          eq(produtosCentralFontes.lojaFonte, "BASE")
        )
      );
    if (!fontes.length) return { estado: "sem_base" };

    const ids = fontes.map((item) => item.idSistema?.trim() ?? "");
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return { estado: "fonte_invalida" };

    const existentes = await tx
      .select({
        idOrigem: produtosCatalogoBase.idOrigem,
        codigoInterno: produtosCatalogoBase.codigoInterno,
        codigoBarras: produtosCatalogoBase.codigoBarras,
        nome: produtosCatalogoBase.nome,
        status: produtosCatalogoBase.status,
        grupoIdOrigem: produtosCatalogoBase.grupoIdOrigem,
        dadosOficiais: produtosCatalogoBase.dadosOficiais
      })
      .from(produtosCatalogoBase)
      .where(inArray(produtosCatalogoBase.idOrigem, ids));
    const existentesPorId = new Map(existentes.map((item) => [item.idOrigem, item]));
    const linhas = fontes.map((item) => ({
      idOrigem: item.idSistema!.trim(),
      // A coluna normalizada pelo leitor da fonte vale primeiro; o JSON bruto e a reserva (fontes antigas).
      codigoInterno: item.codigoInterno?.trim() || lerTexto(item.dados, "codigo_interno"),
      codigoBarras: item.codigoBarras?.trim() || lerTexto(item.dados, "codigo_barras"),
      nome: item.nome,
      status: item.ativo ? "ativo" : "inativo",
      grupoIdOrigem: lerTexto(item.dados, "grupoId", "grupo_id", "grupo_id_origem"),
      dadosOficiais: item.dados,
      atualizadoEm: new Date()
    }));

    let novos = 0;
    let atualizados = 0;
    for (let inicio = 0; inicio < linhas.length; inicio += 250) {
      const loteNovos = linhas.slice(inicio, inicio + 250).filter((linha) => !existentesPorId.has(linha.idOrigem));
      if (!loteNovos.length) continue;
      const inseridos = await tx
        .insert(produtosCatalogoBase)
        .values(loteNovos)
        .onConflictDoNothing({ target: produtosCatalogoBase.idOrigem })
        .returning({ idOrigem: produtosCatalogoBase.idOrigem });
      novos += inseridos.length;
    }
    for (const linha of linhas) {
      const atual = existentesPorId.get(linha.idOrigem);
      if (!atual) continue;
      const semAlteracao =
        atual.codigoInterno === linha.codigoInterno &&
        atual.codigoBarras === linha.codigoBarras &&
        atual.nome === linha.nome &&
        atual.status === linha.status &&
        atual.grupoIdOrigem === linha.grupoIdOrigem &&
        JSON.stringify(atual.dadosOficiais) === JSON.stringify(linha.dadosOficiais);
      if (semAlteracao) continue;
      await tx
        .update(produtosCatalogoBase)
        .set({
          codigoInterno: linha.codigoInterno,
          codigoBarras: linha.codigoBarras,
          nome: linha.nome,
          status: linha.status,
          grupoIdOrigem: linha.grupoIdOrigem,
          dadosOficiais: linha.dadosOficiais,
          atualizadoEm: new Date()
        })
        .where(eq(produtosCatalogoBase.idOrigem, linha.idOrigem));
      atualizados += 1;
    }
    return {
      estado: "ok",
      total: linhas.length,
      novos,
      atualizados
    };
  });
}

export async function listarCatalogoBaseRepository(input: {
  busca?: string | undefined;
  status?: "ativo" | "inativo" | undefined;
  page: number;
  pageSize: number;
}) {
  const filtros = [];
  if (input.status) filtros.push(eq(produtosCatalogoBase.status, input.status));
  if (input.busca) {
    const termo = `%${input.busca.replace(/[\\%_]/gu, (caractere) => `\\${caractere}`)}%`;
    filtros.push(
      or(
        ilike(produtosCatalogoBase.nome, termo),
        ilike(produtosCatalogoBase.codigoInterno, termo),
        ilike(produtosCatalogoBase.codigoBarras, termo)
      )!
    );
  }
  const where = and(...filtros);
  const [total] = await banco.select({ total: count() }).from(produtosCatalogoBase).where(where);
  const itens = await banco
    .select({
      id: produtosCatalogoBase.id,
      idOrigem: produtosCatalogoBase.idOrigem,
      codigoInterno: produtosCatalogoBase.codigoInterno,
      codigoBarras: produtosCatalogoBase.codigoBarras,
      nome: produtosCatalogoBase.nome,
      status: produtosCatalogoBase.status,
      grupoIdOrigem: produtosCatalogoBase.grupoIdOrigem,
      dadosOficiais: produtosCatalogoBase.dadosOficiais,
      atualizadoEm: produtosCatalogoBase.atualizadoEm
    })
    .from(produtosCatalogoBase)
    .where(where)
    .orderBy(asc(produtosCatalogoBase.nome), asc(produtosCatalogoBase.codigoInterno))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { itens, total: Number(total?.total ?? 0) };
}

export async function carregarProdutoBaseParaLojaRepository(id: string, empresaId: string) {
  const [produto] = await banco.select().from(produtosCatalogoBase).where(eq(produtosCatalogoBase.id, id)).limit(1);
  if (!produto) return null;
  const [grupos, unidades, importado, mesmoCodigo] = await Promise.all([
    banco
      .select({ id: gruposMercadorias.id, nome: gruposMercadorias.nome })
      .from(gruposMercadorias)
      .where(eq(gruposMercadorias.empresaId, empresaId)),
    banco
      .select({ id: unidadesMedida.id, sigla: unidadesMedida.sigla })
      .from(unidadesMedida)
      .where(eq(unidadesMedida.empresaId, empresaId)),
    banco
      .select({ id: produtos.id })
      .from(produtos)
      .where(and(eq(produtos.empresaId, empresaId), eq(produtos.produtoBaseId, id)))
      .limit(1),
    // A copia herda o codigo interno da BASE; outro produto da loja com o mesmo codigo impede a copia.
    produto.codigoInterno
      ? banco
          .select({ descricao: produtos.descricao })
          .from(produtos)
          .where(and(eq(produtos.empresaId, empresaId), eq(produtos.codigoInterno, produto.codigoInterno)))
          .limit(1)
      : Promise.resolve([])
  ]);
  return {
    produto,
    grupos,
    unidades,
    jaImportado: importado.length > 0,
    codigoOcupadoPor: mesmoCodigo[0]?.descricao ?? null
  };
}
