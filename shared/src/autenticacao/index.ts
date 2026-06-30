import type { EmpresaSessao } from "../tema/index.js";

export const permissoes = [
  "entradas_visualizar",
  "entradas_criar",
  "entradas_editar",
  "entradas_excluir",
  "transferencias_visualizar",
  "transferencias_criar",
  "transferencias_editar",
  "transferencias_excluir",
  "despesas_visualizar",
  "despesas_criar",
  "despesas_editar",
  "despesas_excluir",
  "mercadorias_visualizar",
  "mercadorias_criar",
  "mercadorias_editar",
  "mercadorias_excluir",
  "retiradas_visualizar",
  "retiradas_criar",
  "retiradas_editar",
  "retiradas_excluir",
  "caixa_operar",
  "caixas_gerenciar",
  "fechamento_com_diferenca_visualizar",
  "relatorio_produtos_visualizar",
  "relatorio_vendas_visualizar",
  "relatorio_vendas_comprovantes_criar",
  "contas_pagar_visualizar",
  "cadastro_malotes_visualizar",
  "cadastro_malotes_criar",
  "cadastro_malotes_editar",
  "cadastro_malotes_excluir",
  "cadastro_contas_visualizar",
  "cadastro_contas_criar",
  "cadastro_contas_editar",
  "cadastro_contas_excluir",
  "cadastro_grupos_visualizar",
  "cadastro_grupos_criar",
  "cadastro_grupos_editar",
  "cadastro_grupos_excluir",
  "cadastro_unidades_medida_visualizar",
  "cadastro_unidades_medida_criar",
  "cadastro_unidades_medida_editar",
  "cadastro_unidades_medida_excluir",
  "cadastro_areas_setores_visualizar",
  "cadastro_areas_setores_criar",
  "cadastro_areas_setores_editar",
  "cadastro_areas_setores_excluir",
  "cadastro_empresas_visualizar",
  "cadastro_empresas_criar",
  "cadastro_empresas_editar",
  "cadastro_empresas_excluir",
  "cadastro_usuarios_visualizar",
  "cadastro_usuarios_criar",
  "cadastro_usuarios_editar",
  "cadastro_usuarios_excluir",
  "cadastro_permissoes_visualizar",
  "cadastro_permissoes_criar",
  "cadastro_permissoes_editar",
  "cadastro_permissoes_excluir",
  "cadastro_clientes_visualizar",
  "cadastro_clientes_criar",
  "cadastro_clientes_editar",
  "cadastro_clientes_excluir",
  "cadastro_fornecedores_visualizar",
  "cadastro_fornecedores_criar",
  "cadastro_fornecedores_editar",
  "cadastro_fornecedores_excluir",
  "cadastro_produtos_visualizar",
  "cadastro_produtos_criar",
  "cadastro_produtos_editar",
  "cadastro_produtos_excluir",
  "cadastro_colaboradores_visualizar",
  "cadastro_colaboradores_criar",
  "cadastro_colaboradores_editar",
  "cadastro_colaboradores_excluir",
  "cadastro_pdv_visualizar",
  "cadastro_pdv_criar",
  "cadastro_pdv_editar",
  "cadastro_pdv_excluir",
  "cadastro_formas_pagamento_visualizar",
  "cadastro_formas_pagamento_criar",
  "cadastro_formas_pagamento_editar",
  "cadastro_formas_pagamento_excluir",
  "aparencia_visualizar",
  "aparencia_editar",
  "integracoes_visualizar",
  "integracoes_criar",
  "integracoes_editar",
  "integracoes_excluir",
  "promocoes_visualizar",
  "relatorio_faltas_visualizar",
  "relatorio_advertencias_visualizar",
  "pedidos_visualizar",
  "perdas_sobras_visualizar",
  "estoque_produtos_visualizar",
  "relatorio_dre_visualizar",
  "avaliacao_qualidade_visualizar",
  "avaliacao_colaboradores_visualizar",
  "relatorio_fiscal_visualizar",
  "cadastro_fiscal_produtos_visualizar",
  "cadastro_patrimonio_visualizar",
  "cadastro_ficha_tecnica_visualizar",
  "cadastro_ingredientes_visualizar",
  "notas_fiscais_visualizar",
  "folha_ponto_visualizar",
  "menu_entradas_mostrar",
  "menu_entradas_desabilitado",
  "menu_entradas_somente_caixa_aberto",
  "menu_transferencias_mostrar",
  "menu_transferencias_desabilitado",
  "menu_transferencias_somente_caixa_aberto",
  "menu_despesas_mostrar",
  "menu_despesas_desabilitado",
  "menu_despesas_somente_caixa_aberto",
  "menu_mercadorias_mostrar",
  "menu_mercadorias_desabilitado",
  "menu_mercadorias_somente_caixa_aberto",
  "menu_retiradas_mostrar",
  "menu_retiradas_desabilitado",
  "menu_retiradas_somente_caixa_aberto",
  "menu_fechamento_mostrar",
  "menu_fechamento_desabilitado",
  "menu_fechamento_somente_caixa_aberto",
  "menu_relatorio_produtos_mostrar",
  "menu_relatorio_produtos_desabilitado",
  "menu_relatorio_produtos_somente_caixa_aberto",
  "menu_malotes_mostrar",
  "menu_malotes_desabilitado",
  "menu_caixa_mostrar",
  "menu_caixa_desabilitado",
  "menu_promocoes_mostrar",
  "menu_promocoes_desabilitado",
  "menu_relatorio_faltas_mostrar",
  "menu_relatorio_faltas_desabilitado",
  "menu_relatorio_advertencias_mostrar",
  "menu_relatorio_advertencias_desabilitado",
  "menu_pedidos_mostrar",
  "menu_pedidos_desabilitado",
  "menu_perdas_sobras_mostrar",
  "menu_perdas_sobras_desabilitado",
  "menu_estoque_produtos_mostrar",
  "menu_estoque_produtos_desabilitado",
  "menu_relatorio_dre_mostrar",
  "menu_relatorio_dre_desabilitado",
  "menu_clientes_mostrar",
  "menu_clientes_desabilitado",
  "menu_fornecedores_mostrar",
  "menu_fornecedores_desabilitado",
  "menu_produtos_mostrar",
  "menu_produtos_desabilitado",
  "menu_colaboradores_mostrar",
  "menu_colaboradores_desabilitado",
  "menu_folha_ponto_mostrar",
  "menu_folha_ponto_desabilitado",
  "menu_avaliacao_qualidade_mostrar",
  "menu_avaliacao_qualidade_desabilitado",
  "menu_avaliacao_colaboradores_mostrar",
  "menu_avaliacao_colaboradores_desabilitado",
  "menu_relatorio_fiscal_mostrar",
  "menu_relatorio_fiscal_desabilitado",
  "menu_fiscal_produtos_mostrar",
  "menu_fiscal_produtos_desabilitado",
  "menu_patrimonio_mostrar",
  "menu_patrimonio_desabilitado",
  "menu_ficha_tecnica_mostrar",
  "menu_ficha_tecnica_desabilitado",
  "menu_ingredientes_mostrar",
  "menu_ingredientes_desabilitado",
  "menu_contas_pagar_mostrar",
  "menu_contas_pagar_desabilitado",
  "menu_relatorio_vendas_mostrar",
  "menu_relatorio_vendas_desabilitado",
  "menu_notas_fiscais_mostrar",
  "menu_notas_fiscais_desabilitado",
  "menu_pdv_mostrar",
  "menu_pdv_desabilitado",
  "menu_formas_pagamento_mostrar",
  "menu_formas_pagamento_desabilitado",
  "menu_integracoes_mostrar",
  "menu_integracoes_desabilitado",
  "menu_contas_mostrar",
  "menu_contas_desabilitado",
  "menu_empresas_mostrar",
  "menu_empresas_desabilitado",
  "menu_grupos_mostrar",
  "menu_grupos_desabilitado",
  "menu_unidades_mostrar",
  "menu_unidades_desabilitado",
  "menu_areas_setores_mostrar",
  "menu_areas_setores_desabilitado",
  "menu_usuarios_mostrar",
  "menu_usuarios_desabilitado",
  "menu_permissoes_mostrar",
  "menu_permissoes_desabilitado",
  "menu_aparencia_mostrar",
  "menu_aparencia_desabilitado"
] as const;

