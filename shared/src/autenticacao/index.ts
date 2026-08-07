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
  // Ciclo de vida R7/R10 (Fase 1). Transferencia nao tem dataPagamento (movimento imediato), entao
  // pagar/*_dpago ficam so no catalogo/distribuicao; a acao enforcada aqui e futura (M3).
  "transferencias_pagar",
  "transferencias_efetuar",
  "transferencias_conferir",
  "transferencias_visualizar_dpago",
  "transferencias_editar_dpago",
  "transferencias_excluir_dpago",
  "despesas_visualizar",
  "despesas_criar",
  "despesas_editar",
  "despesas_excluir",
  "despesas_discriminar",
  "despesas_pagar",
  "despesas_efetuar",
  "despesas_conferir",
  "despesas_visualizar_dpago",
  "despesas_editar_dpago",
  "despesas_excluir_dpago",
  "mercadorias_visualizar",
  "mercadorias_criar",
  "mercadorias_editar",
  "mercadorias_excluir",
  "mercadorias_discriminar",
  "mercadorias_aprovar",
  "mercadorias_pagar",
  "mercadorias_efetuar",
  "mercadorias_conferir",
  "mercadorias_visualizar_dpago",
  "mercadorias_editar_dpago",
  "mercadorias_excluir_dpago",
  "retiradas_visualizar",
  "retiradas_criar",
  "retiradas_editar",
  "retiradas_excluir",
  "retiradas_pagar",
  "retiradas_efetuar",
  "retiradas_conferir",
  "retiradas_visualizar_dpago",
  "retiradas_editar_dpago",
  "retiradas_excluir_dpago",
  // Recorrencia de lancamento (PROJECT_BRAIN/17, D3): "so Admin, Gerencia e Financeiro podem usar
  // recorrencia". E UMA permissao para os tres dominios (despesa/mercadoria/retirada) e nao uma por
  // dominio, porque a regra do negocio e sobre QUEM cria serie, nao sobre onde. Quem nao tem recebe
  // 403 no servidor mesmo que consiga mexer na tela.
  "lancamentos_recorrencia_criar",
  "caixa_operar",
  "caixas_gerenciar",
  "caixa_alterar_horario",
  "fechamento_com_diferenca_visualizar",
  "relatorio_produtos_visualizar",
  "relatorio_vendas_visualizar",
  "relatorio_vendas_comprovantes_criar",
  "contas_pagar_visualizar",
  // Lacres = selo do MOVIMENTO (registro do lacre de uma transferencia de saida/retorno), operado
  // pela Tesouraria. O cadastro de malotes morreu com a R-040: malote-entidade nao existe mais.
  "cadastro_lacres_visualizar",
  "cadastro_lacres_criar",
  "cadastro_lacres_editar",
  "cadastro_lacres_excluir",
  "cadastro_contas_visualizar",
  "cadastro_contas_criar",
  "cadastro_contas_editar",
  "cadastro_contas_excluir",
  // Vinculo usuario<->conta (FOTO 4): ESCOPO de conta por usuario — quais contas cada um opera e quem
  // confirma recebimento. Nao e permissao de tela; e cadastro de escopo, operado pela Gerencia.
  "cadastro_contas_usuarios_visualizar",
  "cadastro_contas_usuarios_criar",
  "cadastro_contas_usuarios_editar",
  "cadastro_contas_usuarios_excluir",
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
  "cadastro_turnos_visualizar",
  "cadastro_turnos_criar",
  "cadastro_turnos_editar",
  "cadastro_turnos_excluir",
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
  "pedidos_criar",
  "pedidos_editar",
  "pedidos_aprovar",
  "perdas_sobras_visualizar",
  "estoque_produtos_visualizar",
  "relatorio_dre_visualizar",
  "avaliacao_qualidade_visualizar",
  "avaliacao_colaboradores_visualizar",
  "relatorio_fiscal_visualizar",
  "cadastro_fiscal_produtos_visualizar",
  "cadastro_patrimonio_visualizar",
  "cadastro_patrimonio_criar",
  "cadastro_patrimonio_editar",
  "cadastro_patrimonio_excluir",
  "cadastro_ficha_tecnica_visualizar",
  "cadastro_ingredientes_visualizar",
  "notas_fiscais_visualizar",
  "notas_fiscais_importar",
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
  "menu_turnos_mostrar",
  "menu_turnos_desabilitado",
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

