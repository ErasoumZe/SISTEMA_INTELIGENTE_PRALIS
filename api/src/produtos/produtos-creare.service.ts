import { createHash } from "node:crypto";
import {
  candidatosDeCodigo,
  chaveDeGrupo,
  CreareValidationError,
  grupoIdDoNome,
  grupoIdPreenchido,
  formatCreareNumber,
  generateCreareFile,
  generateCreareRecord,
  type CreareSiaMatch,
  type CreareStoreConfig,
  type ProdutoCreare
} from "@padaria/shared/produtos";
import { env } from "../env.js";
import { lerConfiguracaoCreare, LOJAS_CREARE, type LojaCreare } from "./produtos-creare.config.js";
import {
  confirmarLoteRepository,
  cursorCreareRepository,
  deParaParaCreareRepository,
  empresasDaLojaRepository,
  loteAbertoRepository,
  prepararLoteRepository,
  produtosParaCreareRepository,
  registrarEntregaRepository,
  LoteCreareError,
  type LoteCreare,
  type RegistroPendente
} from "./produtos-creare.repository.js";
import { contextoDaEmpresaFiscalRepository } from "./produtos-fiscal.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { idsDeGrupoOficiais } from "./produtos-grupo-id.js";

/**
 * Exportacao do cadastro para o PDV CREARE — porte de `creare.service.ts` do app oficial (R-222): casa
 * cada produto da loja com o de-para do SIA (barras, depois coditem, depois o proprio codigo interno),
 * gera o registro de 363 posicoes e separa o que nao casou ou nao passou. DESLIGADO por padrao
 * (`CREARE_EXPORT_ENABLED`): ate a virada, quem publica para o PDV e o app.
 */
export class CreareIndisponivelError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 403 | 404 | 422 | 503,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "CreareIndisponivelError";
  }
}

const digest = (valor: string) => createHash("sha256").update(valor, "ascii").digest("hex");
const semZerosAEsquerda = (valor: string | null | undefined) =>
  String(valor ?? "")
    .replace(/\D/gu, "")
    .replace(/^0+(?=\d)/u, "");
const numero = (valor: string | null) => (valor == null ? null : Number(valor));

type LinhaProduto = Awaited<ReturnType<typeof produtosParaCreareRepository>>[number];
type LinhaSia = Awaited<ReturnType<typeof deParaParaCreareRepository>>[number];

export interface ForaDoArquivo {
  codigo: string;
  nome: string;
  codigoBarras: string | null;
  motivo: string;
}

/** O produto do ERP com os nomes de campo do app oficial (o gerador e o do app, literal). */
function paraCreare(linha: LinhaProduto, grupoIdDoNomeDoGrupo: string | null): ProdutoCreare {
  return {
    codigo: linha.codigo ?? linha.codigoInterno,
    nome: linha.nomeCatalogo?.trim() || linha.descricao,
    quantidade: linha.nomeCatalogo ? Number(linha.quantidadeIndividual) : 0,
    medidaBase: linha.sigla?.toUpperCase() ?? "",
    pesavel: linha.pesavel == null ? null : linha.pesavel ? "S" : "N",
    teclaBalanca: linha.teclaBalanca,
    validadeBalanca: linha.validadeBalanca,
    codigoBarras: linha.codigoBarras,
    marca: linha.marca,
    qtCad: linha.quantidadeCaixa,
    codigoInterno: linha.codigoInterno,
    grupo: linha.grupoNome,
    // "000" e marcador de vazio no layout, nao ID (oficial `grupoIdPreenchido`).
    grupoId: grupoIdPreenchido(linha.grupoIdExterno) ? linha.grupoIdExterno!.trim() : grupoIdDoNomeDoGrupo,
    tipo: linha.tipo === "transformacao" ? "transformacao" : "revenda",
    status: linha.status,
    estoqueMin: numero(linha.estoqueMin),
    estoqueMax: numero(linha.estoqueMax),
    custo: numero(linha.custo),
    margemPontual: numero(linha.margem),
    vVendaPontual: numero(linha.precoVenda),
    auto: linha.auto,
    promocoes: linha.temPromocao ? [{}] : [],
    fiscal: linha.fiscal?.produtoId
      ? {
          ncm: linha.fiscal.ncm,
          cest: linha.fiscal.cest,
          categoria: linha.fiscal.categoria,
          cstPisCofins: linha.fiscal.cstPisCofins,
          aliquotaCheia: numero(linha.fiscal.aliquotaCheia),
          aliquotaFcp: numero(linha.fiscal.aliquotaFcp),
          aliquotaPis: numero(linha.fiscal.aliquotaPis),
          aliquotaCofins: numero(linha.fiscal.aliquotaCofins),
          reducaoIcms: numero(linha.fiscal.reducaoIcms),
          icms: numero(linha.fiscal.icms),
          aliquotaEcfId: linha.fiscal.aliquotaEcfId
        }
      : null
  };
}

