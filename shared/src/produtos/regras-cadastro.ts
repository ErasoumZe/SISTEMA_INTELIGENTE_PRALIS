/**
 * Regras de ENTRADA do cadastro de produto, portadas do app oficial em producao (R-222). Funcoes
 * PURAS: a tela usa para avisar enquanto a pessoa digita, a API usa para recusar o que chega.
 *
 * Sao regras de entrada, nao invariantes do dado: cadastro legado que as viola continua sendo lido
 * e importado (o oficial separa `importProductSchema` de `createProductSchema` pelo mesmo motivo).
 */

/** Tecla da balanca: valor fixo 000 confirmado para a TNP; produto que nao vai para a balanca fica sem tecla. */
export const TECLA_BALANCA_FIXA = 0;

export interface ErroDeCampo {
  campo: "estoqueMin" | "estoqueMax";
  mensagem: string;
}

/**
 * Estoque minimo e maximo em funcao da Qt. embalagem. O estoque e comprado e guardado em embalagem
 * fechada: pedir 15 quando a caixa tem 10 nao existe — ou sao 10, ou sao 20.
 *  - minimo: multiplo da embalagem e pelo menos uma embalagem inteira;
 *  - maximo: multiplo da embalagem e ESTRITAMENTE maior que o minimo.
 * Vazio ou zero nao e validado.
 */
export function validarEstoquePorEmbalagem(entrada: {
  quantidadeCaixa: number | null | undefined;
  estoqueMin: number | null | undefined;
  estoqueMax: number | null | undefined;
}): ErroDeCampo[] {
  const erros: ErroDeCampo[] = [];
  const q = entrada.quantidadeCaixa ?? null;
  const min = entrada.estoqueMin ?? null;
  const max = entrada.estoqueMax ?? null;
  const multiplo = (valor: number, base: number) => Number.isInteger(valor / base);

  if (q != null && q > 0) {
    if (min != null && min > 0) {
      if (min < q) {
        erros.push({
          campo: "estoqueMin",
          mensagem: `Estoque mínimo não pode ser menor que a Qt. embalagem (${q}). Use ${q} ou mais.`
        });
      } else if (!multiplo(min, q)) {
        erros.push({
          campo: "estoqueMin",
          mensagem: `Estoque mínimo deve ser múltiplo da Qt. embalagem (${q}). Ex.: ${q}, ${q * 2}, ${q * 3}.`
        });
      }
    }
    if (max != null && max > 0 && !multiplo(max, q)) {
      erros.push({
        campo: "estoqueMax",
        mensagem: `Estoque máximo deve ser múltiplo da Qt. embalagem (${q}). Ex.: ${q * 2}, ${q * 3}, ${q * 4}.`
      });
    }
  }

  // Vale com ou sem embalagem: maximo igual ao minimo nao e faixa nenhuma.
  if (min != null && max != null && min > 0 && max > 0 && max <= min) {
    erros.push({ campo: "estoqueMax", mensagem: `Estoque máximo deve ser maior que o mínimo (${min}).` });
  }
  return erros;
}

/** Produto que vai para a balanca exige a validade em dias, inteira, de 0 a 999. */
export function validarBalanca(entrada: {
  pesavel: boolean | null | undefined;
  validadeBalanca: number | null | undefined;
}): string[] {
  if (entrada.pesavel !== true) return [];
  const dias = entrada.validadeBalanca;
  if (typeof dias !== "number" || !Number.isInteger(dias) || dias < 0 || dias > 999) {
    return ["Informe a validade da balança em dias (0 a 999)."];
  }
  return [];
}

/** Na CRIACAO, EAN vazio recebe o codigo interno (oficial). EAN informado fica exatamente como veio. */
export function codigoBarrasNaCriacao(
  codigoBarras: string | null | undefined,
  codigoInterno: string | null | undefined
): string | null {
  if (codigoBarras != null && codigoBarras.trim() !== "") return codigoBarras;
  return codigoInterno != null && codigoInterno !== "" ? codigoInterno : null;
}

const CAMPOS_DESCRITIVOS = [
  "descricao",
  "nomeCatalogo",
  "marca",
  "setorEstoque",
  "setorVenda1",
  "setorVenda2",
  "localVenda1",
  "localVenda2"
] as const;

const maiusculas = (valor: string) => valor.toLocaleUpperCase("pt-BR");

type ComTextosDescritivos = { [K in (typeof CAMPOS_DESCRITIVOS)[number]]?: string | null | undefined } & {
  transformacao?: { produtoReceituario?: string | null | undefined } | null | undefined;
  fiscal?: { categoriaFiscal?: string | null | undefined } | null | undefined;
};

/** Apenas textos descritivos digitados no cadastro viram maiusculas; codigos, URLs e enums ficam intactos. */
export function normalizarTextosProduto<T extends ComTextosDescritivos>(entrada: T): T {
  const resultado = { ...entrada };
  for (const campo of CAMPOS_DESCRITIVOS) {
    const valor = resultado[campo];
    if (typeof valor === "string") (resultado as ComTextosDescritivos)[campo] = maiusculas(valor);
  }
  if (resultado.transformacao?.produtoReceituario) {
    resultado.transformacao = {
      ...resultado.transformacao,
      produtoReceituario: maiusculas(resultado.transformacao.produtoReceituario)
    };
  }
  if (resultado.fiscal?.categoriaFiscal) {
    resultado.fiscal = { ...resultado.fiscal, categoriaFiscal: maiusculas(resultado.fiscal.categoriaFiscal) };
  }
  return resultado;
}
