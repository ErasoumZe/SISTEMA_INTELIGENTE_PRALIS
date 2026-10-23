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
  "transferencias_conferir",
  "despesas_visualizar",
  "despesas_criar",
  "despesas_editar",
  "despesas_excluir",
  "despesas_discriminar",
  "despesas_pagar",
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
  "mercadorias_visualizar_dpago",
  "mercadorias_editar_dpago",
  "mercadorias_excluir_dpago",
  "retiradas_visualizar",
  "retiradas_criar",
  "retiradas_editar",
  "retiradas_excluir",
  "retiradas_pagar",
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
  "relatorio_fechamento_visualizar",
  "fechamentos_caixa_conferir",
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
  // Cadastro de socios e gestores e administrativo e nao pode herdar permissao de Retiradas.
  // Retiradas apenas consulta os ativos pelo endpoint operacional proprio.
  "cadastro_socios_gestores_visualizar",
  "cadastro_socios_gestores_criar",
  "cadastro_socios_gestores_editar",
  "cadastro_produtos_visualizar",
  "cadastro_produtos_criar",
  "cadastro_produtos_editar",
  "cadastro_produtos_excluir",
  "cadastro_colaboradores_visualizar",
  "cadastro_colaboradores_criar",
  "cadastro_colaboradores_editar",
  "cadastro_colaboradores_excluir",
  // ADM-001 — periodo de teste. DELIBERADAMENTE separadas de `cadastro_colaboradores_*`: quem
  // cadastra colaborador operacional NAO ganha acesso a admissao, e o inverso tambem vale. O
  // pre-cadastro carrega CPF e decisao sobre pessoa em avaliacao; ampliar isso para os
  // consumidores operacionais da lista de colaboradores (Caixa, despesas) seria o oposto da
  // minimizacao que a CX-M05 fez em `GET /api/colaboradores`.
  //
  // `encerrar` e permissao PROPRIA, e nao um caso de `editar`: encerrar exige resultado
  // (aprovado_para_admissao | nao_prosseguir) e e terminal. Quem corrige um erro de digitacao nao
  // e necessariamente quem decide o desfecho do teste.
  "admissoes_testes_visualizar",
  "admissoes_testes_criar",
  "admissoes_testes_editar",
  "admissoes_testes_encerrar",
  "admissoes_testes_cancelar",
  // ADM-002 V0. Permissoes PROPRIAS do processo de admissao: `admissoes_testes_visualizar` NAO
  // abre o processo, e o processo nao abre o teste. A fronteira vale nos dois sentidos, como ja
  // vale entre Admissoes e o cadastro operacional.
  //
  // Iniciar NAO tem permissao propria: quem pode `admissoes_testes_encerrar` inicia, porque
  // iniciar e consequencia de efetivar, nao um ato separado.
  "admissoes_processos_visualizar",
  "admissoes_processos_cancelar",
  // ADM-003 V1A. `criar_direta` e a UNICA entrada de processo sem teste — e por isso ela existe e
  // se chama assim: nao ha "criar processo" generico, porque criar a partir de um teste continua
  // sendo consequencia de efetivar, nunca um ato separado.
  "admissoes_processos_criar_direta",
  // Separada de `criar_direta` porque o bloco interno carrega CTPS, PIS/NIT e o exame: a Gerencia
  // inicia o processo, o DP e quem preenche.
  "admissoes_processos_editar_internos",
  // ADM-003 V2. Emitir e revogar o convite do candidato e ato PROPRIO: quem cria a admissao nao
  // necessariamente e quem manda o link para uma pessoa de fora. Uma permissao para os dois atos,
  // porque revogar e a correcao de emitir — separa-las deixaria alguem podendo abrir e nao fechar.
  "admissoes_processos_convidar",
  // ADM-003 V3. Ver a ficha e revisa-la sao direitos diferentes: conferir o que o candidato
  // mandou nao e o mesmo que aprovar ou devolver. Quem revisa precisa das duas.
  "admissoes_processos_ver_ficha",
  "admissoes_processos_revisar_ficha",
  // Efetivar cria o cadastro operacional e o vínculo de trabalho; não herda criar admissão.
  "admissoes_processos_efetivar",
  "cadastro_pdv_visualizar",
  "cadastro_pdv_criar",
  "cadastro_pdv_editar",
  "cadastro_pdv_excluir",
  "cadastro_turnos_visualizar",
  "cadastro_turnos_criar",
  "cadastro_turnos_editar",
  "cadastro_turnos_excluir",
  // Catalogo de FUNCOES OPERACIONAIS — o que a pessoa faz. Nao confundir com `cargos`, que e o
  // catalogo de ACESSO. Sao TRES chaves, e nao quatro: nao existe `_excluir` porque nao existe
  // exclusao. Funcao sai de circulacao por `ativo = false` e volta pelo mesmo campo — apagar
  // levaria embora a leitura do periodo de teste e do processo que apontam para ela. Conceder uma
  // permissao para um ato que nao existe seria abrir a porta hoje para quem criasse a rota amanha
  // sem reabrir a decisao.
  "cadastro_funcoes_visualizar",
  "cadastro_funcoes_criar",
  "cadastro_funcoes_editar",
  "cadastro_formas_pagamento_visualizar",
  "cadastro_formas_pagamento_criar",
  "cadastro_formas_pagamento_editar",
  "cadastro_formas_pagamento_excluir",
  // R-176 (#152): PERMISSAO DEDICADA para o roteamento financeiro. Nao reusa criar/editar de
  // proposito — o Financeiro tem `cadastro_formas_pagamento_criar` e, sem esta separacao, o
  // destino do dinheiro entraria de carona na criacao de uma forma. Quem renomeia forma nao
  // decide para onde vai o dinheiro. Nasce so no acesso total (usuario_admin).
  "cadastro_formas_pagamento_roteamento",
  "aparencia_visualizar",
  "aparencia_editar",
  "integracoes_visualizar",
  "integracoes_criar",
  "integracoes_editar",
  "integracoes_excluir",
  // Mensagens administrativas para PDV e campanhas de bonificacao. Sao permissoes de EMISSOR e de
  // PAINEL: quem recebe a propria mensagem nao precisa de permissao nenhuma para le-la, confirmar
  // ou fechar — a autorizacao dele e ser o destinatario daquela entrega, na propria empresa.
  "mensagens_admin_enviar",
  "mensagens_admin_visualizar",
  "campanhas_gerenciar",
  "campanhas_visualizar",
  "promocoes_visualizar",
  "relatorio_faltas_visualizar",
  "relatorio_advertencias_visualizar",
  "pedidos_visualizar",
  "pedidos_criar",
  "pedidos_editar",
  "pedidos_aprovar",
  "compras_catalogo_gerir",
  "compras_preco_base_importar",
  // R-221 decisao 10: aprovar compra acima da base (ou sem base, ou barrada pelo teto da rodada).
  // Separada de `pedidos_aprovar` (receber): quem confere a porta nao autoriza gasto fora do envelope.
  "compras_excecao_aprovar",
  "perdas_sobras_visualizar",
  "estoque_produtos_visualizar",
  "conferencias_estoque_visualizar",
  "conferencias_estoque_agendar",
  // Agendamento de pedido (doc 56): ver a agenda e o pedido do dia; gerir = criar, editar, cancelar e conferir.
  "agendamento_pedidos_visualizar",
  "agendamento_pedidos_gerir",
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
  "menu_conferencias_estoque_mostrar",
  "menu_conferencias_estoque_desabilitado",
  "menu_agendamento_pedidos_mostrar",
  "menu_agendamento_pedidos_desabilitado",
  "menu_cadastro_compras_mostrar",
  "menu_cadastro_compras_desabilitado",
  "menu_solicitacao_compra_mostrar",
  "menu_solicitacao_compra_desabilitado",
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
  "menu_admissoes_testes_mostrar",
  "menu_admissoes_testes_desabilitado",
  "menu_admissoes_processos_mostrar",
  "menu_admissoes_processos_desabilitado",
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
  "menu_funcoes_operacionais_mostrar",
  "menu_funcoes_operacionais_desabilitado",
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

