/**
 * Importador LOCAL e descartável do catálogo histórico do Pralis.
 *
 * Não é caminho de produção nem substitui a planilha oficial (R-145/R-165). Ele existe apenas
 * para montar massa de teste no banco local sem alterar registros existentes. Por padrão é
 * dry-run; só grava com --confirmar-local e recusa qualquer DATABASE_URL que não seja local.
 *
 * Uso:
 *   npm run importar:catalogo-pralis:teste -- --arquivo "D:\\...\\base-products.json" --empresa-id UUID
 *   npm run importar:catalogo-pralis:teste -- --arquivo "D:\\...\\base-products.json" --empresa-id UUID --confirmar-local
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { calcularPrecoVenda } from "@padaria/shared";

type ValorJson = string | number | boolean | null | ObjetoJson | ValorJson[];
type ObjetoJson = { [chave: string]: ValorJson | undefined };

type ProdutoLegado = {
  nome?: ValorJson;
  quantidade?: ValorJson;
  medidaBase?: ValorJson;
  codigoBarras?: ValorJson;
  marca?: ValorJson;
  embalagem?: ValorJson;
  cDe?: ValorJson;
  qtCad?: ValorJson;
  medidaCompra?: ValorJson;
  grupo?: ValorJson;
  tipo?: ValorJson;
  status?: ValorJson;
  estoqueMin?: ValorJson;
  estoqueMax?: ValorJson;
  setorEstoque?: ValorJson;
  custo?: ValorJson;
  margemPontual?: ValorJson;
  vVendaPontual?: ValorJson;
  auto?: ValorJson;
  localVenda1?: ValorJson;
  localVenda2?: ValorJson;
  transformacao?: {
    precisao?: ValorJson;
    qtd?: ValorJson;
    unidade?: ValorJson;
    produtoReceituario?: ValorJson;
  } | null;
  promocoes?: ValorJson[];
};

type TransformacaoPreparada = {
  precisao: string;
  quantidade: number | null;
  unidade: string | null;
  produtoReceituario: string | null;
};

type DadosPreparados = {
  codigoBarras: string;
  descricao: string;
  marca: string | null;
  quantidadeIndividual: number;
  embalagem: string | null;
  cDe: "C/" | "DE";
  quantidadeCaixa: number;
  medidaCompra: string | null;
  custo: number | null;
  margem: number | null;
  precoVenda: number | null;
  auto: boolean;
  status: "ativo" | "inativo";
  tipo: "revenda" | "transformacao";
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
  setorEstoque: string | null;
  localVenda1: string | null;
  localVenda2: string | null;
  transformacao: TransformacaoPreparada | null;
};

type Preparado = {
  indice: number;
  nome: string;
  ean: string;
  unidade: string;
  grupo: string | null;
  payload: DadosPreparados;
};

function argumento(nome: string) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

function texto(valor: ValorJson | undefined): string {
  if (typeof valor !== "string" && typeof valor !== "number" && typeof valor !== "boolean") return "";
  return String(valor)
    .normalize("NFKC")
    .replace(/[\u200b\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chave(valor: string): string {
  return texto(valor).toLocaleLowerCase("pt-BR");
}

function numero(valor: ValorJson | undefined): number | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (String(valor).trim() === "") return null;
  const convertido = Number(String(valor).replace(",", "."));
  return Number.isFinite(convertido) ? convertido : null;
}

function ean(valor: ValorJson | undefined): string {
  return texto(valor).replace(/\D/g, "");
}

function localOuFalhar(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname.toLowerCase();
  if (process.env["NODE_ENV"] === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Este importador aceita somente banco local e nunca roda em producao.");
  }
}

function prepararCatalogo(bruto: ValorJson): { itens: Preparado[]; ignorados: string[] } {
  if (!Array.isArray(bruto)) throw new Error("O arquivo precisa ser um array JSON de produtos.");

  const eansVistos = new Set<string>();
  const itens: Preparado[] = [];
  const ignorados: string[] = [];

  bruto.forEach((valor, indice) => {
    const item = valor as ProdutoLegado;
    const nome = texto(item.nome);
    const unidade = texto(item.medidaBase).toUpperCase();
    const codigoBarras = ean(item.codigoBarras);
    if (!nome || !unidade || !codigoBarras) {
      ignorados.push(`linha ${indice + 1}: nome, unidade ou EAN ausente`);
      return;
    }
    if (eansVistos.has(codigoBarras)) {
      ignorados.push(`linha ${indice + 1}: EAN repetido no catálogo (${codigoBarras})`);
      return;
    }
    eansVistos.add(codigoBarras);

    const tipo = texto(item.tipo) === "transformacao" ? "transformacao" : "revenda";
    const grupo = texto(item.grupo) || null;
    const medidaCompra = texto(item.medidaCompra).toUpperCase() || null;
    const transformacao = item.transformacao
      ? {
          precisao: texto(item.transformacao.precisao) === "APROXIMADOS" ? "APROXIMADOS" : "EXATOS",
          quantidade: numero(item.transformacao.qtd),
          unidade: texto(item.transformacao.unidade).toUpperCase() || null,
          produtoReceituario: texto(item.transformacao.produtoReceituario) || null
        }
      : null;

    itens.push({
      indice,
      nome,
      ean: codigoBarras,
      unidade,
      grupo,
      payload: {
        codigoBarras,
        descricao: nome,
        marca: texto(item.marca) || null,
        quantidadeIndividual: numero(item.quantidade) ?? 1,
        embalagem: texto(item.embalagem).toUpperCase() || null,
        cDe: texto(item.cDe) === "C/" ? "C/" : "DE",
        quantidadeCaixa: numero(item.qtCad) ?? 1,
        medidaCompra,
        custo: numero(item.custo),
        margem: numero(item.margemPontual),
        precoVenda: numero(item.vVendaPontual),
        auto: Boolean(item.auto),
        status: texto(item.status) === "inativo" ? "inativo" : "ativo",
        tipo,
        quantidadeEstoque: 0,
        estoqueMin: numero(item.estoqueMin),
        estoqueMax: numero(item.estoqueMax),
        setorEstoque: texto(item.setorEstoque) || null,
        localVenda1: texto(item.localVenda1) || null,
        localVenda2: texto(item.localVenda2) || null,
        transformacao: tipo === "transformacao" ? transformacao : null
        // O catálogo não tem imagem ou fiscal. Foto continua sendo enviada pelo upload próprio;
        // fiscal continua manual, nunca copiado desta fonte histórica.
      }
    });
  });
  return { itens, ignorados };
}

async function garantirReferencias(
  client: pg.PoolClient,
  empresaId: string,
  unidadesNecessarias: string[],
  gruposNecessarios: string[]
) {
  const existeEmpresa = await client.query("select 1 from empresas where id = $1", [empresaId]);
  if (!existeEmpresa.rowCount) throw new Error("Empresa de destino não encontrada no banco local.");

  const unidades = await client.query<{ id: string; sigla: string }>(
    "select id, sigla from unidades_medida where empresa_id = $1",
    [empresaId]
  );
  const unidadesPorSigla = new Map(unidades.rows.map((item) => [chave(item.sigla), item.id]));
  for (const sigla of unidadesNecessarias) {
    if (unidadesPorSigla.has(chave(sigla))) continue;
    const criada = await client.query<{ id: string }>(
      "insert into unidades_medida (empresa_id, nome, sigla) values ($1, $2, $3) returning id",
      [empresaId, sigla, sigla]
    );
    unidadesPorSigla.set(chave(sigla), criada.rows[0]!.id);
  }

  const grupos = await client.query<{ id: string; nome: string }>(
    "select id, nome from grupos_mercadorias where empresa_id = $1",
    [empresaId]
  );
  const gruposPorNome = new Map(grupos.rows.map((item) => [chave(item.nome), item.id]));
  for (const nome of gruposNecessarios) {
    if (gruposPorNome.has(chave(nome))) continue;
    const criado = await client.query<{ id: string }>(
      "insert into grupos_mercadorias (empresa_id, nome, ativa) values ($1, $2, true) returning id",
      [empresaId, nome]
    );
    gruposPorNome.set(chave(nome), criado.rows[0]!.id);
  }
  return { unidadesPorSigla, gruposPorNome };
}

async function codigoExternoDeTeste(client: pg.PoolClient) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloco = () => Array.from(randomBytes(4), (byte) => alfabeto[byte % alfabeto.length]).join("");
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const candidato = `PR-${bloco()}-${bloco()}`;
    const existente = await client.query("select 1 from produtos where codigo = $1 limit 1", [candidato]);
    if (!existente.rowCount) return candidato;
  }
  throw new Error("Nao foi possivel gerar um codigo externo de teste unico.");
}

function precoDoCatalogo(payload: DadosPreparados): number | null {
  const custo = payload.custo;
  if (!payload.auto) return payload.precoVenda;
  if (custo == null) return null;
  return calcularPrecoVenda({
    auto: true,
    custo,
    quantidadeCaixa: payload.quantidadeCaixa,
    margem: payload.margem,
    margemGrupo: 0,
    precoManual: 0
  });
}

async function inserirProdutoDeTeste(
  client: pg.PoolClient,
  empresaId: string,
  codigoInterno: string,
  item: Preparado,
  referencias: Awaited<ReturnType<typeof garantirReferencias>>
) {
  const unidadeIndividualId = referencias.unidadesPorSigla.get(chave(item.unidade));
  if (!unidadeIndividualId) throw new Error(`Unidade não resolvida para ${item.nome}.`);
  const dados = item.payload;
  const grupoMercadoriaId = item.grupo ? (referencias.gruposPorNome.get(chave(item.grupo)) ?? null) : null;
  const criado = await client.query<{ id: string }>(
    `insert into produtos (
      empresa_id, grupo_mercadoria_id, unidade_medida_id, unidade_individual_id, codigo, codigo_interno, codigo_barras,
      descricao, marca, quantidade_individual, embalagem, c_de, quantidade_caixa, medida_compra,
      custo, margem, preco_venda, auto, status, tipo, quantidade_estoque, estoque_min, estoque_max,
      setor_estoque, local_venda_1, local_venda_2
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
    ) returning id`,
    [
      empresaId,
      grupoMercadoriaId,
      unidadeIndividualId,
      unidadeIndividualId,
      await codigoExternoDeTeste(client),
      codigoInterno,
      dados.codigoBarras,
      dados.descricao,
      dados.marca,
      dados.quantidadeIndividual,
      dados.embalagem,
      dados.cDe,
      dados.quantidadeCaixa,
      dados.medidaCompra,
      dados.custo,
      dados.margem,
      precoDoCatalogo(dados),
      dados.auto,
      dados.status,
      dados.tipo,
      dados.quantidadeEstoque,
      dados.estoqueMin,
      dados.estoqueMax,
      dados.setorEstoque,
      dados.localVenda1,
      dados.localVenda2
    ]
  );
  const transformacao = dados.transformacao;
  if (transformacao) {
    await client.query(
      `insert into produtos_transformacao (produto_id, precisao, quantidade, unidade, produto_receituario)
       values ($1,$2,$3,$4,$5)`,
      [
        criado.rows[0]!.id,
        transformacao.precisao,
        transformacao.quantidade,
        transformacao.unidade,
        transformacao.produtoReceituario
      ]
    );
  }
}

function candidatosNoDestino(
  itens: Preparado[],
  existentes: Array<{ descricao: string; codigo_barras: string | null }>
) {
  const eansExistentes = new Set(existentes.map((item) => ean(item.codigo_barras)).filter(Boolean));
  const nomesExistentes = new Set(existentes.map((item) => chave(item.descricao)));
  return itens.filter((item) => !eansExistentes.has(item.ean) && !nomesExistentes.has(chave(item.nome)));
}

async function executar() {
  const arquivo = argumento("arquivo");
  const empresaId = argumento("empresa-id");
  const aplicar = temFlag("confirmar-local");
  if (!arquivo || !empresaId) {
    throw new Error("Uso: --arquivo <catalogo.json> --empresa-id <UUID> [--confirmar-local]");
  }

  const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria";
  localOuFalhar(databaseUrl);
  const bruto = JSON.parse(await readFile(arquivo, "utf8")) as ValorJson;
  const { itens, ignorados } = prepararCatalogo(bruto);
  const unidades = [
    ...new Set(
      itens
        .flatMap((item) => {
          return [item.unidade, item.payload.medidaCompra ?? "", item.payload.transformacao?.unidade ?? ""];
        })
        .filter(Boolean)
    )
  ];
  const grupos = [...new Set(itens.flatMap((item) => (item.grupo ? [item.grupo] : [])))];

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const existentes = await pool.query<{ descricao: string; codigo_barras: string | null }>(
      "select descricao, codigo_barras from produtos where empresa_id = $1",
      [empresaId]
    );
    const candidatos = candidatosNoDestino(itens, existentes.rows);

    console.log(
      JSON.stringify(
        {
          modo: aplicar ? "APLICAR LOCAL" : "DRY-RUN",
          lidos: itens.length + ignorados.length,
          validos: itens.length,
          candidatos: candidatos.length,
          jaExistentes: itens.length - candidatos.length,
          ignorados,
          gruposQueSeraoGarantidos: grupos.length,
          unidadesQueSeraoGarantidas: unidades.length,
          fotosImportaveis: 0,
          fiscaisImportaveis: 0
        },
        null,
        2
      )
    );
    if (!aplicar) return;

    const client = await pool.connect();
    let inseridos = 0;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('produtos:cadastro'), hashtext($1::text))", [
        empresaId
      ]);
      // The preview can become stale while another product is being saved. Re-check under the
      // same lock used by the API before writing any local test records.
      const atuais = await client.query<{ descricao: string; codigo_barras: string | null }>(
        "select descricao, codigo_barras from produtos where empresa_id = $1",
        [empresaId]
      );
      const candidatosFinais = candidatosNoDestino(itens, atuais.rows);
      const referencias = await garantirReferencias(client, empresaId, unidades, grupos);
      const internoAtual = await client.query<{ codigo_interno: string | null }>(
        "select codigo_interno from produtos where empresa_id = $1 order by codigo_interno desc for update",
        [empresaId]
      );
      let proximoInterno = Math.max(
        0,
        ...internoAtual.rows.map((item) => Number(item.codigo_interno)).filter(Number.isFinite)
      );
      for (const item of candidatosFinais) {
        proximoInterno += 1;
        await inserirProdutoDeTeste(client, empresaId, String(proximoInterno).padStart(5, "0"), item, referencias);
        inseridos += 1;
      }
      await client.query("commit");
    } catch (erro) {
      await client.query("rollback");
      throw erro;
    } finally {
      client.release();
    }
    console.log(
      JSON.stringify({ inseridos, ignorados: ignorados.length, repetidosNoDestino: itens.length - inseridos }, null, 2)
    );
  } finally {
    await pool.end();
  }
}

void executar().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
