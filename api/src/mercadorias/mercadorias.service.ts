import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { MercadoriaCriada, MercadoriaDto, MercadoriaPayload, MercadoriasQuery } from "@padaria/shared/mercadorias";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos
} from "../lancamentos/lancamentos.dominio.js";
import { validarReferenciasMercadoria } from "../lancamentos/lancamentos.dominio.js";
import { deveComputarMercadoria } from "./mercadorias.regras.js";
import { criarMercadoriaRepository, listarMercadoriasRepository } from "./mercadorias.repository.js";

export function validarMercadoria(dados: MercadoriaPayload): void {
  if (!dados.grupoMercadoriaId && !dados.itensMercadoria.length) {
    throw new Error("Grupo ou itens de mercadoria obrigatorios");
  }
  if (dados.itensMercadoria.length) {
    const valores = dados.itensMercadoria.map((item) => item.valorTotal);
    if (!somaConfereCentavos(valores, dados.valorOriginal))
      throw new Error("Soma das mercadorias deve bater com o valor original");
  }
}

export async function listarMercadorias(
  query: MercadoriasQuery,
  empresasPermitidasIds: string[] | null
): Promise<MercadoriaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarMercadoriasRepository(query, empresasPermitidasIds);
}

export async function criarMercadoria(dados: MercadoriaPayload, perfil: PerfilUsuario): Promise<MercadoriaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "mercadorias_criar");
  validarMercadoria(dados);
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasMercadoria(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const computar = deveComputarMercadoria(dados.temNotaFiscal, dados.computar);
    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    const mercadoria = await criarMercadoriaRepository(dados, computar, perfil.usuarioId, caixa.id, tx);
    return { id: mercadoria.id, computar };
  });
}