const nomesRecursosPermissao: Record<string, string> = {
  entradas: "as entradas de venda",
  transferencias: "as transferências entre caixa, cofre e contas",
  despesas: "as despesas",
  mercadorias: "as mercadorias",
  retiradas: "as retiradas",
  lancamentos_recorrencia: "as séries de lançamentos recorrentes",
  caixa: "o caixa do PDV",
  caixas: "a gestão e o histórico dos caixas",
  fechamento_com_diferenca: "as divergências de fechamento",
  relatorio_produtos: "o relatório de produtos mais vendidos",
  relatorio_vendas: "o relatório de vendas",
  relatorio_vendas_comprovantes: "os comprovantes de venda",
  contas_pagar: "as contas a pagar",
  cadastro_lacres: "os lacres de transferências",
  cadastro_contas: "as contas financeiras",
  cadastro_contas_usuarios: "os vínculos de pessoas às contas",
  cadastro_grupos: "os grupos de lançamento",
  cadastro_unidades_medida: "as unidades de medida",
  cadastro_areas_setores: "as áreas e setores",
  cadastro_empresas: "as empresas",
  cadastro_usuarios: "os usuários",
  cadastro_permissoes: "as permissões de usuários",
  cadastro_clientes: "os clientes",
  cadastro_fornecedores: "os fornecedores",
  cadastro_socios_gestores: "os sócios e gestores",
  cadastro_produtos: "os produtos",
  cadastro_colaboradores: "os colaboradores",
  cadastro_pdv: "os PDVs e maquininhas vinculadas",
  cadastro_turnos: "os turnos",
  cadastro_funcoes: "as funções operacionais",
  cadastro_formas_pagamento: "as formas de pagamento",
  cadastro_formas_pagamento_roteamento: "o destino financeiro das formas de pagamento",
  aparencia: "a aparência do sistema",
  integracoes: "as integrações externas",
  mensagens_admin: "as mensagens administrativas para o PDV",
  campanhas: "as campanhas",
  promocoes: "as promoções",
  relatorio_faltas: "o relatório de faltas e atestados",
  relatorio_advertencias: "o relatório de advertências e suspensões",
  pedidos: "os pedidos",
  compras_catalogo: "o catálogo de produtos dos fornecedores",
  compras_preco_base: "a importação e o histórico de preço-base",
  perdas_sobras: "os registros de perdas e sobras",
  estoque_produtos: "o estoque de produtos",
  relatorio_dre: "o relatório de DRE",
  avaliacao_qualidade: "as avaliações de qualidade",
  avaliacao_colaboradores: "as avaliações de colaboradores",
  relatorio_fiscal: "os relatórios fiscais",
  cadastro_fiscal_produtos: "os dados fiscais dos produtos",
  cadastro_patrimonio: "o patrimônio",
  cadastro_ficha_tecnica: "as fichas técnicas",
  cadastro_ingredientes: "os ingredientes",
  notas_fiscais: "as notas fiscais",
  folha_ponto: "as folhas de ponto",
  admissoes_testes: "os períodos de teste",
  admissoes_processos: "os processos de admissão",
  clientes: "os clientes",
  fornecedores: "os fornecedores",
  socios_gestores: "os sócios e gestores",
  produtos: "os produtos",
  colaboradores: "os colaboradores",
  fiscal_produtos: "os dados fiscais dos produtos",
  patrimonio: "o patrimônio",
  ficha_tecnica: "as fichas técnicas",
  ingredientes: "os ingredientes",
  pdv: "os PDVs e maquininhas vinculadas",
  formas_pagamento: "as formas de pagamento",
  contas: "as contas financeiras",
  empresas: "as empresas",
  grupos: "os grupos de lançamento",
  unidades: "as unidades de medida",
  turnos: "os turnos",
  funcoes_operacionais: "as funções operacionais",
  areas_setores: "as áreas e setores",
  usuarios: "os usuários",
  permissoes: "as permissões de usuários",
  fechamento: "as pendências operacionais",
  historico_caixas: "o histórico dos caixas"
};

