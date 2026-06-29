import type { Permissao } from "@padaria/shared";

const permissaoCadastroPorTipo: Record<string, Permissao> = {
  empresas: "cadastro_empresas_visualizar",
  contas: "cadastro_contas_visualizar",
  pdvs: "cadastro_pdv_visualizar",
  grupos: "cadastro_grupos_visualizar",
  "grupos-despesas": "cadastro_grupos_visualizar",
  "grupos-mercadorias": "cadastro_grupos_visualizar",
  "grupos-retiradas": "cadastro_grupos_visualizar",
  "grupos-vendas": "cadastro_grupos_visualizar",
  unidades: "cadastro_unidades_medida_visualizar",
  "unidades-medida": "cadastro_unidades_medida_visualizar",
  areas: "cadastro_areas_setores_visualizar",
  areas_setores: "cadastro_areas_setores_visualizar",
  setores: "cadastro_areas_setores_visualizar",
  cargos: "cadastro_colaboradores_visualizar",
  usuarios: "cadastro_usuarios_visualizar",
  permissoes: "cadastro_permissoes_visualizar",
  malotes: "cadastro_malotes_visualizar",
  clientes: "cadastro_clientes_visualizar",
  fornecedores: "cadastro_fornecedores_visualizar",
  produtos: "cadastro_produtos_visualizar",
  colaboradores: "cadastro_colaboradores_visualizar",
  "formas-pagamento": "cadastro_formas_pagamento_visualizar",
  formas_pagamento: "cadastro_formas_pagamento_visualizar"
};

export function permissaoCadastro(tipo: string, acao: "visualizar" | "criar" | "editar" | "excluir" = "visualizar"): Permissao | undefined {
  const permissao = permissaoCadastroPorTipo[tipo];
  if (!permissao || acao === "visualizar") return permissao;
  return permissao.replace(/_visualizar$/, `_${acao}`) as Permissao;
}
