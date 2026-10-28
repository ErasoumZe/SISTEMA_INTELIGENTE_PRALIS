import { createHash } from "node:crypto";
import {
  OPCOES_PADRAO_PADRONIZACAO,
  PADRAO_TODOS_PESAVEIS,
  planejarBackfill,
  planejarPadronizacao,
  type DecisaoBackfill,
  type OpcoesBackfill,
  type OpcoesPadronizacao
} from "@padaria/shared/produtos";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import {
  estadoDaBalancaRepository,
  gravarBalancaDoEspelhoRepository,
  gravarBalancaDosProdutosRepository
} from "./produtos-pesaveis.repository.js";
import { contextoDaEmpresaFiscalRepository } from "./produtos-fiscal.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { DeParaSiaError } from "./produtos-sia-depara.service.js";

/**
 * Pesavel em lote na loja, sem arquivo — porte de `PesavelBackfillService` e `PesavelPadronizarService` do
 * app oficial (R-222). Os dois so na TNP e na LI, com frase propria e o hash da previa (o estado lido):
 *  - CLASSIFICAR: da valor a quem nao tem (cadastro > espelho do SIA > N/0/0); o cadastro e respeitado;
 *  - PADRONIZAR: todo ativo vira S, tecla 000, validade 5 (barras proprias: N, opcional) — sobrescreve.
 */
type Ator = { administrador: boolean; empresasPermitidas: string[] };
export type LojaDePesavel = "TNP" | "LI";

export const CONFIRMACAO_BACKFILL = (loja: LojaDePesavel) => `CLASSIFICAR PESAVEL ${loja}`;
export const CONFIRMACAO_PADRONIZAR = (loja: LojaDePesavel) => `TODOS PESAVEIS ${loja}`;
const OPCOES_BACKFILL: OpcoesBackfill = { conflitos: "bloquear" };

const digest = (valor: string) => createHash("sha256").update(valor).digest("hex");

async function lojaDaBalanca(empresaId: string, ator: Ator): Promise<LojaDePesavel> {
  if (!ator.administrador) throw new DeParaSiaError("Apenas o administrador ajusta os pesáveis.", 403, "FORBIDDEN");
  if (!ator.empresasPermitidas.includes(empresaId)) {
    throw new DeParaSiaError("Empresa não permitida.", 403, "FORBIDDEN_COMPANY");
  }
  const loja = lojaFiscalDaEmpresa((await contextoDaEmpresaFiscalRepository(empresaId))?.matriculaPrefixo);
  if (loja !== "TNP" && loja !== "LI") {
    throw new DeParaSiaError(`Pesável em lote vale só para TNP e LI (esta empresa é ${loja}).`, 422, "PESAVEL_LOJA");
  }
  return loja;
}

function conferirFrase(digitada: string, esperada: string) {
  if (digitada.trim().toUpperCase() !== esperada) {
    throw new DeParaSiaError(`Digite exatamente ${esperada}.`, 400, "CONFIRMACAO_INVALIDA");
  }
}

const previaMudou = () =>
  new DeParaSiaError(
    "Os cadastros mudaram desde a prévia. Confira novamente; nada foi gravado.",
    409,
    "PREVIA_DESATUALIZADA"
  );

// ---------------- classificar (backfill) ----------------

async function calcularBackfill(empresaId: string, bloquear: boolean, opcoes: OpcoesBackfill, tx?: ExecutorBanco) {
  const estado = await estadoDaBalancaRepository(empresaId, { bloquear, espelhoPorCoditem: true }, tx);
  const plano = planejarBackfill(estado.produtos, estado.espelhos, opcoes);
  return { estado, plano, hashPlano: digest(JSON.stringify({ estado, opcoes })) };
}

export async function previaBackfillPesavel(empresaId: string, ator: Ator, opcoes: OpcoesBackfill = OPCOES_BACKFILL) {
  const loja = await lojaDaBalanca(empresaId, ator);
  const { estado, plano, hashPlano } = await calcularBackfill(empresaId, false, opcoes);
  return {
    loja,
    totalProdutos: estado.produtos.length,
    gravar: plano.gravar.length,
    porOrigem: plano.porOrigem,
    completarBalanca: plano.completarBalanca.length,
    jaDefinidos: plano.jaDefinidos,
    conflitos: plano.conflitos.slice(0, 50),
    politicaConflitos: opcoes.conflitos,
    espelhoCorrigir: plano.espelhoCorrigir.slice(0, 50),
    espelhoAmbiguo: plano.espelhoAmbiguo.slice(0, 50),
    espelhoIncompleto: plano.espelhoIncompleto.slice(0, 50),
    amostraPesaveis: plano.gravar
      .filter((g) => g.pesavel === "S")
      .slice(0, 5)
      .map((g) => ({
        codigoInterno: g.produto.codigoInterno ?? "",
        nome: g.produto.nome,
        validadeDias: g.validadeBalanca
      })),
    hashPlano,
    confirmacao: CONFIRMACAO_BACKFILL(loja)
  };
}

