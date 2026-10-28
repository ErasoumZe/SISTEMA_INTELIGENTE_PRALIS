import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  creareExportacaoConfirmacoes,
  creareExportacaoEntregas,
  creareExportacaoLotes,
  empresas,
  gruposMercadorias,
  produtos,
  produtosFiscal,
  produtosPromocoes,
  siaProdutoDepara,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco, executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";

/**
 * Lotes do TXT do PDV CREARE — porte de `creare-export.repository.ts` do app oficial (R-222).
 * A trava da loja e a linha da EMPRESA (`FOR UPDATE`), no lugar do `pg_advisory_xact_lock` do oficial
 * (a API do ERP nao usa SQL cru); o efeito e o mesmo: prepara, entrega e confirma um de cada vez.
 */
export type LoteCreare = typeof creareExportacaoLotes.$inferSelect;
export interface RegistroPendente {
  produtoId: string;
  registro: string;
  hash: string;
}

/** Versao do formato do registro (oficial: 3). Lote aberto de formato anterior e cancelado. */
export const FORMATO_ATUAL_CREARE = 3;
/** Lote aberto sem entrega por mais que isto e reciclado: os produtos voltam no proximo. */
export const VALIDADE_LOTE_ABERTO_MINUTOS = 15;
export const loteExpirado = (criadoEm: Date, agora = Date.now()) =>
  agora - criadoEm.getTime() > VALIDADE_LOTE_ABERTO_MINUTOS * 60_000;

async function travarLoja(tx: TransacaoBanco, empresaId: string) {
  await tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId)).for("update");
}

/** Empresa que e a loja TNP/LI/HORA (pelo prefixo de matricula). Mais de uma = ambiguo. */
export async function empresasDaLojaRepository(loja: string) {
  return banco.select({ id: empresas.id }).from(empresas).where(eq(empresas.matriculaPrefixo, loja));
}

/** O cadastro da loja como o gerador precisa (ativos e inativos), com grupo, unidade e fiscal. */
export async function produtosParaCreareRepository(empresaId: string) {
  const linhas = await banco
    .select({
      id: produtos.id,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras,
      descricao: produtos.descricao,
      nomeCatalogo: produtos.nomeCatalogo,
      quantidadeIndividual: produtos.quantidadeIndividual,
      sigla: unidadesMedida.sigla,
      pesavel: produtos.pesavel,
      teclaBalanca: produtos.teclaBalanca,
      validadeBalanca: produtos.validadeBalanca,
      marca: produtos.marca,
      quantidadeCaixa: produtos.quantidadeCaixa,
      grupoNome: gruposMercadorias.nome,
      grupoIdExterno: produtos.grupoIdExterno,
      tipo: produtos.tipo,
      status: produtos.status,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax,
      custo: produtos.custo,
      margem: produtos.margem,
      precoVenda: produtos.precoVenda,
      auto: produtos.auto,
      fiscal: {
        ncm: produtosFiscal.ncm,
        cest: produtosFiscal.cest,
        categoria: produtosFiscal.categoriaFiscal,
        cstPisCofins: produtosFiscal.cstPisCofins,
        aliquotaCheia: produtosFiscal.aliquotaCheia,
        aliquotaFcp: produtosFiscal.aliquotaFcp,
        aliquotaPis: produtosFiscal.aliquotaPis,
        aliquotaCofins: produtosFiscal.aliquotaCofins,
        reducaoIcms: produtosFiscal.reducaoIcms,
        icms: produtosFiscal.icms,
        aliquotaEcfId: produtosFiscal.aliquotaEcfId,
        produtoId: produtosFiscal.produtoId
      }
    })
    .from(produtos)
    .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
    .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
    .leftJoin(produtosFiscal, eq(produtosFiscal.produtoId, produtos.id))
    .where(eq(produtos.empresaId, empresaId))
    .orderBy(produtos.id);
  const comPromocao = linhas.length
    ? new Set(
        (
          await banco
            .selectDistinct({ produtoId: produtosPromocoes.produtoId })
            .from(produtosPromocoes)
            .where(
              inArray(
                produtosPromocoes.produtoId,
                linhas.map((linha) => linha.id)
              )
            )
        ).map((linha) => linha.produtoId)
      )
    : new Set<string>();
  return linhas.map((linha) => ({ ...linha, temPromocao: comPromocao.has(linha.id) }));
}

