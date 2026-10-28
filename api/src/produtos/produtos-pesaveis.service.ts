import { createHash } from "node:crypto";
import {
  codigoSia,
  CONFIRMACAO_PESAVEIS,
  lerPesaveisExportacao,
  planejarPesaveis,
  type PesavelDaExportacao
} from "@padaria/shared/produtos";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import {
  estadoDaBalancaRepository,
  gravarBalancaDoEspelhoRepository,
  gravarBalancaDosProdutosRepository
} from "./produtos-pesaveis.repository.js";
import { contextoDaEmpresaFiscalRepository } from "./produtos-fiscal.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { DeParaSiaError, tabelaDoArquivoDoSia, type ArquivoDoSia } from "./produtos-sia-depara.service.js";

/**
 * Pesaveis da TNP pela exportacao do SIA — porte de `PesaveisMaintenanceService` do app oficial (R-222):
 * o que o SIA marca "Pesavel = S" vira pesavel, tecla 0 e a validade do SIA, no produto e no de-para.
 * Casa SO pelo codigo interno (nunca nome, unidade ou barras). A previa nao grava; aplicar exige a frase
 * e os hashes da previa — arquivo ou cadastro mudou no meio, nada e gravado (409).
 */
type Ator = { administrador: boolean; empresasPermitidas: string[] };

const digest = (valor: string | Buffer) => createHash("sha256").update(valor).digest("hex");
const temColunasDePesaveis = (aba: string[][]) => {
  try {
    lerPesaveisExportacao(aba.slice(0, 1));
    return true;
  } catch {
    return false;
  }
};

/** Oficial: so a TNP (a loja onde a balanca do SIA e a fonte). */
async function empresaDaTnp(empresaId: string, ator: Ator) {
  if (!ator.administrador) throw new DeParaSiaError("Apenas o administrador ajusta os pesáveis.", 403, "FORBIDDEN");
  if (!ator.empresasPermitidas.includes(empresaId)) {
    throw new DeParaSiaError("Empresa não permitida.", 403, "FORBIDDEN_COMPANY");
  }
  const contexto = await contextoDaEmpresaFiscalRepository(empresaId);
  if (lojaFiscalDaEmpresa(contexto?.matriculaPrefixo) !== "TNP") {
    throw new DeParaSiaError("A correção de pesáveis vale só para a TNP.", 422, "PESAVEIS_SO_TNP");
  }
}

function ler(arquivo: ArquivoDoSia) {
  let fonte: ReturnType<typeof lerPesaveisExportacao>;
  try {
    fonte = lerPesaveisExportacao(tabelaDoArquivoDoSia(arquivo, temColunasDePesaveis));
  } catch (erro) {
    if (erro instanceof DeParaSiaError) throw erro;
    throw new DeParaSiaError(
      `Exportação inválida: ${erro instanceof Error ? erro.message : "formato desconhecido"}`,
      422,
      "PESAVEIS_ARQUIVO"
    );
  }
  if (fonte.problemas.length) {
    throw new DeParaSiaError(
      `Exportação recusada: ${fonte.problemas.slice(0, 5).join("; ")}. Total: ${fonte.problemas.length}.`,
      422,
      "PESAVEIS_RECUSADA"
    );
  }
  return fonte;
}

async function calcular(empresaId: string, arquivo: ArquivoDoSia, bloquear: boolean, tx?: ExecutorBanco) {
  const fonte = ler(arquivo);
  const codigos = new Set(fonte.pesaveis.map((p: PesavelDaExportacao) => p.codigoInterno));
  const todos = await estadoDaBalancaRepository(empresaId, { bloquear, comCodigoInterno: true }, tx);
  // So os codigos da exportacao entram no estado (e no hash), como no `IN (...)` do oficial.
  const estado = {
    produtos: todos.produtos.filter((p) => codigos.has(codigoSia(p.codigoInterno) ?? "")),
    espelhos: todos.espelhos.filter((e) => codigos.has(codigoSia(e.coditem) ?? ""))
  };
  const plano = planejarPesaveis(fonte.pesaveis, estado.produtos, estado.espelhos);
  const hashArquivo = digest(arquivo.bytes);
  const hashPlano = digest(JSON.stringify({ hashArquivo, estado }));
  return { fonte, plano, hashArquivo, hashPlano };
}

