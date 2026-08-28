import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import type {
  AcaoHistoricoProcesso,
  AcaoHistoricoTeste,
  MotivoCancelamento,
  ResultadoTeste,
  StatusProcesso,
  StatusTeste
} from "@padaria/shared/admissoes";
import type { CampoVinculoIntegracao, TipoIntegracao, TipoRegistroIntegracao } from "@padaria/shared/integracoes";
import type { ConfiguracaoAparenciaEmpresa } from "@padaria/shared/tema";

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);
const empresaId = uuid("empresa_id")
  .notNull()
  .references(() => empresas.id, { onDelete: "cascade" });
const valorMonetario = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

// --- Descontos da discriminacao em 3 NIVEIS (PROJECT_BRAIN/17 §5) ---------------------------
// Niveis 1 e 2 vivem no ITEM; o nivel 3 (geral) vive no CABECALHO do lancamento. Em todos,
// tipo null = sem desconto naquele nivel; os niveis sao CUMULATIVOS.
const descontosPorNivelItem = {
  // Nivel 1 — desconto no V.UNIT (R$ POR UNIDADE quando tipo='valor'). Nao rateia nada.
  descontoTipo: text("desconto_tipo"),
  descontoValor: numeric("desconto_valor", { precision: 14, scale: 4 }),
  // Nivel 2 — desconto no V.TOTAL do item; recalcula o unitario daquele item (D4).
  descontoTotalTipo: text("desconto_total_tipo"),
  descontoTotalValor: numeric("desconto_total_valor", { precision: 14, scale: 4 })
};

// Resultado do calculo dos tres niveis, gravado pelo servidor (nunca pelo cliente).
//
// FONTE DA VERDADE: `valor_total_com_desconto` e AUTORITATIVO — e ele que soma e reconcilia com o
// valor do lancamento. `valor_unitario_com_desconto` e DERIVADO (total / quantidade, arredondado
// em centavos) e existe para custo e exibicao. unitario x quantidade PODE NAO reconciliar com o
// total por arredondamento (ex.: 3,30 / 4 = 0,825 -> 0,83; 0,83 x 4 = 3,32) e isso e ESPERADO.
// Nunca recalcule o total a partir do unitario.
const valoresComDescontoItem = {
  valorUnitarioComDesconto: numeric("valor_unitario_com_desconto", { precision: 14, scale: 4 }).notNull(),
  valorTotalComDesconto: valorMonetario("valor_total_com_desconto").notNull()
};

// Nivel 3 — desconto GERAL, no cabecalho. Guarda COMO foi informado (ex.: 17,5 + 'percentual');
// o R$ resolvido continua em `valor_desconto`, que e quem alimenta liquidoCentavos e os agregados.
const descontoGeralLancamento = {
  descontoGeralTipo: text("desconto_geral_tipo"),
  descontoGeralValor: numeric("desconto_geral_valor", { precision: 14, scale: 4 })
};

function checksDescontoGeral(tabela: string, tipo: AnyPgColumn, valor: AnyPgColumn) {
  return [
    check(`${tabela}_desconto_geral_tipo_check`, sql`${tipo} is null or ${tipo} in ('percentual', 'valor')`),
    check(`${tabela}_desconto_geral_valor_check`, sql`${valor} is null or ${valor} >= 0`)
  ];
}

// JUROS do lancamento (R-041), nas 3 tabelas de lancamento. Sao TRES colunas, e a razao de cada uma:
//   valor_acrescimo (ja existia) — o juros em R$ SEMPRE JA CALCULADO. E esta coluna que entra no
//     liquidoCentavos(original - desconto + acrescimo). Guardar o percentual aqui somaria R$ 2,00
//     no lugar de R$ 20,00 e corromperia caixa, conta e relatorio de uma vez.
//   juros_tipo — 'percentual' | 'valor'. MESMA convencao do desconto_geral_tipo, tres linhas acima:
//     duas convencoes para o mesmo conceito (uma dizendo 'real', outra 'valor') e exatamente o
//     "conflito com regras antigas" que este sprint existe para matar. Decisao do Jose, 30/07.
//   juros_valor_informado — o que a pessoa DIGITOU (2 para 2%, 20.00 para R$ 20,00). Existe porque
//     guardar so o R$ perde a informacao de que era 2%, e recalcular por divisao deriva com
//     arredondamento: 333,33 a 2% da 6,67, que de volta vira 2,001%. A tela reabre com o informado.
// Nas 3 tabelas de lancamento, descricao_acrescimo fica SEM USO — o campo generico de acrescimo foi
// aposentado aqui (um campo, um nome). Em vendas/transferencias valor_acrescimo segue generico.
const jurosLancamento = {
  jurosTipo: text("juros_tipo").$type<"percentual" | "valor">(),
  jurosValorInformado: numeric("juros_valor_informado", { precision: 14, scale: 4 })
};

function checksJuros(tabela: string, tipo: AnyPgColumn, valorInformado: AnyPgColumn) {
  return [
    check(`${tabela}_juros_tipo_check`, sql`${tipo} is null or ${tipo} in ('percentual', 'valor')`),
    check(`${tabela}_juros_valor_informado_check`, sql`${valorInformado} is null or ${valorInformado} >= 0`)
  ];
}

// Documento fiscal do lancamento (R-044 data de emissao, R-045 numero da nota). Os dois opcionais:
// o historico inteiro nasceu sem eles, e nem todo lancamento tem nota.
const documentoFiscalLancamento = {
  dataDocumentoFiscal: date("data_documento_fiscal"),
  numeroDocumentoFiscal: text("numero_documento_fiscal")
};

export const empresas = pgTable("empresas", {
  id: idUuid,
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  configuracoesAparencia: jsonb("configuracoes_aparencia")
    .$type<ConfiguracaoAparenciaEmpresa>()
    .notNull()
    .default(
      sql`'{"padrao":{"corPrimaria":"#6d28d9","corSecundaria":"#0891b2","corFundo":"#eaf1f9","corCartao":"#ffffff","corSucesso":"#16a34a","corAviso":"#f59e0b","corErro":"#ef4444"},"especifico":[]}'::jsonb`
    ),
  // Conta contabil do COFRE da empresa: destino do retorno/sangria do caixa (R-008b).
  // Regra 5 (M1): mapeamento EXPLICITO; sem ela, o retorno falha em vez de inventar uma conta.
  contaCofreId: uuid("conta_cofre_id").references((): AnyPgColumn => contas.id, { onDelete: "set null" }),
  criadoEm
});

export const perfisUsuarios = pgTable(
  "perfis_usuarios",
  {
    usuarioId: text("usuario_id").primaryKey(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").$type<"usuario_comum" | "usuario_admin" | "admin">().notNull().default("usuario_comum"),
    criadoEm,
    atualizadoEm
  },
  (table) => [check("perfis_usuarios_role_check", sql`${table.role} in ('usuario_comum', 'usuario_admin', 'admin')`)]
);

export const permissoesTabela = pgTable("permissoes", {
  codigo: text("codigo").$type<Permissao>().primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao").notNull().default("")
});

export const permissoesUsuarios = pgTable(
  "permissoes_usuarios",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.usuarioId] })]
);

export const usuariosEmpresas = pgTable(
  "usuarios_empresas",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    empresaId,
    criadoEm
  },
  (table) => [primaryKey({ columns: [table.usuarioId, table.empresaId] })]
);

// contas (PROJECT_BRAIN/17, D8): conta com FUNDO. `saldo_inicial` e o ponto de partida declarado no
// cadastro (ex.: CONTA COFRE nasce com 10.000) — NAO e o saldo atual e NUNCA e sobrescrito pelos
// movimentos. O saldo atual e DERIVADO: saldo_inicial + entradas - saidas (ver saldoContaCentavos
// no shared). Guardar o saldo numa coluna mutavel foi descartado de proposito: ele sairia de sincronia
// no primeiro lancamento que falhasse no meio, e nao haveria como reconstruir a verdade.
export const contas = pgTable(
  "contas",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    saldoInicial: valorMonetario("saldo_inicial").notNull().default("0"),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [check("contas_saldo_inicial_check", sql`${table.saldoInicial} >= 0`)]
);

export const formasPagamento = pgTable(
  "formas_pagamento",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [unique("formas_pagamento_empresa_nome_unica").on(table.empresaId, table.nome)]
);

export const pdvs = pgTable(
  "pdvs",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    codigo: text("codigo"),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("pdvs_empresa_nome_unica").on(table.empresaId, table.nome),
    uniqueIndex("pdvs_empresa_codigo_unico_idx")
      .on(table.empresaId, sql`lower(${table.codigo})`)
      .where(sql`${table.codigo} is not null`)
  ]
);

// Maquininhas de cartao (R-039): cadastro proprio por empresa. A maquininha selecionada na
// abertura fica gravada no fechamento_caixa, preservando o equipamento usado naquele PDV/turno.
// O vinculo e opcional: caixa sem maquininha continua sendo uma abertura valida.
export const maquininhas = pgTable(
  "maquininhas",
  {
    id: idUuid,
    empresaId,
    numeroSerie: text("numero_serie").notNull(),
    apelido: text("apelido").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    uniqueIndex("maquininhas_empresa_numero_serie_unico_idx").on(table.empresaId, sql`lower(${table.numeroSerie})`),
    index("maquininhas_empresa_ativo_idx").on(table.empresaId, table.ativo)
  ]
);

export const fornecedores = pgTable("fornecedores", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  documento: text("documento"),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

// SOCIOS / GESTORES (R-047, D1 do PROJECT_BRAIN/17): cadastro MINIMO — nome, empresa, ativo.
// Nada alem disso de proposito: a planilha confirma que a lista e curta (RET. SOCIOS - RODRIGO,
// PRO LABORE - RODRIGO). Nasce como terceiro tipo de credor, hoje so usado em RETIRADAS —
// despesa e mercadoria nao ofertam socio (decisao do Jose, 30/07); se um dia ofertarem, e ADD COLUMN.
export const sociosGestores = pgTable(
  "socios_gestores",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm
  },
  (table) => [
    uniqueIndex("socios_gestores_empresa_nome_unico").on(table.empresaId, sql`lower(${table.nome})`),
    index("socios_gestores_empresa_idx").on(table.empresaId)
  ]
);

export const clientes = pgTable(
  "clientes",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    documento: text("documento"),
    dataNascimento: text("data_nascimento"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    cep: text("cep"),
    rua: text("rua"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cidade: text("cidade"),
    estado: text("estado"),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    uniqueIndex("clientes_empresa_documento_unico_idx")
      .on(table.empresaId, sql`lower(${table.documento})`)
      .where(sql`${table.documento} is not null`)
  ]
);

export const areas = pgTable("areas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const setores = pgTable("setores", {
  id: idUuid,
  empresaId,
  areaId: uuid("area_id").references(() => areas.id),
  setorPaiId: uuid("setor_pai_id").references((): AnyPgColumn => setores.id),
  nome: text("nome").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const colaboradores = pgTable(
  "colaboradores",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    cpf: text("cpf"),
    setorId: uuid("setor_id").references(() => setores.id),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    // Turno habitual do colaborador — pre-seleciona o turno na abertura do caixa (editavel no ato).
    turnoPadraoId: uuid("turno_padrao_id").references(() => turnos.id, { onDelete: "set null" }),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    uniqueIndex("colaboradores_usuario_id_unico")
      .on(table.usuarioId)
      .where(sql`${table.usuarioId} is not null`)
  ]
);

// Turnos de trabalho (ex.: Manha 06:00-14:00). Turno so existe COM horario (regra da reuniao 15/07).
// E filtro/pre-preenchimento; NAO vincula venda sozinho — o vinculo e sempre o periodo do caixa.
export const turnos = pgTable(
  "turnos",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    // ADM-003 V1A/V1B: as duas colunas abaixo sao ANULAVEIS de proposito. Turno que ja existe nao
    // tem etiqueta nem dias, e exigir de imediato quebraria o cadastro atual. Nenhum valor e
    // deduzido do nome: preencher e ato do DP na tela de Turnos.
    //
    // A consequencia esta em `admissoes_processos`: turno INCOMPLETO (sem etiqueta ou sem dias) nao
    // pode ser escolhido numa admissao. Essa regra mora no servico e no teste, e nao aqui — um CHECK
    // nao enxerga a outra tabela, e FK nao aponta para indice parcial.
    etiqueta: text("etiqueta").$type<"M" | "T" | "I">(),
    diasSemana: text("dias_semana").array(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("turnos_empresa_nome_unica").on(table.empresaId, table.nome),
    // Alvo da FK COMPOSTA vinda de `admissoes_processos`. Aditivo: nenhuma constraint existente muda,
    // e as FKs de `colaboradores` e `fechamentos_caixa` seguem `on delete set null` — o Caixa nao
    // percebe esta migration.
    unique("turnos_id_empresa_unica").on(table.id, table.empresaId),
    check("turnos_etiqueta_check", sql`${table.etiqueta} is null or ${table.etiqueta} in ('M', 'T', 'I')`),
    // Vocabulario REUSADO de `colaboradores_jornadas.dia_da_semana`. Um segundo conjunto de nomes
    // para dia da semana seria a divergencia da regra-mae, em miniatura.
    check(
      "turnos_dias_semana_check",
      sql`${table.diasSemana} is null or (
        array_length(${table.diasSemana}, 1) > 0
        and ${table.diasSemana} <@ array['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA','SABADO','DOMINGO']::text[]
      )`
    )
  ]
);

export const cargos = pgTable(
  "cargos",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("cargos_empresa_nome_unica").on(table.empresaId, table.nome)
  ]
);

