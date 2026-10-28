import type { JsonValue } from "@padaria/shared/api";
import { lerAbasXlsx } from "./planilha-xlsx.js";
import type { ItemFonteCentral, LojaProdutoCentral } from "@padaria/shared/produtos";

function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "");
}

function linhasComoRegistros(linhas: string[][], nomeAba: string): Array<Record<string, string>> {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho?.length) throw new Error(`A aba ${nomeAba} está vazia.`);
  const chaves = cabecalho.map(normalizarCabecalho);
  if (new Set(chaves.filter(Boolean)).size !== chaves.filter(Boolean).length) {
    throw new Error(`A aba ${nomeAba} tem cabeçalhos duplicados.`);
  }
  return dados
    .filter((linha) => linha.some((valor) => valor?.trim()))
    .map((linha) => Object.fromEntries(cabecalho.map((nome, indice) => [nome.trim(), linha[indice] ?? ""])));
}

function lerCampo(linha: Record<string, string>, ...nomes: string[]): string {
  const mapa = new Map(Object.entries(linha).map(([chave, valor]) => [normalizarCabecalho(chave), valor.trim()]));
  for (const nome of nomes) {
    const valor = mapa.get(normalizarCabecalho(nome));
    if (valor !== undefined) return valor;
  }
  return "";
}

function valorFiscal(linha: Record<string, string>, nome: string): string | null {
  const valor = lerCampo(linha, nome);
  return valor === "" ? null : valor;
}

function resumoBackup(linhas: string[][]): { geradoEmUtc: string; totalProdutos: number; totalPromocoes: number } {
  const registros = linhasComoRegistros(linhas, "Resumo");
  const valores = new Map(
    registros.map((linha) => [normalizarCabecalho(lerCampo(linha, "campo")), lerCampo(linha, "valor")])
  );
  const geradoEmUtc = valores.get("GERADOEMUTC") ?? "";
  const totalProdutos = Number(valores.get("TOTALPRODUTOS"));
  const totalPromocoes = Number(valores.get("TOTALPROMOCOES"));
  if (!geradoEmUtc || !Number.isFinite(Date.parse(geradoEmUtc))) {
    throw new Error("O resumo do backup não contém uma data de geração válida.");
  }
  if (
    !Number.isSafeInteger(totalProdutos) ||
    !Number.isSafeInteger(totalPromocoes) ||
    totalProdutos < 0 ||
    totalPromocoes < 0
  ) {
    throw new Error("O resumo do backup contém contagens inválidas.");
  }
  return { geradoEmUtc, totalProdutos, totalPromocoes };
}