export async function previaPesaveis(empresaId: string, arquivo: ArquivoDoSia, ator: Ator) {
  await empresaDaTnp(empresaId, ator);
  const { fonte, plano, hashArquivo, hashPlano } = await calcular(empresaId, arquivo, false);
  return {
    loja: "TNP",
    arquivo: arquivo.nome,
    totalFonte: fonte.produtos,
    pesaveisFonte: fonte.pesaveis.length,
    validadeZero: fonte.pesaveis.filter((p) => p.validadeDias === 0).length,
    atualizarProdutos: plano.atualizarProdutos.length,
    atualizarEspelhos: plano.atualizarEspelhos.length,
    jaCorretos: plano.jaCorretos,
    semProduto: plano.semProduto,
    codigoAmbiguo: plano.codigoAmbiguo,
    espelhoAmbiguo: plano.espelhoAmbiguo,
    semEspelho: plano.semEspelho,
    hashArquivo,
    hashPlano,
    confirmacao: CONFIRMACAO_PESAVEIS,
    // Amostra do que sera gravado: tres com validade em dias (validade 0 e a maioria e nao mostra nada).
    amostra: plano.atualizarProdutos
      .filter(({ fonte: item }) => item.validadeDias > 0)
      .slice(0, 3)
      .map(({ fonte: item }) => ({
        codigoInterno: item.codigoInterno,
        nome: item.nome,
        validadeDias: item.validadeDias
      }))
  };
}

export async function aplicarPesaveis(
  empresaId: string,
  arquivo: ArquivoDoSia,
  entrada: { confirmacao: string; hashArquivo: string; hashPlano: string },
  ator: Ator
) {
  await empresaDaTnp(empresaId, ator);
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_PESAVEIS) {
    throw new DeParaSiaError(`Digite exatamente ${CONFIRMACAO_PESAVEIS}.`, 400, "CONFIRMACAO_INVALIDA");
  }
  return executarEmTransacao(async (tx) => {
    const atual = await calcular(empresaId, arquivo, true, tx);
    if (entrada.hashArquivo !== atual.hashArquivo || entrada.hashPlano !== atual.hashPlano) {
      throw new DeParaSiaError(
        "Arquivo ou cadastros mudaram desde a prévia. Confira novamente; nada foi gravado.",
        409,
        "PREVIA_DESATUALIZADA"
      );
    }
    const { plano } = atual;
    if (plano.codigoAmbiguo.length || plano.espelhoAmbiguo.length) {
      throw new DeParaSiaError(
        "Há códigos ambíguos. Corrija os vínculos antes de aplicar; nada foi gravado.",
        422,
        "CODIGO_AMBIGUO"
      );
    }
    for (const { atual: produto, fonte } of plano.atualizarProdutos) {
      await gravarBalancaDosProdutosRepository(tx, [produto.id], {
        pesavel: "S",
        teclaBalanca: 0,
        validadeBalanca: fonte.validadeDias
      });
    }
    for (const { atual: espelho, fonte } of plano.atualizarEspelhos) {
      await gravarBalancaDoEspelhoRepository(tx, [espelho.id], {
        pesavel: "S",
        teclaBalanca: "000",
        validadeBalanca: String(fonte.validadeDias)
      });
    }
    return {
      loja: "TNP",
      produtosAtualizados: plano.atualizarProdutos.length,
      espelhosAtualizados: plano.atualizarEspelhos.length,
      jaCorretos: plano.jaCorretos,
      semProduto: plano.semProduto,
      semEspelho: plano.semEspelho
    };
  });
}
