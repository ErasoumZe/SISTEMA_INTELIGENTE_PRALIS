/**
 * Seed do CADASTRO a partir da planilha operacional (PROJECT_BRAIN/17 D11 + §3 — vertical S7).
 *
 * DRY-RUN por padrao: le a planilha, confere contra o banco e imprime contagens/amostras SEM
 * gravar nada. So grava com `--apply`. O motivo esta no `20` §3.2: cadastro de producao com nome
 * trocado e pior que cadastro faltando, porque ninguem desconfia dele.
 *
 * Uso:
 *   npm run seed:planilha                       # DRY-RUN (nao grava)
 *   npm run seed:planilha -- --apply            # grava (idempotente)
 *   npm run seed:planilha -- --arquivo "x.xlsx" --empresa "Padaria Principal"
 *   npm run seed:planilha -- --detalhe          # lista item a item, nao so amostra
 *
 * Idempotencia: chave natural por empresa (nome, ou SIG no patrimonio, ou codigo de barras no
 * produto). Select-then-insert — script manual, sem concorrencia, igual ao seed-referencia-prod.
 * Rodar duas vezes nao duplica e NUNCA apaga: o script so cria o que falta.
 *
 * MAPA DE COLUNAS: confirmado lendo o arquivo (nao o §3, que estava desatualizado — ver o relatorio
 * "divergencias" no fim da execucao). A linha 5 de cada aba tem o cabecalho real; o dado comeca na 11.
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { abrirPlanilha, type Planilha } from "../db/planilha-xlsx.js";
import { ehTotalizadorPlanilha, normalizarTextoPlanilha } from "./seed-planilha-regras.js";
import { schema } from "../db/src/schema/schema.js";
import {
  areas,
  cargos,
  contas,
  empresas,
  gruposDespesas,
  gruposMercadorias,
  gruposPatrimonio,
  gruposRetiradas,
  produtos,
  setores
} from "../db/src/schema/index.js";

const ARQUIVO_PADRAO = "db/planilhas/CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx";
const ARQUIVO_PRODUTOS_PADRAO = (() => {
  const diretorio = "CADASTRO DE PRODUTOS/tabela";
  const nome = readdirSync(diretorio).find(
    (item) => item.includes("CENTRAL PRODUTOS (BASE)") && item.endsWith("(1).xlsx")
  );
  if (!nome) throw new Error(`Planilha de produtos esperada em ${diretorio}/*CENTRAL PRODUTOS (BASE)*(1).xlsx`);
  return join(diretorio, nome);
})();

/** O dado util comeca na linha 11 em todas as abas de configuracao (1-10 sao cabecalho/rotulos). */
const PRIMEIRA_LINHA_DE_DADO = 10;

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const APLICAR = temFlag("apply");
const DETALHE = temFlag("detalhe");
/** Ensaio: roda a escrita de verdade e da ROLLBACK no fim. Nada persiste; erro de constraint aparece. */
const ENSAIO = temFlag("ensaio");

/** Sentinela do rollback do ensaio — nao e falha, e o fim combinado da transacao. */
class RollbackDoEnsaio extends Error {
  constructor() {
    super("ensaio: rollback proposital");
  }
}

/**
 * A planilha vem do Google Sheets cheia de WORD JOINER (U+2060) e zero-width no meio dos nomes:
 * "DES ⁠IMPOSTOS -  ⁠FEDERAL". Sao invisiveis na tela e viram parte da string no banco — depois a
 * busca por "DES IMPOSTOS - FEDERAL" nao acha nada e ninguem entende por que. Limpa na entrada.
 */
function normalizar(valor: string | undefined): string {
  return normalizarTextoPlanilha(valor);
}

/** Indice 0-based a partir da letra da coluna ("A" -> 0, "AA" -> 26). */
function indiceDaColuna(letra: string): number {
  let indice = 0;
  for (const caractere of letra) indice = indice * 26 + (caractere.charCodeAt(0) - 64);
  return indice - 1;
}

const celula = (linha: string[], letra: string) => normalizar(linha[indiceDaColuna(letra)]);

/**
 * Codigo de barras sai do Sheets como numero: "7.891080001048E12" ou "1234.0". Guardar isso como
 * texto quebraria o casamento por EAN da NF-e (PROJECT_BRAIN/17 §5), que e o unico motivo do campo
 * existir. EAN-13 cabe em Number com folga (< 2^53), entao a volta e exata.
 */
function normalizarCodigoBarras(bruto: string): string {
  const valor = normalizar(bruto);
  if (!valor) return "";
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(valor)) return valor;
  const numero = Number(valor);
  return Number.isFinite(numero) && Number.isSafeInteger(Math.round(numero)) ? String(Math.round(numero)) : valor;
}

/** Coluna inteira de uma aba, ja normalizada e sem vazios, preservando a ordem da planilha. */
function coluna(linhas: string[][], letra: string): string[] {
  return linhas.map((linha) => celula(linha, letra)).filter(Boolean);
}

function distintos(valores: string[]): string[] {
  return [...new Set(valores)];
}