export async function aplicarBackfillPesavel(
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string },
  ator: Ator,
  opcoes: OpcoesBackfill = OPCOES_BACKFILL
) {
  const loja = await lojaDaBalanca(empresaId, ator);
  conferirFrase(entrada.confirmacao, CONFIRMACAO_BACKFILL(loja));
  return executarEmTransacao(async (tx) => {
    const atual = await calcularBackfill(empresaId, true, opcoes, tx);
    if (entrada.hashPlano !== atual.hashPlano) throw previaMudou();
    const { plano } = atual;
    if (plano.conflitos.length || plano.espelhoAmbiguo.length) {
      throw new DeParaSiaError(
        "Há produtos em que cadastro e espelho discordam, ou espelhos ambíguos. Resolva-os antes; nada foi gravado.",
        422,
        "PESAVEL_BACKFILL_CONFLITO"
      );
    }
    const gravar = async (decisoes: DecisaoBackfill[]) => {
      for (const d of decisoes) {
        await gravarBalancaDosProdutosRepository(tx, [d.produto.id], d);
      }
    };
    await gravar(plano.gravar);
    await gravar(plano.completarBalanca);
    for (const c of plano.espelhoCorrigir) {
      await gravarBalancaDoEspelhoRepository(tx, [c.espelhoId], c);
    }
    return {
      loja,
      gravados: plano.gravar.length,
      porOrigem: plano.porOrigem,
      completados: plano.completarBalanca.length,
      espelhosCorrigidos: plano.espelhoCorrigir.length,
      jaDefinidos: plano.jaDefinidos,
      espelhoIncompleto: plano.espelhoIncompleto.length
    };
  });
}

// ---------------- padronizar ----------------

async function calcularPadronizacao(
  empresaId: string,
  bloquear: boolean,
  opcoes: OpcoesPadronizacao,
  tx?: ExecutorBanco
) {
  const estado = await estadoDaBalancaRepository(empresaId, { bloquear, somenteAtivos: true }, tx);
  const padrao = PADRAO_TODOS_PESAVEIS;
  const plano = planejarPadronizacao(estado.produtos, estado.espelhos, padrao, opcoes);
  return { plano, hashPlano: digest(JSON.stringify({ estado, padrao, opcoes })) };
}

export async function previaPadronizarPesavel(
  empresaId: string,
  ator: Ator,
  opcoes: OpcoesPadronizacao = OPCOES_PADRAO_PADRONIZACAO
) {
  const loja = await lojaDaBalanca(empresaId, ator);
  const { plano, hashPlano } = await calcularPadronizacao(empresaId, false, opcoes);
  return {
    loja,
    padrao: plano.padrao,
    opcoes: plano.opcoes,
    totalAtivos: plano.totalAtivos,
    gravar: plano.gravar.length,
    jaNoPadrao: plano.jaNoPadrao,
    invertidos: plano.invertidos,
    semValor: plano.semValor,
    barrasProprias: plano.barrasProprias,
    paraS: plano.paraS,
    paraN: plano.paraN,
    espelhoCorrigir: plano.espelhoCorrigir.length,
    espelhoJaNoPadrao: plano.espelhoJaNoPadrao,
    semEspelho: plano.semEspelho,
    amostraInvertidos: plano.gravar
      .filter((g) => g.depois.pesavel === "S" && g.antes.pesavel && g.antes.pesavel !== "S")
      .slice(0, 8)
      .map((g) => ({ codigoInterno: g.produto.codigoInterno ?? "", nome: g.produto.nome })),
    amostraNaoPesaveis: plano.gravar
      .filter((g) => g.depois.pesavel === "N")
      .slice(0, 8)
      .map((g) => ({
        codigoInterno: g.produto.codigoInterno ?? "",
        codigoBarras: g.produto.codigoBarras ?? "",
        nome: g.produto.nome
      })),
    hashPlano,
    confirmacao: CONFIRMACAO_PADRONIZAR(loja)
  };
}

export async function aplicarPadronizarPesavel(
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string },
  ator: Ator,
  opcoes: OpcoesPadronizacao = OPCOES_PADRAO_PADRONIZACAO
) {
  const loja = await lojaDaBalanca(empresaId, ator);
  conferirFrase(entrada.confirmacao, CONFIRMACAO_PADRONIZAR(loja));
  return executarEmTransacao(async (tx) => {
    const atual = await calcularPadronizacao(empresaId, true, opcoes, tx);
    if (entrada.hashPlano !== atual.hashPlano) throw previaMudou();
    const { plano } = atual;
    for (const alvo of ["S", "N"] as const) {
      const mudancas = plano.gravar.filter((g) => g.depois.pesavel === alvo);
      const valores = mudancas[0]?.depois;
      if (valores) {
        await gravarBalancaDosProdutosRepository(
          tx,
          mudancas.map((g) => g.produto.id),
          valores
        );
      }
      const espelhos = plano.espelhoCorrigir.filter((c) => c.depois.pesavel === alvo);
      const texto = espelhos[0]?.depois;
      if (texto) {
        await gravarBalancaDoEspelhoRepository(
          tx,
          espelhos.map((c) => c.espelhoId),
          texto
        );
      }
    }
    return {
      loja,
      gravados: plano.gravar.length,
      paraS: plano.paraS,
      paraN: plano.paraN,
      invertidos: plano.invertidos,
      semValor: plano.semValor,
      jaNoPadrao: plano.jaNoPadrao,
      barrasProprias: plano.barrasProprias,
      espelhosCorrigidos: plano.espelhoCorrigir.length,
      semEspelho: plano.semEspelho
    };
  });
}
