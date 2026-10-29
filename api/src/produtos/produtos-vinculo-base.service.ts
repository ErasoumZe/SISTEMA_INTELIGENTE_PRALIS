import { createHash } from "node:crypto";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { travarCadastroDeProdutos } from "./produtos-escrita.repository.js";
import { contextoDaEmpresaFiscalRepository } from "./produtos-fiscal.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { registrarNaFilaDaPlanilha } from "./produtos-planilha.service.js";
import {
  basesComCopiaNaLojaRepository,
  basesParaVinculoRepository,
  ligarProdutosABaseRepository,
  produtosDaLojaParaVinculoRepository
} from "./produtos-vinculo-base.repository.js";

/**
 * Ligar os produtos da loja que ja existem no ERP ao catalogo BASE (passo da virada, R-222).
 *
 * No app oficial a copia da loja herda o MESMO codigo interno da BASE; e por ele que o vinculo e refeito
 * aqui — nunca por nome. So liga o inequivoco: um codigo, uma BASE, um produto, e o codigo de barras nao
 * contradiz (quando os dois tem). O resto aparece na previa com o motivo e fica solto, como esta hoje.
 *
 * Fase A (29/10/2026, José): os produtos que a integracao do PDV criou sozinha nao tem codigo interno, so
 * o codigo do PDV (`codigo`: o EAN, ou o codigo interno quando nao ha EAN, com zeros a esquerda). Para
 * eles o codigo do PDV e procurado no codigo interno OU no codigo de barras da BASE. Ao ligar, o produto
 * recebe da BASE o codigo interno, o codigo de barras e o nome do catalogo — so onde estavam vazios.
 * Preco, grupo, fiscal, descricao e o proprio `codigo` do PDV nao mudam.
 */
export const CONFIRMACAO_VINCULO_BASE = "LIGAR PRODUTOS A BASE";

export type MotivoSemVinculo =
  | "sem-codigo"
  | "sem-base"
  | "base-ambigua"
  | "base-ja-tem-copia"
  | "codigo-disputado"
  | "barras-divergem"
  | "codigo-ocupado";

export class VinculoBaseError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 403 | 409 | 422,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "VinculoBaseError";
  }
}

type Ator = { administrador: boolean; empresasPermitidas: string[] };

const numero = (codigo: string | null) => {
  const limpo = String(codigo ?? "").trim();
  return /^\d+$/u.test(limpo) ? limpo.replace(/^0+(?=\d)/u, "") : null;
};
const barras = (valor: string | null) =>
  String(valor ?? "")
    .replace(/\D/gu, "")
    .replace(/^0+(?=\d)/u, "");

async function lojaDaEmpresa(empresaId: string, ator: Ator) {
  if (!ator.administrador) {
    throw new VinculoBaseError("Apenas o administrador liga produtos à BASE.", 403, "FORBIDDEN");
  }
  if (!ator.empresasPermitidas.includes(empresaId)) {
    throw new VinculoBaseError("Empresa não permitida.", 403, "FORBIDDEN_COMPANY");
  }
  const loja = lojaFiscalDaEmpresa((await contextoDaEmpresaFiscalRepository(empresaId))?.matriculaPrefixo);
  if (!["TNP", "LI", "HORA"].includes(loja)) {
    throw new VinculoBaseError(`Esta empresa não é uma loja (${loja}).`, 422, "EMPRESA_SEM_LOJA");
  }
  return loja;
}