// --------------------------------------------------------------------------------------------
// Leitura da planilha
// --------------------------------------------------------------------------------------------

type GrupoComPai = { nome: string; pai: string; ativa: boolean; usos: number };
type ContaLida = { nome: string; ativa: boolean; saldoInicial: number };
type GrupoPatrimonioLido = { sig: string; nome: string };
type ProdutoLido = {
  descricao: string;
  codigoBarras: string;
  marca: string;
  embalagem: string;
  cDe: string;
  quantidadeCaixa: number;
  quantidadeIndividual: string;
  medidaCompra: string;
  grupoMercadoria: string;
  tipo: "revenda" | "transformacao";
  status: "ativo" | "inativo";
};

type Extracao = {
  despesas: GrupoComPai[];
  mercadorias: GrupoComPai[];
  retiradas: GrupoComPai[];
  contas: ContaLida[];
  gruposPatrimonio: GrupoPatrimonioLido[];
  itensPatrimonioTnp: string[];
  setores: string[];
  areas: string[];
  cargos: string[];
  produtos: ProdutoLido[];
  produtosIgnorados: { descricao: string; motivo: string }[];
  // Evidencias que o dry-run precisa mostrar para o Jose conferir o mapa de colunas.
  margensPorGrupo: { grupo: string; margem: string }[];
  tiposDeMercadoria: { grupo: string; tipo: string }[];
  dominioComputar: string[];
  dominioDocFnf: string[];
  dominioTiposProduto: string[];
  totalizadoresDescartados: string[];
};

function ehTotalizador(valor: string): boolean {
  return ehTotalizadorPlanilha(valor);
}

