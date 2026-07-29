import AdmZip from "adm-zip";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { empresas, fornecedores, produtos } from "@padaria/db/schema/cadastro";
import { mercadorias, mercadoriasItens } from "@padaria/db/schema/mercadoria";
import { notasFiscais, notasFiscaisItens } from "@padaria/db/schema/nota-fiscal";
import type { DadosExternos } from "@padaria/shared/api";
import type { NotaFiscalDetalheDto, NotaFiscalDto, NotasFiscaisQuery } from "@padaria/shared/notas-fiscais";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import { calcularDiscriminacao, resolverItemPorEan, type ProdutoPorEan } from "@padaria/shared/discriminacao";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { apenasDigitos } from "../utils.js";
import { extrairNotasDoFiltro, fileIdDaNota, notaCancelada, type NfeParseada } from "./notas-fiscais.parser.js";

const TAMANHO_LOTE_XML = 50;

// Logger minimo compativel com pino (request.log). Serve para diagnosticar a chamada ao webhook
// nos logs do Coolify quando a importacao volta vazia — SEM vazar o token (que vai apenas no header
// Authorization, nunca no corpo logado).
export interface RegistroWebhook {
  info(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

const registroConsole: RegistroWebhook = {
  info: (obj, msg) => console.info(`[notas-fiscais] ${msg ?? ""}`.trimEnd(), obj),
  debug: (obj, msg) => console.debug(`[notas-fiscais] ${msg ?? ""}`.trimEnd(), obj)
};

function padCnpj(valor: string | null): string {
  return (apenasDigitos(valor) ?? "").padStart(14, "0");
}

// EAN -> produto cadastrado (§5). Uma consulta so para a nota inteira, restrita aos EANs que a nota
// realmente traz e a empresa dona da nota — sem N+1 e sem cruzar cadastro de outra empresa.
async function mapaProdutosPorEan(
  empresaId: string,
  itens: readonly { ean?: string | null }[],
  db: ExecutorBanco
): Promise<Map<string, ProdutoPorEan>> {
  const eans = [...new Set(itens.map((item) => (item.ean ?? "").trim()).filter(Boolean))];
  if (!eans.length) return new Map();
  const linhas = await db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      codigoBarras: produtos.codigoBarras
    })
    .from(produtos)
    .where(
      and(eq(produtos.empresaId, empresaId), isNotNull(produtos.codigoBarras), inArray(produtos.codigoBarras, eans))
    );
  return new Map(
    linhas.map((linha) => [
      linha.codigoBarras ?? "",
      { id: linha.id, descricao: linha.descricao, grupoMercadoriaId: linha.grupoMercadoriaId }
    ])
  );
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

// Parse defensivo do corpo do filtro: o Make.com as vezes devolve o JSON como string (dupla
// codificacao). Desembrulha uma vez; retorna null se nao for JSON (o chamador loga a amostra crua).
function parseJsonSeguro(texto: string): DadosExternos {
  try {
    const valor: DadosExternos = JSON.parse(texto);
    if (typeof valor === "string") {
      try {
        return JSON.parse(valor) as DadosExternos;
      } catch {
        return valor;
      }
    }
    return valor;
  } catch {
    return null;
  }
}

type CorpoWebhook = { route: string; company: string; data: Record<string, DadosExternos> };

// company = identificador FIXO da contabilidade (env NOTAS_FISCAIS_COMPANY). O CNPJ da empresa
// consultada vai em data.search.Client — nunca em company.
function corpoFiltro(
  companyContabilidade: string,
  cnpjEmpresa: string,
  dataInicioBr: string,
  dataFimBr: string
): CorpoWebhook {
  return {
    route: "obternfeporfiltro",
    company: padCnpj(companyContabilidade),
    data: {
      search: {
        Client: [padCnpj(cnpjEmpresa)],
        DateEmissionStart: dataInicioBr,
        DateEmissionEnd: dataFimBr
      }
    }
  };
}

// obterxmlporids: aqui company = CNPJ da PROPRIA empresa consultada (nao a contabilidade).
function corpoXml(cnpjEmpresa: string, fileIds: string[]): CorpoWebhook {
  return {
    route: "obterxmlporids",
    company: padCnpj(cnpjEmpresa),
    data: { fileIds: fileIds.map((id) => String(id)) }
  };
}

async function postWebhook(url: string, token: string, corpo: CorpoWebhook, log: RegistroWebhook): Promise<Response> {
  // Diagnostico: corpo SEM o token (o token vai so no header Authorization). Confere
  // company/Client/datas nos logs do Coolify quando a importacao volta vazia.
  log.info({ route: corpo.route, company: corpo.company, data: corpo.data }, "webhook requisicao");
  const resposta = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 500);
    log.info({ route: corpo.route, status: resposta.status, detalhe }, "webhook respondeu erro");
    throw new Error(`Webhook de notas fiscais respondeu HTTP ${resposta.status}: ${detalhe}`);
  }
  return resposta;
}