async function planejar(empresaId: string, bloquear: boolean, tx?: ExecutorBanco) {
  const [bases, daLoja, comCopia] = [
    await basesParaVinculoRepository(tx),
    await produtosDaLojaParaVinculoRepository(empresaId, bloquear, tx),
    await basesComCopiaNaLojaRepository(empresaId, tx)
  ];
  const basesPorCodigo = new Map<string, typeof bases>();
  // Codigo do PDV -> BASE pelo codigo interno OU pelo codigo de barras (sem zeros a esquerda).
  const basesPorCodigoPdv = new Map<string, Map<string, (typeof bases)[number]>>();
  for (const base of bases) {
    const codigo = numero(base.codigoInterno);
    if (codigo) basesPorCodigo.set(codigo, [...(basesPorCodigo.get(codigo) ?? []), base]);
    for (const chave of [codigo, barras(base.codigoBarras)]) {
      if (!chave) continue;
      basesPorCodigoPdv.set(
        chave,
        (basesPorCodigoPdv.get(chave) ?? new Map<string, (typeof bases)[number]>()).set(base.id, base)
      );
    }
  }
  const soltos = daLoja.filter((p) => !p.produtoBaseId);
  const candidatos: Array<{ produto: (typeof soltos)[number]; base: (typeof bases)[number] }> = [];
  const motivos: Record<MotivoSemVinculo, number> = {
    "sem-codigo": 0,
    "sem-base": 0,
    "base-ambigua": 0,
    "base-ja-tem-copia": 0,
    "codigo-disputado": 0,
    "barras-divergem": 0,
    "codigo-ocupado": 0
  };
  const exemplos: Array<{
    produtoId: string;
    nome: string;
    codigoInterno: string | null;
    codigoPdv: string | null;
    motivo: MotivoSemVinculo;
  }> = [];
  const recusar = (produto: (typeof soltos)[number], motivo: MotivoSemVinculo) => {
    motivos[motivo] += 1;
    if (exemplos.length < 50) {
      exemplos.push({
        produtoId: produto.id,
        nome: produto.nomeCatalogo ?? produto.descricao,
        codigoInterno: produto.codigoInterno,
        codigoPdv: produto.codigo,
        motivo
      });
    }
  };
  for (const produto of soltos) {
    const codigo = numero(produto.codigoInterno);
    const codigoPdv = codigo ? null : numero(produto.codigo);
    if (!codigo && !codigoPdv) {
      recusar(produto, "sem-codigo");
      continue;
    }
    const achadas = codigo
      ? (basesPorCodigo.get(codigo) ?? [])
      : [...(basesPorCodigoPdv.get(codigoPdv!)?.values() ?? [])];
    if (!achadas.length) {
      recusar(produto, "sem-base");
      continue;
    }
    if (achadas.length > 1) {
      recusar(produto, "base-ambigua");
      continue;
    }
    const base = achadas[0]!;
    if (comCopia.has(base.id)) {
      recusar(produto, "base-ja-tem-copia");
      continue;
    }
    const doProduto = barras(produto.codigoBarras);
    const daBase = barras(base.codigoBarras);
    if (doProduto && daBase && doProduto !== daBase) {
      recusar(produto, "barras-divergem");
      continue;
    }
    candidatos.push({ produto, base });
  }
  // Dois produtos da loja para a MESMA BASE: nenhum dos dois e ligado (decisao de gente).
  const porBase = new Map<string, number>();
  for (const c of candidatos) porBase.set(c.base.id, (porBase.get(c.base.id) ?? 0) + 1);
  const unicos = candidatos.filter((c) => {
    if ((porBase.get(c.base.id) ?? 0) === 1) return true;
    recusar(c.produto, "codigo-disputado");
    return false;
  });
  // O codigo interno e unico por loja no banco: se OUTRO produto da loja ja usa o da BASE, fica solto.
  const codigosEmUso = new Map(
    daLoja.filter((p) => p.codigoInterno?.trim()).map((p) => [p.codigoInterno!.trim(), p.id] as const)
  );
  const ligar = unicos
    .map((c) => ({
      ...c,
      codigoInterno: c.produto.codigoInterno ?? c.base.codigoInterno,
      codigoBarras: c.produto.codigoBarras ?? c.base.codigoBarras,
      nomeCatalogo: c.produto.nomeCatalogo ?? c.base.nome
    }))
    .filter((c) => {
      const dono = c.codigoInterno ? codigosEmUso.get(c.codigoInterno.trim()) : undefined;
      if (!dono || dono === c.produto.id) return true;
      recusar(c.produto, "codigo-ocupado");
      return false;
    });
  const pares = ligar.map((c) => ({
    produtoId: c.produto.id,
    produtoBaseId: c.base.id,
    codigoInterno: c.codigoInterno,
    codigoBarras: c.codigoBarras,
    nomeCatalogo: c.nomeCatalogo
  }));
  const hashPlano = createHash("sha256").update(JSON.stringify(pares)).digest("hex");
  return { total: daLoja.length, jaLigados: daLoja.length - soltos.length, ligar, pares, motivos, exemplos, hashPlano };
}

export async function previaVinculoBase(empresaId: string, ator: Ator) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  const plano = await planejar(empresaId, false);
  return {
    loja,
    total: plano.total,
    jaLigados: plano.jaLigados,
    ligar: plano.pares.length,
    motivos: plano.motivos,
    exemplosSemVinculo: plano.exemplos,
    amostra: plano.ligar.slice(0, 25).map((c) => ({
      produtoId: c.produto.id,
      nome: c.produto.nomeCatalogo ?? c.produto.descricao,
      codigoPdv: c.produto.codigo,
      // Como fica depois de ligar (o que estava vazio vem da BASE).
      codigoInterno: c.codigoInterno,
      codigoBarras: c.codigoBarras,
      nomeNaBase: c.base.nome
    })),
    hashPlano: plano.hashPlano,
    confirmacao: CONFIRMACAO_VINCULO_BASE
  };
}

export async function aplicarVinculoBase(
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string },
  ator: Ator
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_VINCULO_BASE) {
    throw new VinculoBaseError(`Digite exatamente ${CONFIRMACAO_VINCULO_BASE}.`, 400, "CONFIRMACAO_INVALIDA");
  }
  return executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);
    const plano = await planejar(empresaId, true, tx);
    if (plano.hashPlano !== entrada.hashPlano) {
      throw new VinculoBaseError(
        "Os cadastros mudaram desde a prévia. Confira de novo; nada foi gravado.",
        409,
        "PREVIA_DESATUALIZADA"
      );
    }
    const ligados = await ligarProdutosABaseRepository(tx, empresaId, plano.pares);
    for (const par of plano.pares) await registrarNaFilaDaPlanilha(tx, { empresaId, produtoId: par.produtoId });
    return { loja, ligados, semVinculo: plano.motivos };
  });
}