function lerPlanilha(planilha: Planilha, planilhaProdutos: Planilha): Extracao {
  const achar = (fonte: Planilha, parte: string, primeiraLinha = PRIMEIRA_LINHA_DE_DADO) => {
    const nome = fonte.abas.find((aba) => aba.includes(parte));
    if (!nome) throw new Error(`Aba com "${parte}" nao existe. Abas: ${fonte.abas.join(" | ")}`);
    return fonte.ler(nome).linhas.slice(primeiraLinha);
  };

  const gruposref = achar(planilhaProdutos, "GRUPOSREF");
  const patrimonio = achar(planilha, "PATRIMONIO");
  const folha = achar(planilha, "FOLHA PAGAME");
  const despesasOperacionais = achar(planilha, "(TNP) GRUPO DESPESAS", 9);
  const retiradasOperacionais = achar(planilha, "(TNP) GRUPO RETIRADAS", 8);
  const saldosContas = achar(planilha, "(TNP) SALDOS CONTAS");
  // O catalogo real esta na aba (BASE), com a coluna LOJAS dizendo de quem e cada produto. As abas
  // por loja — (TNP), (LI), (HORA) — sao modelos vazios neste arquivo (4 linhas de teste); semear a
  // partir delas traria 3 produtos e passaria a impressao de que o cadastro foi importado.
  const produtosBase = achar(planilhaProdutos, "(BASE) CADASTRO PRODUTOS");

  // GRUPOSREF — cabecalho real na linha 5:
  //   H=REF despesas   I=GRUPODESPESAS
  //   J=REF mercadorias K=GRUPOMERCADORIAS  L=MARGEM %  M=TIPO
  //   U=REF retiradas   V=GRUPORETIRADAS
  //   X=GRUPOCONTAS (todas)  W=ATIVA  Y=GRUPOCONTAS (so as ativas)
  // A hierarquia nasce do separador do proprio nome. Mantemos o nome completo do filho para nao
  // quebrar os textos ja usados nos lancamentos; o trecho anterior ao primeiro " - " vira o pai.
  const decompor = (nome: string, usos: number, ativa = usos > 1): GrupoComPai => {
    const [pai = ""] = nome.split(" - ");
    return { nome, pai: nome.includes(" - ") ? pai.trim() : "", ativa, usos };
  };
  const gruposPorUso = (linhas: string[][]): GrupoComPai[] => {
    const contagens = new Map<string, number>();
    for (const linha of linhas) {
      const nome = celula(linha, "G");
      if (!nome || ehTotalizador(nome)) continue;
      contagens.set(nome, (contagens.get(nome) ?? 0) + 1);
    }
    return [...contagens].map(([nome, usos]) => decompor(nome, usos));
  };

  const despesas = gruposPorUso(despesasOperacionais);
  const retiradas = gruposPorUso(retiradasOperacionais);
  const mercadorias = distintos([...coluna(gruposref, "K"), ...coluna(gruposref, "N")])
    .filter((nome) => nome.startsWith("MER ") && !ehTotalizador(nome))
    .map((nome) => decompor(nome, 0, true));

  const saldosPorConta = new Map(
    saldosContas
      .map((linha) => [celula(linha, "C"), Number(celula(linha, "D"))] as const)
      .filter(([nome, saldo]) => nome && Number.isFinite(saldo))
  );
  const contasLidas: ContaLida[] = gruposref
    .map((linha) => ({
      nome: celula(linha, "X"),
      ativa: celula(linha, "W") === "ATIVA",
      saldoInicial: saldosPorConta.get(celula(linha, "X")) ?? 0
    }))
    .filter((item) => item.nome);

  // PATRIMONIO — E=SIG  F=grupo  G=item  H=TNP(SIM/NAO)  I=LI  J=MARCA
  const gruposPatrimonioLidos: GrupoPatrimonioLido[] = patrimonio
    .map((linha) => ({ sig: celula(linha, "E"), nome: celula(linha, "F") }))
    .filter((item) => item.sig && item.nome);

  const itensPatrimonioTnp = patrimonio
    .filter((linha) => celula(linha, "G") && celula(linha, "H") === "SIM")
    .map((linha) => celula(linha, "G"));

  // FOLHA PAGAMENTO — G=cargos  Q=setores  P=areas (listas verticais independentes)
  const cargosLidos = distintos(coluna(folha, "G").filter((nome) => nome !== "TITULO"));
  const setoresLidos = distintos(coluna(folha, "Q"));
  const areasLidas = distintos(coluna(folha, "P"));

  // (BASE) CADASTRO PRODUTOS — C=A/I  D=LOJAS  E=nome  F=quantidade  G=medida base
  //   H=descricao montada  J=EAN  K=marca  L=EMB  M=C/DE  N=QT_CAD  O=medida
  //   Q=vende S/N  R=grupo revenda  S=transforma S/N  T=grupo transformacao  AB=status no TNP
  const produtosLidos: ProdutoLido[] = [];
  const produtosIgnorados: { descricao: string; motivo: string }[] = [];
  for (const linha of produtosBase) {
    const nome = celula(linha, "E");
    if (!nome) continue;
    // "So TNP": a coluna LOJAS lista as lojas do produto ("TNP,LI,HORA").
    const lojas = celula(linha, "D")
      .split(",")
      .map((loja) => loja.trim());
    if (!lojas.includes("TNP")) {
      produtosIgnorados.push({ descricao: nome, motivo: `LOJAS = "${celula(linha, "D")}" (sem TNP)` });
      continue;
    }
    if (nome.toUpperCase() === "TESTE") {
      produtosIgnorados.push({ descricao: nome, motivo: "linha de teste da planilha" });
      continue;
    }
    const ehTransformacao = celula(linha, "S") === "SIM";
    const quantidadeCaixa = Number(celula(linha, "N").replace(",", "."));
    const quantidadeIndividual = Number(celula(linha, "F").replace(/\./g, "").replace(",", "."));
    const statusTnp = celula(linha, "AB") || celula(linha, "C");
    produtosLidos.push({
      descricao: celula(linha, "H") || nome,
      codigoBarras: normalizarCodigoBarras(celula(linha, "J")),
      marca: celula(linha, "K"),
      embalagem: celula(linha, "L"),
      cDe: celula(linha, "M"),
      quantidadeCaixa: Number.isFinite(quantidadeCaixa) && quantidadeCaixa > 0 ? Math.round(quantidadeCaixa) : 1,
      quantidadeIndividual:
        Number.isFinite(quantidadeIndividual) && quantidadeIndividual > 0 ? String(quantidadeIndividual) : "1",
      medidaCompra: celula(linha, "O"),
      grupoMercadoria: ehTransformacao ? celula(linha, "T") : celula(linha, "R"),
      tipo: ehTransformacao ? "transformacao" : "revenda",
      status: statusTnp === "ATIVO" ? "ativo" : "inativo"
    });
  }

  return {
    despesas,
    mercadorias,
    retiradas,
    contas: contasLidas,
    gruposPatrimonio: gruposPatrimonioLidos,
    itensPatrimonioTnp,
    setores: setoresLidos,
    areas: areasLidas,
    cargos: cargosLidos,
    produtos: produtosLidos,
    produtosIgnorados,
    margensPorGrupo: gruposref
      .filter((linha) => celula(linha, "L") && celula(linha, "K"))
      .map((linha) => ({ grupo: celula(linha, "K"), margem: celula(linha, "L") })),
    tiposDeMercadoria: gruposref
      .filter((linha) => celula(linha, "K"))
      .map((linha) => ({ grupo: celula(linha, "K"), tipo: celula(linha, "M") })),
    dominioComputar: distintos(coluna(gruposref, "P")),
    dominioDocFnf: distintos(coluna(gruposref, "Q")),
    dominioTiposProduto: distintos(coluna(gruposref, "T")),
    totalizadoresDescartados: distintos([
      ...["H", "I", "J", "K", "N", "U", "V"].flatMap((letra) => coluna(gruposref, letra)),
      ...despesasOperacionais.map((linha) => celula(linha, "G")),
      ...retiradasOperacionais.map((linha) => celula(linha, "G"))
    ]).filter(ehTotalizador)
  };
}

