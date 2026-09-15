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
  (table) => [
    check("contas_saldo_inicial_check", sql`${table.saldoInicial} >= 0`),
    // Alvo das FKs COMPOSTAS do roteamento (#152). Sem este par, o cadastro de uma forma de
    // pagamento poderia apontar para conta de OUTRA empresa e o banco nao reclamaria. Mesmo padrao
    // ja usado por `vendas_id_empresa_unica` e `fechamentos_caixa_id_empresa_unica`.
    unique("contas_id_empresa_unica").on(table.id, table.empresaId)
  ]
);

// R-167 (#152): metade CADASTRO do roteamento financeiro — para onde vai o dinheiro DESTA forma
// NESTA empresa. Fica aqui, e nao em tabela nova, porque a chave de roteamento da R-167 e
// (empresa, forma) e esta tabela JA e exatamente essa chave: um cadastro novo com
// `unique(empresa_id, forma_pagamento_id)` seria o "segundo caminho" que o AGENTS.md proibe.
export const formasPagamento = pgTable(
  "formas_pagamento",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    // Atributo da forma, nao chave: o payload do CREARE (`PagamentosVenda`) nao tem campo de
    // adquirente. Se um dia tiver, vira chave sem quebrar o que ja estiver gravado.
    adquirente: text("adquirente"),
    // So e usada quando o admin marcou EXPLICITAMENTE. Nao existe fallback para a conta do PDV.
    usaContaDoPdv: boolean("usa_conta_do_pdv").notNull().default(false),
    contaRecebivelId: uuid("conta_recebivel_id"),
    contaFinalId: uuid("conta_final_id"),
    // NULL e o estado "sem roteamento": e o que TODA forma existente vira, e o que toda forma
    // criada pelo CREARE continua sendo ate o admin configurar. E o estado que abre pendencia
    // (R-168), nunca um destino inventado.
    disponibilidade: text("disponibilidade"),
    // Trilha: mudar roteamento e mudar o destino do dinheiro (R-176). Nulavel e sem backfill —
    // linha antiga fica sem autor, que e a verdade sobre ela (R-166).
    atualizadoPor: text("atualizado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("formas_pagamento_empresa_nome_unica").on(table.empresaId, table.nome),
    // FKs COMPOSTAS: a conta tem de ser da MESMA empresa da forma. `restrict` porque apagar uma
    // conta que e destino de dinheiro nao pode virar roteamento nulo em silencio.
    foreignKey({
      columns: [table.contaRecebivelId, table.empresaId],
      foreignColumns: [contas.id, contas.empresaId],
      name: "formas_pagamento_conta_recebivel_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.contaFinalId, table.empresaId],
      foreignColumns: [contas.id, contas.empresaId],
      name: "formas_pagamento_conta_final_empresa_fk"
    }).onDelete("restrict"),
    check(
      "formas_pagamento_disponibilidade_check",
      sql`${table.disponibilidade} is null or ${table.disponibilidade} in ('imediata', 'por_evento')`
    ),
    // `is not distinct from`, e NAO `=`. Com `=`, uma coluna nulavel faz o ramo valer NULL, e CHECK
    // so recusa quando a expressao da FALSE — `FALSE or NULL or FALSE` e NULL e PASSA. O estado que
    // escapava era o pior: `disponibilidade` NULL com `usa_conta_do_pdv = true`, ou seja, uma forma
    // meio-cadastrada virando dinheiro IMEDIATAMENTE GASTAVEL na conta do PDV.
    check(
      "formas_pagamento_roteamento_check",
      sql`(${table.disponibilidade} is null and ${table.usaContaDoPdv} = false and ${table.contaRecebivelId} is null and ${table.contaFinalId} is null)
       or (${table.disponibilidade} is not distinct from 'imediata' and ${table.usaContaDoPdv} = true and ${table.contaRecebivelId} is null and ${table.contaFinalId} is null)
       or (${table.disponibilidade} is not distinct from 'por_evento' and ${table.usaContaDoPdv} = false and ${table.contaRecebivelId} is not null and ${table.contaFinalId} is not null)`
    )
  ]
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
    // Alvo das FKs compostas de campanhas e mensagens administrativas. Sem este par, uma linha
    // filha poderia apontar para um PDV de OUTRA empresa sem o banco reclamar — o mesmo motivo de
    // `vendas_id_empresa_unica` e `fechamentos_caixa_id_empresa_unica` existirem.
    unique("pdvs_id_empresa_unica").on(table.id, table.empresaId),
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
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [unique("turnos_empresa_nome_unica").on(table.empresaId, table.nome)]
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
  (table) => [unique("cargos_empresa_nome_unica").on(table.empresaId, table.nome)]
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
      .where(sql`${table.caixaId} is null`),
    // R-175 (#41): UMA venda integrada por (empresa, identificador externo).
    //
    // PARCIAL, e nao `unique(...)`: constraint nao aceita predicado, e a venda de RETAGUARDA precisa
    // ficar de fora — ela nasce com `integracao_chave_id` NULL e `identificador_externo` NULL (o
    // payload de /api/vendas nem tem o campo), e duas vendas manuais no mesmo dia sao legitimas.
    //
    // `integracao_chave_id` fica no PREDICADO e NUNCA na chave. O registro da integracao e escopado
    // por chave (`integracoes_registros_externo_unico`), entao uma troca de credencial faz o mesmo
    // idVenda ser lido como inedito; com a chave dentro do indice a tupla seria nova e a duplicata
    // passaria — o indice pareceria proteger e nao protegeria. No predicado ele so separa venda
    // integrada de venda manual, que e o papel dele.
    //
    // `empresa_id` PRIMEIRO na chave: duas empresas podem reusar o mesmo identificador externo do
    // PDV sem colidir.
    //
    // Precedente de forma: `transferencias_idempotencia_unica` (migration 0030).
    uniqueIndex("vendas_integracao_identificador_unico_idx")
      .on(table.empresaId, table.identificadorExterno)
      .where(sql`${table.integracaoChaveId} is not null and ${table.identificadorExterno} is not null`)
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
    // R-167 (#152): metade FATO — o roteamento QUE VALIA no momento da venda. E snapshot de
    // proposito: mudar o cadastro amanha nao pode reescrever o passado.
    //
    // `nao_aplicavel` e o DEFAULT porque e a verdade sobre as linhas que ja existem — elas sao
    // anteriores ao conceito, e o credito delas continua vindo de `vendas.conta_origem_id`. Assim a
    // migration e ADITIVA: nenhum UPDATE, nenhum backfill (R-166).
    roteamentoStatus: text("roteamento_status").notNull().default("nao_aplicavel"),
    contaRecebivelId: uuid("conta_recebivel_id").references(() => contas.id, { onDelete: "restrict" }),
    contaFinalId: uuid("conta_final_id").references(() => contas.id, { onDelete: "restrict" }),
    adquirente: text("adquirente"),
    // R-169: recebivel e saldo disponivel sao estados diferentes. Enquanto `disponivel_em` for
    // nulo, o pagamento e recebivel e NAO vira saldo gastavel.
    disponivelEm: timestamp("disponivel_em", { withTimezone: true }),
    criadoEm
  },
  (table) => [
    check("vendas_pagamentos_numero_vendas_check", sql`${table.numeroVendas} >= 0`),
    check("vendas_pagamentos_total_pago_check", sql`${table.totalPago} >= 0`),
    check(
      "vendas_pagamentos_roteamento_status_check",
      sql`${table.roteamentoStatus} in ('nao_aplicavel', 'pendente', 'roteado')`
    ),
    // `disponivel_em` so pode existir em linha ROTEADA. E o unico jeito de o BANCO impedir que um
    // recebivel vire saldo gastavel sem roteamento.
    check(
      "vendas_pagamentos_roteamento_check",
      sql`(${table.roteamentoStatus} <> 'roteado' and ${table.contaRecebivelId} is null and ${table.contaFinalId} is null and ${table.disponivelEm} is null)
       or (${table.roteamentoStatus} = 'roteado' and ${table.contaRecebivelId} is not null and ${table.contaFinalId} is not null)`
    ),
    index("vendas_pagamentos_venda_idx").on(table.vendaId),
    // PARCIAIS, porque a porta de saldo (R-165) le isto A CADA ESCRITA de saida. Sem eles a porta
    // ganharia uma varredura de `vendas_pagamentos` por lancamento.
    index("vendas_pagamentos_conta_final_disponivel_idx")
      .on(table.contaFinalId)
      .where(sql`${table.roteamentoStatus} = 'roteado' and ${table.disponivelEm} is not null`),
    index("vendas_pagamentos_conta_recebivel_aberto_idx")
      .on(table.contaRecebivelId)
      .where(sql`${table.roteamentoStatus} = 'roteado' and ${table.disponivelEm} is null`),
    index("vendas_pagamentos_roteamento_pendente_idx")
      .on(table.formaPagamentoId)
      .where(sql`${table.roteamentoStatus} = 'pendente'`)
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
    // R-185: retorno/sangria preparado junto da transferencia que abastece o Caixa. Antes da
    // abertura ainda nao ha caixa_id; a FK composta abaixo impede ligar plano a outra empresa.
    planejamentoOrigemTransferenciaId: uuid("planejamento_origem_transferencia_id"),
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
    // R-183 · o valor FISICAMENTE CONTADO no cofre. Preenchido SO no estado `divergente`, e por
    // isso o CHECK amarra os dois: `valor_original` continua sendo o que SAIU do caixa e nunca e
    // reescrito; este e o que ENTROU no cofre. Nullable e sem default — todo o historico fica NULL e
    // o `coalesce(valor_recebido, valor_original)` do credito devolve o comportamento de sempre.
    // Coluna, e nao derivacao da ultima recusa, por tres motivos: `valor_informado` la e nullable
    // (entao C = 0 seria indistinguivel de "nao contou"), "a ultima" depende de ordem, e o caminho
    // do saldo e quente demais para um lateral correlacionado por transferencia.
    valorRecebido: valorMonetario("valor_recebido"),
    // B2: ancora de idempotencia do fluxo do Caixa, no mesmo padrao de notas_fiscais (empresa +
    // chave). O cliente carimba a INTENCAO; um retry repete a chave e o UNIQUE parcial recusa a
    // segunda linha. Nullable e sem default de proposito: todo o historico fica NULL, o indice
    // parcial o ignora e nenhum backfill e necessario (D8). O retorno final do fechamento nao usa
    // chave — ele nasce dentro da transacao ja protegida pela trava e pela guarda de status (B1).
    idempotenciaChave: uuid("idempotencia_chave"),
    // D4: marcava que a linha nasceu de uma SOLICITACAO Caixa -> Cofre, o fluxo "Programar entrega
    // ao cofre".
    //
    // R-179/Fatia 3 · esse caminho foi REMOVIDO (painel, rotas, servico e consultas). Esta coluna
    // ficou SEM ESCRITOR: nada no codigo a preenche mais. Ela continua aqui porque as linhas
    // historicas que a usam sao fatos ocorridos, e apaga-la e migration — ato separado, com
    // autorizacao propria. O mesmo vale para `executado_por`/`executado_em` abaixo.
    solicitacaoCofreEm: timestamp("solicitacao_cofre_em", { withTimezone: true }),
    // Quem ENTREGOU o dinheiro, e quando. No fluxo D4 nao dava para deduzir de `criado_por`:
    // aquele era quem PROGRAMOU (Tesouraria/Gestao), e a execucao podia ser de outra pessoa.
    //
    // R-179/Fatia 3 · sem o fluxo D4 nao ha mais escritor: na entrega unica quem cria e quem
    // entrega. As colunas ficam para as linhas historicas, e a conferencia continua LENDO
    // `executado_por` para nao deixar quem entregou conferir a propria entrega (R-028).
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
    // R-183: `divergente` e o quinto estado — terminal, para entrega conferida que NAO bateu.
    // Ele existe porque nenhum dos quatro servia: `recebido` afirmaria que bateu e `cancelada`
    // devolveria o dinheiro ao Caixa (`transferenciaContaComoSaida` nao conta cancelada).
    check(
      "transferencias_status_check",
      sql`${table.status} in ('pendente', 'recebido', 'agendada', 'cancelada', 'divergente')`
    ),
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
      sql`(${table.agendadaPara} is null or ${table.planejamentoOrigemTransferenciaId} is null)
        and ((${table.solicitacaoCofreEm} is null
             and ${table.executadoPor} is null
             and ${table.executadoEm} is null
             and ${table.planejamentoOrigemTransferenciaId} is null)
        or (${table.solicitacaoCofreEm} is not null
             and (${table.caixaId} is not null or (${table.status} in ('agendada', 'cancelada') and ${table.planejamentoOrigemTransferenciaId} is not null))
             and ${table.tipo} in ('sangria', 'retorno')
             and ((${table.status} in ('agendada', 'cancelada')
                     and ${table.executadoPor} is null
                     and ${table.executadoEm} is null)
               or (${table.status} in ('pendente', 'recebido', 'divergente')
                     and ${table.executadoPor} is not null
                     and ${table.executadoEm} is not null))))`
    ),
    check(
      "transferencias_planejamento_lacre_check",
      sql`${table.planejamentoOrigemTransferenciaId} is null
        or (${table.nLacreDoc} is not null and length(btrim(${table.nLacreDoc})) > 0)`
    ),
    check(
      "transferencias_planejamento_nao_autorreferente_check",
      sql`${table.planejamentoOrigemTransferenciaId} is null
        or ${table.planejamentoOrigemTransferenciaId} <> ${table.id}`
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
    // R-183 · o contado so existe no estado que o justifica, e existe SEMPRE nele. Sem o segundo
    // ramo, uma linha comum poderia carregar um valor recebido que ninguem le; sem o primeiro, uma
    // divergencia poderia ficar sem o numero que define quanto o cofre recebeu.
    check(
      "transferencias_valor_recebido_check",
      sql`(${table.status} = 'divergente'
             and ${table.valorRecebido} is not null
             and ${table.valorRecebido} >= 0)
        or (${table.status} <> 'divergente' and ${table.valorRecebido} is null)`
    ),
    // R-183 · `divergente` e EXCLUSIVO do malote Caixa -> Cofre. Sem esta amarra um `suprimento`
    // divergente com destino na conta do PDV passaria a contar como ENTRADA do caixa — porque
    // `transferenciaContaComoEntrada` olha status e e cega para direcao — e a FK da quebra, que
    // exige `caixa_id`, nunca casaria: o INSERT estouraria 23503 dentro do fechamento.
    check(
      "transferencias_divergente_escopo_check",
      sql`${table.status} <> 'divergente'
        or (${table.caixaId} is not null and ${table.tipo} in ('sangria', 'retorno'))`
    ),
    // Alvo da FK composta de `quebras_caixa`. TRES colunas, e nao duas: `caixa_id` e FK de coluna
    // unica para `fechamentos_caixa`, entao o par (id, caixa_id) sozinho deixaria a quebra da
    // empresa A apontar entrega da empresa B. Com `empresa_id` na chave, o cruzamento de tenant
    // fica impossivel por construcao, no mesmo padrao da R-021.
    unique("transferencias_id_caixa_empresa_unica").on(table.id, table.caixaId, table.empresaId),
    index("transferencias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    unique("transferencias_id_empresa_unica").on(table.id, table.empresaId),
    foreignKey({
      columns: [table.planejamentoOrigemTransferenciaId, table.empresaId],
      foreignColumns: [table.id, table.empresaId],
      name: "transferencias_planejamento_origem_empresa_fk"
    })
      .onDelete("restrict")
      .onUpdate("no action"),

    index("transferencias_caixa_idx").on(table.caixaId),
    // Parcial: so indexa o fluxo novo, entao nao cresce com o historico (todo NULL). Escopado por
    // empresa para que a chave de uma nunca colida com a de outra.
    uniqueIndex("transferencias_idempotencia_unica")
      .on(table.empresaId, table.idempotenciaChave)
      .where(sql`${table.idempotenciaChave} is not null`),
    // Parcial pelo mesmo motivo: so indexava o fluxo D4. R-179/Fatia 3 · sem escritor para
    // `solicitacao_cofre_em`, o indice para de crescer e cobre apenas as linhas legadas. Derruba-lo
    // e migration, ato separado.
    index("transferencias_solicitacao_cofre_idx")
      .on(table.caixaId, table.status)
      .where(sql`${table.solicitacaoCofreEm} is not null`),
    index("transferencias_planejamento_origem_idx")
      .on(table.planejamentoOrigemTransferenciaId)
      .where(sql`${table.planejamentoOrigemTransferenciaId} is not null`)
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
    uniqueIndex("fechamentos_caixa_operador_aberto_unico_idx")
      .on(table.empresaId, table.usuarioCaixaId)
      .where(sql`${table.status} = 'aberto' and ${table.usuarioCaixaId} is not null`),
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
    // R-183 · quando a quebra nasce de uma entrega ao cofre conferida a menos, ela aponta QUAL
    // entrega. NULL e a quebra de CONTAGEM do turno, que e a unica que existia ate aqui — por isso
    // todo o historico fica NULL e nenhum backfill e necessario.
    transferenciaId: uuid("transferencia_id"),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "quebras_caixa_fechamento_empresa_fk"
    }).onDelete("cascade"),
    // TRES colunas: amarra a quebra a uma entrega DAQUELE fechamento e DAQUELA empresa. Com duas
    // (id, caixa_id) a quebra de terca poderia apontar o malote de segunda de outra empresa, porque
    // `transferencias.caixa_id` e FK de coluna unica. `transferencia_id` NULL desliga a checagem
    // inteira (MATCH SIMPLE), que e o que mantem a quebra de contagem livre.
    foreignKey({
      columns: [table.transferenciaId, table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [transferencias.id, transferencias.caixaId, transferencias.empresaId],
      name: "quebras_caixa_transferencia_fk"
    }).onDelete("restrict"),
    // A quebra de CONTAGEM continua sendo no maximo uma por fechamento — o unique antigo, agora
    // parcial. E cada entrega divergente rende no maximo uma quebra, em qualquer fechamento: o
    // segundo indice e mais forte que um composto por fechamento e ainda serve de indice para a
    // coluna lider da FK.
    uniqueIndex("quebras_caixa_contagem_unica")
      .on(table.fechamentoCaixaId)
      .where(sql`${table.transferenciaId} is null`),
    uniqueIndex("quebras_caixa_transferencia_unica")
      .on(table.transferenciaId)
      .where(sql`${table.transferenciaId} is not null`),
    // O unique antigo por fechamento era um indice COMPLETO nesta coluna, e a R-183 o trocou por um
    // parcial. "As quebras deste fechamento" virou consulta inevitavel — agora um fechamento pode
    // ter varias — e o parcial nao a serve (o planner nao tem como provar `transferencia_id is
    // null`). Este indice devolve o que o unique dava de graca, e serve tambem a RI do CASCADE.
    index("quebras_caixa_fechamento_idx").on(table.fechamentoCaixaId),
    index("quebras_caixa_empresa_usuario_idx").on(table.empresaId, table.usuarioId),
    check("quebras_caixa_valor_nao_zero_check", sql`${table.valor} <> 0`),
    // R-183/D7 no BANCO: quebra de divergencia so pode ser NEGATIVA. A sobra nunca vira quebra
    // positiva, e ate aqui isso vivia so no `if` do servico — um insert de suporte ou um escritor
    // futuro transformaria a divida do operador em credito sem nada reclamar. A quebra de CONTAGEM
    // (`transferencia_id is null`) fica de fora: a semantica antiga dela ("positivo = sobrou") e
    // historico e nao muda aqui.
    check("quebras_caixa_divergencia_negativa_check", sql`${table.transferenciaId} is null or ${table.valor} < 0`),
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
    // `mensagem_admin` aponta `referencia_id` para `mensagens_admin_entregas.id` (UMA linha de sino
    // por ENTREGA, entao o unique abaixo passa a permitir o mesmo usuario em dois PDVs);
    // `campanha` aponta para `campanhas.id`.
    tipo: text("tipo")
      .$type<
        "quebra_caixa" | "transferencia_divergencia" | "transferencia_prazo_confirmacao" | "mensagem_admin" | "campanha"
      >()
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
      sql`${table.tipo} in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha')`
    ),
    check("notificacoes_titulo_nao_vazio_check", sql`length(btrim(${table.titulo})) > 0`),
    check(
      "notificacoes_verificacao_consistente_check",
      sql`(${table.verificado} = false and ${table.verificadoPor} is null and ${table.verificadoEm} is null)
        or (${table.verificado} = true and ${table.verificadoPor} is not null and ${table.verificadoEm} is not null)`
    )
  ]
);