const descricoesEspeciaisPermissao: Partial<Record<Permissao, string>> = {
  caixa_operar: "Permite abrir, operar e encaminhar o fechamento do caixa do próprio PDV.",
  caixa_alterar_horario: "Permite corrigir o horário registrado em uma operação de caixa.",
  lancamentos_recorrencia_criar: "Permite criar séries recorrentes de despesas, mercadorias e retiradas.",
  despesas_discriminar: "Permite detalhar os itens que compõem uma despesa já registrada.",
  mercadorias_discriminar: "Permite detalhar os itens e documentos de uma mercadoria já registrada.",
  mercadorias_aprovar: "Permite aprovar ou recusar mercadorias que aguardam conferência.",
  cadastro_formas_pagamento_roteamento:
    "Permite definir para qual conta financeira cada forma de pagamento será encaminhada.",
  admissoes_processos_criar_direta: "Permite iniciar um processo de admissão sem período de teste.",
  admissoes_processos_editar_internos:
    "Permite preencher e alterar os dados internos e documentos do processo de admissão.",
  admissoes_processos_convidar: "Permite emitir ou revogar o convite enviado ao candidato.",
  admissoes_processos_ver_ficha: "Permite consultar a ficha preenchida pelo candidato.",
  admissoes_processos_revisar_ficha: "Permite aprovar ou devolver a ficha do candidato para correção.",
  admissoes_testes_encerrar: "Permite encerrar um período de teste com seu resultado final.",
  admissoes_testes_cancelar: "Permite cancelar um período de teste antes do encerramento.",
  relatorio_vendas_comprovantes_criar: "Permite gerar comprovantes para as vendas consultadas.",
  transferencias_conferir:
    "Permite conferir, aceitar ou recusar transferências recebidas e consultar os anexos do fechamento.",
  relatorio_fechamento_visualizar:
    "Mostra no menu o Relatório de fechamento e permite consultar a fila e a folha digital. É efetiva para Tesouraria, Diretor Geral e Administrador Total.",
  fechamentos_caixa_conferir:
    "Permite confirmar a conferência ou registrar divergência em um fechamento já encerrado. É efetiva para Tesouraria, Diretor Geral e Administrador Total."
};

