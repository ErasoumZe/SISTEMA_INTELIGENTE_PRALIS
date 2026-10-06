import type { DadosExternos } from "@padaria/shared/api";
import {
  estruturaMenuEmpresaSchema,
  normalizarEstruturaMenuEmpresa,
  type EstruturaMenuEmpresa,
  type MenuEmpresaPayload
} from "@padaria/shared";
import {
  obterEstruturaMenuEmpresaRepository,
  salvarEstruturaMenuEmpresaRepository
} from "./menu-empresa.repository.js";

/** Configuração ausente/corrompida preserva o menu padrão do front, sem quebrar a navegação. */
export async function carregarMenuEmpresa(empresaId: string): Promise<EstruturaMenuEmpresa | null> {
  const estrutura = await obterEstruturaMenuEmpresaRepository(empresaId);
  const validada = estruturaMenuEmpresaSchema.safeParse(estrutura as DadosExternos);
  return validada.success ? normalizarEstruturaMenuEmpresa(validada.data) : null;
}

export async function atualizarMenuEmpresa(payload: MenuEmpresaPayload): Promise<EstruturaMenuEmpresa> {
  const estrutura = normalizarEstruturaMenuEmpresa(payload.estrutura);
  await salvarEstruturaMenuEmpresaRepository(payload.empresaId, estrutura);
  return estrutura;
}
