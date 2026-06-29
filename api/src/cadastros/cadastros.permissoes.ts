import type { Permissao } from "@padaria/shared";

const permissaoCadastroPorTipo: Record<string, Permissao> = {
  empresas: "cadastro_empresas",
  contas: "cadastro_contas",
  pdvs: "cadastro_pdv",
  grupos: "cadastro_grupos_despesas",
  unidades: "cadastro_unidades_medida",
  areas: "cadastro_areas_setores",
  areas_setores: "cadastro_areas_setores",
  setores: "cadastro_areas_setores",
  cargos: "cadastro_colaboradores",
  usuarios: "cadastro_usuarios",
  permissoes: "cadastro_permissoes",
  malotes: "cadastro_malotes",
  fornecedores: "cadastro_fornecedores",
  produtos: "cadastro_produtos",
  colaboradores: "cadastro_colaboradores",
  "formas-pagamento": "cadastro_formas_pagamento",
  formas_pagamento: "cadastro_formas_pagamento"
};

export function permissaoCadastro(tipo: string): Permissao | undefined {
  return permissaoCadastroPorTipo[tipo];
}