export type Permissao = (typeof permissoes)[number];

export type RegrasPermissoes = Partial<Record<Permissao, boolean>>;

export function temPermissao(
  permissoesUsuario: readonly Permissao[] | null | undefined,
  permissao: Permissao
): boolean {
  return Boolean(permissoesUsuario?.includes(permissao));
}

export function temAlgumaPermissao(
  permissoesUsuario: readonly Permissao[] | null | undefined,
  permissoesNecessarias: readonly Permissao[]
): boolean {
  return permissoesNecessarias.some((permissao) => temPermissao(permissoesUsuario, permissao));
}

export function temTodasPermissoes(
  permissoesUsuario: readonly Permissao[] | null | undefined,
  permissoesNecessarias: readonly Permissao[]
): boolean {
  return permissoesNecessarias.every((permissao) => temPermissao(permissoesUsuario, permissao));
}

function valorRegraPermissao(regras: RegrasPermissoes | null | undefined, permissao: Permissao): boolean | undefined {
  const valor = regras?.[permissao];
  return typeof valor === "boolean" ? valor : undefined;
}

export function resolverPermissoesEfetivas(
  camadas: readonly (readonly (RegrasPermissoes | null | undefined)[])[]
): Permissao[] {
  const efetivas = new Set<Permissao>();

  for (const camada of camadas) {
    const decisoes = new Map<Permissao, boolean>();
    for (const regras of camada) {
      for (const permissao of permissoes) {
        const permitir = valorRegraPermissao(regras, permissao);
        if (permitir === undefined) continue;
        if (permitir === false || !decisoes.has(permissao)) decisoes.set(permissao, permitir);
      }
    }
    for (const [permissao, permitir] of decisoes) {
      if (permitir) efetivas.add(permissao);
      else efetivas.delete(permissao);
    }
  }

  return permissoes.filter((permissao) => efetivas.has(permissao));
}

export const rolesUsuario = ["usuario_comum", "usuario_admin", "admin"] as const;

export type RoleUsuario = (typeof rolesUsuario)[number];

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface CargoPerfil {
  id: string;
  nome: string;
}

export interface PerfilUsuario {
  usuarioId: string;
  empresaId?: string | null;
  empresaIds?: string[];
  colaboradorId: string;
  setorId?: string | null;
  cargoIds: string[];
  cargos: CargoPerfil[];
  role: RoleUsuario;
  nome: string;
  email: string;
  permissoes: Permissao[];
}

export interface AuthSession {
  user: PublicUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date | string;
  };
  perfil?: PerfilUsuario;
  empresas?: EmpresaSessao[];
}