/** Lê o backup completo produzido por `/admin/produtos/export.xlsx`; não grava no catálogo. */
export function lerBackupCompletoPralisXlsx(bytes: Buffer): ItemFonteCentral[] {
  const planilhas = lerAbasXlsx(bytes, "backup do Cadastro de Produtos");
  const linhasResumo = planilhas.get("Resumo");
  if (!linhasResumo) throw new Error("O backup não contém a aba Resumo.");
  const resumo = resumoBackup(linhasResumo);
  const linhasProdutos = planilhas.get("Produtos");
  if (!linhasProdutos) throw new Error("O backup não contém a aba Produtos.");
  const produtos = linhasComoRegistros(linhasProdutos, "Produtos");
  const linhasPromocoes = planilhas.get("Promocoes") ?? [];
  const promocoes = linhasPromocoes.length ? linhasComoRegistros(linhasPromocoes, "Promocoes") : [];
  if (produtos.length !== resumo.totalProdutos || promocoes.length !== resumo.totalPromocoes) {
    throw new Error(
      `O backup está incompleto: resumo informa ${resumo.totalProdutos} produtos e ${resumo.totalPromocoes} promoções, ` +
        `mas as abas contêm ${produtos.length} produtos e ${promocoes.length} promoções.`
    );
  }
  const idsProdutos = new Set(produtos.map((linha) => lerCampo(linha, "id")));
  const promocoesPorProduto = new Map<string, JsonValue[]>();
  for (const linha of promocoes) {
    const produtoId = lerCampo(linha, "produto_id");
    if (!produtoId || !idsProdutos.has(produtoId)) {
      throw new Error(`A aba Promocoes contém vínculo para produto ausente: ${produtoId || "vazio"}.`);
    }
    const itens = promocoesPorProduto.get(produtoId) ?? [];
    itens.push(Object.fromEntries(Object.entries(linha)));
    promocoesPorProduto.set(produtoId, itens);
  }
  const ids = new Set<string>();

  return produtos.map((linha, indice) => {
    const id = lerCampo(linha, "id");
    const nome = lerCampo(linha, "nome");
    const loja = lerCampo(linha, "loja").toUpperCase() as LojaProdutoCentral;
    if (!id || !nome) throw new Error(`A linha ${indice + 2} da aba Produtos não tem id ou nome.`);
    if (!["BASE", "TNP", "LI", "HORA"].includes(loja)) {
      throw new Error(`A linha ${indice + 2} contém uma loja não reconhecida: ${loja || "vazia"}.`);
    }
    if (ids.has(id)) throw new Error(`O backup repete o id de produto ${id}.`);
    ids.add(id);

    const fiscal = {
      ncm: valorFiscal(linha, "ncm"),
      cest: valorFiscal(linha, "cest"),
      categoriaFiscal: valorFiscal(linha, "categoria"),
      cstPisCofins: valorFiscal(linha, "cst_pis_cofins"),
      csosn: null,
      aliquotaEcf: valorFiscal(linha, "aliquota_ecf"),
      reducaoIcms: valorFiscal(linha, "reducao_icms"),
      icms: valorFiscal(linha, "icms"),
      icmsEfetivo: null,
      tributacaoSimples: valorFiscal(linha, "tributacao_simples"),
      aliquotaSimples: valorFiscal(linha, "aliquota_simples"),
      baseFiscal: valorFiscal(linha, "base_fiscal"),
      codigoFiscal: valorFiscal(linha, "codigo_fiscal"),
      produtoFiscal: valorFiscal(linha, "produto_fiscal"),
      cstReforma: valorFiscal(linha, "cst_reforma"),
      cClassTrib: valorFiscal(linha, "cclass_trib"),
      aliquotaIbs: valorFiscal(linha, "aliquota_ibs"),
      aliquotaCbs: valorFiscal(linha, "aliquota_cbs"),
      origemFiscal: valorFiscal(linha, "origem_fiscal"),
      aliquotaFcp: valorFiscal(linha, "aliquota_fcp"),
      aliquotaPis: valorFiscal(linha, "aliquota_pis"),
      aliquotaCofins: valorFiscal(linha, "aliquota_cofins"),
      aliquotaCheia: valorFiscal(linha, "aliquota_cheia"),
      pctNcm: valorFiscal(linha, "pct_ncm"),
      aliquotaEcfId: valorFiscal(linha, "aliquota_ecf_id"),
      estado: valorFiscal(linha, "estado_fiscal"),
      motivo: valorFiscal(linha, "motivo_fiscal"),
      conferidoEm: null
    };
    const bruto = Object.fromEntries(Object.entries(linha).map(([chave, valor]) => [chave, valor])) as Record<
      string,
      JsonValue
    >;
    bruto["promocoes"] = promocoesPorProduto.get(id) ?? [];
    bruto["_backup"] = {
      geradoEmUtc: resumo.geradoEmUtc,
      totalProdutos: resumo.totalProdutos,
      totalPromocoes: resumo.totalPromocoes
    };

    return {
      id: `pralis:${id}`,
      idSistema: id,
      fonte: "pralis",
      loja,
      codigoInterno: lerCampo(linha, "codigo_interno"),
      codigoBarras: lerCampo(linha, "codigo_barras"),
      nome,
      ativo: lerCampo(linha, "status").toLowerCase() === "ativo",
      grupo: valorFiscal(linha, "grupo"),
      custo: valorFiscal(linha, "custo"),
      venda: valorFiscal(linha, "venda_pontual"),
      fiscal: Object.values(fiscal).some((valor) => valor !== null) ? fiscal : null,
      raw: bruto
    } satisfies ItemFonteCentral;
  });
}