// --------------------------------------------------------------------------------------------
// Area do setor: o prefixo do nome ("LJ - CAIXAS") diz a area ("LOJA"). E derivacao, nao dado —
// a planilha nao tem coluna ligando setor a area. Fica explicito aqui e impresso no dry-run.
// --------------------------------------------------------------------------------------------
const AREA_POR_PREFIXO: Record<string, string> = {
  LJ: "LOJA",
  "PROD.": "PRODUÇAO",
  "MIST.": "MISTO",
  ADM: "ADM"
};

function areaDoSetor(nomeDoSetor: string): string | undefined {
  const prefixo = nomeDoSetor.split(" - ")[0]?.trim() ?? "";
  return AREA_POR_PREFIXO[prefixo];
}

// --------------------------------------------------------------------------------------------
// Execucao
// --------------------------------------------------------------------------------------------

const caminho = argumento("arquivo") ?? ARQUIVO_PADRAO;
const caminhoProdutos = argumento("produtos") ?? ARQUIVO_PRODUTOS_PADRAO;
console.info(`Planilha: ${caminho}`);
console.info(`Cadastro de produtos: ${caminhoProdutos}`);
console.info(APLICAR ? "MODO: APLICAR (grava no banco)" : "MODO: DRY-RUN (nao grava nada)");

const extracao = lerPlanilha(abrirPlanilha(caminho), abrirPlanilha(caminhoProdutos));

const databaseUrl = process.env["DATABASE_URL"]?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL obrigatoria (mesmo no dry-run: ele confere o que ja existe)");

const pool = new pg.Pool({ connectionString: databaseUrl });
const banco = drizzle(pool, { schema });

// Empresa alvo: "so TNP". Aceita id ou nome; sem argumento, usa a mais antiga (a do bootstrap).
const empresaArgumento = argumento("empresa");
const todasEmpresas = await banco
  .select({ id: empresas.id, nome: empresas.nome })
  .from(empresas)
  .orderBy(empresas.criadoEm);
const empresa = empresaArgumento
  ? todasEmpresas.find((item) => item.id === empresaArgumento || item.nome === empresaArgumento)
  : todasEmpresas[0];
if (!empresa) {
  throw new Error(
    `Empresa nao encontrada${empresaArgumento ? ` para "${empresaArgumento}"` : ""}. Existentes: ${todasEmpresas.map((e) => `${e.nome} (${e.id})`).join(" | ") || "nenhuma"}`
  );
}
const empresaId = empresa.id;
console.info(
  `Empresa alvo: ${empresa.nome} (${empresaId})${todasEmpresas.length > 1 ? "  [use --empresa para trocar]" : ""}\n`
);

/** Nomes ja existentes no banco para uma tabela com coluna `nome`, por empresa. */
async function nomesExistentes(tabela: TabelaComNome): Promise<Set<string>> {
  const linhas = await banco.select({ nome: tabela.nome }).from(tabela).where(eq(tabela.empresaId, empresaId));
  return new Set(linhas.map((linha) => linha.nome));
}

/** As tabelas de cadastro que compartilham a forma (id, empresaId, nome) e o mesmo passo idempotente. */
type TabelaComNome =
  | typeof gruposDespesas
  | typeof gruposMercadorias
  | typeof gruposRetiradas
  | typeof contas
  | typeof setores
  | typeof areas
  | typeof cargos;

/** Colunas alem de (empresaId, nome) que o cadastro preenche na CRIACAO. */
type ColunasExtras = { areaId?: string; ativa?: boolean; saldoInicial?: string };

type Bloco = { titulo: string; novos: string[]; existentes: number; observacao?: string };
const blocos: Bloco[] = [];

function registrar(titulo: string, itens: string[], jaExistem: Set<string>, observacao?: string) {
  const novos = distintos(itens).filter((nome) => !jaExistem.has(nome));
  blocos.push({
    titulo,
    novos,
    existentes: distintos(itens).length - novos.length,
    ...(observacao ? { observacao } : {})
  });
}

// --- Grupos (o REF vira grupo PAI: a tabela ja tem grupo_pai_id e o REF e exatamente o balde de
// --- agregacao do DRE — "DES IMPOSTOS - FEDERAL" pertence a "TOTAL DESPESAS VARIAVEIS").
const despesasExistentes = await nomesExistentes(gruposDespesas);
const mercadoriasExistentes = await nomesExistentes(gruposMercadorias);
const retiradasExistentes = await nomesExistentes(gruposRetiradas);

const paisDespesa = distintos(extracao.despesas.map((item) => item.pai).filter(Boolean));
const paisMercadoria = distintos(extracao.mercadorias.map((item) => item.pai).filter(Boolean));
const paisRetirada = distintos(extracao.retiradas.map((item) => item.pai).filter(Boolean));

