export const permissoes = [
  "entradas",
  "transferencias",
  "despesas",
  "mercadorias",
  "retiradas",
  "operar_caixa",
  "gerenciar_caixas",
  "fechamento_com_diferenca",
  "relatorio_produtos_mais_vendidos",
  "cadastro_malotes",
  "cadastro_contas",
  "cadastro_grupos_despesas",
  "cadastro_grupos_mercadorias",
  "cadastro_unidades_medida",
  "cadastro_grupos_retiradas",
  "cadastro_areas_setores",
  "cadastro_empresas",
  "cadastro_usuarios",
  "cadastro_permissoes",
  "configurar_tema",
  "promocoes",
  "relatorio_faltas_atestados_colaboradores",
  "relatorio_advertencia_suspensao_colaboradores",
  "pedidos",
  "perdas_sobras",
  "estoque_produtos",
  "relatorio_dre",
  "cadastro_avaliacao_clientes",
  "cadastro_fornecedores",
  "cadastro_produtos",
  "cadastro_colaboradores",
  "avaliacao_qualidade",
  "avaliacao_colaboradores",
  "relatorio_fiscal_produtos",
  "cadastro_fiscal_produtos",
  "cadastro_patrimonio",
  "cadastro_ficha_tecnica",
  "cadastro_ingredientes",
  "contas_pagar",
  "vendas_crediario",
  "notas_fiscais",
  "cadastro_grupos_vendas",
  "cadastro_pdv",
  "cadastro_formas_pagamento",
  "integracoes",
  "folha_ponto"
] as const;

export type Permissao = (typeof permissoes)[number];

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
}