// Busca a lista de NF-e do periodo e baixa os XMLs (ZIP em lotes de 50), retornando o conteudo cru.
export async function baixarXmlsDoWebhook(input: {
  url: string;
  token: string;
  companyContabilidade: string;
  cnpjEmpresa: string;
  dataInicioBr: string;
  dataFimBr: string;
  log?: RegistroWebhook | undefined;
}): Promise<string[]> {
  const log = input.log ?? registroConsole;
  const respostaFiltro = await postWebhook(
    input.url,
    input.token,
    corpoFiltro(input.companyContabilidade, input.cnpjEmpresa, input.dataInicioBr, input.dataFimBr),
    log
  );
  const textoFiltro = await respostaFiltro.text();
  const payloadFiltro = parseJsonSeguro(textoFiltro);
  const notas = extrairNotasDoFiltro(payloadFiltro);
  const naoCanceladas = notas.filter((nfe) => !notaCancelada(nfe));
  const fileIds = naoCanceladas.map(fileIdDaNota).filter((id) => id.length > 0);
  // Contagem da resposta (sempre) + amostra crua do payload (debug) para diagnostico em producao.
  log.info(
    { notasNoPayload: notas.length, notasNaoCanceladas: naoCanceladas.length, fileIds: fileIds.length },
    "webhook filtro resposta"
  );
  log.debug({ amostra: textoFiltro.slice(0, 300) }, "webhook filtro payload (300 chars)");

  const xmls: string[] = [];
  for (const lote of emLotes(fileIds, TAMANHO_LOTE_XML)) {
    const respostaXml = await postWebhook(input.url, input.token, corpoXml(input.cnpjEmpresa, lote), log);
    const zip = new AdmZip(Buffer.from(await respostaXml.arrayBuffer()));
    for (const entrada of zip.getEntries()) {
      if (!entrada.isDirectory && entrada.entryName.toLowerCase().endsWith(".xml")) {
        xmls.push(entrada.getData().toString("utf8"));
      }
    }
  }
  log.info({ xmls: xmls.length }, "webhook xmls baixados");
  return xmls;
}

export async function buscarCnpjEmpresaRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const [empresa] = await db.select({ cnpj: empresas.cnpj }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  return empresa ? apenasDigitos(empresa.cnpj) : null;
}

// Casa o fornecedor por CNPJ (digitos) dentro da empresa; cria se nao existir (padrao do dicionario
// de integracoes: buscar automatico -> criar automatico). Retorna null se nao houver CNPJ.
async function resolverFornecedorPorCnpj(
  db: ExecutorBanco,
  empresaId: string,
  cnpj: string | null,
  nome: string | null
): Promise<string | null> {
  if (!cnpj) return null;
  const existentes = await db
    .select({ id: fornecedores.id, documento: fornecedores.documento })
    .from(fornecedores)
    .where(eq(fornecedores.empresaId, empresaId));
  const casado = existentes.find((fornecedor) => apenasDigitos(fornecedor.documento) === cnpj);
  if (casado) return casado.id;
  const [criado] = await db
    .insert(fornecedores)
    .values({ empresaId, nome: nome ?? cnpj, documento: cnpj })
    .returning({ id: fornecedores.id });
  return criado?.id ?? null;
}

function somar(...valores: (string | null)[]): string {
  const total = valores.reduce((acc, valor) => acc + (valor ? Number(valor) : 0), 0);
  return (Number.isFinite(total) ? total : 0).toFixed(2);
}

function valorOuZero(valor: string | null): string {
  return valor ? Number(valor).toFixed(2) : "0.00";
}

export interface ImportarNotaFiscalInput {
  empresaId: string;
  nfe: NfeParseada;
  dataReferenciaFallback: string; // yyyy-MM-dd (dataFim do periodo importado)
  criadoPor: string | null;
}

