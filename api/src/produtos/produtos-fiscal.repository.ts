import { and, eq } from "drizzle-orm";
import type { FiscalDoProduto } from "@padaria/shared/produtos";
import { empresas, gruposMercadorias, produtos, produtosFiscal } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

const numero = (valor: string | null) => (valor == null ? null : Number(valor));

/** Prefixo de matricula da empresa (TNP/LI/HORA): e ele que diz de qual loja e o fiscal. */
export async function contextoDaEmpresaFiscalRepository(empresaId: string) {
  const [empresa] = await banco
    .select({ matriculaPrefixo: empresas.matriculaPrefixo })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return empresa ?? null;
}

/** O mesmo contexto da gravacao, fora de transacao e sem produto: e o da classificacao ao vivo (F3). */
export async function contextoDaClassificacaoRepository(empresaId: string, grupoMercadoriaId: string | null) {
  return contextoFiscalRepository(banco, { empresaId, grupoMercadoriaId, produtoId: null });
}

/**
 * O que a classificacao fiscal precisa saber na gravacao: o NOME do grupo (a regra e por nome, como no
 * oficial), o prefixo da empresa (de qual loja e o ECF) e, na edicao, o fiscal, o grupo e o EAN atuais.
 */
export async function contextoFiscalRepository(
  tx: ExecutorBanco,
  entrada: { empresaId: string; grupoMercadoriaId: string | null; produtoId: string | null }
): Promise<{
  grupoNome: string | null;
  matriculaPrefixo: string | null;
  atual: { grupoMercadoriaId: string | null; codigoBarras: string | null; fiscal: FiscalDoProduto | null } | null;
}> {
  const [empresa] = await tx
    .select({ matriculaPrefixo: empresas.matriculaPrefixo })
    .from(empresas)
    .where(eq(empresas.id, entrada.empresaId))
    .limit(1);
  const [grupo] = entrada.grupoMercadoriaId
    ? await tx
        .select({ nome: gruposMercadorias.nome })
        .from(gruposMercadorias)
        .where(
          and(eq(gruposMercadorias.id, entrada.grupoMercadoriaId), eq(gruposMercadorias.empresaId, entrada.empresaId))
        )
        .limit(1)
    : [];
  let atual = null;
  if (entrada.produtoId) {
    const [linha] = await tx
      .select({ grupoMercadoriaId: produtos.grupoMercadoriaId, codigoBarras: produtos.codigoBarras })
      .from(produtos)
      .where(eq(produtos.id, entrada.produtoId))
      .limit(1);
    const [f] = await tx.select().from(produtosFiscal).where(eq(produtosFiscal.produtoId, entrada.produtoId)).limit(1);
    atual = {
      grupoMercadoriaId: linha?.grupoMercadoriaId ?? null,
      codigoBarras: linha?.codigoBarras ?? null,
      fiscal: f
        ? {
            ncm: f.ncm,
            cest: f.cest,
            categoriaFiscal: f.categoriaFiscal,
            cstPisCofins: f.cstPisCofins,
            aliquotaCheia: numero(f.aliquotaCheia),
            aliquotaFcp: numero(f.aliquotaFcp),
            aliquotaPis: numero(f.aliquotaPis),
            aliquotaCofins: numero(f.aliquotaCofins),
            reducaoIcms: numero(f.reducaoIcms),
            icms: numero(f.icms),
            tributacaoSimples: f.tributacaoSimples,
            aliquotaSimples: numero(f.aliquotaSimples),
            icmsRe: numero(f.icmsRe),
            baseFiscal: f.baseFiscal,
            codigoFiscal: f.codigoFiscal,
            produtoFiscal: f.produtoFiscal,
            cstReforma: f.cstReforma,
            cClassTrib: f.cClassTrib,
            aliquotaIbs: numero(f.aliquotaIbs),
            aliquotaCbs: numero(f.aliquotaCbs),
            origemFiscal: f.origemFiscal,
            aliquotaEcf: f.aliquotaEcf,
            aliquotaEcfId: f.aliquotaEcfId,
            estado: f.estado,
            motivo: f.motivo,
            conferidoEm: f.conferidoEm?.toISOString() ?? null,
            pctNcm: numero(f.pctNcm)
          }
        : null
    };
  }
  return { grupoNome: grupo?.nome ?? null, matriculaPrefixo: empresa?.matriculaPrefixo ?? null, atual };
}