const acoesPermissao: ReadonlyArray<[string, (recurso: string) => string]> = [
  ["visualizar_dpago", (recurso) => `Permite ver ${recurso} que já foram pagos.`],
  ["editar_dpago", (recurso) => `Permite alterar ${recurso} que já foram pagos.`],
  ["excluir_dpago", (recurso) => `Permite excluir ${recurso} que já foram pagos.`],
  ["somente_caixa_aberto", (recurso) => `Restringe ${recurso} ao período em que o caixa estiver aberto.`],
  ["desabilitado", (recurso) => `Mostra o item de ${recurso} no menu, mas mantém o acesso bloqueado.`],
  ["mostrar", (recurso) => `Mostra o item de ${recurso} no menu; não concede acesso à tela por si só.`],
  ["visualizar", (recurso) => `Permite consultar ${recurso}.`],
  ["criar", (recurso) => `Permite criar registros em ${recurso}.`],
  ["editar", (recurso) => `Permite alterar registros em ${recurso}.`],
  ["excluir", (recurso) => `Permite excluir registros em ${recurso}.`],
  ["pagar", (recurso) => `Permite registrar ou alterar o pagamento de ${recurso}.`],
  ["aprovar", (recurso) => `Permite aprovar registros em ${recurso}.`],
  ["cancelar", (recurso) => `Permite cancelar registros em ${recurso}.`],
  ["importar", (recurso) => `Permite importar dados para ${recurso}.`],
  ["gerenciar", (recurso) => `Permite gerenciar ${recurso}.`]
];