const paraSia = (linha: LinhaSia): CreareSiaMatch => ({
  coditem: linha.coditem,
  codGrupo: linha.codGrupo,
  aliqSaidaEcf: linha.aliqSaidaEcf,
  ncm: linha.ncm,
  pesavel: linha.pesavel,
  teclaBalanca: linha.teclaBalanca,
  validadeBalanca: linha.validadeBalanca
});

interface Lote {
  casados: Array<{ id: string; produto: ProdutoCreare; sia: CreareSiaMatch }>;
  naoCasados: ForaDoArquivo[];
  invalidos: ForaDoArquivo[];
  colisoesCoditem: Array<{ coditem: string; produtos: string[] }>;
  totalProdutos: number;
  deParaCarregado: number;
}

const resumo = (produto: ProdutoCreare, motivo: string): ForaDoArquivo => ({
  codigo: produto.codigo ?? "",
  nome: produto.nome,
  codigoBarras: produto.codigoBarras,
  motivo
});

async function montarLote(empresaId: string, config: CreareStoreConfig): Promise<Lote> {
  const [linhas, dePara, oficiais] = await Promise.all([
    produtosParaCreareRepository(empresaId),
    deParaParaCreareRepository(empresaId),
    idsDeGrupoOficiais()
  ]);
  const siaPorBarras = new Map(dePara.map((linha) => [linha.chaveBarras, linha]));
  const siaPorCoditem = new Map(dePara.map((linha) => [semZerosAEsquerda(linha.coditem), linha]));
  // Oficial `grupoIdPorNome`: o id do grupo vem da aba oficial (AC/AD) pelo NOME; se ela nao tiver, pode
  // ser aprendido de outro produto do mesmo grupo. A chave ignora acento, espaco e o U+2060 da planilha.
  const aprendidos = new Map<string, string>();
  for (const linha of linhas) {
    if (linha.grupoNome && grupoIdPreenchido(linha.grupoIdExterno)) {
      aprendidos.set(chaveDeGrupo(linha.grupoNome), linha.grupoIdExterno!.trim());
    }
  }
  const grupoIdPeloNome = (nome: string | null): string | null =>
    nome ? (grupoIdDoNome(oficiais, nome) ?? aprendidos.get(chaveDeGrupo(nome)) ?? null) : null;

  const casados: Lote["casados"] = [];
  const naoCasados: ForaDoArquivo[] = [];
  const invalidos: ForaDoArquivo[] = [];
  const porCoditem = new Map<string, string[]>();
  for (const linha of linhas) {
    const produto = paraCreare(linha, grupoIdPeloNome(linha.grupoNome));
    const codigoInterno = semZerosAEsquerda(produto.codigoInterno);
    const porBarras = candidatosDeCodigo(produto.codigoBarras)
      .map((chave) => siaPorBarras.get(chave))
      .find(Boolean);
    const daTabela = porBarras ?? siaPorCoditem.get(codigoInterno);
    // Sem par no SIA, o proprio codigo interno vale como coditem (linha sintetica do oficial).
    const sia: CreareSiaMatch | undefined = daTabela
      ? paraSia(daTabela)
      : codigoInterno
        ? {
            coditem: codigoInterno,
            codGrupo: produto.grupoId ?? "",
            aliqSaidaEcf: produto.fiscal?.aliquotaEcfId ?? "",
            ncm: produto.fiscal?.ncm ?? "",
            pesavel: null,
            teclaBalanca: null,
            validadeBalanca: null
          }
        : undefined;
    if (!sia) {
      naoCasados.push(
        resumo(produto, "sem par no SIA pelo codigo de barras e sem codigo interno para valer como coditem")
      );
      continue;
    }
    try {
      generateCreareRecord(produto, config, sia);
    } catch (erro) {
      invalidos.push(resumo(produto, erro instanceof CreareValidationError ? erro.message : "erro inesperado"));
      continue;
    }
    porCoditem.set(sia.coditem, [...(porCoditem.get(sia.coditem) ?? []), produto.codigo ?? linha.id]);
    casados.push({ id: linha.id, produto, sia });
  }
  return {
    casados,
    naoCasados,
    invalidos,
    colisoesCoditem: [...porCoditem.entries()]
      .filter(([, lista]) => lista.length > 1)
      .map(([coditem, lista]) => ({ coditem, produtos: lista })),
    totalProdutos: linhas.length,
    deParaCarregado: dePara.length
  };
}