/** De-para do SIA da loja, por chave de barras. */
export async function deParaParaCreareRepository(empresaId: string) {
  return banco
    .select({
      chaveBarras: siaProdutoDepara.chaveBarras,
      coditem: siaProdutoDepara.coditem,
      codGrupo: siaProdutoDepara.codGrupo,
      aliqSaidaEcf: siaProdutoDepara.aliqSaidaEcf,
      ncm: siaProdutoDepara.ncm,
      pesavel: siaProdutoDepara.pesavel,
      teclaBalanca: siaProdutoDepara.teclaBalanca,
      validadeBalanca: siaProdutoDepara.validadeBalanca
    })
    .from(siaProdutoDepara)
    .where(eq(siaProdutoDepara.empresaId, empresaId));
}

const abertoDa = (empresaId: string) =>
  and(
    eq(creareExportacaoLotes.empresaId, empresaId),
    isNull(creareExportacaoLotes.entregueEm),
    isNull(creareExportacaoLotes.confirmadoEm),
    isNull(creareExportacaoLotes.canceladoEm)
  );

/** Lote aberto valido (formato atual, dentro da validade), sem gerar outro. */
export async function loteAbertoRepository(empresaId: string): Promise<LoteCreare | null> {
  const [lote] = await banco
    .select()
    .from(creareExportacaoLotes)
    .where(and(abertoDa(empresaId), eq(creareExportacaoLotes.formatoVersao, FORMATO_ATUAL_CREARE)))
    .limit(1);
  return lote && !loteExpirado(lote.criadoEm) ? lote : null;
}

async function entreguesDa(executor: TransacaoBanco | typeof banco, empresaId: string) {
  const linhas = await executor
    .select({ produtoId: creareExportacaoEntregas.produtoId, hash: creareExportacaoEntregas.hash })
    .from(creareExportacaoEntregas)
    .where(eq(creareExportacaoEntregas.empresaId, empresaId));
  return new Map(linhas.map((linha) => [linha.produtoId, linha.hash]));
}

/** Diagnostico do cursor (o `cursor` do oficial): o que esta pendente, lote aberto e ultima entrega. */
export async function cursorCreareRepository(empresaId: string, registros: RegistroPendente[]) {
  const entregues = await entreguesDa(banco, empresaId);
  const [confirmados] = await banco
    .select({ total: count() })
    .from(creareExportacaoConfirmacoes)
    .where(eq(creareExportacaoConfirmacoes.empresaId, empresaId));
  const [aberto] = await banco.select().from(creareExportacaoLotes).where(abertoDa(empresaId)).limit(1);
  const [entrega] = await banco
    .select()
    .from(creareExportacaoLotes)
    .where(
      and(
        eq(creareExportacaoLotes.empresaId, empresaId),
        isNull(creareExportacaoLotes.canceladoEm),
        isNotNull(creareExportacaoLotes.entregueEm)
      )
    )
    .orderBy(desc(creareExportacaoLotes.entregueEm))
    .limit(1);
  return {
    pendentes: registros.filter((item) => entregues.get(item.produtoId) !== item.hash).map((item) => item.produtoId),
    cursorEntregue: entregues.size,
    cursorConfirmado: Number(confirmados?.total ?? 0),
    loteAberto: aberto
      ? {
          id: aberto.id,
          registros: aberto.itens.length,
          criadoEm: aberto.criadoEm,
          idadeMinutos: Math.floor((Date.now() - aberto.criadoEm.getTime()) / 60_000),
          formatoVersao: aberto.formatoVersao,
          abandonado: loteExpirado(aberto.criadoEm)
        }
      : null,
    ultimaEntrega: entrega?.entregueEm
      ? { loteId: entrega.id, registros: entrega.itens.length, em: entrega.entregueEm }
      : null
  };
}

/**
 * Oficial `prepare`: devolve o MESMO lote aberto enquanto valido (idempotencia do download); lote
 * expirado ou de formato antigo e fechado sem avancar o cursor; senao cria lote so com o que mudou
 * desde a ultima entrega. Nada mudou = null (204).
 */