registrar("Grupos de despesas — REF (grupo pai)", paisDespesa, despesasExistentes);
registrar(
  "Grupos de despesas",
  extracao.despesas.map((item) => item.nome),
  despesasExistentes,
  `${extracao.despesas.filter((item) => item.ativa).length} ativos / ${extracao.despesas.filter((item) => !item.ativa).length} raros inativos (corte conservador: 1 uso)`
);
registrar("Grupos de mercadorias — REF (grupo pai)", paisMercadoria, mercadoriasExistentes);
registrar(
  "Grupos de mercadorias",
  extracao.mercadorias.map((item) => item.nome),
  mercadoriasExistentes
);
registrar("Grupos de retiradas — REF (grupo pai)", paisRetirada, retiradasExistentes);
registrar(
  "Grupos de retiradas",
  extracao.retiradas.map((item) => item.nome),
  retiradasExistentes,
  `${extracao.retiradas.filter((item) => item.ativa).length} ativos / ${extracao.retiradas.filter((item) => !item.ativa).length} raros inativos (corte conservador: 1 uso)`
);

const contasExistentes = await nomesExistentes(contas);
const movimentosResultado = await pool.query<{ nome: string; movimentos: string }>(
  `select c.nome,
     ((select count(*) from vendas v where v.conta_origem_id = c.id) +
      (select count(*) from despesas d where d.conta_origem_id = c.id) +
      (select count(*) from mercadorias m where m.conta_origem_id = c.id) +
      (select count(*) from retiradas r where r.conta_origem_id = c.id) +
      (select count(*) from transferencias t where t.conta_origem_id = c.id or t.conta_destino_id = c.id))::text movimentos
   from contas c where c.empresa_id = $1 and c.nome = any($2::text[])`,
  [empresaId, extracao.contas.map((item) => item.nome)]
);
const movimentosPorConta = new Map(movimentosResultado.rows.map((item) => [item.nome, Number(item.movimentos)]));
const contasComMovimento = extracao.contas.filter((item) => (movimentosPorConta.get(item.nome) ?? 0) > 0);
const podeAplicarContas = contasComMovimento.length === 0;
registrar(
  "Contas (CNT CONTA - *)",
  extracao.contas.map((item) => item.nome),
  contasExistentes,
  `${extracao.contas.filter((c) => c.ativa).length} ativas / ${extracao.contas.filter((c) => !c.ativa).length} inativas; ${extracao.contas.filter((c) => c.saldoInicial > 0).length} com fundo da aba SALDOS; movimentos anteriores: ${contasComMovimento.length}${podeAplicarContas ? "" : " — ALVO CONTAS SERA PULADO"}`
);

const areasExistentes = await nomesExistentes(areas);
const setoresExistentes = await nomesExistentes(setores);
const cargosExistentes = await nomesExistentes(cargos);
registrar("Areas", extracao.areas, areasExistentes);
registrar("Setores", extracao.setores, setoresExistentes, "area derivada do prefixo do nome (LJ/PROD./MIST./ADM)");
registrar("Cargos", extracao.cargos, cargosExistentes);

const sigsExistentes = new Set(
  (
    await banco
      .select({ sig: gruposPatrimonio.sig })
      .from(gruposPatrimonio)
      .where(eq(gruposPatrimonio.empresaId, empresaId))
  ).map((linha) => linha.sig)
);
const gruposPatrimonioNovos = extracao.gruposPatrimonio.filter((item) => !sigsExistentes.has(item.sig));
blocos.push({
  titulo: "Grupos de patrimonio (SIG)",
  novos: gruposPatrimonioNovos.map((item) => `${item.sig} — ${item.nome}`),
  existentes: extracao.gruposPatrimonio.length - gruposPatrimonioNovos.length
});

// --- Produtos: chave natural = codigo de barras; sem EAN, cai na descricao.
const produtosNoBanco = await banco
  .select({ codigoBarras: produtos.codigoBarras, descricao: produtos.descricao })
  .from(produtos)
  .where(eq(produtos.empresaId, empresaId));
const eansExistentes = new Set(produtosNoBanco.map((linha) => linha.codigoBarras).filter(Boolean));
const descricoesExistentes = new Set(produtosNoBanco.map((linha) => linha.descricao));

const chaveProduto = (item: ProdutoLido) => item.codigoBarras || item.descricao;
const produtosPorChave = new Map<string, ProdutoLido>();
for (const item of extracao.produtos)
  if (!produtosPorChave.has(chaveProduto(item))) produtosPorChave.set(chaveProduto(item), item);
const produtosNovos = [...produtosPorChave.values()].filter((item) =>
  item.codigoBarras ? !eansExistentes.has(item.codigoBarras) : !descricoesExistentes.has(item.descricao)
);
const nomesDeGrupoMercadoria = new Set(extracao.mercadorias.map((item) => item.nome));
const produtosSemGrupoCasado = produtosNovos.filter(
  (item) => !item.grupoMercadoria || !nomesDeGrupoMercadoria.has(item.grupoMercadoria)
);
// Grupo que o produto cita mas que nao existe na lista de grupos: ou e erro de digitacao na planilha,
// ou e grupo que ninguem cadastrou. O produto entra sem grupo — mas o nome tem de aparecer aqui,
// senao vira 12 produtos orfaos que ninguem sabe explicar.
const gruposCitadosSemCadastro = distintos(produtosSemGrupoCasado.map((item) => item.grupoMercadoria).filter(Boolean));
blocos.push({
  titulo: "Produtos (aba BASE, LOJAS contem TNP)",
  novos: produtosNovos.map(
    (item) => `${item.codigoBarras || "sem EAN"} — ${item.descricao} [${item.tipo}/${item.status}]`
  ),
  existentes: produtosPorChave.size - produtosNovos.length,
  observacao: `${extracao.produtos.length} linhas TNP, ${produtosPorChave.size} apos dedupe por chave natural, ${extracao.produtos.filter((p) => !p.codigoBarras).length} sem EAN, ${extracao.produtosIgnorados.length} ignoradas, ${produtosSemGrupoCasado.length} sem grupo de mercadoria`
});

