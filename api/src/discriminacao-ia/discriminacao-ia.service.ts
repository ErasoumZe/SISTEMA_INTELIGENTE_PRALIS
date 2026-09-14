import {
  analiseNotaFiscalIaSchema,
  paraCentavos,
  temAlgumaPermissao,
  type AnaliseNotaFiscalIa,
  type CategoriaDiscriminacaoIa,
  type PerfilUsuario
} from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { env } from "../env.js";
import { ErroDominio, proibido } from "../erros.js";
import type { ImagemNotaValidada } from "./imagem-nota.js";
import { extrairNotaFiscalComGemini } from "./gemini-nota-fiscal.js";
import { buscarFornecedorIa, buscarProdutosIa, verificarDuplicidadeIa } from "./discriminacao-ia.repository.js";
import { apenasDigitos } from "../utils.js";

const LIMIAR_DUVIDOSO = 0.8;

function decimalCentavos(centavos: number): string {
  return `${Math.trunc(centavos / 100)}.${String(Math.abs(centavos % 100)).padStart(2, "0")}`;
}

function normalizarDecimal(valor: string | null, casas = 2): string | null {
  if (valor === null) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero
    .toFixed(casas)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function normalizarData(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T12:00:00Z`)) ? valor : null;
}

function permissoesDaCategoria(categoria: CategoriaDiscriminacaoIa) {
  return categoria === "despesa"
    ? (["despesas_criar", "despesas_editar", "despesas_discriminar"] as const)
    : (["mercadorias_criar", "mercadorias_editar", "mercadorias_discriminar"] as const);
}

export async function analisarNotaFiscalIa(
  entrada: { empresaId: string; categoria: CategoriaDiscriminacaoIa; imagem: ImagemNotaValidada },
  perfil: PerfilUsuario
): Promise<AnaliseNotaFiscalIa> {
  if (!podeAcessarEmpresa(perfil, entrada.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  if (!temAlgumaPermissao(perfil.permissoes, permissoesDaCategoria(entrada.categoria))) {
    throw proibido("Permissao insuficiente", "INSUFFICIENT_PERMISSION");
  }
  if (!env.GEMINI_API_KEY) {
    throw new ErroDominio("A leitura por IA ainda nao foi configurada.", 503, "IA_NAO_CONFIGURADA");
  }

  const extraida = await extrairNotaFiscalComGemini(entrada.imagem, {
    chave: env.GEMINI_API_KEY,
    modelo: env.GEMINI_MODEL,
    timeoutMs: env.GEMINI_TIMEOUT_MS
  });
  const cnpj = apenasDigitos(extraida.fornecedorCnpj);
  const fornecedorCnpj = cnpj?.length === 14 ? cnpj : null;
  const chave = apenasDigitos(extraida.chaveAcesso);
  const chaveAcesso = chave?.length === 44 ? chave : null;
  const dataEmissao = normalizarData(extraida.dataEmissao);
  const fornecedor = await buscarFornecedorIa(entrada.empresaId, fornecedorCnpj);
  const produtos = await buscarProdutosIa(
    entrada.empresaId,
    extraida.itens.flatMap((item) => (item.ean ? [item.ean] : []))
  );
  const itens = extraida.itens.flatMap((item) => {
    if (!item.descricao) return [];
    const ean = apenasDigitos(item.ean);
    const produto = ean ? produtos.get(ean) : undefined;
    return [
      {
        descricao: produto?.descricao ?? item.descricao,
        codigo: item.codigo,
        ean,
        quantidade: normalizarDecimal(item.quantidade, 3),
        valorUnitario: normalizarDecimal(item.valorUnitario, 4),
        desconto: normalizarDecimal(item.desconto),
        valorTotal: normalizarDecimal(item.valorTotal),
        produtoId: produto?.id ?? null,
        grupoMercadoriaId: produto?.grupoMercadoriaId ?? null,
        unidadeMedidaId: produto?.unidadeMedidaId ?? null,
        cadastrado: Boolean(produto),
        confianca: item.confianca,
        camposDuvidosos: item.camposDuvidosos
      }
    ];
  });
  const somaItensCentavos = itens.reduce((total, item) => {
    if (item.valorTotal) return total + paraCentavos(item.valorTotal);
    return total + Math.round(Number(item.quantidade ?? 0) * Number(item.valorUnitario ?? 0) * 100);
  }, 0);
  const valorProdutos = normalizarDecimal(extraida.valorProdutos);
  const valorDesconto = normalizarDecimal(extraida.valorDesconto);
  const valorFrete = normalizarDecimal(extraida.valorFrete);
  const valorTotal = normalizarDecimal(extraida.valorTotal);
  const totalCalculadoCentavos =
    paraCentavos(valorProdutos ?? decimalCentavos(somaItensCentavos)) -
    paraCentavos(valorDesconto) +
    paraCentavos(valorFrete);
  const duplicidade = await verificarDuplicidadeIa({
    empresaId: entrada.empresaId,
    chaveAcesso,
    numero: extraida.numero,
    fornecedorId: fornecedor?.id ?? null,
    dataEmissao,
    valorTotal
  });
  const camposDuvidosos = [...new Set(extraida.camposDuvidosos)];
  if (!fornecedor && fornecedorCnpj) camposDuvidosos.push("fornecedor.nao_cadastrado");
  if (!extraida.documentoLegivel) camposDuvidosos.push("documento");
  if (extraida.confiancas.fornecedor < LIMIAR_DUVIDOSO) camposDuvidosos.push("fornecedor");
  if (extraida.confiancas.numero < LIMIAR_DUVIDOSO) camposDuvidosos.push("numero");
  if (extraida.confiancas.dataEmissao < LIMIAR_DUVIDOSO) camposDuvidosos.push("dataEmissao");

  const avisos = [...extraida.observacoes];
  if (entrada.categoria === "despesa" && itens.length) {
    avisos.push("Em despesas, relacione cada item a um Patrimonio ou Colaborador antes de salvar.");
  }
  if (valorFrete && paraCentavos(valorFrete) > 0) {
    avisos.push("O frete foi extraido para conferencia e nao foi aplicado ao campo Juros.");
  }
  if (duplicidade.duplicada && duplicidade.motivo) avisos.push(duplicidade.motivo);

  return analiseNotaFiscalIaSchema.parse({
    documentoLegivel: extraida.documentoLegivel,
    fornecedor: {
      nome: fornecedor?.nome ?? extraida.fornecedorNome,
      cnpj: fornecedorCnpj,
      fornecedorId: fornecedor?.id ?? null,
      cadastrado: Boolean(fornecedor),
      confianca: extraida.confiancas.fornecedor,
      duvidoso: !fornecedor || extraida.confiancas.fornecedor < LIMIAR_DUVIDOSO
    },
    numero: extraida.numero,
    serie: extraida.serie,
    dataEmissao,
    chaveNfeIdentificada: Boolean(chaveAcesso),
    chaveNfeFinal: chaveAcesso?.slice(-4) ?? null,
    itens,
    valorProdutos,
    valorDesconto,
    valorFrete,
    valorTotal,
    camposDuvidosos,
    validacoes: {
      somaItens: decimalCentavos(somaItensCentavos),
      somaItensConfere: valorProdutos === null ? null : somaItensCentavos === paraCentavos(valorProdutos),
      totalCalculado: decimalCentavos(Math.max(0, totalCalculadoCentavos)),
      valorTotalConfere: valorTotal === null ? null : totalCalculadoCentavos === paraCentavos(valorTotal),
      possivelDuplicata: duplicidade.duplicada,
      motivoDuplicidade: duplicidade.motivo
    },
    avisos
  });
}