export async function prepararLoteRepository(
  empresaId: string,
  registros: RegistroPendente[],
  conteudoDe: (selecionados: RegistroPendente[]) => { conteudo: string; sha256: string },
  limite?: number
): Promise<LoteCreare | null> {
  return executarEmTransacao(async (tx) => {
    await travarLoja(tx, empresaId);
    const [aberto] = await tx.select().from(creareExportacaoLotes).where(abertoDa(empresaId)).limit(1);
    if (aberto?.formatoVersao === FORMATO_ATUAL_CREARE && !loteExpirado(aberto.criadoEm)) return aberto;
    if (aberto) {
      const fechadoEm = new Date();
      await tx
        .update(creareExportacaoLotes)
        .set({ canceladoEm: fechadoEm, confirmadoEm: fechadoEm, entregueEm: fechadoEm })
        .where(eq(creareExportacaoLotes.id, aberto.id));
    }
    const entregues = await entreguesDa(tx, empresaId);
    const mudaram = registros.filter((item) => entregues.get(item.produtoId) !== item.hash);
    const selecionados = limite ? mudaram.slice(0, limite) : mudaram;
    if (!selecionados.length) return null;
    const { conteudo, sha256 } = conteudoDe(selecionados);
    const [lote] = await tx
      .insert(creareExportacaoLotes)
      .values({
        empresaId,
        conteudo,
        sha256,
        itens: selecionados.map(({ produtoId, hash }) => ({ produtoId, hash })),
        formatoVersao: FORMATO_ATUAL_CREARE
      })
      .returning();
    return lote ?? null;
  });
}

export class LoteCreareError extends Error {
  constructor(
    mensagem: string,
    readonly status: 404 | 409,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "LoteCreareError";
  }
}

async function loteParaFechar(tx: TransacaoBanco, empresaId: string, id: string, sha256: string) {
  const [lote] = await tx
    .select()
    .from(creareExportacaoLotes)
    .where(and(eq(creareExportacaoLotes.id, id), eq(creareExportacaoLotes.empresaId, empresaId)))
    .limit(1);
  if (!lote) throw new LoteCreareError("Lote não encontrado para esta loja.", 404, "CREARE_BATCH_NOT_FOUND");
  if (lote.sha256 !== sha256) {
    throw new LoteCreareError(
      "O hash do TXT não corresponde ao lote. Nada foi registrado.",
      409,
      "CREARE_BATCH_HASH_MISMATCH"
    );
  }
  if (lote.canceladoEm || lote.formatoVersao !== FORMATO_ATUAL_CREARE) {
    throw new LoteCreareError(
      "Lote cancelado ou em formato anterior. Baixe o TXT de novo.",
      409,
      "CREARE_BATCH_OUTDATED"
    );
  }
  return lote;
}

/** Grava o cursor (entrega ou confirmacao) de cada item: apaga a chave e reinsere, em blocos de 500. */
async function gravarCursor(
  tx: TransacaoBanco,
  tabela: typeof creareExportacaoEntregas | typeof creareExportacaoConfirmacoes,
  lote: LoteCreare
) {
  for (let inicio = 0; inicio < lote.itens.length; inicio += 500) {
    const bloco = lote.itens.slice(inicio, inicio + 500);
    await tx.delete(tabela).where(
      and(
        eq(tabela.empresaId, lote.empresaId),
        inArray(
          tabela.produtoId,
          bloco.map((item) => item.produtoId)
        )
      )
    );
    await tx.insert(tabela).values(
      bloco.map((item) => ({
        empresaId: lote.empresaId,
        produtoId: item.produtoId,
        hash: item.hash,
        loteId: lote.id
      }))
    );
  }
}

/** O robo salvou e conferiu o TXT no PC da loja: avanca o cursor de ENTREGA (nao e "o SIA importou"). */
export async function registrarEntregaRepository(empresaId: string, id: string, sha256: string) {
  return executarEmTransacao(async (tx) => {
    await travarLoja(tx, empresaId);
    const lote = await loteParaFechar(tx, empresaId, id, sha256);
    if (lote.entregueEm) return { count: lote.itens.length, alreadyDelivered: true };
    await gravarCursor(tx, creareExportacaoEntregas, lote);
    await tx.update(creareExportacaoLotes).set({ entregueEm: new Date() }).where(eq(creareExportacaoLotes.id, id));
    return { count: lote.itens.length, alreadyDelivered: false };
  });
}

/** Auditoria opcional depois de conferir a importacao no SIA: avanca a confirmacao (e a entrega, se faltava). */
export async function confirmarLoteRepository(empresaId: string, id: string, sha256: string) {
  return executarEmTransacao(async (tx) => {
    await travarLoja(tx, empresaId);
    const lote = await loteParaFechar(tx, empresaId, id, sha256);
    if (lote.confirmadoEm) return { count: lote.itens.length, alreadyConfirmed: true };
    if (!lote.entregueEm) await gravarCursor(tx, creareExportacaoEntregas, lote);
    await gravarCursor(tx, creareExportacaoConfirmacoes, lote);
    const agora = new Date();
    await tx
      .update(creareExportacaoLotes)
      .set({ confirmadoEm: agora, entregueEm: lote.entregueEm ?? agora })
      .where(eq(creareExportacaoLotes.id, id));
    return { count: lote.itens.length, alreadyConfirmed: false };
  });
}