// --------------------------------------------------------------------------------------------
// Relatorio
// --------------------------------------------------------------------------------------------
console.info("=== O QUE ENTRA (contagens) ===");
console.info(
  `  Filtro TOTAL ativo: ${extracao.totalizadoresDescartados.length} totalizador(es) descartado(s)` +
    `${extracao.totalizadoresDescartados.length ? ` (${extracao.totalizadoresDescartados.slice(0, 5).join(" | ")})` : ""}`
);
console.info("  ALVO                                          | NOVOS | JA EXISTEM");
for (const bloco of blocos) {
  console.info(
    `  ${bloco.titulo.padEnd(45)} | ${String(bloco.novos.length).padStart(5)} | ${String(bloco.existentes).padStart(10)}`
  );
  if (bloco.observacao) console.info(`    ${bloco.observacao}`);
}

console.info("\n=== AMOSTRAS ===");
for (const bloco of blocos) {
  if (!bloco.novos.length) continue;
  const mostrar = DETALHE ? bloco.novos : bloco.novos.slice(0, 5);
  console.info(`  ${bloco.titulo} (${bloco.novos.length}):`);
  for (const item of mostrar) console.info(`    - ${item}`);
  if (!DETALHE && bloco.novos.length > mostrar.length)
    console.info(`    ... +${bloco.novos.length - mostrar.length} (use --detalhe)`);
}

console.info("\n=== GUARDA DE MOVIMENTO DAS CONTAS ===");
if (contasComMovimento.length) {
  for (const conta of contasComMovimento.slice(0, 5))
    console.info(`  PULAR: ${conta.nome} tem ${movimentosPorConta.get(conta.nome) ?? 0} movimento(s)`);
} else {
  console.info(
    "  OK: nenhuma das contas da planilha tem movimento anterior; fundo pode ser aplicado sem duplicar dinheiro."
  );
}

if (produtosSemGrupoCasado.length) {
  console.info(`\n=== PRODUTOS SEM GRUPO DE MERCADORIA (${produtosSemGrupoCasado.length}) ===`);
  console.info(
    gruposCitadosSemCadastro.length
      ? `  citam grupo que nao existe na lista: ${gruposCitadosSemCadastro.join(" · ")}`
      : "  a planilha nao informa grupo para eles"
  );
  for (const item of produtosSemGrupoCasado.slice(0, DETALHE ? produtosSemGrupoCasado.length : 8)) {
    console.info(
      `    - ${item.descricao}${item.grupoMercadoria ? `  (grupo citado: ${item.grupoMercadoria})` : "  (sem grupo)"}`
    );
  }
}

console.info("\n=== SETOR -> AREA (derivado do prefixo, confira) ===");
for (const setor of extracao.setores) console.info(`  ${setor.padEnd(36)} -> ${areaDoSetor(setor) ?? "(sem area)"}`);

console.info(`
=== O QUE A PLANILHA TEM E O SCHEMA NAO GUARDA (precisaria de migration) ===
  - grupos de despesas/mercadorias/retiradas nao tem coluna REF: o REF entra como GRUPO PAI
    (grupo_pai_id), que ja existe. Confira acima se a hierarquia ficou como voce espera.
  - MARGEM % (col. L) existe em ${extracao.margensPorGrupo.length} de ${extracao.mercadorias.length} grupos de mercadoria: ${extracao.margensPorGrupo.map((m) => `${m.grupo}=${m.margem}`).join(" · ") || "nenhum"}
    grupos_mercadorias nao tem coluna margem (so produtos tem). NAO entra.
  - TIPO (col. M, VENDA/TRANSFORMACAO) existe nos ${extracao.tiposDeMercadoria.length} grupos, mas grupos_mercadorias
    nao tem coluna tipo. NAO entra.

=== O QUE O PROMPT PEDIU E A PLANILHA NAO TEM ===
  - mercadorias "+computar" e "+docfnf": as colunas P e Q NAO sao atributo por grupo — sao a LISTA
    DE VALORES POSSIVEIS, preenchida so nas 2 primeiras linhas (P: ${extracao.dominioComputar.join(" | ")};
    Q: ${extracao.dominioDocFnf.join(" | ")}). Nao ha dado por grupo para semear.
    (idem col. T, tipos de produto: ${extracao.dominioTiposProduto.join(" | ")})
  - retiradas "+ativa": a coluna ATIVA (W) e das CONTAS, nao das retiradas — a prova e a col. Y,
    que repete a conta exatamente quando W=ATIVA (33 de 33 linhas). As retiradas tem REF (col. U:
    ${distintos(extracao.retiradas.map((r) => r.pai)).join(" | ")}), nao flag de ativa. Todas entram como grupo.
  - patrimonio: os ${extracao.itensPatrimonioTnp.length} ITENS (TNP=SIM) nao tem coluna ligando item -> grupo, e
    patrimonio_itens.grupo_patrimonio_id e NOT NULL. Os ${extracao.gruposPatrimonio.length} GRUPOS entram; os itens NAO.
    Exemplos de item sem grupo: ${extracao.itensPatrimonioTnp.slice(0, 3).join(" · ")}
`);

