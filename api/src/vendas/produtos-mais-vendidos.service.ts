import { temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { podeOperarCaixa } from "../caixa/caixa-acesso.js";
import { buscarCaixaPorIdRepository } from "../caixa/caixa.repository.js";
import { naoEncontrado, proibido } from "../erros.js";
import { listarProdutosMaisVendidos } from "./produtos-mais-vendidos.repository.js";

// Fechamento cego (R-236) · achado A: somado, o valor por produto do turno dava as vendas do caixa. Quem nao ve vendas
// (PDV 1-3, R-238) recebe so produto e quantidade; PDV 4, Gerencia e Tesouraria recebem o valor.
const VEEM_VALOR: Permissao[] = ["fechamentos_caixa_conferir", "caixas_gerenciar", "entradas_visualizar"];

export type ProdutoMaisVendidoVisivel = { produto: string; quantidade: number; valorTotal?: number };

export async function obterProdutosMaisVendidos(
  empresaId: string,
  caixaId: string | undefined,
  perfil: PerfilUsuario
): Promise<ProdutoMaisVendidoVisivel[]> {
  if (caixaId) {
    // O caixa consultado precisa ser da empresa e do proprio operador (ou de quem gerencia caixas): sem isto, qualquer
    // um com o relatorio lia o turno de outro PDV.
    const caixa = await buscarCaixaPorIdRepository(caixaId);
    if (!caixa || caixa.empresaId !== empresaId || !podeAcessarEmpresa(perfil, caixa.empresaId)) {
      throw naoEncontrado("Caixa nao encontrado");
    }
    if (!podeOperarCaixa(perfil, caixa)) throw proibido("Caixa nao permitido");
  }
  const linhas = await listarProdutosMaisVendidos(empresaId, caixaId);
  const veValor = VEEM_VALOR.some((permissao) => temPermissao(perfil.permissoes, permissao));
  return veValor ? linhas : linhas.map(({ produto, quantidade }) => ({ produto, quantidade }));
}