export const permissoesCargos = pgTable(
  "permissoes_cargos",
  {
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id, { onDelete: "cascade" }),
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.cargoId] })]
);

/**
 * FUNCAO OPERACIONAL — o que a pessoa FAZ. Nao e cargo de acesso.
 *
 * Fica AQUI, ao lado de `cargos` e `permissoes_cargos`, de proposito: e ao lado que a diferenca
 * aparece. As duas tabelas tem nome e empresa, e sao lidas por gente diferente para perguntas
 * diferentes:
 *
 *   `cargos`                -> o que a pessoa PODE VER. Chave primaria de `permissoes_cargos`.
 *                              Dez valores: Caixa, Tesouraria, Gerencia, Compras, DP, RH, Fiscal,
 *                              Diretor de Operacoes, Diretor Geral, Financeiro.
 *   `funcoes_operacionais`  -> o que a pessoa FAZ. PADEIRO, BALCONISTA, FAXINEIRO.
 *
 * Apontar admissao para `cargos` significaria que registrar um PADEIRO exige criar um cargo de
 * ACESSO chamado PADEIRO — e qualquer regra de permissao por cargo passaria a enxerga-lo.
 *
 * Catalogo OPERACIONAL COMPARTILHAVEL por empresa: nasceu em Admissoes, mas nao pertence a ela. O
 * cadastro de colaboradores usara a mesma lista quando existir. Nome sem prefixo de modulo porque
 * `admissoes_funcoes` convidaria a segunda lista de funcoes no dia em que o cadastro precisasse
 * dela — e duas listas para a mesma pergunta e o defeito que a regra-mae proibe.
 *
 * NUNCA se liga a `cargos`, `permissoes_cargos`, `permissoes_setores` ou `colaboradores_cargos`.
 *
 * Nasce VAZIA. A planilha do RH tem 31 funcoes, mas elas sao evidencia sanitizada, nao carga: a
 * decisao de povoar a tabela e de quem opera, e vai por SQL revisado, nunca por seed automatico.
 */
export const funcoesOperacionais = pgTable(
  "funcoes_operacionais",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    /**
     * CBO — Classificacao Brasileira de Ocupacoes, 6 digitos.
     *
     * Opcional porque o codigo nem sempre e conhecido no momento do teste, e recusar a funcao por
     * falta dele travaria o DP num dado que nao muda a decisao. Na planilha o CBO e DERIVADO do
     * cargo por script; aqui ele e um atributo da funcao, que e o mesmo dado sem o gatilho.
     */
    cbo: text("cbo"),
    /**
     * Situacao da funcao no catalogo.
     *
     * Desativar tira a funcao das escolhas NOVAS sem quebrar registro antigo que ja aponta para ela —
     * excluir apagaria a leitura do historico, que e o mesmo motivo pelo qual "Excluir" no periodo
     * de teste cancela e arquiva em vez de apagar.
     */
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("funcoes_operacionais_empresa_nome_unica").on(table.empresaId, table.nome),
    // Alvo da FK COMPOSTA de quem referencia a funcao.
    unique("funcoes_operacionais_id_empresa_unica").on(table.id, table.empresaId),
    check("funcoes_operacionais_nome_check", sql`length(btrim(${table.nome})) > 0`),
    // Formato, nao existencia: o banco nao valida CBO contra a tabela do MTE.
    check("funcoes_operacionais_cbo_check", sql`${table.cbo} is null or ${table.cbo} ~ '^[0-9]{6}$'`),
    // Ordem do seletor: dentro da empresa, ativas primeiro, por nome.
    index("funcoes_operacionais_empresa_ativo_nome_idx").on(table.empresaId, table.ativo, table.nome)
  ]
);

export const gruposDespesas = pgTable("grupos_despesas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposDespesas.id),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const gruposMercadorias = pgTable("grupos_mercadorias", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposMercadorias.id),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const gruposRetiradas = pgTable("grupos_retiradas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposRetiradas.id),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const gruposVendas = pgTable("grupos_vendas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposVendas.id),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

// PATRIMONIO (PROJECT_BRAIN/17, D2) — cadastro MINIMO, espelhando a aba PATRIMONIO da planilha:
// grupos com sigla (FIS estrutura fisica, MAT materia prima, UTS utensilios, MAQ maquinas,
// MOB mobiliarios, EMB embalagens) e itens com marca/setor. Alimenta o campo Grupo da
// discriminacao quando o item e maquinario/manutencao (§5).
// A sigla NAO e travada nos seis valores: isto e um cadastro com CRUD, e travar no banco faria o
// "novo grupo" so saber falhar. Unica por empresa + formato (2-4 maiusculas).
export const gruposPatrimonio = pgTable(
  "grupos_patrimonio",
  {
    id: idUuid,
    empresaId,
    sig: text("sig").notNull(),
    nome: text("nome").notNull(),
    criadoEm
  },
  (table) => [
    unique("grupos_patrimonio_sig_unica").on(table.empresaId, table.sig),
    check("grupos_patrimonio_sig_check", sql`${table.sig} ~ '^[A-Z]{2,4}$'`)
  ]
);

export const patrimonioItens = pgTable(
  "patrimonio_itens",
  {
    id: idUuid,
    empresaId,
    grupoPatrimonioId: uuid("grupo_patrimonio_id")
      .notNull()
      .references(() => gruposPatrimonio.id),
    setorId: uuid("setor_id").references(() => setores.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    marca: text("marca"),
    criadoEm
  },
  (table) => [
    index("patrimonio_itens_empresa_idx").on(table.empresaId),
    index("patrimonio_itens_grupo_idx").on(table.grupoPatrimonioId)
  ]
);

export const unidadesMedida = pgTable("unidades_medida", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  sigla: text("sigla").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const colaboradoresCargos = pgTable(
  "colaboradores_cargos",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    setorId: uuid("setor_id").references(() => setores.id),
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id),
    remuneracaoMinuto: numeric("remuneracao_minuto", { precision: 14, scale: 6 }).notNull(),
    dataInicio: date("data_inicio").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("colaboradores_cargos_empresa_colaborador_cargo_data_unica").on(
      table.empresaId,
      table.colaboradorId,
      table.cargoId,
      table.dataInicio
    ),
    check("colaboradores_cargos_remuneracao_minuto_check", sql`${table.remuneracaoMinuto} > 0`)
  ]
);

export const colaboradoresJornadas = pgTable(
  "colaboradores_jornadas",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    diaDaSemana: text("dia_da_semana").notNull(),
    cargaHorariaDiariaEmMinutos: integer("carga_horaria_diaria_em_minutos").notNull(),
    intervaloMinutos: integer("intervalo_minutos").notNull().default(0),
    colaboradorCargoId: uuid("colaborador_cargo_id").references(() => colaboradoresCargos.id),
    horaEntrada: time("hora_entrada"),
    dataInicio: date("data_inicio").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    check(
      "colaboradores_jornadas_dia_da_semana_check",
      sql`${table.diaDaSemana} in ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO')`
    ),
    check("colaboradores_jornadas_carga_check", sql`${table.cargaHorariaDiariaEmMinutos} >= 0`),
    check("colaboradores_jornadas_intervalo_check", sql`${table.intervaloMinutos} >= 0`)
  ]
);

export const colaboradoresFaltasJustificadas = pgTable(
  "colaboradores_faltas_justificadas",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    motivo: text("motivo").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [check("colaboradores_faltas_justificadas_fim_check", sql`${table.fim} > ${table.inicio}`)]
);

export const permissoesSetores = pgTable(
  "permissoes_setores",
  {
    setorId: uuid("setor_id")
      .notNull()
      .references(() => setores.id, { onDelete: "cascade" }),
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.setorId] })]
);

export const produtos = pgTable(
  "produtos",
  {
    id: idUuid,
    empresaId,
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    unidadeIndividualId: uuid("unidade_individual_id").references(() => unidadesMedida.id),
    codigo: text("codigo"), // codigo externo (PR-XXXX-XXXX gerado quando vazio; ou manual)
    codigoInterno: text("codigo_interno"), // sequencial 5 digitos por empresa; herdado na importacao
    codigoBarras: text("codigo_barras"),
    descricao: text("descricao").notNull(), // auto (montarDescricao) por padrao, com override manual
    marca: text("marca"),
    quantidadeIndividual: numeric("quantidade_individual", { precision: 14, scale: 3 }).notNull().default("1"),
    // Como se compra (porte do Pralis; enums fieis mantidos como texto)
    embalagem: text("embalagem"), // sigla de unidades_medida (cadastro de Unidades)
    cDe: text("c_de"), // C/ | DE (preposicao de "como se compra")
    quantidadeCaixa: integer("quantidade_caixa").notNull().default(1), // qtCad: unidades por embalagem/caixa
    medidaCompra: text("medida_compra"), // sigla de unidades_medida (cadastro de Unidades)
    // Comercial (por empresa/loja) — preco = referencia de catalogo (vendas seguem do CREARE).
    custo: numeric("custo", { precision: 14, scale: 2 }),
    margem: numeric("margem", { precision: 6, scale: 4 }), // fracao (0.30 = 30%)
    precoVenda: numeric("preco_venda", { precision: 14, scale: 2 }),
    auto: boolean("auto").notNull().default(false),
    status: text("status").notNull().default("ativo"), // ativo | inativo
    tipo: text("tipo").notNull().default("revenda"), // revenda | transformacao
    // Estoque (saldo + parametrizacao). quantidadeEstoque = "quantidade" do Pralis (distinta de quantidadeIndividual/Caixa).
    quantidadeEstoque: numeric("quantidade_estoque", { precision: 14, scale: 3 }).notNull().default("0"),
    estoqueMin: numeric("estoque_min", { precision: 14, scale: 3 }),
    estoqueMax: numeric("estoque_max", { precision: 14, scale: 3 }),
    setorEstoque: text("setor_estoque"),
    // Locais de venda e foto
    localVenda1: text("local_venda_1"),
    localVenda2: text("local_venda_2"),
    fotoUrl: text("foto_url"),
    criadoPor: text("criado_por"), // auditoria (usuarioId; nome resolvido via join)
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    // codigo interno unico por empresa (NULLs sao distintos no Postgres, entao produtos ainda sem codigo convivem)
    uniqueIndex("produtos_codigo_interno_empresa_uidx").on(table.empresaId, table.codigoInterno),
    check("produtos_status_check", sql`${table.status} in ('ativo', 'inativo')`),
    check("produtos_tipo_check", sql`${table.tipo} in ('revenda', 'transformacao')`)
  ]
);

export const produtosConversoes = pgTable(
  "produtos_conversoes",
  {
    id: idUuid,
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    unidadeMedidaId: uuid("unidade_medida_id")
      .notNull()
      .references(() => unidadesMedida.id),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    unidadesIndividuais: numeric("unidades_individuais", { precision: 14, scale: 3 }).notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("produtos_conversoes_quantidade_check", sql`${table.quantidade} > 0`),
    check("produtos_conversoes_unidades_individuais_check", sql`${table.unidadesIndividuais} > 0`)
  ]
);

// Dados tributarios do produto (1:1). Porte de product_fiscal do Pralis; aliquotas em fracao (scale 4).
// So armazena os campos — nao ha calculo fiscal (nem no Pralis nem no ERP hoje).
export const produtosFiscal = pgTable("produtos_fiscal", {
  produtoId: uuid("produto_id")
    .primaryKey()
    .references(() => produtos.id, { onDelete: "cascade" }),
  ncm: text("ncm"),
  cest: text("cest"),
  categoriaFiscal: text("categoria_fiscal"),
  cstPisCofins: text("cst_pis_cofins"),
  aliquotaCheia: numeric("aliquota_cheia", { precision: 6, scale: 4 }),
  aliquotaFcp: numeric("aliquota_fcp", { precision: 6, scale: 4 }),
  aliquotaPis: numeric("aliquota_pis", { precision: 6, scale: 4 }),
  aliquotaCofins: numeric("aliquota_cofins", { precision: 6, scale: 4 }),
  reducaoIcms: numeric("reducao_icms", { precision: 6, scale: 4 }),
  icms: numeric("icms", { precision: 6, scale: 4 }),
  criadoEm,
  atualizadoEm
});