// --- Mensagens administrativas para PDV (R-193..R-196) -----------------------------------------
//
// O Administrador Geral dispara UMA mensagem; ela alcanca destinatarios que podem nem existir no
// momento do envio (quem abre caixa depois, dentro da validade). Por isso sao tres tabelas e nao
// uma: a MENSAGEM (conteudo), o ALVO (o que foi pedido, persistido para resolver os retardatarios)
// e a ENTREGA (a quem de fato chegou, com o PDV em que estava operando).
//
// A ENTREGA e a referencia do sino: `notificacoes.referencia_id` aponta para
// `mensagens_admin_entregas.id`, nunca para a mensagem. Isso faz o
// `notificacoes_tipo_destinatario_referencia_unica` que ja existia passar a significar "uma linha
// de sino por entrega" — o mesmo operador em dois PDVs ganha duas linhas sem que nada mude naquele
// unique. Apontar para a mensagem colapsaria os dois PDVs numa linha so.
export const mensagensAdmin = pgTable(
  "mensagens_admin",
  {
    id: idUuid,
    empresaId,
    titulo: text("titulo").notNull(),
    corpo: text("corpo").notNull(),
    // Sem validade = vale ate ser encerrada. Com validade, quem abre caixa depois do prazo nao
    // recebe mais: e assim que "entregar quando voltar" para de valer sem apagar o historico.
    validoAte: timestamp("valido_ate", { withTimezone: true }),
    status: text("status").$type<"ativa" | "encerrada">().notNull().default("ativa"),
    // text, e nao uuid: `perfis_usuarios.usuario_id` e text (id do Better Auth), como toda FK de
    // usuario neste schema.
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm
  },
  (table) => [
    unique("mensagens_admin_id_empresa_unica").on(table.id, table.empresaId),
    index("mensagens_admin_empresa_status_idx").on(table.empresaId, table.status, table.validoAte),
    check("mensagens_admin_status_check", sql`${table.status} in ('ativa', 'encerrada')`),
    check("mensagens_admin_titulo_nao_vazio_check", sql`length(btrim(${table.titulo})) > 0`),
    check("mensagens_admin_corpo_nao_vazio_check", sql`length(btrim(${table.corpo})) > 0`)
  ]
);