// Persiste UMA NF-e de forma idempotente e atomica: a nota (ancora unica por empresa+chave) e
// criada primeiro; em conflito, pula sem efeitos colaterais. Caso contrario, resolve o fornecedor,
// cria a mercadoria pre-preenchida (aguardando_aprovacao, computar=false, sem caixa) + itens, os
// itens fiscais da nota e liga tudo. Abre transacao propria por nota (resiliente ao lote).
export async function importarNotaFiscalRepository(
  input: ImportarNotaFiscalInput,
  db?: ExecutorBanco
): Promise<"importada" | "pulada"> {
  const { empresaId, nfe, criadoPor } = input;
  return executarComTransacaoOpcional(db, async (tx) => {
    const dataEmissao = nfe.dataEmissao ? nfe.dataEmissao.slice(0, 10) : null;
    const dataReferencia = dataEmissao ?? input.dataReferenciaFallback;
    const dataVencimento = nfe.dataVencimento ?? dataReferencia;

    // 1) Ancora de idempotencia: se a chave ja existe para a empresa, nada e criado.
    const [notaInserida] = await tx
      .insert(notasFiscais)
      .values({
        empresaId,
        chave: nfe.chave,
        numero: nfe.numero,
        serie: nfe.serie,
        modelo: nfe.modelo,
        naturezaOperacao: nfe.naturezaOperacao,
        dataEmissao: nfe.dataEmissao ? new Date(nfe.dataEmissao) : null,
        fornecedorCnpj: nfe.fornecedorCnpj,
        fornecedorNome: nfe.fornecedorNome,
        valorProdutos: nfe.valorProdutos,
        valorDesconto: nfe.valorDesconto,
        valorFrete: nfe.valorFrete,
        valorOutros: nfe.valorOutros,
        valorSeguro: nfe.valorSeguro,
        valorTotal: nfe.valorTotal,
        dataVencimento,
        statusImportacao: "pendente_revisao"
      })
      .onConflictDoNothing({ target: [notasFiscais.empresaId, notasFiscais.chave] })
      .returning({ id: notasFiscais.id });
    if (!notaInserida) return "pulada";

    // 2) Fornecedor casado por CNPJ (criado se necessario).
    const fornecedorId = await resolverFornecedorPorCnpj(tx, empresaId, nfe.fornecedorCnpj, nfe.fornecedorNome);

    // 3) Cabecalho da mercadoria pre-preenchida (para revisao/aprovacao).
    const descricaoFornecedor = nfe.fornecedorCnpj
      ? `Compra de mercadorias com o fornecedor ${nfe.fornecedorCnpj}${nfe.fornecedorNome ? ` - ${nfe.fornecedorNome}` : ""}`
      : `Compra de mercadorias (NF-e ${nfe.chave})`;
    const [mercadoria] = await tx
      .insert(mercadorias)
      .values({
        empresaId,
        caixaId: null,
        fornecedorId,
        dataReferencia,
        dataVencimento,
        descricao: descricaoFornecedor,
        valorOriginal: valorOuZero(nfe.valorProdutos ?? nfe.valorTotal),
        valorAcrescimo: somar(nfe.valorFrete, nfe.valorOutros, nfe.valorSeguro),
        valorDesconto: valorOuZero(nfe.valorDesconto),
        notaFiscalId: nfe.chave,
        temNotaFiscal: true,
        computar: false,
        status: "aguardando_aprovacao",
        criadoPor
      })
      .returning({ id: mercadorias.id });
    if (!mercadoria) throw new Error("Falha ao criar a mercadoria da NF-e.");

    // 4) Itens da mercadoria (revisaveis). Itens sem quantidade positiva ficam so na nota fiscal
    //    (mercadorias_itens exige quantidade > 0); o detalhe fiscal completo vai no passo 5.
    //    A DESCRICAO vem do cadastro quando o EAN casa com produtos.codigoBarras (§5); sem match,
    //    fica o texto da nota e o item nasce sem produtoId — o sinal de "nao cadastrado".
    const produtosPorEan = await mapaProdutosPorEan(empresaId, nfe.itens, tx);
    for (const item of nfe.itens) {
      const quantidade = item.quantidade ? Number(item.quantidade) : 0;
      if (!(quantidade > 0)) continue;
      const valorUnitario = item.valorUnitario ? Number(item.valorUnitario) : 0;
      const resolvido = resolverItemPorEan(item, produtosPorEan);
      const calculo = calcularDiscriminacao({ itens: [{ quantidade, valorUnitario }] });
      const calculado = calculo.itens[0];
      await tx.insert(mercadoriasItens).values({
        mercadoriaId: mercadoria.id,
        produtoId: resolvido.produtoId,
        grupoMercadoriaId: resolvido.grupoMercadoriaId,
        descricao: resolvido.descricao,
        quantidade: String(quantidade),
        valorUnitario: String(valorUnitario),
        valorTotal: centavosParaDecimalBanco(calculado?.valorTotalCentavos ?? 0),
        valorUnitarioComDesconto: centavosParaDecimalBanco(calculado?.valorUnitarioComDescontoCentavos ?? 0),
        valorTotalComDesconto: centavosParaDecimalBanco(calculado?.valorTotalComDescontoCentavos ?? 0)
      });
    }

    // 5) Itens fiscais da NF-e (NCM/CFOP/CEST/EAN...), fonte da verdade.
    for (const item of nfe.itens) {
      await tx.insert(notasFiscaisItens).values({
        notaFiscalId: notaInserida.id,
        numeroItem: item.numeroItem,
        ean: item.ean,
        ncm: item.ncm,
        cfop: item.cfop,
        cest: item.cest,
        descricao: item.descricao,
        unidadeComercial: item.unidadeComercial,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario
      });
    }

    // 6) Liga a nota ao fornecedor resolvido e a mercadoria criada.
    await tx
      .update(notasFiscais)
      .set({ fornecedorId, mercadoriaId: mercadoria.id, atualizadoEm: new Date() })
      .where(eq(notasFiscais.id, notaInserida.id));

    return "importada";
  });
}