// Ficha de transformacao/receita (1:1, presente quando produtos.tipo = 'transformacao').
// Porte de product_transformacao do Pralis. unidade agora vem do cadastro de Unidades (grava a sigla).
export const produtosTransformacao = pgTable(
  "produtos_transformacao",
  {
    produtoId: uuid("produto_id")
      .primaryKey()
      .references(() => produtos.id, { onDelete: "cascade" }),
    precisao: text("precisao"), // EXATOS | APROXIMADOS
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }),
    unidade: text("unidade"), // sigla de unidades_medida (cadastro de Unidades)
    produtoReceituario: text("produto_receituario"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "produtos_transformacao_precisao_check",
      sql`${table.precisao} is null or ${table.precisao} in ('EXATOS', 'APROXIMADOS')`
    )
  ]
);

// Promocoes do produto (1:N). Porte de promocoes do Pralis: preco fixo (valor) ou desconto (fracao),
// janela de horario e dias da semana. Consumida por calcularPrecoVendaComPromocao (ja portada).
export const produtosPromocoes = pgTable(
  "produtos_promocoes",
  {
    id: idUuid,
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // valor | desconto
    valor: numeric("valor", { precision: 14, scale: 2 }),
    descontoFracao: numeric("desconto_fracao", { precision: 6, scale: 4 }), // 0.10 = 10%
    horaInicio: time("hora_inicio"),
    horaFim: time("hora_fim"),
    seg: boolean("seg").notNull().default(false),
    ter: boolean("ter").notNull().default(false),
    qua: boolean("qua").notNull().default(false),
    qui: boolean("qui").notNull().default(false),
    sex: boolean("sex").notNull().default(false),
    sab: boolean("sab").notNull().default(false),
    dom: boolean("dom").notNull().default(false),
    validaAte: date("valida_ate"),
    criadoEm,
    atualizadoEm
  },
  (table) => [check("produtos_promocoes_tipo_check", sql`${table.tipo} in ('valor', 'desconto')`)]
);

export const integracoesChaves = pgTable(
  "integracoes_chaves",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    codigo: text("codigo").notNull(),
    codigoHash: text("codigo_hash"),
    ativa: boolean("ativa").notNull().default(true),
    criadoPor: text("criado_por"),
    criadoEm,
    inativadoEm: timestamp("inativado_em", { withTimezone: true })
  },
  (table) => [
    unique("integracoes_chaves_codigo_unico").on(table.codigo),
    uniqueIndex("integracoes_chaves_codigo_hash_unico_idx")
      .on(table.codigoHash)
      .where(sql`${table.codigoHash} is not null`),
    check("integracoes_chaves_tipo_check", sql`${table.tipo} in ('vendas')`)
  ]
);

export const integracoesCamposConfig = pgTable(
  "integracoes_campos_config",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    campo: text("campo").$type<CampoVinculoIntegracao>().notNull(),
    criarAutomaticamente: boolean("criar_automaticamente").notNull().default(true),
    vincularAutomaticamente: boolean("vincular_automaticamente").notNull().default(true),
    atualizadoEm
  },
  (table) => [
    unique("integracoes_campos_config_empresa_tipo_campo_unico").on(table.empresaId, table.tipo, table.campo),
    check("integracoes_campos_config_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_campos_config_campo_check",
      sql`${table.campo} in ('pdv', 'cliente', 'produto', 'forma_pagamento')`
    )
  ]
);

export const integracoesVinculos = pgTable(
  "integracoes_vinculos",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    tipoRegistro: text("tipo_registro").$type<TipoRegistroIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo").notNull(),
    descricaoExterna: text("descricao_externa"),
    registroSistemaId: uuid("registro_sistema_id"),
    pendente: boolean("pendente").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("integracoes_vinculos_externo_unico").on(
      table.empresaId,
      table.tipo,
      table.tipoRegistro,
      table.identificadorExterno
    ),
    check("integracoes_vinculos_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_vinculos_tipo_registro_check",
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento', 'colaborador')`
    )
  ]
);

export const integracoesRegistros = pgTable(
  "integracoes_registros",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id")
      .notNull()
      .references(() => integracoesChaves.id, { onDelete: "cascade" }),
    tipoRegistro: text("tipo_registro").$type<TipoRegistroIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo").notNull(),
    hashConteudo: text("hash_conteudo").notNull(),
    registroSistemaId: uuid("registro_sistema_id").notNull(),
    payload: jsonb("payload").notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("integracoes_registros_externo_unico").on(
      table.empresaId,
      table.integracaoChaveId,
      table.tipoRegistro,
      table.identificadorExterno
    ),
    check(
      "integracoes_registros_tipo_registro_check",
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento')`
    )
  ]
);

export const integracoesHistorico = pgTable(
  "integracoes_historico",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id")
      .notNull()
      .references(() => integracoesChaves.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo"),
    hashConteudo: text("hash_conteudo"),
    status: text("status").notNull(),
    mensagemErro: text("mensagem_erro"),
    payload: jsonb("payload").notNull(),
    criadoEm
  },
  (table) => [
    check("integracoes_historico_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_historico_status_check",
      sql`${table.status} in ('criado', 'atualizado', 'sem_novidade', 'erro')`
    )
  ]
);