// O QUE foi pedido no envio. Fica gravado porque `pdv` e `empresa` continuam alcancando gente
// depois: quem abre caixa as 7h recebe a mensagem enviada as 5h enquanto ela for valida.
// `caixas_abertos` e a excecao deliberada — e foto do instante do envio e nao pega retardatario.
export const mensagensAdminAlvos = pgTable(
  "mensagens_admin_alvos",
  {
    id: idUuid,
    empresaId,
    mensagemId: uuid("mensagem_id").notNull(),
    tipo: text("tipo").$type<"caixas_abertos" | "empresa" | "pdv" | "operador">().notNull(),
    pdvId: uuid("pdv_id"),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.mensagemId, table.empresaId],
      foreignColumns: [mensagensAdmin.id, mensagensAdmin.empresaId],
      name: "mensagens_admin_alvos_mensagem_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.pdvId, table.empresaId],
      foreignColumns: [pdvs.id, pdvs.empresaId],
      name: "mensagens_admin_alvos_pdv_empresa_fk"
    }),
    // O mesmo PDV/operador nao entra duas vezes na mesma mensagem, e o alvo amplo e unico por tipo.
    uniqueIndex("mensagens_admin_alvos_pdv_unico_idx")
      .on(table.mensagemId, table.pdvId)
      .where(sql`${table.pdvId} is not null`),
    uniqueIndex("mensagens_admin_alvos_usuario_unico_idx")
      .on(table.mensagemId, table.usuarioId)
      .where(sql`${table.usuarioId} is not null`),
    uniqueIndex("mensagens_admin_alvos_amplo_unico_idx")
      .on(table.mensagemId, table.tipo)
      .where(sql`${table.tipo} in ('caixas_abertos', 'empresa')`),
    check("mensagens_admin_alvos_tipo_check", sql`${table.tipo} in ('caixas_abertos', 'empresa', 'pdv', 'operador')`),
    // Cada tipo carrega exatamente a coluna que lhe pertence — e nenhuma outra.
    check(
      "mensagens_admin_alvos_coerencia_check",
      sql`(${table.tipo} in ('caixas_abertos', 'empresa') and ${table.pdvId} is null and ${table.usuarioId} is null)
        or (${table.tipo} = 'pdv' and ${table.pdvId} is not null and ${table.usuarioId} is null)
        or (${table.tipo} = 'operador' and ${table.usuarioId} is not null and ${table.pdvId} is null)`
    )
  ]
);