function nomeRecursoPermissao(codigo: string): string {
  return nomesRecursosPermissao[codigo] ?? `a regra ${codigo.replaceAll("_", " ")}`;
}

/** Texto exibido sob cada switch do editor; toda permissão tem uma explicação humana. */
export function descricaoPermissao(codigo: Permissao): string {
  const especial = descricoesEspeciaisPermissao[codigo];
  if (especial) return especial;

  if (codigo.startsWith("menu_")) {
    const semPrefixo = codigo.slice("menu_".length);
    for (const [sufixo, descrever] of acoesPermissao) {
      if (semPrefixo.endsWith(`_${sufixo}`)) {
        return descrever(nomeRecursoPermissao(semPrefixo.slice(0, -sufixo.length - 1)));
      }
    }
  }

  for (const [sufixo, descrever] of acoesPermissao) {
    if (codigo.endsWith(`_${sufixo}`)) {
      return descrever(nomeRecursoPermissao(codigo.slice(0, -sufixo.length - 1)));
    }
  }

  return `Permite usar ${nomeRecursoPermissao(codigo)} dentro do sistema.`;
}

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
// Quem e DONO do sistema, e nao quem apenas opera dentro dele. Mora aqui pelo mesmo motivo que a
// `podeLancarSemCaixa` logo abaixo: a TELA precisa da mesma resposta que o servidor, e copiar a
// regra no front criaria duas verdades que divergem na primeira mudanca de papel.
//
// SO `usuario_admin`, e a diferenca para a irma abaixo e deliberada, nao esquecimento. A
// `podeLancarSemCaixa` aceita `admin` tambem porque responde outra pergunta — "e retaguarda?" —, e
// para aquilo o legado conta. Aqui a pergunta e "e o administrador total?", e o proprio sistema
// responde que nao: o `perfil.service.ts:10` da API declara por escrito que o role `admin` NAO tem
// efeito especial, e so `usuario_admin` recebe `permissoesAcessoTotal`; o legado passa por
// `resolverPermissoesEfetivas` como qualquer outro. O rotulo que o usuario le confirma
// (`WorkspaceDialogs.vue:14-17`): `usuario_admin` e "Administrador total", `admin` e
// "Admin legado (permissoes por cargo, setor e usuario)".
// Incluir o legado aqui seria vazamento: ele veria numeros do negocio inteiro por herdar um nome.
export function ehAdministradorTotal(perfil: Pick<PerfilUsuario, "role">): boolean {
  return perfil.role === "usuario_admin";
}

/** Regra de cargo usada pelos fluxos operacionais próprios da Tesouraria. */
export function ehTesouraria(perfil: Pick<PerfilUsuario, "cargos">): boolean {
  return perfil.cargos.some((cargo) => normalizarCargo(cargo.nome).startsWith("tesouraria"));
}

/** Ajustar saldo e um ato financeiro excepcional: somente Administrador total ou Tesouraria. */
export function podeAjustarSaldoContas(perfil: Pick<PerfilUsuario, "role" | "cargos">): boolean {
  return ehAdministradorTotal(perfil) || ehTesouraria(perfil);
}

/** A folha de fechamento é conferida pela Tesouraria e supervisionada pela Direção Geral. */
export function podeAcessarRelatorioFechamento(perfil: Pick<PerfilUsuario, "role" | "cargos">): boolean {
  return (
    ehAdministradorTotal(perfil) ||
    ehTesouraria(perfil) ||
    perfil.cargos.some((cargo) => normalizarCargo(cargo.nome).startsWith("diretor geral"))
  );
}

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
