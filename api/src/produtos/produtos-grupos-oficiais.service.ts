import { createHash } from "node:crypto";
import type { JsonValue } from "@padaria/shared/api";
import { chaveDeGrupo } from "@padaria/shared/produtos";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { travarCadastroDeProdutos } from "./produtos-escrita.repository.js";
import { gruposOficiais } from "./produtos-grupo-id.js";
import {
  criarGruposEUnidadesRepository,
  dadosOficiaisDaBaseRepository,
  gruposEUnidadesDaLojaRepository
} from "./produtos-grupos-oficiais.repository.js";
import { lojaDaEmpresa, VinculoBaseError, type Ator } from "./produtos-vinculo-base.service.js";

/**
 * Fase B1 da virada (29/10/2026, José): a loja recebe os GRUPOS OFICIAIS da planilha (a mesma faixa AC5:AD de
 * onde sai o ID do grupo no PDV) e as UNIDADES que os produtos da BASE usam e ela ainda nao tem. Sem isso a
 * copia BASE -> loja recusa o produto ("o grupo nao tem correspondencia unica na loja").
 *
 * So cria o que falta: grupo que a loja ja tem com o mesmo nome (sem acento, maiusculas e separadores
 * invisiveis nao contam) nao e recriado; nada e alterado nem apagado.
 */
export const CONFIRMACAO_GRUPOS_OFICIAIS = "CRIAR GRUPOS E UNIDADES";

/** Nome das unidades conhecidas do paralelo; sigla desconhecida vira o proprio nome. */
const NOME_DA_UNIDADE: Record<string, string> = {
  UN: "Unidade",
  KG: "Quilograma",
  G: "Grama",
  L: "Litro",
  LT: "Litro (LT)",
  ML: "Mililitro",
  CX: "Caixa",
  FD: "Fardo",
  PCT: "Pacote"
};
const CAMPOS_DE_UNIDADE = ["medida_base", "embalagem", "medida_compra"];

const chaveDeUnidade = (sigla: string) =>
  sigla
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/gu, "");

function siglasDaBase(dados: Array<Record<string, JsonValue>>): string[] {
  const siglas = new Map<string, string>();
  for (const produto of dados) {
    for (const campo of CAMPOS_DE_UNIDADE) {
      const bruto = produto[campo];
      const valor = typeof bruto === "string" || typeof bruto === "number" ? String(bruto).trim() : "";
      if (valor && !siglas.has(chaveDeUnidade(valor))) siglas.set(chaveDeUnidade(valor), valor.toUpperCase());
    }
  }
  return [...siglas.values()].sort();
}

async function planejar(empresaId: string, oficiais: Array<{ nome: string; id: string }>, tx?: ExecutorBanco) {
  const [loja, dadosBase] = [
    await gruposEUnidadesDaLojaRepository(empresaId, tx),
    await dadosOficiaisDaBaseRepository(tx)
  ];
  const gruposDaLoja = new Set(loja.grupos.map(chaveDeGrupo));
  const grupos = oficiais.filter((g) => !gruposDaLoja.has(chaveDeGrupo(g.nome)));
  const unidadesDaLoja = new Set(loja.unidades.map(chaveDeUnidade));
  const unidades = siglasDaBase(dadosBase)
    .filter((sigla) => !unidadesDaLoja.has(chaveDeUnidade(sigla)))
    .map((sigla) => ({ sigla, nome: NOME_DA_UNIDADE[sigla] ?? sigla }));
  const hashPlano = createHash("sha256")
    .update(JSON.stringify({ grupos: grupos.map((g) => g.nome), unidades }))
    .digest("hex");
  return {
    grupos,
    gruposJaExistentes: oficiais.length - grupos.length,
    unidades,
    unidadesJaExistentes: loja.unidades.length,
    hashPlano
  };
}

async function lerOficiais() {
  const oficiais = await gruposOficiais();
  if (!oficiais) {
    throw new VinculoBaseError(
      "Não consegui ler os grupos oficiais da planilha. Confira o acesso do ERP à planilha e tente de novo.",
      422,
      "GRUPOS_OFICIAIS_INDISPONIVEIS"
    );
  }
  return oficiais;
}

export async function previaGruposOficiais(empresaId: string, ator: Ator) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  const plano = await planejar(empresaId, await lerOficiais());
  return { loja, ...plano, confirmacao: CONFIRMACAO_GRUPOS_OFICIAIS };
}

export async function aplicarGruposOficiais(
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string },
  ator: Ator
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_GRUPOS_OFICIAIS) {
    throw new VinculoBaseError(`Digite exatamente ${CONFIRMACAO_GRUPOS_OFICIAIS}.`, 400, "CONFIRMACAO_INVALIDA");
  }
  // A planilha e lida ANTES da trava do cadastro: o Google nunca segura a trava.
  const oficiais = await lerOficiais();
  return executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);
    const plano = await planejar(empresaId, oficiais, tx);
    if (plano.hashPlano !== entrada.hashPlano) {
      throw new VinculoBaseError(
        "Os grupos ou as unidades mudaram desde a prévia. Confira de novo; nada foi gravado.",
        409,
        "PREVIA_DESATUALIZADA"
      );
    }
    const criados = await criarGruposEUnidadesRepository(
      tx,
      empresaId,
      plano.grupos.map((g) => g.nome),
      plano.unidades
    );
    return { loja, gruposCriados: criados.grupos, unidadesCriadas: criados.unidades };
  });
}