export async function listarNotasFiscaisRepository(
  query: NotasFiscaisQuery,
  empresasPermitidasIds: string[] | null,
  db: ExecutorBanco = banco
): Promise<NotaFiscalDto[]> {
  const filtros = [];
  if (empresasPermitidasIds !== null) {
    if (empresasPermitidasIds.length === 0) return [];
    filtros.push(inArray(notasFiscais.empresaId, empresasPermitidasIds));
  }
  if (query.empresaId) filtros.push(eq(notasFiscais.empresaId, query.empresaId));
  if (query.statusImportacao) filtros.push(eq(notasFiscais.statusImportacao, query.statusImportacao));

  const linhas = await db
    .select({
      id: notasFiscais.id,
      empresaId: notasFiscais.empresaId,
      chave: notasFiscais.chave,
      numero: notasFiscais.numero,
      serie: notasFiscais.serie,
      dataEmissao: notasFiscais.dataEmissao,
      fornecedorNome: notasFiscais.fornecedorNome,
      fornecedorCnpj: notasFiscais.fornecedorCnpj,
      fornecedorId: notasFiscais.fornecedorId,
      valorTotal: notasFiscais.valorTotal,
      dataVencimento: notasFiscais.dataVencimento,
      mercadoriaId: notasFiscais.mercadoriaId,
      statusImportacao: notasFiscais.statusImportacao
    })
    .from(notasFiscais)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(notasFiscais.criadoEm));

  return linhas.map((linha) => ({
    ...linha,
    dataEmissao: linha.dataEmissao ? linha.dataEmissao.toISOString() : null
  }));
}

export async function buscarNotaFiscalDetalheRepository(
  notaFiscalId: string,
  db: ExecutorBanco = banco
): Promise<NotaFiscalDetalheDto | null> {
  const [nota] = await db
    .select({
      id: notasFiscais.id,
      empresaId: notasFiscais.empresaId,
      chave: notasFiscais.chave,
      numero: notasFiscais.numero,
      serie: notasFiscais.serie,
      modelo: notasFiscais.modelo,
      naturezaOperacao: notasFiscais.naturezaOperacao,
      dataEmissao: notasFiscais.dataEmissao,
      fornecedorNome: notasFiscais.fornecedorNome,
      fornecedorCnpj: notasFiscais.fornecedorCnpj,
      fornecedorId: notasFiscais.fornecedorId,
      valorProdutos: notasFiscais.valorProdutos,
      valorDesconto: notasFiscais.valorDesconto,
      valorFrete: notasFiscais.valorFrete,
      valorOutros: notasFiscais.valorOutros,
      valorSeguro: notasFiscais.valorSeguro,
      valorTotal: notasFiscais.valorTotal,
      dataVencimento: notasFiscais.dataVencimento,
      mercadoriaId: notasFiscais.mercadoriaId,
      statusImportacao: notasFiscais.statusImportacao
    })
    .from(notasFiscais)
    .where(eq(notasFiscais.id, notaFiscalId))
    .limit(1);
  if (!nota) return null;

  const itens = await db
    .select({
      numeroItem: notasFiscaisItens.numeroItem,
      ean: notasFiscaisItens.ean,
      ncm: notasFiscaisItens.ncm,
      cfop: notasFiscaisItens.cfop,
      cest: notasFiscaisItens.cest,
      descricao: notasFiscaisItens.descricao,
      unidadeComercial: notasFiscaisItens.unidadeComercial,
      quantidade: notasFiscaisItens.quantidade,
      valorUnitario: notasFiscaisItens.valorUnitario
    })
    .from(notasFiscaisItens)
    .where(eq(notasFiscaisItens.notaFiscalId, notaFiscalId));

  return {
    ...nota,
    dataEmissao: nota.dataEmissao ? nota.dataEmissao.toISOString() : null,
    itens: itens.map((item) => ({
      ...item,
      quantidade: item.quantidade != null ? Number(item.quantidade) : null,
      valorUnitario: item.valorUnitario != null ? Number(item.valorUnitario) : null
    }))
  };
}