// A QUEM chegou, por PDV. `pdv_id` nulo = alcancado sem caixa aberto (alvo empresa/operador);
// R-195 promove essa linha quando o operador abre um PDV antes de confirmar.
//
// DOIS uniques parciais, e nao um: em Postgres NULL nunca e igual a NULL, entao
// `unique(mensagem, destinatario, pdv_id)` sozinho deixaria entrar N linhas com `pdv_id` nulo para
// a mesma pessoa. Com o par: mesmo operador em dois PDVs = duas linhas; sem PDV = exatamente uma.
export const mensagensAdminEntregas = pgTable(
  "mensagens_admin_entregas",
  {
    id: idUuid,
    empresaId,
    mensagemId: uuid("mensagem_id").notNull(),
    destinatarioUsuarioId: text("destinatario_usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    pdvId: uuid("pdv_id"),
    fechamentoCaixaId: uuid("fechamento_caixa_id"),
    // Carimbado na PRIMEIRA leitura bem-sucedida do cliente. Nao existe push neste projeto (sem
    // PWA, sem SSE), entao "entregar quando voltar" e exatamente isto: a linha espera no banco.
    entregueEm: timestamp("entregue_em", { withTimezone: true }),
    visualizadaEm: timestamp("visualizada_em", { withTimezone: true }),
    // R-194: "Entendi" confirma e tira do sino; "Fechar" apenas dispensa o pop-up na sessao e a
    // mensagem CONTINUA pendente. Por isso `fechada_em` nao depende de `confirmada_em`.
    confirmadaEm: timestamp("confirmada_em", { withTimezone: true }),
    fechadaEm: timestamp("fechada_em", { withTimezone: true }),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.mensagemId, table.empresaId],
      foreignColumns: [mensagensAdmin.id, mensagensAdmin.empresaId],
      name: "mensagens_admin_entregas_mensagem_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.pdvId, table.empresaId],
      foreignColumns: [pdvs.id, pdvs.empresaId],
      name: "mensagens_admin_entregas_pdv_empresa_fk"
    }),
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "mensagens_admin_entregas_caixa_empresa_fk"
    }).onDelete("set null"),
    uniqueIndex("mensagens_admin_entregas_por_pdv_idx")
      .on(table.mensagemId, table.destinatarioUsuarioId, table.pdvId)
      .where(sql`${table.pdvId} is not null`),
    uniqueIndex("mensagens_admin_entregas_sem_pdv_idx")
      .on(table.mensagemId, table.destinatarioUsuarioId)
      .where(sql`${table.pdvId} is null`),
    index("mensagens_admin_entregas_painel_idx").on(table.empresaId, table.mensagemId, table.confirmadaEm),
    // Os carimbos so avancam: nao se visualiza o que nao chegou, nem se confirma o que nao se viu.
    check(
      "mensagens_admin_entregas_ordem_check",
      sql`(${table.visualizadaEm} is null or ${table.entregueEm} is not null)
        and (${table.confirmadaEm} is null or ${table.visualizadaEm} is not null)
        and (${table.fechadaEm} is null or ${table.entregueEm} is not null)`
    )
  ]
);

