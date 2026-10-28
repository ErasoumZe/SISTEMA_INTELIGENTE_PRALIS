import { createHash } from "node:crypto";
import { planejarCusto, type MotivoSemCusto, type PropostaCusto } from "@padaria/shared/produtos";
import { executarEmTransacao } from "../banco/conexao.js";
import { lerDiscriminacao } from "./produtos-custo-mer.planilha.js";
import {
  empresasComPrefixoRepository,
  gravarCustoRepository,
  produtosParaCustearRepository
} from "./produtos-custo-mer.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { registrarNaFilaDaPlanilha } from "./produtos-planilha.service.js";

/**
 * Custo pela discriminacao de mercadorias — porte de `CustoMerService` do app oficial (R-222, regra DB-05):
 * o custo do produto e o da compra MAIS RECENTE na aba, convertido para a embalagem (unitario x qtCad).
 * O motor e o do app, literal. Nao calcula preco nem mexe em margem: custo entra como custo.
 *
 * Diferenca de onde grava: no app o custo ia na BASE e descia por heranca; no ERP o custo e por empresa, e
 * José decidiu em 28/10/2026 gravar SO NOS PRODUTOS DA TNP (a aba e "TNP - DISCRIMINAÇÃO MERCADORIAS").
 */
export const CONFIRMACAO_CUSTO_MER = "ATUALIZAR CUSTO DA DISCRIMINACAO";
/** Teto por chamada (oficial): a tela repete e mostra o que falta. */
export const LOTE_CUSTO = 300;

export class CustoMerError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 403 | 409 | 503,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "CustoMerError";
  }
}

type Ator = { administrador: boolean; empresasPermitidas: string[] };

function exigirAdministrador(ator: Ator) {
  if (!ator.administrador) {
    throw new CustoMerError("Apenas o administrador atualiza o custo pela discriminação.", 403, "FORBIDDEN");
  }
}

/** As empresas da TNP que o administrador alcanca. */
async function empresasDaTnp(ator: Ator): Promise<string[]> {
  return (await empresasComPrefixoRepository())
    .filter((e) => lojaFiscalDaEmpresa(e.matriculaPrefixo) === "TNP" && ator.empresasPermitidas.includes(e.id))
    .map((e) => e.id);
}

const motivosZerados = (): Record<MotivoSemCusto, number> => ({
  "sem-lancamento": 0,
  "nome-ambiguo-no-cadastro": 0,
  "custo-ilegivel": 0,
  "ja-esta-certo": 0
});

/**
 * O plano, uma empresa da TNP de cada vez: o mesmo nome em duas empresas nao e cadastro ambiguo (o motor
 * do app recebia um catalogo so). Custo que arredonda para menos de 1 centavo nao e gravado: zero viraria
 * preco automatico zero no PDV — conta como "custo ilegivel".
 */
async function planejar(ator: Ator) {
  const leitura = await lerDiscriminacao();
  if (leitura.estado !== "ok") return { leitura, plano: null };
  const linhas = await produtosParaCustearRepository(await empresasDaTnp(ator));
  const porEmpresa = new Map<string, typeof linhas>();
  for (const linha of linhas) porEmpresa.set(linha.empresaId, [...(porEmpresa.get(linha.empresaId) ?? []), linha]);
  const semCusto = motivosZerados();
  const propostas: PropostaCusto[] = [];
  for (const daEmpresa of porEmpresa.values()) {
    const parcial = planejarCusto(
      daEmpresa.map((p) => ({
        id: p.id,
        nome: p.nomeCatalogo ?? p.descricao,
        custo: p.custo,
        qtCad: p.quantidadeCaixa
      })),
      leitura.lancamentos
    );
    for (const motivo of Object.keys(semCusto) as MotivoSemCusto[]) semCusto[motivo] += parcial.semCusto[motivo];
    for (const proposta of parcial.propostas) {
      if (proposta.custoNovo !== null && proposta.custoNovo < 0.01) {
        semCusto["custo-ilegivel"] += 1;
        propostas.push({ ...proposta, custoNovo: null, motivo: "custo-ilegivel" });
      } else propostas.push(proposta);
    }
  }
  const alvos = propostas.filter((p) => p.custoNovo !== null);
  // O hash do que a previa mostrou: aplicar sobre outra coisa e 409, nada e gravado.
  const hashPlano = createHash("sha256")
    .update(JSON.stringify(alvos.map((p) => [p.productId, p.custoAtual, p.custoNovo])))
    .digest("hex");
  return { leitura, plano: { semCusto, propostas, alvos, comCusto: alvos.length, hashPlano } };
}

export async function previaCustoMer(ator: Ator) {
  exigirAdministrador(ator);
  const { leitura, plano } = await planejar(ator);
  return {
    estado: leitura.estado,
    truncada: leitura.truncada,
    faltando: leitura.faltando,
    erro: leitura.erro,
    linhaCabecalho: leitura.linhaCabecalho,
    lancamentos: leitura.lancamentos.length,
    lancamentosDescartados: leitura.descartados,
    comCusto: plano?.comCusto ?? 0,
    semCusto: plano?.semCusto ?? motivosZerados(),
    amostra: (plano?.alvos ?? []).slice(0, 25),
    hashPlano: plano?.hashPlano ?? null,
    confirmacao: CONFIRMACAO_CUSTO_MER,
    loteMaximo: LOTE_CUSTO
  };
}

export async function aplicarCustoMer(ator: Ator, confirmacao: string, hashPlano: string) {
  exigirAdministrador(ator);
  if (confirmacao.trim().toUpperCase() !== CONFIRMACAO_CUSTO_MER) {
    throw new CustoMerError(
      `Frase de confirmação inválida. Digite "${CONFIRMACAO_CUSTO_MER}" para gravar.`,
      400,
      "CONFIRMACAO_INVALIDA"
    );
  }
  const { leitura, plano } = await planejar(ator);
  if (leitura.estado !== "ok" || !plano) {
    throw new CustoMerError(
      "A base de discriminação não pôde ser lida agora; nada foi gravado.",
      503,
      "MER_INDISPONIVEL"
    );
  }
  if (hashPlano !== plano.hashPlano) {
    throw new CustoMerError(
      "A planilha ou os cadastros mudaram desde a prévia. Confira de novo; nada foi gravado.",
      409,
      "PREVIA_DESATUALIZADA"
    );
  }
  const alvos = plano.alvos.slice(0, LOTE_CUSTO);
  let aplicados = 0;
  let conflitos = 0;
  for (const proposta of alvos) {
    // Custo e fila do espelho (desligado ate a virada) na mesma transacao, item a item.
    const gravou = await executarEmTransacao(async (tx) => {
      const empresaId = await gravarCustoRepository(tx, proposta.productId, proposta.custoAtual, proposta.custoNovo!);
      if (empresaId) await registrarNaFilaDaPlanilha(tx, { empresaId, produtoId: proposta.productId });
      return Boolean(empresaId);
    });
    if (gravou) aplicados += 1;
    else conflitos += 1;
  }
  return { aplicados, conflitos, restantes: Math.max(0, plano.comCusto - alvos.length) };
}
