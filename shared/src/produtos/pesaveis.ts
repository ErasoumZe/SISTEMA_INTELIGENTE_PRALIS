// Porte LITERAL de `stack/api/src/modules/creare/pesaveis-exportacao.ts` e `pesaveis-plano.ts` do app
// oficial (R-222). Nao mudar regra aqui. Unica troca: `unknown` -> `CelulaDoSia` (lint do ERP).

type CelulaDoSia = string | number | boolean | null | undefined;

/** Apenas a classificação operacional explicitamente marcada S no SIA. */
export interface PesavelDaExportacao {
  codigoInterno: string;
  nome: string;
  validadeDias: number;
  status: string;
  linha: number;
}

const cabecalho = (valor: CelulaDoSia) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");

export const codigoSia = (valor: CelulaDoSia): string | null => {
  const texto = String(valor ?? "").trim();
  return /^\d+$/u.test(texto) ? texto.replace(/^0+(?=\d)/u, "") : null;
};

export function lerPesaveisExportacao(linhas: CelulaDoSia[][]) {
  const titulos = (linhas[0] ?? []).map(cabecalho);
  const indice = (titulo: string) => titulos.indexOf(titulo);
  const colunas = {
    codigo: indice("codproduto"),
    nome: indice("descricao"),
    status: indice("status"),
    pesavel: indice("pesavel"),
    validade: indice("validade")
  };
  if (Object.values(colunas).some((i) => i < 0)) {
    throw new Error("A exportação precisa de Cód. produto, Descrição, Status, Pesável e Validade.");
  }

  const vistos = new Set<string>();
  const pesaveis: PesavelDaExportacao[] = [];
  const problemas: string[] = [];
  let produtos = 0;
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    const bruto = String(linha[colunas.codigo] ?? "").trim();
    if (!bruto) continue;
    produtos++;
    const codigo = codigoSia(bruto);
    if (!codigo) {
      problemas.push(`linha ${i + 1}: código inválido`);
      continue;
    }
    if (vistos.has(codigo)) {
      problemas.push(`linha ${i + 1}: código ${codigo} duplicado`);
      continue;
    }
    vistos.add(codigo);
    const classe = String(linha[colunas.pesavel] ?? "")
      .trim()
      .toUpperCase();
    if (classe !== "S" && classe !== "N") {
      problemas.push(`linha ${i + 1}: Pesável diferente de S/N para ${codigo}`);
      continue;
    }
    if (classe === "N") continue;
    const nome = String(linha[colunas.nome] ?? "").trim();
    const validadeBruta = String(linha[colunas.validade] ?? "").trim();
    if (!nome || !/^\d{1,3}$/u.test(validadeBruta)) {
      problemas.push(`linha ${i + 1}: pesável ${codigo} sem nome ou validade de 0 a 999 dias`);
      continue;
    }
    pesaveis.push({
      codigoInterno: codigo,
      nome,
      validadeDias: Number(validadeBruta),
      status: String(linha[colunas.status] ?? "").trim(),
      linha: i + 1
    });
  }
  if (produtos === 0 || pesaveis.length === 0) problemas.push("Nenhum produto pesável encontrado.");
  return { produtos, pesaveis, problemas };
}

export interface ProdutoPesavelAtual {
  id: string;
  codigoInterno: string | null;
  nome: string;
  pesavel: string | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
}

export interface EspelhoPesavelAtual {
  id: string;
  coditem: string;
  pesavel: string | null;
  teclaBalanca: string | null;
  validadeBalanca: string | null;
}

/** Não usa nome, unidade nem barcode como chave de atualização. */
export function planejarPesaveis(
  fonte: PesavelDaExportacao[],
  produtos: ProdutoPesavelAtual[],
  espelhos: EspelhoPesavelAtual[]
) {
  const porCodigo = <T>(linhas: T[], obter: (linha: T) => string | null) => {
    const mapa = new Map<string, T[]>();
    for (const linha of linhas) {
      const codigo = codigoSia(obter(linha));
      if (codigo) mapa.set(codigo, [...(mapa.get(codigo) ?? []), linha]);
    }
    return mapa;
  };
  const produtosPorCodigo = porCodigo(produtos, (p) => p.codigoInterno);
  const espelhosPorCodigo = porCodigo(espelhos, (e) => e.coditem);
  const atualizarProdutos: Array<{ atual: ProdutoPesavelAtual; fonte: PesavelDaExportacao }> = [];
  const atualizarEspelhos: Array<{ atual: EspelhoPesavelAtual; fonte: PesavelDaExportacao }> = [];
  const semProduto: string[] = [];
  const codigoAmbiguo: string[] = [];
  const espelhoAmbiguo: string[] = [];
  const semEspelho: string[] = [];
  let jaCorretos = 0;

  for (const item of fonte) {
    const candidatos = produtosPorCodigo.get(item.codigoInterno) ?? [];
    if (!candidatos.length) {
      semProduto.push(item.codigoInterno);
      continue;
    }
    if (candidatos.length !== 1) {
      codigoAmbiguo.push(item.codigoInterno);
      continue;
    }
    const dePara = espelhosPorCodigo.get(item.codigoInterno) ?? [];
    if (dePara.length > 1) {
      espelhoAmbiguo.push(item.codigoInterno);
      continue;
    }
    const produto = candidatos[0]!;
    const produtoCerto =
      produto.pesavel === "S" && produto.teclaBalanca === 0 && produto.validadeBalanca === item.validadeDias;
    if (!produtoCerto) atualizarProdutos.push({ atual: produto, fonte: item });
    if (!dePara.length) semEspelho.push(item.codigoInterno);
    else {
      const espelho = dePara[0]!;
      if (
        espelho.pesavel !== "S" ||
        Number(espelho.teclaBalanca) !== 0 ||
        Number(espelho.validadeBalanca) !== item.validadeDias ||
        espelho.teclaBalanca === null ||
        espelho.validadeBalanca === null
      ) {
        atualizarEspelhos.push({ atual: espelho, fonte: item });
      }
    }
    if (produtoCerto && (!dePara.length || !atualizarEspelhos.some((e) => e.fonte === item))) jaCorretos++;
  }
  return { atualizarProdutos, atualizarEspelhos, semProduto, codigoAmbiguo, espelhoAmbiguo, semEspelho, jaCorretos };
}

export const CONFIRMACAO_PESAVEIS = "ATUALIZAR PESAVEIS TNP";