// --- Campanhas de bonificacao (R-197..R-199) ---------------------------------------------------
//
// A campanha e por PDV, nunca por vendedor (R-198). Nao existe tabela de progresso de proposito
// (R-199): a venda do CREARE pode ser reenviada, trocar de caixa e ser cancelada depois, e qualquer
// saldo materializado exigiria uma regra de invalidacao que este sistema nao tem. O progresso e
// sempre uma soma ao vivo sobre `vendas`.
//
// A bonificacao e INFORMATIVA e auditavel: nao existe coluna de saldo aqui e nenhuma linha desta
// tabela toca `contas`, `fechamentos_caixa`, folha ou financeiro.
export const campanhas = pgTable(
  "campanhas",
  {
    id: idUuid,
    empresaId,
    titulo: text("titulo").notNull(),
    mensagem: text("mensagem").notNull(),
    // Dia de negocio, comparado com `vendas.data_referencia` (R-197) — nunca com `data_venda`.
    inicio: date("inicio").notNull(),
    fim: date("fim").notNull(),
    metaValor: valorMonetario("meta_valor").notNull(),
    bonificacaoTipo: text("bonificacao_tipo").$type<"dinheiro" | "percentual" | "recompensa">().notNull(),
    bonificacaoValor: valorMonetario("bonificacao_valor"),
    bonificacaoTexto: text("bonificacao_texto"),
    status: text("status").$type<"rascunho" | "ativa" | "encerrada" | "cancelada">().notNull().default("rascunho"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("campanhas_id_empresa_unica").on(table.id, table.empresaId),
    index("campanhas_empresa_status_periodo_idx").on(table.empresaId, table.status, table.inicio, table.fim),
    check("campanhas_status_check", sql`${table.status} in ('rascunho', 'ativa', 'encerrada', 'cancelada')`),
    check("campanhas_periodo_check", sql`${table.fim} >= ${table.inicio}`),
    check("campanhas_meta_check", sql`${table.metaValor} > 0`),
    check("campanhas_titulo_nao_vazio_check", sql`length(btrim(${table.titulo})) > 0`),
    check("campanhas_mensagem_nao_vazia_check", sql`length(btrim(${table.mensagem})) > 0`),
    // Dinheiro e percentual exigem numero; recompensa exige texto. Nunca os dois, nunca nenhum.
    check(
      "campanhas_bonificacao_check",
      sql`(${table.bonificacaoTipo} in ('dinheiro', 'percentual') and ${table.bonificacaoValor} is not null
          and ${table.bonificacaoValor} > 0 and ${table.bonificacaoTexto} is null)
        or (${table.bonificacaoTipo} = 'recompensa' and ${table.bonificacaoTexto} is not null
          and length(btrim(${table.bonificacaoTexto})) > 0 and ${table.bonificacaoValor} is null)`
    ),
    // Percentual e percentual: trava o dedo escorregado que digitaria 1500 no lugar de 15.
    check(
      "campanhas_percentual_ate_cem_check",
      sql`${table.bonificacaoTipo} <> 'percentual' or ${table.bonificacaoValor} <= 100`
    )
  ]
);

export const campanhasPdvs = pgTable(
  "campanhas_pdvs",
  {
    campanhaId: uuid("campanha_id").notNull(),
    pdvId: uuid("pdv_id").notNull(),
    empresaId,
    criadoEm
  },
  (table) => [
    primaryKey({ columns: [table.campanhaId, table.pdvId], name: "campanhas_pdvs_pk" }),
    foreignKey({
      columns: [table.campanhaId, table.empresaId],
      foreignColumns: [campanhas.id, campanhas.empresaId],
      name: "campanhas_pdvs_campanha_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.pdvId, table.empresaId],
      foreignColumns: [pdvs.id, pdvs.empresaId],
      name: "campanhas_pdvs_pdv_empresa_fk"
    })
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