// Permissoes que RESTRINGEM em vez de conceder: quem as tem fica preso ao caixa aberto — some do
// menu e as listagens ficam presas ao proprio caixa (ver resolverEscopoListagemPorCaixa). Existem
// para o cargo Caixa, que so opera com o caixa aberto.
export const permissoesRestricao = permissoes.filter((permissao) =>
  permissao.endsWith("_somente_caixa_aberto")
) as readonly Permissao[];

// O que "todas as permissoes" significa (usuario_admin / cargo com `todas`): o catalogo INTEIRO
// MENOS as restricoes. O dono do sistema nao herda restricao — antes o admin recebia as flags
// `_somente_caixa_aberto` junto com tudo e, sem caixa aberto, PERDIA Lancamentos/Entradas do menu e
// via listagens vazias (decisao do Jose, 29/07).
export const permissoesAcessoTotal = permissoes.filter(
  (permissao) => !permissoesRestricao.includes(permissao)
) as readonly Permissao[];

export function ehPermissaoRestricao(permissao: Permissao): boolean {
  return permissoesRestricao.includes(permissao);
}

// DE-PARA oficial (Fase 1) do modelo de 9 acoes do Xmind. Mantemos os codigos LEGADOS como
// CANONICOS (nada e renomeado agora): `*_criar` desempenha o papel da acao "lancar"; visualizar/
// editar/excluir ja casam com as acoes sem sufixo D/Pago. As acoes novas (pagar/efetuar/conferir/
// *_dpago) ganharam codigo proprio. Este de-para documenta a equivalencia para a UI de grade
// agrupar (Fase 2) e para o script de renome (Fase 3) — SEM efeito no runtime hoje.
export const mapaPermissoesLegadoParaAcoes = {
  entradas_criar: "entradas_lancar",
  transferencias_criar: "transferencias_lancar",
  despesas_criar: "despesas_lancar",
  mercadorias_criar: "mercadorias_lancar",
  retiradas_criar: "retiradas_lancar"
} as const satisfies Partial<Record<Permissao, string>>;

// Dominios de lancamento com dataPagamento (o "D/Pago" e enforcavel na Fase 1). Transferencia e
// entradas ficam de fora do enforcement de pagamento (transferencia = movimento imediato sem
// dataPagamento; entradas = venda por integracao).
export const dominiosLancamentoPagavel = ["despesas", "mercadorias", "retiradas"] as const;
export type DominioLancamentoPagavel = (typeof dominiosLancamentoPagavel)[number];

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

function normalizarCargo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase();
}

// Perfis de RETAGUARDA: lancam sem estar presos a um caixa e escolhem a conta livremente. Era
// `podeTransferirSemCaixa`, exclusiva da transferencia (R-032); virou a fonte unica das QUATRO
// saidas para que "quem e livre" nao tenha duas definicoes que divergem com o tempo.
//
// Mora em `shared` — e nao na API — porque a TELA precisa da mesma resposta: o painel de programar
// entrega ao cofre so existe para a retaguarda, e o servico so aceita a retaguarda. Copiar a lista
// de cargos no front criaria duas verdades, e a primeira mudanca de cargo deixaria a tela
// oferecendo um botao que a API recusa. Foi exatamente esse o defeito corrigido.
export function podeLancarSemCaixa(perfil: Pick<PerfilUsuario, "role" | "cargos">): boolean {
  if (perfil.role === "usuario_admin" || perfil.role === "admin") return true;
  const prefixosLiberados = ["tesouraria", "gerencia", "gerente", "financeiro", "diretor geral"];
  return perfil.cargos.some((cargo) =>
    prefixosLiberados.some((prefixo) => normalizarCargo(cargo.nome).startsWith(prefixo))
  );
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
