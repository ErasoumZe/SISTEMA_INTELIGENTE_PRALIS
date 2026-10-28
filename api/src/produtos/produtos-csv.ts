type LinhaCsvProduto = {
  id: string;
  loja: string;
  codigo: string | null;
  codigoBarras: string | null;
  codigoInterno: string | null;
  produtoBaseId: string | null;
  nome: string | null;
  descricao: string;
  grupo: string | null;
  tipo: string;
  status: string;
  custo: string | null;
  precoVenda: string | null;
  margem: string | null;
  quantidade: string;
  medidaBase: string | null;
  quantidadeCaixa: number;
  ncm: string | null;
  cest: string | null;
  categoria: string | null;
  cstPisCofins: string | null;
  icms: string | null;
  reducaoIcms: string | null;
  aliquotaPis: string | null;
  aliquotaCofins: string | null;
};

const COLUNAS = [
  "id",
  "loja",
  "codigo",
  "codigo_barras",
  "codigo_interno",
  "base_product_id",
  "nome",
  "grupo",
  "tipo",
  "status",
  "custo",
  "v_venda_pontual",
  "margem_pontual",
  "quantidade",
  "medida_base",
  "qt_cad",
  "ncm",
  "cest",
  "categoria",
  "cst_pis_cofins",
  "icms",
  "reducao_icms",
  "aliquota_pis",
  "aliquota_cofins"
] as const;

function texto(valor: string | null | undefined): string {
  const bruto = String(valor ?? "");
  // Evita que nomes/descrições vindos do cadastro sejam interpretados como fórmulas no Excel.
  const seguro = /^[\s]*[=+@]/u.test(bruto) ? `'${bruto}` : bruto;
  return `"${seguro.replace(/"/gu, '""')}"`;
}

function codigo(valor: string | null | undefined): string {
  const bruto = String(valor ?? "");
  return bruto ? `="${bruto.replace(/"/gu, '""')}"` : '""';
}

function numero(valor: string | null | undefined): string {
  return valor == null ? "" : valor.replace(".", ",");
}

export function montarCsvCatalogo(linhas: LinhaCsvProduto[]): string {
  const registros = linhas.map((item) =>
    [
      texto(item.id),
      texto(item.loja),
      codigo(item.codigo),
      codigo(item.codigoBarras),
      codigo(item.codigoInterno),
      texto(item.produtoBaseId),
      texto(item.nome ?? item.descricao),
      texto(item.grupo),
      texto(item.tipo),
      texto(item.status),
      numero(item.custo),
      numero(item.precoVenda),
      numero(item.margem),
      numero(item.quantidade),
      texto(item.medidaBase),
      String(item.quantidadeCaixa),
      texto(item.ncm),
      texto(item.cest),
      texto(item.categoria),
      texto(item.cstPisCofins),
      numero(item.icms),
      numero(item.reducaoIcms),
      numero(item.aliquotaPis),
      numero(item.aliquotaCofins)
    ].join(";")
  );
  return `\uFEFF${[COLUNAS.join(";"), ...registros].join("\r\n")}\r\n`;
}
