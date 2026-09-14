import { and, eq, inArray } from "drizzle-orm";
import { fornecedores, produtos } from "@padaria/db/schema/cadastro";
import { despesas } from "@padaria/db/schema/despesa";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { notasFiscais } from "@padaria/db/schema/nota-fiscal";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import { apenasDigitos } from "../utils.js";

export type ProdutoCasadoIa = {
  id: string;
  descricao: string;
  grupoMercadoriaId: string | null;
  unidadeMedidaId: string | null;
};

export async function buscarFornecedorIa(
  empresaId: string,
  cnpj: string | null,
  db: ExecutorBanco = banco
): Promise<{ id: string; nome: string } | null> {
  if (!cnpj) return null;
  const linhas = await db
    .select({ id: fornecedores.id, nome: fornecedores.nome, documento: fornecedores.documento })
    .from(fornecedores)
    .where(eq(fornecedores.empresaId, empresaId));
  return linhas.find((linha) => apenasDigitos(linha.documento) === cnpj) ?? null;
}

export async function buscarProdutosIa(
  empresaId: string,
  eans: string[],
  db: ExecutorBanco = banco
): Promise<Map<string, ProdutoCasadoIa>> {
  const unicos = [...new Set(eans.map((ean) => apenasDigitos(ean)).filter((ean): ean is string => Boolean(ean)))];
  if (!unicos.length) return new Map();
  const linhas = await db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      codigoBarras: produtos.codigoBarras,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      unidadeMedidaId: produtos.unidadeMedidaId
    })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), inArray(produtos.codigoBarras, unicos)));
  return new Map(
    linhas.flatMap((linha) => {
      const ean = apenasDigitos(linha.codigoBarras);
      return ean ? [[ean, linha] as const] : [];
    })
  );
}

export async function verificarDuplicidadeIa(
  entrada: {
    empresaId: string;
    chaveAcesso: string | null;
    numero: string | null;
    fornecedorId: string | null;
    dataEmissao: string | null;
    valorTotal: string | null;
  },
  db: ExecutorBanco = banco
): Promise<{ duplicada: boolean; motivo: string | null }> {
  if (entrada.chaveAcesso) {
    const [nota] = await db
      .select({ id: notasFiscais.id })
      .from(notasFiscais)
      .where(and(eq(notasFiscais.empresaId, entrada.empresaId), eq(notasFiscais.chave, entrada.chaveAcesso)))
      .limit(1);
    if (nota) return { duplicada: true, motivo: "A chave desta NF-e ja existe nas notas importadas." };
    const [mercadoria] = await db
      .select({ id: mercadorias.id })
      .from(mercadorias)
      .where(and(eq(mercadorias.empresaId, entrada.empresaId), eq(mercadorias.notaFiscalId, entrada.chaveAcesso)))
      .limit(1);
    if (mercadoria) return { duplicada: true, motivo: "A chave desta NF-e ja esta ligada a uma mercadoria." };
  }

  const numero = apenasDigitos(entrada.numero);
  if (!numero) return { duplicada: false, motivo: null };
  const semZeros = numero.replace(/^0+(?=\d)/, "");
  const noveDigitos = numero.padStart(9, "0");
  const pontuado = `${noveDigitos.slice(0, 3)}.${noveDigitos.slice(3, 6)}.${noveDigitos.slice(6)}`;
  const variantesNumero = [
    ...new Set([entrada.numero, numero, semZeros, pontuado].filter((valor): valor is string => Boolean(valor)))
  ];
  const candidatosMercadoria = await db
    .select({
      fornecedorId: mercadorias.fornecedorId,
      data: mercadorias.dataDocumentoFiscal,
      valor: mercadorias.valorOriginal
    })
    .from(mercadorias)
    .where(
      and(eq(mercadorias.empresaId, entrada.empresaId), inArray(mercadorias.numeroDocumentoFiscal, variantesNumero))
    )
    .limit(20);
  const candidatosDespesa = await db
    .select({ fornecedorId: despesas.fornecedorId, data: despesas.dataDocumentoFiscal, valor: despesas.valorOriginal })
    .from(despesas)
    .where(and(eq(despesas.empresaId, entrada.empresaId), inArray(despesas.numeroDocumentoFiscal, variantesNumero)))
    .limit(20);
  const candidato = [...candidatosMercadoria, ...candidatosDespesa].find((linha) => {
    if (entrada.fornecedorId && linha.fornecedorId !== entrada.fornecedorId) return false;
    if (entrada.dataEmissao && linha.data !== entrada.dataEmissao) return false;
    if (
      !entrada.fornecedorId &&
      !entrada.dataEmissao &&
      entrada.valorTotal &&
      Number(linha.valor) !== Number(entrada.valorTotal)
    )
      return false;
    return true;
  });
  return candidato
    ? { duplicada: true, motivo: "Ha um lancamento com o mesmo fornecedor, numero e data da nota." }
    : { duplicada: false, motivo: null };
}