function configuracaoDa(loja: LojaCreare): CreareStoreConfig {
  const lida = lerConfiguracaoCreare(env.CREARE_STORE_CONFIG_JSON);
  if (lida.erros.length) {
    throw new CreareIndisponivelError(
      `Configuração Criare incompleta (${lida.erros.join(", ")}).`,
      503,
      "CREARE_MISCONFIGURED"
    );
  }
  const config = lida.configs[loja];
  if (!config) {
    throw new CreareIndisponivelError(
      `Loja ${loja} não possui configuração Criare.`,
      503,
      "CREARE_STORE_NOT_CONFIGURED"
    );
  }
  // Oficial: na TNP o GTIN vai sempre no campo longo (formato homologado).
  return loja === "TNP" ? { ...config, barcodeField: "extended" } : config;
}

function exigirLigado() {
  if (!env.CREARE_EXPORT_ENABLED) {
    throw new CreareIndisponivelError(
      "Exportação Criare está desabilitada até a virada combinada.",
      503,
      "CREARE_DISABLED"
    );
  }
}

/** A loja (TNP/LI/HORA) de uma empresa; empresa sem loja nao exporta. */
export async function lojaCreareDaEmpresa(empresaId: string): Promise<LojaCreare> {
  const contexto = await contextoDaEmpresaFiscalRepository(empresaId);
  const loja = lojaFiscalDaEmpresa(contexto?.matriculaPrefixo);
  if (!(LOJAS_CREARE as readonly string[]).includes(loja)) {
    throw new CreareIndisponivelError(`Esta empresa não é uma loja com PDV (${loja}).`, 422, "CREARE_EMPRESA_SEM_LOJA");
  }
  return loja as LojaCreare;
}

/** A empresa da loja pedida pelo robo (`?loja=TNP`). Mais de uma empresa com o mesmo prefixo = ambiguo. */
export async function empresaDaLojaCreare(loja: string): Promise<string> {
  const empresas = await empresasDaLojaRepository(loja.trim().toUpperCase());
  const [empresa] = empresas;
  if (!empresa || empresas.length > 1) {
    throw new CreareIndisponivelError(
      `Não há uma única empresa para a loja ${loja}.`,
      empresa ? 422 : 404,
      "CREARE_STORE_UNKNOWN"
    );
  }
  return empresa.id;
}

async function loteValido(empresaId: string) {
  const loja = await lojaCreareDaEmpresa(empresaId);
  const config = configuracaoDa(loja);
  const lote = await montarLote(empresaId, config);
  if (!lote.deParaCarregado) {
    throw new CreareIndisponivelError(
      `De-para do SIA não importado para ${loja}. Importe na Manutenção antes de exportar.`,
      503,
      "CREARE_DEPARA_MISSING"
    );
  }
  const [exemplo] = lote.colisoesCoditem;
  if (exemplo) {
    throw new CreareIndisponivelError(
      `Exportação recusada: ${lote.colisoesCoditem.length} coditem(ns) do SIA casam com mais de um produto ` +
        `(ex.: coditem ${exemplo.coditem} -> ${exemplo.produtos.join(", ")}). Um sobrescreveria o outro no PDV.`,
      422,
      "CREARE_CODITEM_COLLISION"
    );
  }
  if (!lote.casados.length) {
    throw new CreareIndisponivelError(`Nenhum produto de ${loja} casou com o cadastro do SIA.`, 422, "CREARE_EMPTY");
  }
  return { loja, config, lote };
}

const registrosDo = (lote: Lote, config: CreareStoreConfig): RegistroPendente[] =>
  lote.casados.map(({ id, produto, sia }) => {
    const registro = generateCreareRecord(produto, config, sia);
    return { produtoId: id, registro, hash: digest(registro) };
  });