export const integracoesSemNovidade = pgTable("integracoes_sem_novidade", {
  id: idUuid,
  empresaId,
  integracaoChaveId: uuid("integracao_chave_id")
    .notNull()
    .references(() => integracoesChaves.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<TipoIntegracao>().notNull(),
  identificadorExterno: text("identificador_externo").notNull(),
  hashConteudo: text("hash_conteudo").notNull(),
  payload: jsonb("payload").notNull(),
  criadoEm
});

// R-040 (31/07/2026): a tabela `malotes` foi REMOVIDA. O malote-entidade (objeto reutilizavel com
// estoque de lacres disponiveis) nao existe mais — o lacre nasce inline na transferencia (R-022) e
// vive em `lacres` como selo de um EVENTO. Nada do que `malotes` guardava ficou sem casa:
// numero_lacre -> lacres.numero (UNIQUE por empresa), valor -> transferencias.valor_original,
// status -> lacres.rompido + transferencias.status. Migration 0026.

export const vendas = pgTable(
  "vendas",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id").references(() => integracoesChaves.id, { onDelete: "set null" }),
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    dataReferencia: date("data_referencia").notNull(),
    dataVenda: timestamp("data_venda", { withTimezone: true }),
    // VENDA fica FORA da R-127: a entrada vem pronta da integracao (R-062) e a descricao dela e
    // gerada, nao digitada. A 0027 nao tocou nesta coluna — continua NOT NULL no banco.
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    dataPagamento: date("data_pagamento"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    pdvId: uuid("pdv_id").references(() => pdvs.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    identificadorExterno: text("identificador_externo"),
    hashIntegracao: text("hash_integracao"),
    statusExterno: text("status_externo"),
    numeroNotaFiscal: text("numero_nota_fiscal"),
    pdvAutomacaoId: text("pdv_automacao_id"),
    pdvAutomacao: text("pdv_automacao"),
    clienteAutomacaoId: text("cliente_automacao_id"),
    clienteAutomacao: text("cliente_automacao"),
    clienteAutomacaoDocumento: text("cliente_automacao_documento"),
    // Vendedor/atendente cru da automacao (CREARE): identificador do de-para + texto do posto de caixa.
    // Guardado sempre, mesmo sem vinculo resolvido (auditoria e pendencia "sem conversao").
    colaboradorAutomacaoId: text("colaborador_automacao_id"),
    colaboradorAutomacao: text("colaborador_automacao"),
    automacaoId: text("automacao_id"),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("vendas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("vendas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("vendas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("vendas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    unique("vendas_id_empresa_unica").on(table.id, table.empresaId),
    index("vendas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("vendas_caixa_idx").on(table.caixaId),
    // Suporta a revinculacao retroativa: achar vendas ORFAS (caixa_id NULL) de um PDV num intervalo.
    index("vendas_orfas_pdv_data_idx")
      .on(table.empresaId, table.pdvId, table.dataVenda)
      .where(sql`${table.caixaId} is null`)
  ]
);

export const vendasProdutos = pgTable(
  "vendas_produtos",
  {
    id: idUuid,
    vendaId: uuid("venda_id")
      .notNull()
      .references(() => vendas.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    produtoAutomacaoId: text("produto_automacao_id"),
    produtoAutomacaoCodigo: text("produto_automacao_codigo"),
    descricaoProduto: text("descricao_produto").notNull(),
    dataHoraItem: timestamp("data_hora_item", { withTimezone: true }),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull().default("0"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    valorTotal: valorMonetario("valor_total").notNull().default("0"),
    cancelado: boolean("cancelado").notNull().default(false),
    criadoEm
  },
  (table) => [
    check("vendas_produtos_quantidade_check", sql`${table.quantidade} >= 0`),
    check("vendas_produtos_valor_unitario_check", sql`${table.valorUnitario} >= 0`),
    check("vendas_produtos_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    check("vendas_produtos_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("vendas_produtos_valor_total_check", sql`${table.valorTotal} >= 0`),
    index("vendas_produtos_venda_idx").on(table.vendaId)
  ]
);

export const vendasPagamentos = pgTable(
  "vendas_pagamentos",
  {
    id: idUuid,
    vendaId: uuid("venda_id")
      .notNull()
      .references(() => vendas.id, { onDelete: "cascade" }),
    formaPagamentoId: uuid("forma_pagamento_id").references(() => formasPagamento.id),
    tipoPagamentoAutomacaoId: text("tipo_pagamento_automacao_id"),
    tipoPagamentoAutomacao: text("tipo_pagamento_automacao"),
    numeroVendas: integer("numero_vendas").notNull().default(0),
    totalPago: valorMonetario("total_pago").notNull().default("0"),
    criadoEm
  },
  (table) => [
    check("vendas_pagamentos_numero_vendas_check", sql`${table.numeroVendas} >= 0`),
    check("vendas_pagamentos_total_pago_check", sql`${table.totalPago} >= 0`),
    index("vendas_pagamentos_venda_idx").on(table.vendaId)
  ]
);

export const vendasComprovantes = pgTable("vendas_comprovantes", {
  id: idUuid,
  vendaId: uuid("venda_id")
    .notNull()
    .references(() => vendas.id, { onDelete: "cascade" }),
  nomeOriginal: text("nome_original").notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  caminho: text("caminho").notNull(),
  mimeType: text("mime_type").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId),
  criadoEm
});

// RECORRENCIA de lancamento (PROJECT_BRAIN/17, D3 + PROJECT_BRAIN/14). Guarda a DEFINICAO —
// "toda terca e sexta, 20 vezes, a partir de 30/07" — enquanto os lancamentos da serie sao criados
// na hora do salvar e apontam de volta para ca (recorrencia_id + recorrencia_ordem).
//
// A serie NAO e gerada por job noturno de proposito: lancamento que so aparece se um job rodou e
// lancamento em que ninguem confia, e a conferencia do dia passaria a depender de infraestrutura.
//
// A definicao fica gravada mesmo depois de a serie existir porque e ela que responde "de onde
// vieram estes 12 lancamentos iguais?" — sem isso eles sao indistinguiveis de digitacao repetida.
export const lancamentosRecorrencias = pgTable(
  "lancamentos_recorrencias",
  {
    id: idUuid,
    empresaId,
    dominio: text("dominio").notNull(), // despesa | mercadoria | retirada
    frequencia: text("frequencia").notNull(), // dia | semana | quinzena | mes | trimestre
    // Dias da semana ISO ("2,5" = terca e sexta), so na frequencia 'semana'; null nas demais,
    // porque "toda terca" nao significa nada numa serie mensal. Texto e nao array: o campo e lido
    // por gente conferindo no psql e nunca e filtrado por.
    diasSemana: text("dias_semana"),
    // TOTAL pedido pela pessoa, JA CONTANDO o lancamento inicial. Pode ser MAIOR que o numero de
    // lancamentos criados: o teto de 12 meses corta a serie e o corte fica visivel nesta diferenca.
    repeticoes: integer("repeticoes").notNull(),
    dataInicial: date("data_inicial").notNull(),
    criadoPor: text("criado_por"),
    criadoEm
  },
  (table) => [
    check("lancamentos_recorrencias_dominio_check", sql`${table.dominio} in ('despesa', 'mercadoria', 'retirada')`),
    check(
      "lancamentos_recorrencias_frequencia_check",
      sql`${table.frequencia} in ('dia', 'semana', 'quinzena', 'mes', 'trimestre')`
    ),
    check("lancamentos_recorrencias_repeticoes_check", sql`${table.repeticoes} between 1 and 366`),
    // Lista ISO nao vazia, sem separador solto. So a frequencia 'semana' preenche.
    check("lancamentos_recorrencias_dias_semana_check", sql`${table.diasSemana} ~ '^[1-7](,[1-7])*$'`),
    index("lancamentos_recorrencias_empresa_idx").on(table.empresaId)
  ]
);

// Vinculo do lancamento com a serie que o gerou. As duas colunas andam JUNTAS (check abaixo em cada
// tabela): ordem sem recorrencia seria um numero sem serie, e recorrencia sem ordem esconderia a
// posicao que a tela mostra como "3/12".
const vinculoRecorrencia = {
  recorrenciaId: uuid("recorrencia_id").references((): AnyPgColumn => lancamentosRecorrencias.id),
  recorrenciaOrdem: integer("recorrencia_ordem")
};

function checksVinculoRecorrencia(tabela: string, recorrenciaId: AnyPgColumn, recorrenciaOrdem: AnyPgColumn) {
  return [
    check(`${tabela}_recorrencia_par_check`, sql`num_nonnulls(${recorrenciaId}, ${recorrenciaOrdem}) <> 1`),
    check(`${tabela}_recorrencia_ordem_check`, sql`${recorrenciaOrdem} is null or ${recorrenciaOrdem} >= 1`)
  ];
}

export const despesas = pgTable(
  "despesas",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    ...vinculoRecorrencia,
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    // R-046: o tipo e ESCOLHA do operador e precisa sobreviver ao credor ser apagado — e nao e
    // derivavel das FKs (com as duas nulas nao ha como saber em que aba reabrir a tela).
    credorTipo: text("credor_tipo").$type<"fornecedor" | "colaborador">(),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    ...documentoFiscalLancamento,
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    // R-127: o texto do movimento vive em `observacao`. `descricao` e LEGADO — deixou de ser
    // obrigatoria na 0027 e sai numa migration futura, depois de producao rodar estavel.
    descricao: text("descricao"),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    ...jurosLancamento,
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    ...descontoGeralLancamento,
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    computar: boolean("computar").notNull().default(true),
    fotoDocumentoUrl: text("foto_documento_url"),
    // R-049: foto 1 = recibo/boleto/nota (foto_documento_url); foto 2 = a nota COM OS ITENS.
    fotoNotaUrl: text("foto_nota_url"),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("despesas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("despesas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("despesas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("despesas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    ...checksDescontoGeral("despesas", table.descontoGeralTipo, table.descontoGeralValor),
    ...checksJuros("despesas", table.jurosTipo, table.jurosValorInformado),
    ...checksVinculoRecorrencia("despesas", table.recorrenciaId, table.recorrenciaOrdem),
    // Despesa nao oferta socio/gestor como credor (decisao do Jose, 30/07).
    check(
      "despesas_credor_tipo_check",
      sql`${table.credorTipo} is null or ${table.credorTipo} in ('fornecedor', 'colaborador')`
    ),
    // Coerencia SEM cardinalidade retroativa. NAO exige credor (despesa aceita lancamento sem ele) e
    // NAO reprova a linha legada que tem fornecedor_id e colaborador_id juntos — existe uma assim no
    // dev hoje, e um `num_nonnulls(...) <= 1` abortaria nela. E o erro da 0017, de novo.
    check(
      "despesas_credor_coerente_check",
      sql`${table.credorTipo} is null
        or (${table.credorTipo} = 'fornecedor' and ${table.colaboradorId} is null)
        or (${table.credorTipo} = 'colaborador' and ${table.fornecedorId} is null)`
    ),
    index("despesas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("despesas_caixa_idx").on(table.caixaId),
    // Parcial: so lancamento de serie preenche. Serve o "mostre a serie inteira" e o DELETE da
    // recorrencia (FK sem indice varre a tabela filha).
    index("despesas_recorrencia_idx")
      .on(table.recorrenciaId)
      .where(sql`${table.recorrenciaId} is not null`)
  ]
);

export const despesasItens = pgTable(
  "despesas_itens",
  {
    id: idUuid,
    despesaId: uuid("despesa_id")
      .notNull()
      .references(() => despesas.id, { onDelete: "cascade" }),
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    // Grupo do item vindo do cadastro de PATRIMONIO (§5: "se maquinario/manutencao"). Precisa ser
    // coluna PROPRIA: grupo_despesa_id e FK de grupos_despesas e nao aceita um id de patrimonio —
    // gravar la daria erro de FK, ou pior, casaria com um grupo de despesa de mesmo id.
    // As duas sao OPCIONAIS e MUTUAMENTE EXCLUSIVAS (check abaixo): item sem grupo e legitimo e
    // existe aos milhares no historico, entao a regra e "no maximo um", nunca "exatamente um".
    grupoPatrimonioId: uuid("grupo_patrimonio_id").references(() => gruposPatrimonio.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    // E6: o item da despesa vem de um CADASTRO (Patrimonio ou Colaborador), como a mercadoria ja
    // vinha de produtos. NULLABLE: toda despesa discriminada antes de 04/08/2026 tem descricao
    // digitada a mao e nenhum vinculo — exigir aqui invalidaria o historico. A obrigatoriedade e do
    // formulario e do servico, para lancamento novo.
    patrimonioItemId: uuid("patrimonio_item_id").references(() => patrimonioItens.id),
    descricao: text("descricao").notNull(),
    // Quantidade/unitario chegaram com os 3 niveis de desconto (§5): item antigo = 1 x valor.
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull().default("1"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    ...descontosPorNivelItem,
    valor: valorMonetario("valor").notNull(),
    ...valoresComDescontoItem
  },
  (table) => [
    check("despesas_itens_valor_check", sql`${table.valor} >= 0`),
    check("despesas_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("despesas_itens_valor_unitario_check", sql`${table.valorUnitario} >= 0`),
    check(
      "despesas_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('percentual', 'valor')`
    ),
    check("despesas_itens_desconto_valor_check", sql`${table.descontoValor} is null or ${table.descontoValor} >= 0`),
    check(
      "despesas_itens_desconto_total_tipo_check",
      sql`${table.descontoTotalTipo} is null or ${table.descontoTotalTipo} in ('percentual', 'valor')`
    ),
    check(
      "despesas_itens_desconto_total_valor_check",
      sql`${table.descontoTotalValor} is null or ${table.descontoTotalValor} >= 0`
    ),
    check(
      "despesas_itens_valor_com_desconto_check",
      sql`${table.valorTotalComDesconto} >= 0 and ${table.valorUnitarioComDesconto} >= 0`
    ),
    // O grupo do item vem de UMA origem so: despesas OU patrimonio. Nenhum e permitido (item sem
    // grupo, o caso do historico); os dois juntos nao — seria um item em duas arvores de grupo, e
    // qualquer relatorio que agrupe contaria ele duas vezes.
    check(
      "despesas_itens_grupo_unico_check",
      sql`num_nonnulls(${table.grupoDespesaId}, ${table.grupoPatrimonioId}) <= 1`
    ),
    index("despesas_itens_despesa_idx").on(table.despesaId),
    // Parcial: a coluna e esparsa (so item de maquinario/manutencao preenche). Serve o DELETE de
    // grupos_patrimonio (FK sem indice varre a tabela filha inteira) e o filtro por grupo.
    index("despesas_itens_grupo_patrimonio_idx")
      .on(table.grupoPatrimonioId)
      .where(sql`${table.grupoPatrimonioId} is not null`),
    // E6: mesma razao do indice acima — serve o DELETE em patrimonio_itens (FK sem indice varre a
    // tabela filha inteira). Precisa existir AQUI e nao so na 0029: o `migracoes.test` compara o
    // schema construido por migrate com o construido por push, e um indice so na migration faz os
    // dois divergirem.
    index("despesas_itens_patrimonio_item_idx").on(table.patrimonioItemId)
  ]
);

// PEDIDOS de compra/reposicao de estoque (V1). Header + itens. Itens podem ter fornecedores
// diferentes (misto). Agendamento por data unica (dataAgendada) e/ou recorrencia.
export const pedidos = pgTable(
  "pedidos",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").notNull().default("manual"),
    status: text("status").notNull().default("rascunho"),
    dataAgendada: timestamp("data_agendada", { withTimezone: true }),
    recorrencia: text("recorrencia").notNull().default("nenhuma"),
    observacao: text("observacao"),
    criadoPor: text("criado_por"),
    aprovadoPor: text("aprovado_por"),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("pedidos_tipo_check", sql`${table.tipo} in ('manual', 'automatico')`),
    check("pedidos_status_check", sql`${table.status} in ('rascunho', 'aprovado', 'cancelado')`),
    check("pedidos_recorrencia_check", sql`${table.recorrencia} in ('nenhuma', 'semanal', 'quinzenal', 'mensal')`),
    index("pedidos_empresa_status_idx").on(table.empresaId, table.status)
  ]
);

export const pedidosItens = pgTable(
  "pedidos_itens",
  {
    id: idUuid,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    descricaoProduto: text("descricao_produto").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    // Snapshot do estoque no momento da geracao (auditoria do pedido automatico).
    estoqueAtual: numeric("estoque_atual", { precision: 14, scale: 3 }),
    estoqueMin: numeric("estoque_min", { precision: 14, scale: 3 }),
    estoqueMax: numeric("estoque_max", { precision: 14, scale: 3 })
  },
  (table) => [
    check("pedidos_itens_quantidade_check", sql`${table.quantidade} > 0`),
    index("pedidos_itens_pedido_idx").on(table.pedidoId)
  ]
);

export const mercadorias = pgTable(
  "mercadorias",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    ...vinculoRecorrencia,
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    // Mercadoria so oferta FORNECEDOR (nao tem colaborador_id nem socio_gestor_id). A coluna existe
    // mesmo assim para a tela reabrir no tipo certo e para o contrato ser igual nos 3 dominios.
    credorTipo: text("credor_tipo").$type<"fornecedor">(),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    ...documentoFiscalLancamento,
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    // R-127: o texto do movimento vive em `observacao`. `descricao` e LEGADO — deixou de ser
    // obrigatoria na 0027 e sai numa migration futura, depois de producao rodar estavel.
    descricao: text("descricao"),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    ...jurosLancamento,
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    ...descontoGeralLancamento,
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    notaFiscalId: text("nota_fiscal_id"),
    temNotaFiscal: boolean("tem_nota_fiscal").notNull().default(false),
    computar: boolean("computar").notNull().default(true),
    fotoDocumentoUrl: text("foto_documento_url"),
    fotoNotaUrl: text("foto_nota_url"),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("mercadorias_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("mercadorias_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("mercadorias_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("mercadorias_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    ...checksDescontoGeral("mercadorias", table.descontoGeralTipo, table.descontoGeralValor),
    ...checksJuros("mercadorias", table.jurosTipo, table.jurosValorInformado),
    ...checksVinculoRecorrencia("mercadorias", table.recorrenciaId, table.recorrenciaOrdem),
    check("mercadorias_credor_tipo_check", sql`${table.credorTipo} is null or ${table.credorTipo} = 'fornecedor'`),
    index("mercadorias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("mercadorias_caixa_idx").on(table.caixaId),
    index("mercadorias_recorrencia_idx")
      .on(table.recorrenciaId)
      .where(sql`${table.recorrenciaId} is not null`)
  ]
);

export const mercadoriasItens = pgTable(
  "mercadorias_itens",
  {
    id: idUuid,
    mercadoriaId: uuid("mercadoria_id")
      .notNull()
      .references(() => mercadorias.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    // Ver a nota em despesas_itens.grupo_patrimonio_id: mesma regra, mesmo motivo (FK diferente).
    grupoPatrimonioId: uuid("grupo_patrimonio_id").references(() => gruposPatrimonio.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    ...descontosPorNivelItem,
    // valor_total = V.Total do item ja LIQUIDO dos descontos DE ITEM (niveis 1 e 2). E a soma dele
    // que a validacao D5 compara com o valor do lancamento.
    valorTotal: valorMonetario("valor_total").notNull(),
    ...valoresComDescontoItem
  },
  (table) => [
    check("mercadorias_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("mercadorias_itens_valor_total_check", sql`${table.valorTotal} >= 0`),
    check(
      "mercadorias_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('percentual', 'valor')`
    ),
    check("mercadorias_itens_desconto_valor_check", sql`${table.descontoValor} is null or ${table.descontoValor} >= 0`),
    check(
      "mercadorias_itens_desconto_total_tipo_check",
      sql`${table.descontoTotalTipo} is null or ${table.descontoTotalTipo} in ('percentual', 'valor')`
    ),
    check(
      "mercadorias_itens_desconto_total_valor_check",
      sql`${table.descontoTotalValor} is null or ${table.descontoTotalValor} >= 0`
    ),
    check(
      "mercadorias_itens_valor_com_desconto_check",
      sql`${table.valorTotalComDesconto} >= 0 and ${table.valorUnitarioComDesconto} >= 0`
    ),
    // Mesma regra de despesas_itens: no maximo uma origem de grupo (mercadorias OU patrimonio).
    check(
      "mercadorias_itens_grupo_unico_check",
      sql`num_nonnulls(${table.grupoMercadoriaId}, ${table.grupoPatrimonioId}) <= 1`
    ),
    index("mercadorias_itens_mercadoria_idx").on(table.mercadoriaId),
    index("mercadorias_itens_grupo_patrimonio_idx")
      .on(table.grupoPatrimonioId)
      .where(sql`${table.grupoPatrimonioId} is not null`)
  ]
);

// Notas fiscais eletronicas importadas do webhook da contabilidade (NF-e por CNPJ/periodo).
// Guarda a NF-e crua como fonte da verdade e ancora de idempotencia (unica por empresa+chave);
// a mercadoria pre-preenchida (cabecalho+itens, status 'aguardando_aprovacao') referencia esta
// nota via mercadoria_id. Fornecedor casado por CNPJ (criado se nao existir).
export const notasFiscais = pgTable(
  "notas_fiscais",
  {
    id: idUuid,
    empresaId,
    chave: text("chave").notNull(), // 44 digitos, sem o prefixo "NFe"
    numero: text("numero"),
    serie: text("serie"),
    modelo: text("modelo"),
    naturezaOperacao: text("natureza_operacao"),
    dataEmissao: timestamp("data_emissao", { withTimezone: true }),
    fornecedorCnpj: text("fornecedor_cnpj"),
    fornecedorNome: text("fornecedor_nome"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    valorProdutos: valorMonetario("valor_produtos"),
    valorDesconto: valorMonetario("valor_desconto"),
    valorFrete: valorMonetario("valor_frete"),
    valorOutros: valorMonetario("valor_outros"),
    valorSeguro: valorMonetario("valor_seguro"),
    valorTotal: valorMonetario("valor_total"),
    dataVencimento: date("data_vencimento"),
    mercadoriaId: uuid("mercadoria_id").references(() => mercadorias.id, { onDelete: "set null" }),
    payloadHash: text("payload_hash"),
    statusImportacao: text("status_importacao").notNull().default("pendente_revisao"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "notas_fiscais_status_importacao_check",
      sql`${table.statusImportacao} in ('pendente_revisao', 'revisada', 'ignorada', 'cancelada')`
    ),
    unique("notas_fiscais_empresa_chave_unica").on(table.empresaId, table.chave),
    index("notas_fiscais_empresa_status_idx").on(table.empresaId, table.statusImportacao)
  ]
);

// Itens fiscais da NF-e (nItem/EAN/NCM/CFOP/CEST/uCom/qCom/vUnCom). Detalhe que mercadorias_itens
// nao carrega — fica ligado ao cabecalho da nota; a tela de revisao junta por nota_fiscal_id.
export const notasFiscaisItens = pgTable(
  "notas_fiscais_itens",
  {
    id: idUuid,
    notaFiscalId: uuid("nota_fiscal_id")
      .notNull()
      .references(() => notasFiscais.id, { onDelete: "cascade" }),
    numeroItem: integer("numero_item"),
    ean: text("ean"), // cEAN
    ncm: text("ncm"),
    cfop: text("cfop"),
    cest: text("cest"),
    descricao: text("descricao"), // xProd
    unidadeComercial: text("unidade_comercial"), // uCom
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }), // qCom
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 6 }), // vUnCom
    criadoEm
  },
  (table) => [index("notas_fiscais_itens_nota_idx").on(table.notaFiscalId)]
);

export const retiradas = pgTable(
  "retiradas",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    ...vinculoRecorrencia,
    grupoRetiradaId: uuid("grupo_retirada_id").references(() => gruposRetiradas.id),
    // R-046/R-047: retirada e o UNICO dominio que oferta socio/gestor (decisao do Jose, 30/07).
    // R-128: a tela oferece FORNECEDOR ou SOCIO/GESTOR (fiel a FOTO 2). `colaborador` continua no
    // tipo porque o HISTORICO tem retirada gravada assim — sai da tela, nao do banco.
    credorTipo: text("credor_tipo").$type<"fornecedor" | "colaborador" | "socio_gestor">(),
    // colaborador_id DEIXA DE SER NOT NULL: com socio/gestor como credor nao ha colaborador, e
    // exigir um forcaria inventar. DROP NOT NULL nao perde dado e nao aborta — so relaxa.
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    socioGestorId: uuid("socio_gestor_id").references(() => sociosGestores.id, { onDelete: "set null" }),
    ...documentoFiscalLancamento,
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    // R-127: o texto do movimento vive em `observacao`. `descricao` e LEGADO — deixou de ser
    // obrigatoria na 0027 e sai numa migration futura, depois de producao rodar estavel.
    descricao: text("descricao"),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    ...jurosLancamento,
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    computar: boolean("computar").notNull().default(true),
    // R-049: retirada nao tinha NENHUMA foto. Comprar um freezer tem nota como qualquer outra
    // compra — a D12 tirou so a DISCRIMINACAO da retirada, nunca as fotos.
    fotoDocumentoUrl: text("foto_documento_url"),
    fotoNotaUrl: text("foto_nota_url"),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("retiradas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("retiradas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("retiradas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("retiradas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    ...checksJuros("retiradas", table.jurosTipo, table.jurosValorInformado),
    ...checksVinculoRecorrencia("retiradas", table.recorrenciaId, table.recorrenciaOrdem),
    check(
      "retiradas_credor_tipo_check",
      sql`${table.credorTipo} is null or ${table.credorTipo} in ('fornecedor', 'colaborador', 'socio_gestor')`
    ),
    // Mesmo desenho tolerante das despesas: so checa coerencia quando o tipo esta preenchido.
    // O historico inteiro tem credor_tipo nulo e colaborador_id preenchido — e passa.
    check(
      "retiradas_credor_coerente_check",
      sql`${table.credorTipo} is null
        or (${table.credorTipo} = 'fornecedor' and ${table.colaboradorId} is null and ${table.socioGestorId} is null)
        or (${table.credorTipo} = 'colaborador' and ${table.fornecedorId} is null and ${table.socioGestorId} is null)
        or (${table.credorTipo} = 'socio_gestor' and ${table.fornecedorId} is null and ${table.colaboradorId} is null)`
    ),
    index("retiradas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("retiradas_caixa_idx").on(table.caixaId),
    index("retiradas_recorrencia_idx")
      .on(table.recorrenciaId)
      .where(sql`${table.recorrenciaId} is not null`)
  ]
);

export const transferencias = pgTable(
  "transferencias",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    dataReferencia: date("data_referencia").notNull(),
    // R-127: o texto do movimento vive em `observacao`. `descricao` e LEGADO — deixou de ser
    // obrigatoria na 0027 e sai numa migration futura, depois de producao rodar estavel.
    descricao: text("descricao"),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id")
      .notNull()
      .references(() => contas.id),
    contaDestinoId: uuid("conta_destino_id")
      .notNull()
      .references(() => contas.id),
    nLacreDoc: text("n_lacre_doc"),
    agendadaPara: timestamp("agendada_para", { withTimezone: true }),
    tempoConfirmacao: text("tempo_confirmacao"),
    prazoConfirmacaoEm: timestamp("prazo_confirmacao_em", { withTimezone: true }),
    dataRecebimento: timestamp("data_recebimento", { withTimezone: true }),
    confirmadoPor: text("confirmado_por").references(() => perfisUsuarios.usuarioId),
    travaLiberadaPor: text("trava_liberada_por").references(() => perfisUsuarios.usuarioId),
    travaLiberadaEm: timestamp("trava_liberada_em", { withTimezone: true }),
    // R-040: `malote_id` foi removida. O lacre da transferencia esta em `n_lacre_doc` (digitado) e
    // em `lacres` (o selo do movimento, com `rompido`). Migration 0026 fez o backfill antes do drop.
    //
    // Papel da transferencia. `abertura` NAO nasce assim: a tesouraria cria como `suprimento` e ela
    // vira `abertura` no instante em que um caixa a reivindica pelo lacre (R-040). `sangria`/
    // `retorno` sao manuais (R4/R6). Default 'suprimento' para linhas existentes (nao-destrutivo).
    tipo: text("tipo").notNull().default("suprimento"),
    // M2 (rascunho Rodrigo): data REAL do movimento fisico (separada de dataReferencia contabil e do
    // criadoEm), vencimento e classificacao contabil (paridade com o lancamento da planilha), e o
    // ordinal 1a/2a/3a/4a por caixa+tipo (R6). O vinculo caixa+dia e o caixaId ja existente.
    dataTransferencia: date("data_transferencia"),
    vencimento: date("vencimento"),
    contabil: text("contabil"),
    ordem: integer("ordem"),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("recebido"),
    // B2: ancora de idempotencia do fluxo do Caixa, no mesmo padrao de notas_fiscais (empresa +
    // chave). O cliente carimba a INTENCAO; um retry repete a chave e o UNIQUE parcial recusa a
    // segunda linha. Nullable e sem default de proposito: todo o historico fica NULL, o indice
    // parcial o ignora e nenhum backfill e necessario (D8). O retorno final do fechamento nao usa
    // chave — ele nasce dentro da transacao ja protegida pela trava e pela guarda de status (B1).
    idempotenciaChave: uuid("idempotencia_chave"),
    // D4: marca que esta linha nasceu de uma SOLICITACAO Caixa -> Cofre. Nullable e sem default —
    // historico, entrega avulsa e retorno final do fechamento ficam NULL, e e esse NULL que separa
    // os dois fluxos. Preenchido SO na criacao D4; preservado na execucao e no cancelamento.
    // Nao reusa `agendada_para` (que e QUANDO efetivar, do fluxo generico) nem descricao/observacao.
    solicitacaoCofreEm: timestamp("solicitacao_cofre_em", { withTimezone: true }),
    // Quem ENTREGOU o dinheiro, e quando. Nao da para deduzir de `criado_por`: aquele e quem
    // PROGRAMOU (Tesouraria/Gestao), e a execucao pode ser feita pelo gerente, por quem abriu o
    // caixa ou pelo operador designado (`podeOperarCaixa`). A recusa notifica esta pessoa.
    // Gravados na transicao atomica 'agendada' -> 'pendente'; como so um chamador acerta a linha,
    // retry e execucao concorrente nunca os sobrescrevem.
    executadoPor: text("executado_por").references(() => perfisUsuarios.usuarioId),
    executadoEm: timestamp("executado_em", { withTimezone: true }),
    // Auditoria de cancelamento (decisao 2): os tres andam juntos — ver o CHECK.
    canceladoPor: text("cancelado_por").references(() => perfisUsuarios.usuarioId),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    motivoCancelamento: text("motivo_cancelamento"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("transferencias_status_check", sql`${table.status} in ('pendente', 'recebido', 'agendada', 'cancelada')`),
    // `motivoCancelamento is not null` e explicito: sem ele, length(btrim(null)) > 0 avalia para
    // NULL, o OR inteiro vira NULL e o Postgres ACEITA a linha — a constraint existiria sem
    // proteger o caso mais obvio, que e cancelar sem dizer por que.
    check(
      "transferencias_cancelamento_check",
      sql`(${table.status} = 'cancelada'
             and ${table.canceladoPor} is not null
             and ${table.canceladoEm} is not null
             and ${table.motivoCancelamento} is not null
             and length(btrim(${table.motivoCancelamento})) > 0)
        or (${table.status} <> 'cancelada'
             and ${table.canceladoPor} is null
             and ${table.canceladoEm} is null
             and ${table.motivoCancelamento} is null)`
    ),
    // Ciclo de vida da solicitacao D4, garantido pelo BANCO e nao pela aplicacao:
    //   sem marcador         -> nao ha executor (historico, genericas, avulsas, retorno final);
    //   com marcador         -> e obrigatoriamente Caixa -> Cofre (caixa_id + tipo);
    //   agendada / cancelada -> ainda nao foi executada, entao nao ha executor;
    //   pendente / recebido  -> foi executada, entao executor e horario existem.
    // Os quatro estados possiveis de `status` estao cobertos. Todo o historico satisfaz o primeiro
    // ramo (as colunas nascem NULL), por isso valida sem backfill.
    check(
      "transferencias_solicitacao_cofre_check",
      sql`(${table.solicitacaoCofreEm} is null
             and ${table.executadoPor} is null
             and ${table.executadoEm} is null)
        or (${table.solicitacaoCofreEm} is not null
             and ${table.caixaId} is not null
             and ${table.tipo} in ('sangria', 'retorno')
             and ((${table.status} in ('agendada', 'cancelada')
                     and ${table.executadoPor} is null
                     and ${table.executadoEm} is null)
               or (${table.status} in ('pendente', 'recebido')
                     and ${table.executadoPor} is not null
                     and ${table.executadoEm} is not null)))`
    ),
    check(
      "transferencias_prazo_check",
      sql`${table.tempoConfirmacao} is null or ${table.tempoConfirmacao} in ('5min', '10min', '30min', '1h', '1dia', '10dias', '30dias')`
    ),
    check(
      "transferencias_recebimento_check",
      sql`(${table.status} = 'recebido' and ${table.dataRecebimento} is not null and ${table.confirmadoPor} is not null)
        or (${table.status} <> 'recebido' and ${table.dataRecebimento} is null and ${table.confirmadoPor} is null)
        or (${table.tipo} in ('abertura', 'suprimento', 'sangria', 'retorno') and ${table.status} = 'recebido')`
    ),
    check("transferencias_tipo_check", sql`${table.tipo} in ('abertura', 'suprimento', 'sangria', 'retorno')`),
    check("transferencias_ordem_check", sql`${table.ordem} is null or ${table.ordem} >= 1`),
    check("transferencias_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("transferencias_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("transferencias_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    check("transferencias_contas_diferentes_check", sql`${table.contaOrigemId} <> ${table.contaDestinoId}`),
    index("transferencias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("transferencias_caixa_idx").on(table.caixaId),
    // Parcial: so indexa o fluxo novo, entao nao cresce com o historico (todo NULL). Escopado por
    // empresa para que a chave de uma nunca colida com a de outra.
    uniqueIndex("transferencias_idempotencia_unica")
      .on(table.empresaId, table.idempotenciaChave)
      .where(sql`${table.idempotenciaChave} is not null`),
    // Parcial pelo mesmo motivo: so indexa o fluxo D4, entao nao cresce com o historico.
    index("transferencias_solicitacao_cofre_idx")
      .on(table.caixaId, table.status)
      .where(sql`${table.solicitacaoCofreEm} is not null`)
  ]
);

// Recusa de conferencia — a trilha do "conferi e nao bateu". Uma linha POR TENTATIVA: a segunda
// recusa da mesma transferencia gera outro registro, senao a trilha mentiria. E o que permite
// manter o movimento `pendente` sem perder o historico de quem tentou conferir e por que recusou.
// Restrita ao fluxo Caixa -> Cofre por regra de servico; a tabela em si nao sabe disso.
export const transferenciasConferenciasRecusadas = pgTable(
  "transferencias_conferencias_recusadas",
  {
    id: idUuid,
    // Sem `empresaId` de proposito: a empresa vem da transferencia. Sem a coluna, o par
    // inconsistente (empresa A apontando para transferencia da empresa B) nao e representavel —
    // integridade por construcao, sem precisar de UNIQUE(id, empresa_id) na tabela historica.
    transferenciaId: uuid("transferencia_id")
      .notNull()
      // RESTRICT, nao CASCADE: auditoria financeira nao desaparece junto com o movimento.
      .references(() => transferencias.id, { onDelete: "restrict" }),
    recusadoPor: text("recusado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    motivo: text("motivo").notNull(),
    // O que a pessoa DIGITOU na conferencia — nao o do movimento. E essa diferenca que torna a
    // divergencia auditavel depois; guardar o valor do movimento seria guardar o que ja se sabe.
    lacreInformado: text("lacre_informado"),
    valorInformado: valorMonetario("valor_informado"),
    criadoEm
  },
  (table) => [
    check("transferencias_conferencias_recusadas_motivo_check", sql`length(btrim(${table.motivo})) > 0`),
    check(
      "transferencias_conferencias_recusadas_valor_check",
      sql`${table.valorInformado} is null or ${table.valorInformado} >= 0`
    ),
    index("transferencias_conferencias_recusadas_transferencia_idx").on(table.transferenciaId, table.criadoEm)
  ]
);

export const transferenciasDestinosCandidatos = pgTable(
  "transferencias_destinos_candidatos",
  {
    id: idUuid,
    empresaId,
    transferenciaId: uuid("transferencia_id")
      .notNull()
      .references(() => transferencias.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    criadoEm
  },
  (table) => [
    unique("transferencias_destinos_candidatos_unica").on(table.transferenciaId, table.contaId),
    index("transferencias_destinos_candidatos_conta_idx").on(table.contaId)
  ]
);

// contas_usuarios (FOTO 4 do PROJECT_BRAIN/14): vinculo N:N usuario<->conta. Define QUAIS contas cada
// usuario pode operar (as que aparecem como Origem/Destino numa transferencia) e QUEM pode confirmar o
// recebimento de uma transferencia destinada aquela conta. NAO e permissao de tela (isso sao as 9 acoes
// por dominio) — e ESCOPO DE CONTA por usuario; as duas coisas sao complementares. Reconstrucao do
// trabalho de 24/07 (a tabela chegou a existir mas nunca foi commitada).
export const contasUsuarios = pgTable(
  "contas_usuarios",
  {
    id: idUuid,
    empresaId,
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    criadoEm
  },
  (table) => [
    unique("contas_usuarios_unica").on(table.contaId, table.usuarioId),
    index("contas_usuarios_usuario_idx").on(table.usuarioId),
    index("contas_usuarios_conta_idx").on(table.contaId)
  ]
);

// lacres: registro UNICO do lacre de um MOVIMENTO (a saida de uma transferencia OU cada linha de
// retorno/sangria). O numero vem impresso de fonte externa, e digitado pelo operador e nao se repete
// por empresa. `rompido` vira true quando o lacre e usado para receber/abrir no destino (o selo e
// quebrado) — a partir dai nunca mais pode ser reutilizado. Reconstrucao do trabalho de 24/07.
//
// Desde a R-040 esta e a UNICA tabela de lacre: `malotes.numero_lacre` (a identidade do
// malote-ENTIDADE, um objeto reutilizavel de cadastro) deixou de existir. `lacres.numero` e o selo
// de um EVENTO de transporte — a prova de que UMA transferencia especifica saiu lacrada e foi
// recebida. E o "lacre do setor" da FOTO 1.
export const lacres = pgTable(
  "lacres",
  {
    id: idUuid,
    empresaId,
    numero: text("numero").notNull(),
    transferenciaId: uuid("transferencia_id").references(() => transferencias.id, { onDelete: "set null" }),
    // Ponta do movimento que o lacre selou: 'saida' (ida da transferencia) ou 'retorno' (volta/sangria).
    origem: text("origem").notNull(),
    rompido: boolean("rompido").notNull().default(false),
    criadoEm
  },
  (table) => [
    check("lacres_origem_check", sql`${table.origem} in ('saida', 'retorno')`),
    unique("lacres_numero_unico").on(table.empresaId, table.numero),
    index("lacres_transf_idx").on(table.transferenciaId)
  ]
);

export const fechamentosCaixa = pgTable(
  "fechamentos_caixa",
  {
    id: idUuid,
    empresaId,
    pdvId: uuid("pdv_id").references(() => pdvs.id),
    // Turno da abertura (pre-selecionado pelo turno padrao do colaborador). Filtro/relatorio;
    // NAO governa o vinculo de vendas — quem manda e o periodo [abertura, fechamento] do caixa.
    turnoId: uuid("turno_id").references(() => turnos.id, { onDelete: "set null" }),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId),
    usuarioCaixaId: text("usuario_caixa_id").references(() => perfisUsuarios.usuarioId),
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    dataMovimento: date("data_movimento").notNull(),
    dataHoraAbertura: timestamp("data_hora_abertura", { withTimezone: true }),
    abertoEm: timestamp("aberto_em", { withTimezone: true }),
    dataHoraFechamento: timestamp("data_hora_fechamento", { withTimezone: true }),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    fechadoPor: text("fechado_por").references(() => perfisUsuarios.usuarioId),
    tokenEdicao: text("token_edicao"),
    observacao: text("observacao"),
    // R-040: o lacre digitado na abertura, que identificou a transferencia confirmada. A coluna
    // `malote_abertura_id` foi removida na 0026 (o vinculo agora e transferencias.caixa_id).
    // `divida_cofre` e legado da R8 revogada pela R-001 (o fundo nao e emprestimo): sempre 0.
    lacreAbertura: text("lacre_abertura"),
    maquininhaId: uuid("maquininha_id").references(() => maquininhas.id, { onDelete: "set null" }),
    dividaCofre: valorMonetario("divida_cofre").notNull().default("0"),
    totalEntradas: valorMonetario("total_entradas").notNull().default("0"),
    totalTransferencias: valorMonetario("total_transferencias").notNull().default("0"),
    totalTransferenciasEntrada: valorMonetario("total_transferencias_entrada").notNull().default("0"),
    totalTransferenciasSaida: valorMonetario("total_transferencias_saida").notNull().default("0"),
    totalDespesas: valorMonetario("total_despesas").notNull().default("0"),
    totalRetiradas: valorMonetario("total_retiradas").notNull().default("0"),
    totalMercadorias: valorMonetario("total_mercadorias").notNull().default("0"),
    saldo: valorMonetario("saldo").notNull().default("0"),
    status: text("status").notNull().default("aberto"),
    criadoPor: text("criado_por"),
    criadoEm
  },
  (table) => [
    check("fechamentos_caixa_status_check", sql`${table.status} in ('aberto', 'fechado', 'ajustado')`),
    unique("fechamentos_caixa_id_empresa_unica").on(table.id, table.empresaId),
    uniqueIndex("fechamentos_caixa_pdv_aberto_unico_idx")
      .on(table.pdvId)
      .where(sql`${table.status} = 'aberto'`),
    index("fechamentos_caixa_empresa_data_idx").on(table.empresaId, table.dataMovimento)
  ]
);

// Trilha imutavel da R-013: uma venda integrada recebida depois da conferencia continua entrando
// no caixa correspondente ao horario em que ocorreu, mas deixa evidencia visivel no fechamento.
// Uma venda gera no maximo uma marca por fechamento mesmo se o PDV reenviar atualizacoes.
export const alteracoesPosFechamentoCaixa = pgTable(
  "alteracoes_pos_fechamento_caixa",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    vendaId: uuid("venda_id").notNull(),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "alteracoes_pos_fechamento_caixa_fechamento_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.vendaId, table.empresaId],
      foreignColumns: [vendas.id, vendas.empresaId],
      name: "alteracoes_pos_fechamento_caixa_venda_empresa_fk"
    }).onDelete("cascade"),
    unique("alteracoes_pos_fechamento_caixa_venda_unica").on(table.fechamentoCaixaId, table.vendaId),
    index("alteracoes_pos_fechamento_caixa_empresa_idx").on(table.empresaId, table.fechamentoCaixaId)
  ]
);

// Quebra de caixa (R-015..R-019/R-021): o valor tem sinal (negativo = faltou, positivo = sobrou)
// e pertence ao usuario que operou o caixa. O saldo pendente e derivado juntando estas linhas com
// suas notificacoes ainda nao verificadas; nao existe coluna de saldo e esta entidade jamais
// movimenta `contas`. A FK composta impede empresa_id divergente do fechamento no proprio banco.
export const quebrasCaixa = pgTable(
  "quebras_caixa",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    valor: valorMonetario("valor").notNull(),
    observacao: text("observacao").notNull(),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "quebras_caixa_fechamento_empresa_fk"
    }).onDelete("cascade"),
    unique("quebras_caixa_fechamento_unico").on(table.fechamentoCaixaId),
    index("quebras_caixa_empresa_usuario_idx").on(table.empresaId, table.usuarioId),
    check("quebras_caixa_valor_nao_zero_check", sql`${table.valor} <> 0`),
    check("quebras_caixa_observacao_nao_vazia_check", sql`length(btrim(${table.observacao})) > 0`)
  ]
);

// Caixa comum das notificacoes operacionais (R-017/R-019/R-037). Cada destinatario recebe sua
// propria linha: no prazo de transferencia estourado, por exemplo, origem e destino sao notificados
// sem compartilhar estado de leitura/verificacao. referencia_id aponta para a entidade do tipo
// (quebra ou transferencia); a integridade dessa referencia polimorfica fica no servico.
export const notificacoes = pgTable(
  "notificacoes",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo")
      .$type<"quebra_caixa" | "transferencia_divergencia" | "transferencia_prazo_confirmacao">()
      .notNull(),
    destinatarioUsuarioId: text("destinatario_usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    referenciaId: uuid("referencia_id").notNull(),
    titulo: text("titulo").notNull(),
    valor: valorMonetario("valor"),
    verificado: boolean("verificado").notNull().default(false),
    verificadoPor: text("verificado_por").references(() => perfisUsuarios.usuarioId),
    verificadoEm: timestamp("verificado_em", { withTimezone: true }),
    criadoEm
  },
  (table) => [
    unique("notificacoes_tipo_destinatario_referencia_unica").on(
      table.tipo,
      table.destinatarioUsuarioId,
      table.referenciaId
    ),
    index("notificacoes_empresa_destinatario_pendente_idx").on(
      table.empresaId,
      table.destinatarioUsuarioId,
      table.verificado
    ),
    check(
      "notificacoes_tipo_check",
      sql`${table.tipo} in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao')`
    ),
    check("notificacoes_titulo_nao_vazio_check", sql`length(btrim(${table.titulo})) > 0`),
    check(
      "notificacoes_verificacao_consistente_check",
      sql`(${table.verificado} = false and ${table.verificadoPor} is null and ${table.verificadoEm} is null)
        or (${table.verificado} = true and ${table.verificadoPor} is not null and ${table.verificadoEm} is not null)`
    )
  ]
);

export const edicoesCaixa = pgTable("edicoes_caixa", {
  id: idUuid,
  caixaId: uuid("caixa_id")
    .notNull()
    .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
  // Nullable: alteracao por permissao direta (gerente/admin) nao consome token. No fluxo por token,
  // guarda o token efetivamente usado (o tokenEdicao antigo do gerente ou o token de autorizacao).
  tokenUsado: text("token_usado"),
  // Quem autorizou a alteracao (fluxo por token). Na permissao direta e o proprio editor.
  autorizadorId: text("autorizador_id").references(() => perfisUsuarios.usuarioId),
  // Motivo obrigatorio da alteracao de horario (auditoria).
  observacao: text("observacao"),
  editadoPor: text("editado_por").references(() => perfisUsuarios.usuarioId),
  editadoEm: timestamp("editado_em", { withTimezone: true }).notNull().defaultNow(),
  valoresAntigos: jsonb("valores_antigos").notNull(),
  valoresNovos: jsonb("valores_novos").notNull()
});

// Fluxo de autorizacao para alterar horario do caixa (reuniao 15/07): o operador solicita escolhendo
// um autorizador (usuario com caixa_alterar_horario); o autorizador gera um token curto — guardado
// APENAS como SHA-256 — que o operador usa UMA vez, em ate 15 min, para alterar o horario com
// observacao obrigatoria. Gerente/admin com a permissao alteram direto, sem passar por aqui.
export const caixaAutorizacoes = pgTable(
  "caixa_autorizacoes",
  {
    id: idUuid,
    caixaId: uuid("caixa_id")
      .notNull()
      .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
    solicitanteId: text("solicitante_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    autorizadorId: text("autorizador_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    tokenHash: text("token_hash"),
    status: text("status").notNull().default("pendente"),
    observacao: text("observacao"),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    criadoEm
  },
  (table) => [
    check("caixa_autorizacoes_status_check", sql`${table.status} in ('pendente', 'usada', 'expirada', 'negada')`),
    index("caixa_autorizacoes_autorizador_status_idx").on(table.autorizadorId, table.status)
  ]
);

export const ajustesFechamentoCaixa = pgTable("ajustes_fechamento_caixa", {
  id: idUuid,
  fechamentoCaixaId: uuid("fechamento_caixa_id")
    .notNull()
    .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id").references(() => despesas.id),
  valorDiferenca: valorMonetario("valor_diferenca").notNull(),
  criadoEm
});

export const debitosColaboradores = pgTable(
  "debitos_colaboradores",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    tipo: text("tipo").notNull(),
    despesaId: uuid("despesa_id").references(() => despesas.id),
    retiradaId: uuid("retirada_id").references(() => retiradas.id),
    caixaId: uuid("caixa_id").references(() => fechamentosCaixa.id),
    valor: valorMonetario("valor").notNull(),
    observacao: text("observacao"),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm
  },
  (table) => [
    check("debitos_colaboradores_tipo_check", sql`${table.tipo} in ('FECHAMENTO_CAIXA', 'DESPESA', 'RETIRADA')`),
    check("debitos_colaboradores_valor_check", sql`${table.valor} >= 0`),
    index("debitos_colaboradores_empresa_colaborador_idx").on(table.empresaId, table.colaboradorId)
  ]
);

// =================================================================================================
// ADM-001 — Controle de periodo de teste (piloto TNP).
//
// NAO e o cadastro operacional. `admissoes_testes` NUNCA escreve em `colaboradores`, nao tem
// `colaborador_id` e nao efetiva ninguem — nem quando o resultado e `aprovado_para_admissao`.
// Aprovar aqui registra a DECISAO do DP; abrir a admissao e criar/vincular o colaborador sao
// verticais proprias.
//
// A empresa nunca vem do cliente: o servico a deriva de `perfil.empresa_id` e so aceita quando ela
// esta dentro das empresas permitidas do ator. A coluna existe para o recorte e para as FKs
// compostas, nao para ser escolhida.
// =================================================================================================

export const admissoesTestes = pgTable(
  "admissoes_testes",
  {
    id: idUuid,
    empresaId,
    status: text("status").$type<StatusTeste>().notNull().default("em_teste"),
    // Concorrencia otimista. Toda escrita sobre linha existente compara e incrementa; sem isto duas
    // edicoes simultaneas do DP perderiam uma em silencio ("ultima gravacao vence").
    versao: integer("versao").notNull().default(1),
    nomeCompleto: text("nome_completo").notNull(),
    // Somente digitos. O digito verificador e conferido em `shared/src/admissoes/cpf.ts` (contrato)
    // — o CHECK abaixo garante o FORMATO no banco, que e o que o banco consegue garantir sozinho.
    cpf: text("cpf").notNull(),
    funcaoId: uuid("funcao_id").notNull(),
    // Texto livre nesta vertical: o Pralis nao tem catalogo de jornada. `turnos` e turno
    // (nome + hora inicio/fim) e `colaboradores_jornadas` exige um colaborador que ainda nao existe.
    jornadaHorario: text("jornada_horario").notNull(),
    inicioEm: timestamp("inicio_em", { withTimezone: true }).notNull(),
    fimCombinadoEm: timestamp("fim_combinado_em", { withTimezone: true }).notNull(),
    // Preenchido SO no encerramento, e obrigatorio la (ver a coerencia de status abaixo).
    resultado: text("resultado").$type<ResultadoTeste>(),
    // Lista FECHADA. "Excluir" na tela e este cancelamento — nao ha DELETE fisico em lugar nenhum
    // desta vertical, e o motivo e obrigatorio (ver a coerencia de status abaixo).
    motivoCancelamento: text("motivo_cancelamento").$type<MotivoCancelamento>(),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    atualizadoPor: text("atualizado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    encerradoPor: text("encerrado_por").references(() => perfisUsuarios.usuarioId),
    canceladoPor: text("cancelado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm,
    encerradoEm: timestamp("encerrado_em", { withTimezone: true }),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true })
  },
  (table) => [
    // FK COMPOSTA, e nao `references(() => funcoesOperacionais.id)`: assim o banco recusa funcao de
    // outra empresa por conta propria. A FK simples deixaria a garantia inteira nas maos do
    // servico — que e como `colaboradores.setor_id` virou um ponteiro estrangeiro representavel.
    foreignKey({
      columns: [table.funcaoId, table.empresaId],
      foreignColumns: [funcoesOperacionais.id, funcoesOperacionais.empresaId],
      name: "admissoes_testes_funcao_empresa_fk"
    }),
    // Alvo da FK composta vinda de `admissoes_testes_historico`.
    unique("admissoes_testes_id_empresa_unica").on(table.id, table.empresaId),
    check("admissoes_testes_status_check", sql`${table.status} in ('em_teste', 'encerrado', 'cancelado')`),
    check("admissoes_testes_versao_check", sql`${table.versao} > 0`),
    check("admissoes_testes_cpf_check", sql`${table.cpf} ~ '^[0-9]{11}$'`),
    check("admissoes_testes_nome_check", sql`length(btrim(${table.nomeCompleto})) > 0`),
    check("admissoes_testes_jornada_check", sql`length(btrim(${table.jornadaHorario})) > 0`),
    check("admissoes_testes_periodo_check", sql`${table.fimCombinadoEm} > ${table.inicioEm}`),
    check(
      "admissoes_testes_resultado_check",
      sql`${table.resultado} is null or ${table.resultado} in ('aprovado_para_admissao', 'nao_prosseguir')`
    ),
    check(
      "admissoes_testes_motivo_cancelamento_check",
      sql`${table.motivoCancelamento} is null or ${table.motivoCancelamento} in ('nao_aprovado_no_teste', 'sem_continuidade_apos_dia_de_teste')`
    ),
    // Um CHECK unico para os tres estados, em vez de seis condicionais soltos: estado terminal
    // pela metade (encerrado sem resultado, cancelado sem motivo, cancelado com `encerrado_por`)
    // deixa de ser representavel. Sem isto, um bug no servico grava a linha incoerente e ela so
    // aparece meses depois, num relatorio.
    check(
      "admissoes_testes_coerencia_status_check",
      sql`(
        ${table.status} = 'em_teste'
        and ${table.resultado} is null
        and ${table.motivoCancelamento} is null
        and ${table.encerradoPor} is null and ${table.encerradoEm} is null
        and ${table.canceladoPor} is null and ${table.canceladoEm} is null
      ) or (
        ${table.status} = 'encerrado'
        and ${table.resultado} is not null
        and ${table.motivoCancelamento} is null
        and ${table.encerradoPor} is not null and ${table.encerradoEm} is not null
        and ${table.canceladoPor} is null and ${table.canceladoEm} is null
      ) or (
        ${table.status} = 'cancelado'
        and ${table.resultado} is null
        and ${table.motivoCancelamento} is not null
        and ${table.encerradoPor} is null and ${table.encerradoEm} is null
        and ${table.canceladoPor} is not null and ${table.canceladoEm} is not null
      )`
    ),
    // "Bloquear teste aberto duplicado na mesma empresa" enforcado no BANCO, nao so no servico:
    // duas criacoes simultaneas com o mesmo CPF passariam pelas duas verificacoes previas e
    // gravariam as duas. O indice PARCIAL e o que permite que o mesmo CPF volte depois — teste
    // encerrado ou cancelado nao ocupa a vaga.
    uniqueIndex("admissoes_testes_cpf_em_teste_unico")
      .on(table.empresaId, table.cpf)
      .where(sql`${table.status} = 'em_teste'`),
    // Ordem da fila do DP: o que vence antes aparece antes, dentro da empresa e do status.
    index("admissoes_testes_empresa_status_fim_idx").on(
      table.empresaId,
      table.status,
      table.fimCombinadoEm,
      table.id
    )
  ]
);

// Trilha append-only. NUNCA guarda valor de campo — so o NOME dos campos alterados. Gravar
// antes/depois duplicaria a PII dentro da propria auditoria, que e o oposto do que ela existe para
// fazer. Quem quiser o valor atual le a linha raiz; valor antigo nao e recuperavel de proposito.
export const admissoesTestesHistorico = pgTable(
  "admissoes_testes_historico",
  {
    id: idUuid,
    empresaId,
    testeId: uuid("teste_id").notNull(),
    versao: integer("versao").notNull(),
    acao: text("acao").$type<AcaoHistoricoTeste>().notNull(),
    atorUsuarioId: text("ator_usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    camposAlterados: jsonb("campos_alterados")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.testeId, table.empresaId],
      foreignColumns: [admissoesTestes.id, admissoesTestes.empresaId],
      name: "admissoes_testes_historico_teste_empresa_fk"
    }).onDelete("cascade"),
    check(
      "admissoes_testes_historico_acao_check",
      sql`${table.acao} in ('criado', 'alterado', 'encerrado', 'cancelado', 'cpf_revelado')`
    ),
    check("admissoes_testes_historico_versao_check", sql`${table.versao} > 0`),
    // Unico PARCIAL, e nao unico simples: transicao de estado tem uma versao propria, entao repetir
    // um cancelamento nao consegue gravar um segundo evento — a idempotencia fica no banco. Mas
    // `cpf_revelado` NAO incrementa versao e acontece quantas vezes o DP revelar; um unico simples
    // recusaria a segunda revelacao e a auditoria perderia justamente o que deve registrar.
    uniqueIndex("admissoes_testes_historico_evento_unico")
      .on(table.testeId, table.versao)
      .where(sql`${table.acao} <> 'cpf_revelado'`),
    index("admissoes_testes_historico_teste_idx").on(
      table.empresaId,
      table.testeId,
      table.ocorridoEm,
      table.id
    )
  ]
);

// =================================================================================================
// ADM-002 V0 — Processo de admissao.
//
// Nasce de um teste encerrado com `aprovado_para_admissao`, na MESMA transacao que o encerra. Nao ha
// acao "iniciar admissao": um segundo caminho para o mesmo ato e o defeito que a regra-mae proibe.
//
// NAO tem `colaborador_id` e nao referencia `colaboradores`. O vinculo com o cadastro operacional e
// escopo inteiro da V7 — incluindo a coluna que o representara. Antecipa-la agora criaria coluna
// nula que ninguem sabe preencher, e uma FK que exigiria mexer em `colaboradores` antes da hora.
//
// Esta vertical e PURAMENTE ADITIVA: nenhuma tabela existente e alterada.
// =================================================================================================

export const admissoesProcessos = pgTable(
  "admissoes_processos",
  {
    id: idUuid,
    empresaId,
    // ADM-003 V1A: DUAS origens, UM processo. Nao ha segunda tabela nem segundo tipo — o que muda
    // e de onde vieram os dados, e o CHECK de coerencia abaixo torna a mistura irrepresentavel.
    // O default cobre as linhas que ja existem: todas nasceram de um teste efetivado.
    // A uniao literal vive aqui por ora; sobe para `shared` quando o service da V1A chegar.
    origem: text("origem")
      .$type<"teste_efetivado" | "admissao_direta">()
      .notNull()
      .default("teste_efetivado"),
    /**
     * A ORIGEM, quando ela e um periodo de teste. NULO na admissao direta — e e o CHECK de
     * coerencia, nao esta coluna, que garante que nulo so acontece na origem certa.
     */
    testeId: uuid("teste_id"),
    // So na admissao direta. Na origem teste estes sao NULOS por CHECK: identidade, funcao e turno
    // moram em `admissoes_testes` e sao apenas EXIBIDOS — copiar aqui criaria a segunda fonte que a
    // regra-mae proibe.
    nomeCompleto: text("nome_completo"),
    cpf: text("cpf"),
    funcaoId: uuid("funcao_id"),
    turnoId: uuid("turno_id"),
    /**
     * `jornada_horario` PERMANECE. Ela e HISTORICO LEGADO dos processos diretos criados na V1A, antes
     * do catalogo de turnos. Nao e escrita por nenhum caminho novo, nao e convertida e nao e apagada:
     * converter "seg a sex, 08:00 as 17:00" em turno seria adivinhar qual turno da empresa aquilo era.
     */
    jornadaHorario: text("jornada_horario"),
    /**
     * RETRATO do turno no ato da criacao. Nao e segunda fonte: responde outra pergunta. O catalogo
     * responde "o que e o turno M hoje"; o retrato responde "o que foi combinado com esta pessoa".
     * Quando o DP muda o horario do turno M, a primeira resposta muda e a segunda NAO pode — mesma
     * razao pela qual uma venda guarda o preco praticado.
     */
    turnoRotulo: text("turno_rotulo"),
    turnoEtiqueta: text("turno_etiqueta"),
    turnoHoraInicio: time("turno_hora_inicio"),
    turnoHoraFim: time("turno_hora_fim"),
    turnoDiasSemana: text("turno_dias_semana").array(),
    status: text("status").$type<StatusProcesso>().notNull().default("iniciado"),
    versao: integer("versao").notNull().default(1),
    // Sem coluna de MOTIVO: a lista real depende de validacao do DP que ainda nao aconteceu, e uma
    // lista provisoria vira regra definitiva assim que o CHECK roda. O cancelamento e auditado por
    // ator, data e acao — que e o que a trilha precisa responder.
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    atualizadoPor: text("atualizado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    canceladoPor: text("cancelado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm,
    canceladoEm: timestamp("cancelado_em", { withTimezone: true })
  },
  (table) => [
    // FK COMPOSTA: o banco recusa teste de outra empresa por conta propria.
    foreignKey({
      columns: [table.testeId, table.empresaId],
      foreignColumns: [admissoesTestes.id, admissoesTestes.empresaId],
      name: "admissoes_processos_teste_empresa_fk"
    }),
    // FK COMPOSTA tambem para a funcao: o banco recusa funcao de outra empresa por conta propria.
    foreignKey({
      columns: [table.funcaoId, table.empresaId],
      foreignColumns: [funcoesOperacionais.id, funcoesOperacionais.empresaId],
      name: "admissoes_processos_funcao_empresa_fk"
    }),
    // RESTRICT, e nao SET NULL: turno em uso numa admissao NAO se apaga. O `set null` das FKs de
    // `colaboradores` e `fechamentos_caixa` continua como esta — ali perder a referencia e aceitavel,
    // aqui apagaria em silencio o que foi combinado com uma pessoa.
    //
    // A traducao do erro 23503 em 409 TURNO_EM_USO e implementacao da vertical, no controller de
    // Turnos. NAO ha SQL para isso, e nao havia como haver: o banco so sabe recusar.
    foreignKey({
      columns: [table.turnoId, table.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
      name: "admissoes_processos_turno_empresa_fk"
    }).onDelete("restrict"),
    // UM teste, UM processo — no banco, nao no servico. E a rede para duas transacoes concorrentes
    // passarem juntas pelo lock; repeticao e tratada pelo ramo idempotente do servico.
    // Segue valendo com `teste_id` anulavel: o Postgres permite varios NULL numa unique, entao N
    // admissoes diretas convivem sem afrouxar a garantia da origem teste.
    unique("admissoes_processos_teste_unico").on(table.testeId),
    // Alvo da FK composta vinda do historico. Tabela NOVA — nao fere a regra de nao tocar existentes.
    unique("admissoes_processos_id_empresa_unica").on(table.id, table.empresaId),
    // SOMENTE os dois estados alcancaveis na V0. Aceitar um estado antes de a regra dele existir e
    // gravar vocabulario que ninguem confirmou, e que passa a ser gravavel por qualquer bug.
    // ADM-003 V1B: `pausado` entra porque `aso_nao_apto` pausa o processo. Continua sem estado de
    // vertical futura reservado — `aguardando_candidato`, `em_revisao_dp` e `efetivado` seguem fora.
    check(
      "admissoes_processos_status_check",
      sql`${table.status} in ('iniciado', 'pausado', 'cancelado')`
    ),
    check("admissoes_processos_versao_check", sql`${table.versao} > 0`),
    // Um CHECK unico para os estados: cancelado pela metade deixa de ser representavel.
    // `pausado` se comporta como `iniciado` aqui — pausado nao esta cancelado.
    check(
      "admissoes_processos_coerencia_status_check",
      sql`(
        ${table.status} in ('iniciado', 'pausado')
        and ${table.canceladoPor} is null and ${table.canceladoEm} is null
      ) or (
        ${table.status} = 'cancelado'
        and ${table.canceladoPor} is not null and ${table.canceladoEm} is not null
      )`
    ),
    check(
      "admissoes_processos_nome_check",
      sql`${table.nomeCompleto} is null or length(btrim(${table.nomeCompleto})) > 0`
    ),
    check("admissoes_processos_cpf_check", sql`${table.cpf} is null or ${table.cpf} ~ '^[0-9]{11}$'`),
    check(
      "admissoes_processos_origem_check",
      sql`${table.origem} in ('teste_efetivado', 'admissao_direta')`
    ),
    // A constraint que impede combinacao incoerente, nos DOIS sentidos:
    //   origem teste  -> tem teste, e NAO tem copia de funcao/jornada;
    //   origem direta -> nao tem teste, e funcao/jornada sao obrigatorias no proprio processo.
    // Com isso, "duas fontes para o mesmo dado" deixa de ser representavel no banco.
    // ESTRITO, sem NOT VALID. `NOT VALID` pareceria gentil e seria pior: aceitaria a linha legada na
    // criacao, barraria qualquer UPDATE futuro dela com erro confuso, e deixaria dado invalido
    // escondido atras de uma constraint que se declara satisfeita. Legado se resolve ANTES, por
    // preflight que PARA — nunca afrouxando a regra.
    //
    // A metade TESTE segue exigindo `jornada_horario` nula: e ela que impede a jornada do teste ser
    // recopiada. A metade DIRETA deixou de exigi-la — processo novo usa turno, e a linha legada da
    // V1A continua valida com o texto que tem.
    check(
      "admissoes_processos_origem_coerencia_check",
      sql`(
        ${table.origem} = 'teste_efetivado'
        and ${table.testeId} is not null
        and ${table.nomeCompleto} is null and ${table.cpf} is null
        and ${table.funcaoId} is null and ${table.turnoId} is null
        and ${table.jornadaHorario} is null
      ) or (
        ${table.origem} = 'admissao_direta'
        and ${table.testeId} is null
        and ${table.nomeCompleto} is not null and ${table.cpf} is not null
        and ${table.funcaoId} is not null and ${table.turnoId} is not null
      )`
    ),
    // Ultima linha de defesa DENTRO desta tabela. A garantia entre teste e processo e o lock
    // consultivo no servico: indice nao cruza tabelas, e alegar que cruza seria mentira.
    uniqueIndex("admissoes_processos_cpf_ativo_unico")
      .on(table.empresaId, table.cpf)
      .where(sql`${table.cpf} is not null and ${table.status} <> 'cancelado'`),
    index("admissoes_processos_empresa_status_criado_idx").on(
      table.empresaId,
      table.status,
      table.criadoEm,
      table.id
    )
  ]
);

/**
 * ADM-003 V1A — bloco INTERNO do DP. Vale para as duas origens.
 *
 * Tudo anulavel menos a situacao do exame: o DP preenche ao longo do tempo, e exigir tudo de uma vez
 * travaria o processo num dado que ainda nao existe.
 *
 * FORA daqui, de proposito: area, setor, CBO e salario (dependem de `unique (id, empresa_id)` em
 * `areas`/`setores`, que nao existe — sem ele nao ha FK composta, e a garantia de empresa cairia
 * para o servico) e dados bancarios (dado sensivel sem finalidade antes de haver candidato).
 */
export const admissoesProcessosInternos = pgTable(
  "admissoes_processos_internos",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    dataAdmissao: date("data_admissao"),
    ctpsNumero: text("ctps_numero"),
    ctpsSerie: text("ctps_serie"),
    ctpsUf: text("ctps_uf"),
    pisPasepNit: text("pis_pasep_nit"),
    // Os CINCO valores confirmados pelo DP. O ALERTA enquanto nao for 'realizado' e DERIVADO em
    // `shared`, nunca gravado — nao existe coluna, indice nem filtro paralelo de pendencia.
    // ADM-003 V1B: `realizado` SAI — virou ambiguo quando o desfecho ganhou dois lados, porque nao
    // dizia se a pessoa podia ser admitida. `exige_acao` FICA, para a clinica pedir exame complementar.
    exameSituacao: text("exame_situacao")
      .$type<"pendente" | "guia_entregue" | "agendado" | "aso_apto" | "aso_nao_apto" | "exige_acao">()
      .notNull()
      .default("pendente"),
    exameAtualizadoEm: timestamp("exame_atualizado_em", { withTimezone: true }),
    exameAtualizadoPor: text("exame_atualizado_por").references(() => perfisUsuarios.usuarioId),
    observacoesRh: text("observacoes_rh"),
    versao: integer("versao").notNull().default(1),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_processos_internos_processo_empresa_fk"
    }).onDelete("cascade"),
    unique("admissoes_processos_internos_processo_unico").on(table.processoId),
    check(
      "admissoes_processos_internos_exame_check",
      sql`${table.exameSituacao} in ('pendente', 'guia_entregue', 'agendado', 'aso_apto', 'aso_nao_apto', 'exige_acao')`
    ),
    check("admissoes_processos_internos_versao_check", sql`${table.versao} > 0`),
    check(
      "admissoes_processos_internos_ctps_uf_check",
      sql`${table.ctpsUf} is null or ${table.ctpsUf} ~ '^[A-Z]{2}$'`
    ),
    check(
      "admissoes_processos_internos_pis_check",
      sql`${table.pisPasepNit} is null or ${table.pisPasepNit} ~ '^[0-9]{11}$'`
    ),
    index("admissoes_processos_internos_exame_idx").on(table.empresaId, table.exameSituacao)
  ]
);

export const admissoesProcessosHistorico = pgTable(
  "admissoes_processos_historico",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    versao: integer("versao").notNull(),
    acao: text("acao").$type<AcaoHistoricoProcesso>().notNull(),
    atorUsuarioId: text("ator_usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    // NOMES de campos, nunca valores: gravar antes/depois duplicaria a PII dentro da propria trilha.
    camposAlterados: jsonb("campos_alterados")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_processos_historico_processo_empresa_fk"
    }).onDelete("cascade"),
    check(
      "admissoes_processos_historico_acao_check",
      sql`${table.acao} in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado')`
    ),
    check("admissoes_processos_historico_versao_check", sql`${table.versao} > 0`),
    // Idempotencia da transicao no banco: repetir um cancelamento nao grava segundo evento.
    uniqueIndex("admissoes_processos_historico_evento_unico").on(table.processoId, table.versao),
    index("admissoes_processos_historico_processo_idx").on(
      table.empresaId,
      table.processoId,
      table.ocorridoEm,
      table.id
    )
  ]
);
