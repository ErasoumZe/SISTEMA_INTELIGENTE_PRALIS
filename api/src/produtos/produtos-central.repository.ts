import { and, arrayContains, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import {
  produtosCentralCargas,
  produtosCentralDecisoes,
  produtosCentralFontes,
  produtosCentralGrupos,
  produtosCentralGruposFontes
} from "@padaria/db/schema/cadastro";
import { banco, executarEmTransacao } from "../banco/conexao.js";

export async function criarCargaCentralRepository(ator: { id: string; nome: string }) {
  const [carga] = await banco
    .insert(produtosCentralCargas)
    .values({
      estado: "recebida",
      manifesto: { tipo: "fontes_csv_separadas", versao: 1 },
      criadoPor: ator.id,
      criadoPorNome: ator.nome
    })
    .returning({ id: produtosCentralCargas.id, criadoEm: produtosCentralCargas.criadoEm });
  return carga!;
}

export async function obterCargaCentralRepository(cargaId: string) {
  const [carga] = await banco
    .select()
    .from(produtosCentralCargas)
    .where(eq(produtosCentralCargas.id, cargaId))
    .limit(1);
  return carga ?? null;
}

export async function listarCargasCentraisRepository() {
  return banco.select().from(produtosCentralCargas).orderBy(desc(produtosCentralCargas.criadoEm)).limit(50);
}

export async function inserirFonteCentralRepository(
  cargaId: string,
  fonte: string,
  itens: Array<{
    fonte: string;
    loja: string;
    chaveLinhaFonte: string;
    idSistema: string | null;
    codigoInterno: string;
    codigoBarras: string;
    chaveBarras: string;
    nome: string;
    nomeNormalizado: string;
    ativo: boolean | null;
    grupo: string | null;
    custo: string | null;
    venda: string | null;
    fiscal: Record<string, JsonValue> | null;
    dadosOriginais: Record<string, JsonValue>;
  }>
): Promise<"adicionada" | "nao_encontrada" | "estado_invalido" | "duplicada"> {
  return executarEmTransacao(async (tx) => {
    const [carga] = await tx
      .select({ id: produtosCentralCargas.id, estado: produtosCentralCargas.estado })
      .from(produtosCentralCargas)
      .where(eq(produtosCentralCargas.id, cargaId))
      .for("update");
    if (!carga) return "nao_encontrada";
    if (carga.estado !== "recebida") return "estado_invalido";
    const [existente] = await tx
      .select({ id: produtosCentralFontes.id })
      .from(produtosCentralFontes)
      .where(and(eq(produtosCentralFontes.cargaId, cargaId), eq(produtosCentralFontes.fonte, fonte)))
      .limit(1);
    if (existente) return "duplicada";
    for (let inicio = 0; inicio < itens.length; inicio += 250) {
      await tx.insert(produtosCentralFontes).values(
        itens.slice(inicio, inicio + 250).map((item) => ({
          cargaId,
          fonte: item.fonte,
          lojaFonte: item.loja,
          chaveLinhaFonte: item.chaveLinhaFonte,
          idSistema: item.idSistema,
          codigoInterno: item.codigoInterno,
          codigoBarras: item.codigoBarras,
          chaveBarras: item.chaveBarras,
          nome: item.nome,
          nomeNormalizado: item.nomeNormalizado,
          ativo: item.ativo,
          grupo: item.grupo,
          custo: item.custo,
          venda: item.venda,
          fiscal: item.fiscal,
          dadosOriginais: item.dadosOriginais
        }))
      );
    }
    return "adicionada";
  });
}

export async function listarFontesDaCargaRepository(cargaId: string) {
  return banco.select().from(produtosCentralFontes).where(eq(produtosCentralFontes.cargaId, cargaId));
}

export async function iniciarValidacaoCargaRepository(cargaId: string) {
  return executarEmTransacao(async (tx) => {
    const [carga] = await tx
      .select({ id: produtosCentralCargas.id, estado: produtosCentralCargas.estado })
      .from(produtosCentralCargas)
      .where(eq(produtosCentralCargas.id, cargaId))
      .for("update");
    if (!carga) return "nao_encontrada" as const;
    if (carga.estado !== "recebida") return "estado_invalido" as const;
    await tx.update(produtosCentralCargas).set({ estado: "validando" }).where(eq(produtosCentralCargas.id, cargaId));
    return "validando" as const;
  });
}

export async function marcarCargaCentralFalhouRepository(cargaId: string, motivo: string) {
  await banco
    .update(produtosCentralCargas)
    .set({ estado: "falhou", resumo: { erro: motivo } })
    .where(eq(produtosCentralCargas.id, cargaId));
}

export async function registrarDecisaoCentralRepository(input: {
  cargaId: string;
  grupoId: string;
  chaveGrupo: string;
  acao: "nao_e_o_mesmo" | "ignorado";
  detalhe: Record<string, JsonValue>;
  usuarioId: string;
  usuarioNome: string;
}): Promise<
  | { estado: "registrada"; decisao: { id: string; acao: string; criadoEm: Date } }
  | { estado: "nao_encontrada" }
  | { estado: "ja_decidida" }
> {
  return executarEmTransacao(async (tx) => {
    const [grupo] = await tx
      .select({ id: produtosCentralGrupos.id, chave: produtosCentralGrupos.chave })
      .from(produtosCentralGrupos)
      .where(and(eq(produtosCentralGrupos.id, input.grupoId), eq(produtosCentralGrupos.cargaId, input.cargaId)))
      .for("update");
    if (!grupo || grupo.chave !== input.chaveGrupo) return { estado: "nao_encontrada" };

    const decisoes = await tx
      .select({ detalhe: produtosCentralDecisoes.detalhe })
      .from(produtosCentralDecisoes)
      .where(eq(produtosCentralDecisoes.chaveGrupo, input.chaveGrupo));
    const jaDecididaNestaCarga = decisoes.some(
      ({ detalhe }) =>
        typeof detalhe === "object" &&
        detalhe !== null &&
        !Array.isArray(detalhe) &&
        detalhe["cargaId"] === input.cargaId
    );
    if (jaDecididaNestaCarga) return { estado: "ja_decidida" };

    const [decisao] = await tx
      .insert(produtosCentralDecisoes)
      .values({
        chaveGrupo: input.chaveGrupo,
        acao: input.acao,
        detalhe: input.detalhe,
        usuarioId: input.usuarioId,
        usuarioNome: input.usuarioNome
      })
      .returning({
        id: produtosCentralDecisoes.id,
        acao: produtosCentralDecisoes.acao,
        criadoEm: produtosCentralDecisoes.criadoEm
      });
    return { estado: "registrada", decisao: decisao! };
  });
}

export async function substituirGruposDaCargaRepository(
  cargaId: string,
  grupos: Array<{
    id: string;
    chave: string;
    motivo: string;
    fontes: string[];
    lojas: string[];
    candidato: Record<string, JsonValue>;
    nome: string;
    nomeNormalizado: string;
    ativo: boolean;
    alertaNomeDivergente: boolean;
    alertaBarrasConflitantes: boolean;
    alertaSemBarras: boolean;
    alertaSemFiscalTnp: boolean;
    alertaSemGrupo: boolean;
    alertaJaNaBase: boolean;
    linhasFonte: Array<{ fonteProdutoId: string; fonte: string; loja: string }>;
  }>,
  resumo: Record<string, JsonValue>
) {
  await executarEmTransacao(async (tx) => {
    await tx.delete(produtosCentralGrupos).where(eq(produtosCentralGrupos.cargaId, cargaId));
    for (let inicio = 0; inicio < grupos.length; inicio += 200) {
      const lote = grupos.slice(inicio, inicio + 200);
      await tx
        .insert(produtosCentralGrupos)
        .values(lote.map(({ linhasFonte: _linhasFonte, ...grupo }) => ({ cargaId, ...grupo })));
      const vinculos = lote.flatMap((grupo) =>
        grupo.linhasFonte.map((linha) => ({
          cargaId,
          grupoId: grupo.id,
          fonteProdutoId: linha.fonteProdutoId,
          fonte: linha.fonte,
          lojaFonte: linha.loja
        }))
      );
      for (let indice = 0; indice < vinculos.length; indice += 500) {
        await tx.insert(produtosCentralGruposFontes).values(vinculos.slice(indice, indice + 500));
      }
    }
    await tx
      .update(produtosCentralCargas)
      .set({ estado: "validada", resumo, validadoEm: new Date() })
      .where(eq(produtosCentralCargas.id, cargaId));
  });
}

export async function listarGruposDaCargaRepository(input: {
  cargaId: string;
  grupoId?: string;
  busca?: string;
  loja?: string;
  page: number;
  pageSize: number;
}) {
  const filtros = [eq(produtosCentralGrupos.cargaId, input.cargaId)];
  if (input.grupoId) filtros.push(eq(produtosCentralGrupos.id, input.grupoId));
  if (input.busca) {
    const termo = `%${input.busca.replace(/[\\%_]/gu, (caractere) => `\\${caractere}`)}%`;
    filtros.push(
      or(
        ilike(produtosCentralGrupos.nome, termo),
        ilike(produtosCentralGrupos.chave, termo),
        ilike(produtosCentralGrupos.nomeNormalizado, termo)
      )!
    );
  }
  if (input.loja) filtros.push(arrayContains(produtosCentralGrupos.lojas, [input.loja]));
  const where = and(...filtros);
  const [total] = await banco.select({ total: count() }).from(produtosCentralGrupos).where(where);
  const grupos = await banco
    .select()
    .from(produtosCentralGrupos)
    .where(where)
    .orderBy(asc(produtosCentralGrupos.nomeNormalizado), asc(produtosCentralGrupos.chave))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  if (!grupos.length) return { grupos: [], total: total?.total ?? 0 };

  const ids = grupos.map((grupo) => grupo.id);
  const linhasFonte = await banco
    .select({
      grupoId: produtosCentralGruposFontes.grupoId,
      fonte: produtosCentralFontes.fonte,
      loja: produtosCentralFontes.lojaFonte,
      codigoInterno: produtosCentralFontes.codigoInterno,
      codigoBarras: produtosCentralFontes.codigoBarras,
      nome: produtosCentralFontes.nome,
      ativo: produtosCentralFontes.ativo,
      grupoMercadoria: produtosCentralFontes.grupo,
      custo: produtosCentralFontes.custo,
      venda: produtosCentralFontes.venda,
      fiscal: produtosCentralFontes.fiscal,
      dadosOriginais: produtosCentralFontes.dadosOriginais
    })
    .from(produtosCentralGruposFontes)
    .innerJoin(produtosCentralFontes, eq(produtosCentralFontes.id, produtosCentralGruposFontes.fonteProdutoId))
    .where(inArray(produtosCentralGruposFontes.grupoId, ids));
  const chaves = grupos.map((grupo) => grupo.chave);
  const decisoes = await banco
    .select()
    .from(produtosCentralDecisoes)
    .where(inArray(produtosCentralDecisoes.chaveGrupo, chaves))
    .orderBy(desc(produtosCentralDecisoes.criadoEm));
  const decisaoPorChave = new Map<string, (typeof decisoes)[number]>();
  for (const decisao of decisoes) {
    if (!decisaoPorChave.has(decisao.chaveGrupo)) decisaoPorChave.set(decisao.chaveGrupo, decisao);
  }
  return {
    total: total?.total ?? 0,
    grupos: grupos.map((grupo) => ({
      ...grupo,
      decisao: decisaoPorChave.get(grupo.chave) ?? null,
      itens: linhasFonte.filter((linha) => linha.grupoId === grupo.id)
    }))
  };
}