/** Fotografia completa (sem `modo=pendentes`): o catalogo inteiro, sem tocar em lote. */
export async function gerarTxtCompleto(empresaId: string, limite?: number): Promise<{ loja: LojaCreare; txt: Buffer }> {
  exigirLigado();
  const { loja, config, lote } = await loteValido(empresaId);
  const selecionados = limite && limite > 0 ? lote.casados.slice(0, limite) : lote.casados;
  const siaPorProduto = new Map(selecionados.map(({ produto, sia }) => [produto, sia]));
  const arquivo = generateCreareFile(
    selecionados.map(({ produto }) => produto),
    config,
    (produto) => siaPorProduto.get(produto)
  );
  return { loja, txt: Buffer.from(arquivo, "ascii") };
}

/** Lote incremental (`modo=pendentes`): o mesmo lote enquanto aberto; null = nada pendente (204). */
export async function loteDePendentes(empresaId: string, limite?: number): Promise<LoteCreare | null> {
  exigirLigado();
  const aberto = await loteAbertoRepository(empresaId);
  if (aberto) return aberto;
  const { config, lote } = await loteValido(empresaId);
  const fim = config.lineEnding === "CRLF" ? "\r\n" : "\n";
  return prepararLoteRepository(
    empresaId,
    registrosDo(lote, config),
    (selecionados) => {
      const conteudo = `${selecionados.map((item) => item.registro).join(fim)}${fim}`;
      return { conteudo, sha256: digest(conteudo) };
    },
    limite
  );
}

export async function loteAbertoCreare(empresaId: string): Promise<LoteCreare | null> {
  exigirLigado();
  configuracaoDa(await lojaCreareDaEmpresa(empresaId));
  return loteAbertoRepository(empresaId);
}

export async function registrarEntregaCreare(empresaId: string, id: string, sha256: string) {
  return registrarEntregaRepository(empresaId, id, sha256);
}

export async function confirmarLoteCreare(empresaId: string, id: string, sha256: string) {
  return confirmarLoteRepository(empresaId, id, sha256);
}

/** Diagnostico (`/admin/creare/health` do oficial): casados, fora, colisoes, ECF, custo e incremental. */
export async function saudeCreare(empresasPermitidas: string[]) {
  const lida = lerConfiguracaoCreare(env.CREARE_STORE_CONFIG_JSON);
  const lojas = [];
  for (const empresaId of empresasPermitidas) {
    const contexto = await contextoDaEmpresaFiscalRepository(empresaId);
    const loja = lojaFiscalDaEmpresa(contexto?.matriculaPrefixo) as LojaCreare;
    const config = lida.configs[loja];
    if (!config) continue;
    const efetiva = loja === "TNP" ? { ...config, barcodeField: "extended" as const } : config;
    const lote = await montarLote(empresaId, efetiva);
    const distribuicaoEcf: Record<string, number> = {};
    for (const { sia } of lote.casados) {
      const codigo = sia.aliqSaidaEcf.replace(/^0+$/u, "") || efetiva.ecfTaxCodePadrao || "(vazio)";
      distribuicaoEcf[codigo] = (distribuicaoEcf[codigo] ?? 0) + 1;
    }
    const casas = efetiva.decimalPlaces.cost;
    const cursor = await cursorCreareRepository(empresaId, registrosDo(lote, efetiva));
    lojas.push({
      empresaId,
      loja,
      totalProdutos: lote.totalProdutos,
      deParaCarregado: lote.deParaCarregado,
      casados: lote.casados.length,
      naoCasados: lote.naoCasados.length,
      invalidos: lote.invalidos.length,
      exemplosNaoCasados: lote.naoCasados.slice(0, 10),
      exemplosInvalidos: lote.invalidos.slice(0, 10),
      colisoesCoditem: lote.colisoesCoditem,
      distribuicaoEcf,
      amostraCusto: lote.casados
        .filter(({ produto }) => (produto.custo ?? 0) > 0)
        .slice(0, 5)
        .map(({ produto }) => {
          const campoGravado = formatCreareNumber(produto.custo, 10, casas);
          return {
            codigo: produto.codigo,
            nome: produto.nome,
            custo: produto.custo ?? 0,
            campoGravado,
            casasConfiguradas: casas,
            seSiaLerCom2Casas: Number(campoGravado) / 100,
            seSiaLerCom3Casas: Number(campoGravado) / 1000
          };
        }),
      incremental: { ...cursor, pendentes: cursor.pendentes.length }
    });
  }
  return {
    ligado: env.CREARE_EXPORT_ENABLED,
    configuracaoOk: lida.erros.length === 0,
    errosDeConfiguracao: lida.erros,
    downloadPorTokenHabilitado: env.CREARE_EXPORT_TOKEN.length >= 32,
    lojas
  };
}
export { LoteCreareError };
