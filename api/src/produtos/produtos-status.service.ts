import { fraseDeInativacaoEmLote, type AlterarStatusProdutosPayload } from "@padaria/shared/produtos";
import { alterarStatusDeProdutosRepository } from "./produtos-status.repository.js";

/** Lote de status fora da regra: mais de um produto sem ser administrador, ou para ativar. */
export class StatusEmLoteNaoPermitidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "StatusEmLoteNaoPermitidoError";
  }
}

/**
 * Ativa/inativa produtos da loja. Um produto: quem edita produto. Varios: so o administrador, so
 * para inativar e com a frase "INATIVAR N PRODUTOS" — o lote nao pode sair de um clique perdido.
 *
 * Devolve os ids alterados e os ignorados (inexistentes ou de outra loja — indistinguiveis de
 * proposito, para nao permitir enumerar o cadastro alheio).
 */
export async function alterarStatusDeProdutos(
  entrada: AlterarStatusProdutosPayload,
  ator: { administrador: boolean; empresasPermitidas: string[] }
) {
  if (!ator.empresasPermitidas.includes(entrada.empresaId)) throw new Error("Empresa nao permitida");
  const ids = [...new Set(entrada.ids)];
  if (ids.length > 1) {
    if (!ator.administrador) {
      throw new StatusEmLoteNaoPermitidoError("Apenas o administrador inativa produtos em lote.");
    }
    if (entrada.status !== "inativo") {
      throw new StatusEmLoteNaoPermitidoError("Em lote, só é possível inativar.");
    }
    const frase = fraseDeInativacaoEmLote(ids.length);
    if ((entrada.confirmacao ?? "").toUpperCase() !== frase) {
      throw new Error(`Digite "${frase}" para confirmar.`);
    }
  }
  const alterados = await alterarStatusDeProdutosRepository(entrada.empresaId, ids, entrada.status);
  return { alterados, ignorados: ids.filter((id) => !alterados.includes(id)) };
}
