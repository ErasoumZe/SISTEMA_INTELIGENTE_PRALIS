import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  MercadoriaCriada,
  MercadoriaDto,
  MercadoriaPayload,
  MercadoriasQuery
} from "@padaria/shared/mercadorias";
import { arredondar, exigirPermissaoLancamento, obterCaixaParaLancamento } from "./mercadorias.lancamento.js";
import { validarReferenciasMercadoria } from "./mercadorias.lancamento.js";
import { deveComputarMercadoria } from "./mercadorias.regras.js";
import { criarMercadoriaRepository, listarMercadoriasRepository } from "./mercadorias.repository.js";

export function validarMercadoria(dados: MercadoriaPayload): void {
  if (!dados.grupoMercadoriaId && !dados.itensMercadoria.length) {
    throw new Error("Grupo ou itens de mercadoria obrigatorios");
  }
  if (dados.itensMercadoria.length) {
    const soma = arredondar(dados.itensMercadoria.reduce((total, item) => total + item.valorTotal, 0));
    if (soma !== arredondar(dados.valorOriginal)) throw new Error("Soma das mercadorias deve bater com o valor original");
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
  const referenciaInvalida = await validarReferenciasMercadoria(dados);
  if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

  const computar = deveComputarMercadoria(dados.temNotaFiscal, dados.computar);
  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId);
  const mercadoria = await criarMercadoriaRepository(dados, computar, perfil.usuarioId, caixa.id);
  return { id: mercadoria.id, computar };
}