if (!APLICAR && !ENSAIO) {
  console.info(
    "DRY-RUN concluido — nada foi gravado.\n" +
      "  ensaiar a escrita (roda tudo e da rollback): npm run seed:planilha -- --ensaio\n" +
      "  gravar de verdade:                           npm run seed:planilha -- --apply"
  );
  await pool.end();
  process.exit(0);
}

// --------------------------------------------------------------------------------------------
// Gravacao (so com --apply), em transacao unica: ou o cadastro inteiro entra, ou nada entra.
// --------------------------------------------------------------------------------------------
console.info(ENSAIO ? "=== ENSAIO (escreve e desfaz — nada persiste) ===" : "=== GRAVANDO ===");

try {
  await banco.transaction(async (trx) => {
    /** Cria os que faltam e devolve nome -> id de TODOS (novos + existentes). */
    async function garantirPorNome(
      tabela: TabelaComNome,
      rotulo: string,
      nomes: string[],
      extras: (nome: string) => ColunasExtras = () => ({})
    ): Promise<Map<string, string>> {
      const existentes = await trx
        .select({ id: tabela.id, nome: tabela.nome })
        .from(tabela)
        .where(eq(tabela.empresaId, empresaId));
      const porNome = new Map(existentes.map((linha) => [linha.nome, linha.id]));
      const faltando = distintos(nomes).filter((nome) => nome && !porNome.has(nome));
      if (faltando.length) {
        const inseridos = await trx
          .insert(tabela)
          .values(faltando.map((nome) => ({ empresaId, nome, ...extras(nome) })))
          .returning({ id: tabela.id, nome: tabela.nome });
        for (const linha of inseridos) porNome.set(linha.nome, linha.id);
      }
      console.info(
        `  ${String(faltando.length).padStart(5)} novos · ${rotulo} (${distintos(nomes).length} na planilha)`
      );
      return porNome;
    }

    // Areas antes de setores (setor referencia area).
    const areaPorNome = await garantirPorNome(areas, "areas", extracao.areas);
    await garantirPorNome(setores, "setores", extracao.setores, (nome) => {
      const area = areaDoSetor(nome);
      const areaId = area ? areaPorNome.get(area) : undefined;
      return areaId ? { areaId } : {};
    });
    await garantirPorNome(cargos, "cargos", extracao.cargos);

    // Grupos: primeiro os REF (pais), depois os filhos apontando para o pai.
    async function grupoComHierarquia(
      tabela: typeof gruposDespesas | typeof gruposMercadorias | typeof gruposRetiradas,
      rotulo: string,
      itens: GrupoComPai[]
    ): Promise<void> {
      const pais = distintos(itens.map((item) => item.pai).filter(Boolean));
      const porNome = await garantirPorNome(tabela, `${rotulo} — pai`, pais, () => ({ ativa: true }));
      const existentes = await trx
        .select({ id: tabela.id, nome: tabela.nome })
        .from(tabela)
        .where(eq(tabela.empresaId, empresaId));
      for (const linha of existentes) porNome.set(linha.nome, linha.id);

      const faltando = itens.filter((item) => !porNome.has(item.nome));
      if (faltando.length) {
        await trx.insert(tabela).values(
          faltando.map((item) => {
            const grupoPaiId = item.pai ? porNome.get(item.pai) : undefined;
            return { empresaId, nome: item.nome, ativa: item.ativa, ...(grupoPaiId ? { grupoPaiId } : {}) };
          })
        );
      }
      for (const item of itens) {
        const id = porNome.get(item.nome);
        if (!id) continue;
        await trx
          .update(tabela)
          .set({ grupoPaiId: item.pai ? (porNome.get(item.pai) ?? null) : null, ativa: item.ativa })
          .where(eq(tabela.id, id));
      }
      console.info(`  ${String(faltando.length).padStart(5)} novos · ${rotulo} (${itens.length} na planilha)`);
    }

    await grupoComHierarquia(gruposDespesas, "grupos de despesas", extracao.despesas);
    await grupoComHierarquia(gruposMercadorias, "grupos de mercadorias", extracao.mercadorias);
    await grupoComHierarquia(gruposRetiradas, "grupos de retiradas", extracao.retiradas);

    // Contas: o `ativa` da planilha vale so na criacao — nao sobrescreve conta ja cadastrada, que
    // pode ter sido ativada/desativada no sistema depois.
    if (podeAplicarContas) {
      const contasPorNome = await garantirPorNome(
        contas,
        "contas",
        extracao.contas.map((item) => item.nome),
        (nome) => {
          const conta = extracao.contas.find((item) => item.nome === nome);
          return { ativa: conta?.ativa ?? true, saldoInicial: (conta?.saldoInicial ?? 0).toFixed(2) };
        }
      );
      for (const conta of extracao.contas) {
        const id = contasPorNome.get(conta.nome);
        if (id)
          await trx
            .update(contas)
            .set({ ativa: conta.ativa, saldoInicial: conta.saldoInicial.toFixed(2) })
            .where(eq(contas.id, id));
      }
      console.info("      fundos e status das contas aplicados (guarda de movimento = zero)");
    } else {
      console.info(`      contas PULADAS: ${contasComMovimento.length} conta(s) com movimento anterior`);
    }

    // Patrimonio: so os grupos (itens nao tem grupo na planilha — ver o relatorio acima).
    const sigsNoBanco = new Set(
      (
        await trx
          .select({ sig: gruposPatrimonio.sig })
          .from(gruposPatrimonio)
          .where(eq(gruposPatrimonio.empresaId, empresaId))
      ).map((linha) => linha.sig)
    );
    const patrimonioFaltando = extracao.gruposPatrimonio.filter((item) => !sigsNoBanco.has(item.sig));
    if (patrimonioFaltando.length) {
      await trx
        .insert(gruposPatrimonio)
        .values(patrimonioFaltando.map((item) => ({ empresaId, sig: item.sig, nome: item.nome })));
    }
    console.info(`  ${String(patrimonioFaltando.length).padStart(5)} grupos de patrimonio novos`);

    // Produtos: grupo de mercadoria resolvido por nome (o mesmo texto da planilha, ja normalizado).
    const gruposMercadoriaNoBanco = await trx
      .select({ id: gruposMercadorias.id, nome: gruposMercadorias.nome })
      .from(gruposMercadorias)
      .where(eq(gruposMercadorias.empresaId, empresaId));
    const grupoMercadoriaPorNome = new Map(gruposMercadoriaNoBanco.map((linha) => [linha.nome, linha.id]));

    const produtosFaltando = produtosNovos;
    if (produtosFaltando.length) {
      // Em lotes: 9k linhas num INSERT so estoura o limite de parametros do Postgres.
      const TAMANHO_DO_LOTE = 500;
      for (let inicio = 0; inicio < produtosFaltando.length; inicio += TAMANHO_DO_LOTE) {
        const lote = produtosFaltando.slice(inicio, inicio + TAMANHO_DO_LOTE);
        await trx.insert(produtos).values(
          lote.map((item) => {
            const grupoMercadoriaId = item.grupoMercadoria
              ? grupoMercadoriaPorNome.get(item.grupoMercadoria)
              : undefined;
            return {
              empresaId,
              descricao: item.descricao,
              tipo: item.tipo,
              status: item.status,
              quantidadeCaixa: item.quantidadeCaixa,
              quantidadeIndividual: item.quantidadeIndividual,
              ...(item.codigoBarras ? { codigoBarras: item.codigoBarras } : {}),
              ...(item.marca ? { marca: item.marca } : {}),
              ...(item.embalagem ? { embalagem: item.embalagem } : {}),
              ...(item.cDe ? { cDe: item.cDe } : {}),
              ...(item.medidaCompra ? { medidaCompra: item.medidaCompra } : {}),
              ...(grupoMercadoriaId ? { grupoMercadoriaId } : {})
            };
          })
        );
      }
    }
    console.info(`  ${String(produtosFaltando.length).padStart(5)} produtos novos`);

    if (ENSAIO) {
      // Ensaio: exercita o caminho de escrita INTEIRO (FK, CHECK, unique, lotes) e desfaz. Serve para
      // descobrir agora — e nao no meio do apply de producao — que uma constraint recusa o dado.
      const [{ total } = { total: 0 }] = await trx
        .select({ total: sql<number>`count(*)::int` })
        .from(produtos)
        .where(eq(produtos.empresaId, empresaId));
      console.info(`\n  [ensaio] escrita completou. produtos na empresa DENTRO da transacao: ${total}`);
      throw new RollbackDoEnsaio();
    }
  });
} catch (erro) {
  if (!(erro instanceof RollbackDoEnsaio)) throw erro;
  console.info("  [ensaio] ROLLBACK aplicado — o banco esta exatamente como estava.");
  await pool.end();
  process.exit(0);
}

const semGrupo = await banco
  .select({ id: produtos.id })
  .from(produtos)
  .where(and(eq(produtos.empresaId, empresaId), isNull(produtos.grupoMercadoriaId)));
console.info(
  `\nConcluido. Produtos sem grupo de mercadoria: ${semGrupo.length} (o grupo da planilha nao casou pelo nome).`
);

await pool.end();
