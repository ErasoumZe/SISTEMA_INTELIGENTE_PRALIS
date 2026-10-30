import { sql } from "drizzle-orm";
import {
  bigint,
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
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import type { JsonValue } from "@padaria/shared/api";
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
import type { DiaSemana, EtiquetaTurno } from "@padaria/shared/turnos";
import type { RankingConferencia, RegraRecorrencia } from "@padaria/shared/compras";

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);
const empresaId = uuid("empresa_id")
  .notNull()
  .references(() => empresas.id, { onDelete: "cascade" });
const valorMonetario = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/** Catálogo mestre BASE do app Pralis; não pertence a nenhuma empresa do ERP. */
export const produtosCatalogoBase = pgTable(
  "produtos_catalogo_base",
  {
    id: idUuid,
    idOrigem: text("id_origem").notNull(),
    codigoInterno: text("codigo_interno"),
    codigoBarras: text("codigo_barras"),
    nome: text("nome").notNull(),
    status: text("status").notNull().default("ativo"),
    grupoIdOrigem: text("grupo_id_origem"),
    dadosOficiais: jsonb("dados_oficiais").$type<Record<string, JsonValue>>().notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    uniqueIndex("produtos_catalogo_base_id_origem_uidx").on(table.idOrigem),
    check("produtos_catalogo_base_status_check", sql`${table.status} in ('ativo', 'inativo')`),
    index("produtos_catalogo_base_codigo_interno_idx").on(table.codigoInterno),
    index("produtos_catalogo_base_codigo_barras_idx").on(table.codigoBarras),
    index("produtos_catalogo_base_nome_idx").on(table.nome)
  ]
);

/**
 * De-para do SIA por loja (tabela `sia_produto_depara` do app oficial de Produtos): o cadastro que JA
 * existe no PDV da loja, casado pelo codigo de barras. E daqui que saem o fiscal de LI e HORA (aliquota
 * ECF, reducao, grupo) e o `coditem` que o importador do CREARE usa como chave. Substituido inteiro a
 * cada importacao da exportacao do SIA — dado real da loja, nunca versionado.
 */
export const siaProdutoDepara = pgTable(
  "sia_produto_depara",
  {
    id: idUuid,
    empresaId,
    /** Como esta no SIA (14 posicoes com zeros); o casamento usa `chaveBarras`. */
    codigoBarras: text("codigo_barras").notNull(),
    /** O mesmo codigo sem pontuacao e sem zeros a esquerda. */
    chaveBarras: text("chave_barras").notNull(),
    /** Chave do importador do CREARE: sem ela, importar duplica em vez de atualizar. */
    coditem: text("coditem").notNull(),
    descricao: text("descricao").notNull().default(""),
    codGrupo: text("cod_grupo").notNull().default(""),
    /** Codigo de tributacao do ECF (03 tributado, 10 ST, 11 isento): vem do SIA, nunca recalculado. */
    aliqSaidaEcf: text("aliq_saida_ecf").notNull().default(""),
    reducao: numeric("reducao", { precision: 7, scale: 4 }),
    aliquotaInterna: numeric("aliquota_interna", { precision: 7, scale: 4 }),
    cstSaida: text("cst_saida").notNull().default(""),
    csosn: text("csosn").notNull().default(""),
    ncm: text("ncm").notNull().default(""),
    ativo: text("ativo").notNull().default(""),
    // Nulo = "nao veio da fonte"; ausencia nunca vira N/zero.
    pesavel: text("pesavel"),
    teclaBalanca: text("tecla_balanca"),
    validadeBalanca: text("validade_balanca"),
    importadoEm: timestamp("importado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    // Um codigo de barras e um coditem identificam UM produto no SIA da loja.
    uniqueIndex("sia_produto_depara_barras_uidx").on(table.empresaId, table.chaveBarras),
    uniqueIndex("sia_produto_depara_coditem_uidx").on(table.empresaId, table.coditem)
  ]
);

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

export const empresas = pgTable(
  "empresas",
  {
    id: idUuid,
    nome: text("nome").notNull(),
    cnpj: text("cnpj"),
    // Prefixo visível da matrícula. O sequencial é por empresa e a combinação é única no vínculo.
    matriculaPrefixo: text("matricula_prefixo").notNull().default("TNP"),
    configuracoesAparencia: jsonb("configuracoes_aparencia")
      .$type<ConfiguracaoAparenciaEmpresa>()
      .notNull()
      .default(
        sql`'{"padrao":{"corPrimaria":"#6d28d9","corSecundaria":"#0891b2","corFundo":"#eaf1f9","corCartao":"#ffffff","corSucesso":"#16a34a","corAviso":"#f59e0b","corErro":"#ef4444"},"especifico":[]}'::jsonb`
      ),
    // Conta contabil do COFRE da empresa: destino do retorno/sangria do caixa (R-008b).
    // Regra 5 (M1): mapeamento EXPLICITO; sem ela, o retorno falha em vez de inventar uma conta.
    contaCofreId: uuid("conta_cofre_id").references((): AnyPgColumn => contas.id, { onDelete: "set null" }),
    fusoHorario: text("fuso_horario").notNull().default("America/Sao_Paulo"),
    comprasPrazoRespostaHoras: integer("compras_prazo_resposta_horas"),
    criadoEm
  },
  (table) => [
    check("empresas_matricula_prefixo_check", sql`${table.matriculaPrefixo} ~ '^[A-Z0-9]{2,8}$'`),
    check("empresas_fuso_horario_check", sql`btrim(${table.fusoHorario}) <> ''`),
    check(
      "empresas_compras_prazo_resposta_horas_check",
      sql`${table.comprasPrazoRespostaHoras} is null or ${table.comprasPrazoRespostaHoras} > 0`
    )
  ]
);
export const perfisUsuarios = pgTable(
  "perfis_usuarios",
  {
    usuarioId: text("usuario_id").primaryKey(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    whatsapp: text("whatsapp"),
    role: text("role").$type<"usuario_comum" | "usuario_admin" | "admin">().notNull().default("usuario_comum"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("perfis_usuarios_role_check", sql`${table.role} in ('usuario_comum', 'usuario_admin', 'admin')`),
    check("perfis_usuarios_whatsapp_check", sql`${table.whatsapp} is null or ${table.whatsapp} ~ '^[0-9]{10,15}$'`)
  ]
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

// Ajustes administrativos nao reescrevem o historico nem o fundo da conta. Cada linha e um
// fato financeiro imutavel que entra na mesma projecao do saldo atual; assim a tesouraria pode
// corrigir um saldo de partida sem apagar venda, transferencia ou lancamento anterior.
export const ajustesContas = pgTable(
  "ajustes_contas",
  {
    id: idUuid,
    empresaId,
    contaId: uuid("conta_id").notNull(),
    valor: valorMonetario("valor").notNull(),
    saldoAnterior: valorMonetario("saldo_anterior").notNull(),
    saldoPosterior: valorMonetario("saldo_posterior").notNull(),
    motivo: text("motivo").notNull(),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm
  },
  (table) => [
    check("ajustes_contas_valor_nao_zero_check", sql`${table.valor} <> 0`),
    foreignKey({
      columns: [table.contaId, table.empresaId],
      foreignColumns: [contas.id, contas.empresaId],
      name: "ajustes_contas_conta_empresa_fk"
    }).onDelete("restrict"),
    index("ajustes_contas_conta_criado_em_idx").on(table.contaId, table.criadoEm)
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
    // Classificacao explicita para o relatorio do Caixa. Uma forma nova entra em "outros",
    // nunca em dinheiro/cartao por inferencia do nome recebido da integracao.
    categoriaFechamentoCaixa: text("categoria_fechamento_caixa")
      .notNull()
      .$type<"dinheiro" | "credito" | "debito" | "pix" | "voucher" | "crediario" | "outros">()
      .default("outros"),
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
    // Alvo da FK composta das regras de recebimento. A regra pertence a uma forma DA MESMA
    // empresa; este par impede que uma configuracao da empresa A seja associada a uma forma B.
    unique("formas_pagamento_id_empresa_unica").on(table.id, table.empresaId),
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
    check(
      "formas_pagamento_categoria_fechamento_caixa_check",
      sql`${table.categoriaFechamentoCaixa} in ('dinheiro', 'credito', 'debito', 'pix', 'voucher', 'crediario', 'outros')`
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

// Configuracao de REFERENCIA para o recebimento de uma forma. Nesta primeira etapa ela NAO e
// consultada pelo caixa, pelas vendas, pelos saldos nem por qualquer liquidacao: serve para o
// administrador testar taxas, prazo e parcelas antes de existir integracao que traga esses fatos
// do adquirente/CREARE. O status tambem nao produz efeito financeiro.
export const regrasRecebimento = pgTable(
  "regras_recebimento",
  {
    id: idUuid,
    empresaId,
    formaPagamentoId: uuid("forma_pagamento_id").notNull(),
    parcelasDe: integer("parcelas_de"),
    parcelasAte: integer("parcelas_ate"),
    taxaPercentual: numeric("taxa_percentual", { precision: 8, scale: 4 }),
    taxaFixa: valorMonetario("taxa_fixa"),
    prazoDias: integer("prazo_dias"),
    status: text("status").$type<"rascunho" | "validada" | "arquivada">().notNull().default("rascunho"),
    fonteReferencia: text("fonte_referencia"),
    observacao: text("observacao"),
    vigenciaInicio: date("vigencia_inicio"),
    vigenciaFim: date("vigencia_fim"),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.formaPagamentoId, table.empresaId],
      foreignColumns: [formasPagamento.id, formasPagamento.empresaId],
      name: "regras_recebimento_forma_empresa_fk"
    }).onDelete("cascade"),
    index("regras_recebimento_empresa_forma_status_idx").on(table.empresaId, table.formaPagamentoId, table.status),
    check("regras_recebimento_status_check", sql`${table.status} in ('rascunho', 'validada', 'arquivada')`),
    check(
      "regras_recebimento_parcelas_check",
      sql`(${table.parcelasDe} is null and ${table.parcelasAte} is null)
       or (${table.parcelasDe} is not null and ${table.parcelasAte} is not null
           and ${table.parcelasDe} >= 1 and ${table.parcelasAte} >= ${table.parcelasDe})`
    ),
    check(
      "regras_recebimento_taxa_percentual_check",
      sql`${table.taxaPercentual} is null or (${table.taxaPercentual} >= 0 and ${table.taxaPercentual} <= 100)`
    ),
    check("regras_recebimento_taxa_fixa_check", sql`${table.taxaFixa} is null or ${table.taxaFixa} >= 0`),
    check("regras_recebimento_prazo_dias_check", sql`${table.prazoDias} is null or ${table.prazoDias} >= 0`),
    check(
      "regras_recebimento_vigencia_check",
      sql`${table.vigenciaInicio} is null or ${table.vigenciaFim} is null or ${table.vigenciaFim} >= ${table.vigenciaInicio}`
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
    // R-229 · turnos do caixa deste PDV (postos: PDV 1 · Manha, PDV 1 · Tarde). Separados dos turnos do DP.
    turnosCaixa: text("turnos_caixa")
      .array()
      .$type<("manha" | "tarde")[]>()
      .notNull()
      .default(sql`ARRAY['manha','tarde']::text[]`),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("pdvs_empresa_nome_unica").on(table.empresaId, table.nome),
    check(
      "pdvs_turnos_caixa_check",
      sql`${table.turnosCaixa} <@ ARRAY['manha','tarde']::text[] and cardinality(${table.turnosCaixa}) >= 1`
    ),
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

export const fornecedores = pgTable(
  "fornecedores",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    documento: text("documento"),
    // Canal operacional do fornecedor para o pedido de compra. O documento continua sendo fiscal;
    // WhatsApp nao substitui CNPJ/CPF nem e obrigatorio para fornecedores historicos.
    whatsapp: text("whatsapp"),
    // R-219/R-221: fornecedor inativo nao aparece no seletor da rodada. Mesmo padrao de
    // `produtos.status`. WhatsApp continua opcional no cadastro; a obrigatoriedade e no convite.
    situacao: text("situacao").$type<"ativo" | "inativo">().notNull().default("ativo"),
    // Doc 59: categoria do fornecedor (texto livre ate a lista ser definida).
    categoria: text("categoria"),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("fornecedores_id_empresa_unica").on(table.id, table.empresaId),
    check("fornecedores_situacao_check", sql`${table.situacao} in ('ativo', 'inativo')`),
    index("fornecedores_empresa_situacao_idx").on(table.empresaId, table.situacao)
  ]
);

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
    // Vinculo operacional do Caixa. Quando preenchidos, PDV e turno nao sao escolhas do operador na
    // abertura: a sessao abre exclusivamente o posto e o turno configurados pelo administrador.
    pdvPadraoId: uuid("pdv_padrao_id").references(() => pdvs.id, { onDelete: "set null" }),
    // Turno do DP (jornada, admissao, Questor). Nao decide mais nada no Caixa (R-229).
    turnoPadraoId: uuid("turno_padrao_id").references(() => turnos.id, { onDelete: "set null" }),
    // R-229 · conta de posto do Caixa: o posto e PDV (pdv_padrao_id) + turno do caixa. Um login por posto.
    turnoCaixa: text("turno_caixa").$type<"manha" | "tarde">(),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    // Alvo das FKs compostas do vínculo: impede uma efetivação cruzar empresas no banco.
    unique("colaboradores_id_empresa_unica").on(table.id, table.empresaId),
    // CPF armazenado pode vir com pontuação nos dados legados; a unicidade normaliza apenas CPF válido.
    uniqueIndex("colaboradores_empresa_cpf_unico")
      .on(table.empresaId, sql`regexp_replace(${table.cpf}, '\\D', '', 'g')`)
      .where(sql`regexp_replace(${table.cpf}, '\\D', '', 'g') ~ '^[0-9]{11}$'`),
    uniqueIndex("colaboradores_usuario_id_unico")
      .on(table.usuarioId)
      .where(sql`${table.usuarioId} is not null`),
    index("colaboradores_empresa_pdv_padrao_idx").on(table.empresaId, table.pdvPadraoId),
    check(
      "colaboradores_turno_caixa_check",
      sql`${table.turnoCaixa} is null or (${table.turnoCaixa} in ('manha', 'tarde') and ${table.pdvPadraoId} is not null)`
    ),
    uniqueIndex("colaboradores_posto_caixa_unico_idx")
      .on(table.empresaId, table.pdvPadraoId, table.turnoCaixa)
      .where(sql`${table.turnoCaixa} is not null`)
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
    etiqueta: text("etiqueta").$type<EtiquetaTurno>(),
    diasSemana: text("dias_semana").array().$type<DiaSemana[]>(),
    ativo: boolean("ativo").notNull().default(true),
    // E3 (M5) — vínculo do turno com o Questor. NULL até a Conplus informar a escala da empresa.
    questorCodigoEscala: text("questor_codigo_escala"),
    questorTipoJornada: smallint("questor_tipo_jornada"),
    questorTempoParcial: smallint("questor_tempo_parcial"),
    questorRegimeJornada: smallint("questor_regime_jornada"),
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
    // E3 (M5): domínios do layout oficial (B.CODIGOESCALA Inteiro 6, TIPOJORNADA, TEMPOPARCIAL, REGIMEJOR).
    check(
      "turnos_questor_escala_check",
      sql`${table.questorCodigoEscala} is null or ${table.questorCodigoEscala} ~ '^[0-9]{1,6}$'`
    ),
    check(
      "turnos_questor_tipo_jornada_check",
      sql`${table.questorTipoJornada} is null or ${table.questorTipoJornada} in (2, 3, 4, 5, 6, 7, 9)`
    ),
    check(
      "turnos_questor_tempo_parcial_check",
      sql`${table.questorTempoParcial} is null or ${table.questorTempoParcial} in (0, 1, 2, 3)`
    ),
    check(
      "turnos_questor_regime_check",
      sql`${table.questorRegimeJornada} is null or ${table.questorRegimeJornada} in (1, 2, 3, 4)`
    ),
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
    // E3 (M5) — vínculo da função com o Questor. NULL até a Conplus informar; o agente nocivo é
    // declaração do DP, sem default.
    questorCodigoCargo: text("questor_codigo_cargo"),
    questorAgenteNocivo: text("questor_agente_nocivo"),
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
    // E3 (M5): A.CODIGOCARGO Inteiro 7; B.AGENTENOCIVO lista fechada da documentação.
    check(
      "funcoes_operacionais_questor_cargo_check",
      sql`${table.questorCodigoCargo} is null or ${table.questorCodigoCargo} ~ '^[0-9]{1,7}$'`
    ),
    check(
      "funcoes_operacionais_questor_agente_check",
      sql`${table.questorAgenteNocivo} is null or ${table.questorAgenteNocivo} in ('00', '15', '20', '25')`
    ),
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

export const gruposMercadorias = pgTable(
  "grupos_mercadorias",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    grupoPaiId: uuid("grupo_pai_id"),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("grupos_mercadorias_id_empresa_unica").on(table.id, table.empresaId),
    foreignKey({
      name: "grupos_mercadorias_pai_mesma_empresa_fk",
      columns: [table.grupoPaiId, table.empresaId],
      foreignColumns: [table.id, table.empresaId]
    }).onDelete("restrict")
  ]
);

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
    produtoBaseId: uuid("produto_base_id").references(() => produtosCatalogoBase.id, { onDelete: "set null" }),
    grupoMercadoriaId: uuid("grupo_mercadoria_id"),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    unidadeIndividualId: uuid("unidade_individual_id").references(() => unidadesMedida.id),
    codigo: text("codigo"), // codigo externo (PR-XXXX-XXXX gerado quando vazio; ou manual)
    codigoInterno: text("codigo_interno"), // sequencial global da fonte oficial; preservado na importacao
    codigoBarras: text("codigo_barras"),
    descricao: text("descricao").notNull(), // auto (montarDescricao) por padrao, com override manual
    nomeCatalogo: text("nome_catalogo"), // nome separado da descricao automatica oficial; NULL identifica cadastro legado
    pesavel: boolean("pesavel"), // NULL = legado sem conferencia; novos cadastros recebem false
    teclaBalanca: integer("tecla_balanca"),
    validadeBalanca: integer("validade_balanca"),
    grupoIdExterno: text("grupo_id_externo"),
    areaVenda: text("area_venda"),
    marca: text("marca"),
    compraAproximada: boolean("compra_aproximada").notNull().default(false),
    habilitarAjuda: boolean("habilitar_ajuda").notNull().default(false),
    // Doc 59 (Rodrigo, 29/10/2026): so o produto liberado entra no pedido de Compras. Comeca desligado; nao
    // liberado continua ativo e vendendo, so nao e pedido.
    liberadoCompra: boolean("liberado_compra").notNull().default(false),
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
    // Area e local sao dimensoes diferentes: area organiza o estoque; local identifica onde o
    // produto fica guardado. Curva ABC e classificacao manual ate existir regra de calculo aprovada.
    areaEstoque: text("area_estoque"),
    setorEstoque: text("setor_estoque"),
    curvaAbc: text("curva_abc").$type<"A" | "B" | "C" | null>(),
    quantidadeVariavel: boolean("quantidade_variavel").notNull().default(false),
    toleranciaQuantidadePercentual: numeric("tolerancia_quantidade_percentual", { precision: 5, scale: 2 }),
    // Locais de venda e foto
    localVenda1: text("local_venda_1"),
    localVenda2: text("local_venda_2"),
    setorVenda1: text("setor_venda_1"),
    setorVenda2: text("setor_venda_2"),
    fotoUrl: text("foto_url"),
    criadoPor: text("criado_por"), // auditoria (usuarioId; nome resolvido via join)
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("produtos_id_empresa_unica").on(table.id, table.empresaId),
    foreignKey({
      name: "produtos_grupo_mercadoria_mesma_empresa_fk",
      columns: [table.grupoMercadoriaId, table.empresaId],
      foreignColumns: [gruposMercadorias.id, gruposMercadorias.empresaId]
    }).onDelete("restrict"),
    // codigo interno unico por empresa (NULLs sao distintos no Postgres, entao produtos ainda sem codigo convivem)
    uniqueIndex("produtos_codigo_interno_empresa_uidx").on(table.empresaId, table.codigoInterno),
    uniqueIndex("produtos_empresa_produto_base_uidx")
      .on(table.empresaId, table.produtoBaseId)
      .where(sql`${table.produtoBaseId} is not null`),
    check("produtos_status_check", sql`${table.status} in ('ativo', 'inativo')`),
    check("produtos_tipo_check", sql`${table.tipo} in ('revenda', 'transformacao')`),
    check("produtos_curva_abc_check", sql`${table.curvaAbc} is null or ${table.curvaAbc} in ('A', 'B', 'C')`),
    check(
      "produtos_quantidade_variavel_tolerancia_check",
      sql`(${table.quantidadeVariavel} = false and ${table.toleranciaQuantidadePercentual} is null) or (${table.quantidadeVariavel} = true and ${table.toleranciaQuantidadePercentual} between 0 and 30)`
    )
  ]
);

/** Trilha imutável das mudanças no nome oficial do produto, sempre isolada por empresa. */
export const produtosHistoricoNomes = pgTable(
  "produtos_historico_nomes",
  {
    id: idUuid,
    empresaId,
    produtoId: uuid("produto_id").notNull(),
    nomeAnterior: text("nome_anterior").notNull(),
    nomeNovo: text("nome_novo").notNull(),
    alteradoPor: text("alterado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    alteradoPorNome: text("alterado_por_nome"),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "produtos_historico_nomes_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    index("produtos_historico_nomes_empresa_produto_data_idx").on(
      table.empresaId,
      table.produtoId,
      table.alteradoEm.desc()
    )
  ]
);

/**
 * Historico de codigo interno (R-222, migration 0089; oficial `product_codigo_interno_history`): toda
 * troca feita pela reconciliacao do codigo de cadastro, na BASE (`produto_base_id`) ou num produto de loja
 * (`empresa_id` + `produto_id`) — e o "desfazer" possivel de um lote que troca codigos no PDV.
 */
export const produtosHistoricoCodigoInterno = pgTable(
  "produtos_historico_codigo_interno",
  {
    id: idUuid,
    empresaId: uuid("empresa_id"),
    produtoId: uuid("produto_id"),
    produtoBaseId: uuid("produto_base_id"),
    codigoAnterior: text("codigo_anterior"),
    codigoNovo: text("codigo_novo").notNull(),
    fonte: text("fonte").notNull(),
    alteradoPor: text("alterado_por"),
    alteradoPorNome: text("alterado_por_nome"),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "produtos_historico_codigo_interno_alvo_check",
      sql`(${table.empresaId} is null and ${table.produtoBaseId} is not null and ${table.produtoId} is null) or (${table.empresaId} is not null and ${table.produtoId} is not null and ${table.produtoBaseId} is null)`
    ),
    foreignKey({
      name: "prod_hist_codigo_empresa_fk",
      columns: [table.empresaId],
      foreignColumns: [empresas.id]
    }).onDelete("cascade"),
    foreignKey({
      name: "prod_hist_codigo_produto_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "prod_hist_codigo_base_fk",
      columns: [table.produtoBaseId],
      foreignColumns: [produtosCatalogoBase.id]
    }).onDelete("cascade"),
    foreignKey({
      name: "prod_hist_codigo_alterado_por_fk",
      columns: [table.alteradoPor],
      foreignColumns: [perfisUsuarios.usuarioId]
    }).onDelete("set null"),
    index("prod_hist_codigo_produto_idx").on(table.empresaId, table.produtoId, table.alteradoEm.desc()),
    index("prod_hist_codigo_base_idx").on(table.produtoBaseId, table.alteradoEm.desc())
  ]
);

// --- Exportacao para o PDV CREARE e espelho na planilha (R-222, migration 0088) ----------------
// Porte das tabelas do app oficial de Produtos (creare_export_batch / _delivery_state / _state e
// product_sheet_sync), com empresa_id no lugar do texto da loja. Escrita DESLIGADA ate a virada.

/** Cada TXT montado para o robo da loja: snapshot imutavel (conteudo, hash e itens). */
export const creareExportacaoLotes = pgTable(
  "creare_exportacao_lotes",
  {
    id: idUuid,
    empresaId,
    conteudo: text("conteudo").notNull(),
    sha256: text("sha256").notNull(),
    /** [{ produtoId, hash }] — o que este lote leva, igual ao oficial. */
    itens: jsonb("itens").$type<Array<{ produtoId: string; hash: string }>>().notNull(),
    formatoVersao: integer("formato_versao").notNull().default(1),
    criadoEm,
    entregueEm: timestamp("entregue_em", { withTimezone: true }),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true })
  },
  (table) => [
    unique("creare_exportacao_lotes_id_empresa_unico").on(table.id, table.empresaId),
    check("creare_exportacao_lotes_sha256_check", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "creare_exportacao_lotes_itens_check",
      sql`jsonb_typeof(${table.itens}) = 'array' and jsonb_array_length(${table.itens}) > 0`
    ),
    check("creare_exportacao_lotes_conteudo_check", sql`length(${table.conteudo}) > 0`),
    check("creare_exportacao_lotes_formato_versao_check", sql`${table.formatoVersao} >= 1`),
    // Um lote aberto por loja (junto com a trava da empresa na transacao).
    uniqueIndex("creare_exportacao_lotes_aberto_uidx")
      .on(table.empresaId)
      .where(sql`${table.entregueEm} is null and ${table.confirmadoEm} is null and ${table.canceladoEm} is null`),
    index("creare_exportacao_lotes_empresa_criado_idx").on(table.empresaId, table.criadoEm)
  ]
);

/** Cursor de ENTREGA no PC da loja: o hash do registro de cada produto que o robo ja salvou. */
export const creareExportacaoEntregas = pgTable(
  "creare_exportacao_entregas",
  {
    empresaId,
    produtoId: uuid("produto_id").notNull(),
    hash: text("hash").notNull(),
    loteId: uuid("lote_id").notNull(),
    entregueEm: timestamp("entregue_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "creare_exportacao_entregas_empresa_id_produto_id_pk",
      columns: [table.empresaId, table.produtoId]
    }),
    check("creare_exportacao_entregas_hash_check", sql`${table.hash} ~ '^[a-f0-9]{64}$'`),
    foreignKey({
      name: "creare_exportacao_entregas_produto_mesma_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "creare_exportacao_entregas_lote_mesma_empresa_fk",
      columns: [table.loteId, table.empresaId],
      foreignColumns: [creareExportacaoLotes.id, creareExportacaoLotes.empresaId]
    }).onDelete("restrict"),
    index("creare_exportacao_entregas_lote_idx").on(table.loteId)
  ]
);

/** Cursor de CONFIRMACAO (auditoria opcional depois de conferir a importacao no SIA). */
export const creareExportacaoConfirmacoes = pgTable(
  "creare_exportacao_confirmacoes",
  {
    empresaId,
    produtoId: uuid("produto_id").notNull(),
    hash: text("hash").notNull(),
    loteId: uuid("lote_id").notNull(),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "creare_exportacao_confirmacoes_empresa_id_produto_id_pk",
      columns: [table.empresaId, table.produtoId]
    }),
    check("creare_exportacao_confirmacoes_hash_check", sql`${table.hash} ~ '^[a-f0-9]{64}$'`),
    foreignKey({
      name: "creare_exportacao_confirmacoes_produto_mesma_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "creare_exportacao_confirmacoes_lote_mesma_empresa_fk",
      columns: [table.loteId, table.empresaId],
      foreignColumns: [creareExportacaoLotes.id, creareExportacaoLotes.empresaId]
    }).onDelete("restrict"),
    index("creare_exportacao_confirmacoes_lote_idx").on(table.loteId)
  ]
);

/**
 * Fila (outbox) do espelho na planilha Google: uma linha por produto da BASE (sem empresa) ou por
 * copia da loja (com empresa) — nunca os dois. Reenvio com espera crescente e teto de tentativas.
 */
export const produtosPlanilhaSincronizacoes = pgTable(
  "produtos_planilha_sincronizacoes",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id"),
    produtoBaseId: uuid("produto_base_id"),
    planilhaId: text("planilha_id").notNull(),
    aba: text("aba").notNull(),
    linha: integer("linha"),
    status: text("status").notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "produtos_planilha_sincronizacoes_status_check",
      sql`${table.status} in ('pendente', 'sincronizado', 'falhou')`
    ),
    check("produtos_planilha_sincronizacoes_tentativas_check", sql`${table.tentativas} >= 0`),
    check("produtos_planilha_sincronizacoes_linha_check", sql`${table.linha} is null or ${table.linha} > 0`),
    check(
      "produtos_planilha_sincronizacoes_alvo_check",
      sql`(${table.empresaId} is null and ${table.produtoBaseId} is not null and ${table.produtoId} is null) or (${table.empresaId} is not null and ${table.produtoId} is not null and ${table.produtoBaseId} is null)`
    ),
    foreignKey({
      name: "produtos_planilha_sincronizacoes_produto_mesma_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    // Nome curto de proposito: o gerado passaria de 63 bytes e o Postgres o cortaria.
    foreignKey({
      name: "produtos_planilha_sincronizacoes_base_fk",
      columns: [table.produtoBaseId],
      foreignColumns: [produtosCatalogoBase.id]
    }).onDelete("cascade"),
    uniqueIndex("produtos_planilha_sincronizacoes_produto_uidx")
      .on(table.produtoId)
      .where(sql`${table.produtoId} is not null`),
    uniqueIndex("produtos_planilha_sincronizacoes_produto_base_uidx")
      .on(table.produtoBaseId)
      .where(sql`${table.produtoBaseId} is not null`),
    index("produtos_planilha_sincronizacoes_fila_idx").on(table.status, table.proximaTentativaEm, table.atualizadoEm)
  ]
);

export const fornecedoresProdutos = pgTable(
  "fornecedores_produtos",
  {
    id: idUuid,
    empresaId,
    fornecedorId: uuid("fornecedor_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    status: text("status").$type<"pendente" | "aprovado" | "rejeitado">().notNull().default("pendente"),
    origem: text("origem").$type<"compras" | "fornecedor">().notNull(),
    precoOfertado: numeric("preco_ofertado", { precision: 14, scale: 4 }),
    observacao: text("observacao"),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    aprovadoPor: text("aprovado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("fornecedores_produtos_empresa_fornecedor_produto_unico").on(
      table.empresaId,
      table.fornecedorId,
      table.produtoId
    ),
    foreignKey({
      name: "fornecedores_produtos_fornecedor_empresa_fk",
      columns: [table.fornecedorId, table.empresaId],
      foreignColumns: [fornecedores.id, fornecedores.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "fornecedores_produtos_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("cascade"),
    check("fornecedores_produtos_status_check", sql`${table.status} in ('pendente', 'aprovado', 'rejeitado')`),
    check("fornecedores_produtos_origem_check", sql`${table.origem} in ('compras', 'fornecedor')`),
    check("fornecedores_produtos_preco_check", sql`${table.precoOfertado} is null or ${table.precoOfertado} >= 0`),
    index("fornecedores_produtos_empresa_status_idx").on(table.empresaId, table.status),
    index("fornecedores_produtos_fornecedor_idx").on(table.fornecedorId)
  ]
);

export const fornecedoresProdutosEventos = pgTable(
  "fornecedores_produtos_eventos",
  {
    id: idUuid,
    empresaId,
    fornecedorProdutoId: uuid("fornecedor_produto_id")
      .notNull()
      .references(() => fornecedoresProdutos.id, { onDelete: "cascade" }),
    statusAnterior: text("status_anterior").$type<"pendente" | "aprovado" | "rejeitado">(),
    statusNovo: text("status_novo").$type<"pendente" | "aprovado" | "rejeitado">().notNull(),
    precoOfertado: numeric("preco_ofertado", { precision: 14, scale: 4 }),
    atorTipo: text("ator_tipo").$type<"usuario" | "fornecedor" | "sistema">().notNull(),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    observacao: text("observacao"),
    criadoEm
  },
  (table) => [
    check(
      "fornecedores_produtos_eventos_status_anterior_check",
      sql`${table.statusAnterior} is null or ${table.statusAnterior} in ('pendente', 'aprovado', 'rejeitado')`
    ),
    check(
      "fornecedores_produtos_eventos_status_novo_check",
      sql`${table.statusNovo} in ('pendente', 'aprovado', 'rejeitado')`
    ),
    check(
      "fornecedores_produtos_eventos_ator_tipo_check",
      sql`${table.atorTipo} in ('usuario', 'fornecedor', 'sistema')`
    ),
    check(
      "fornecedores_produtos_eventos_usuario_check",
      sql`(${table.atorTipo} = 'usuario' and ${table.usuarioId} is not null) or (${table.atorTipo} <> 'usuario')`
    ),
    index("fornecedores_produtos_eventos_vinculo_criado_idx").on(table.fornecedorProdutoId, table.criadoEm)
  ]
);

export const comprasImportacoesPrecoBase = pgTable(
  "compras_importacoes_preco_base",
  {
    id: idUuid,
    empresaId,
    nomeArquivo: text("nome_arquivo").notNull(),
    hashArquivo: text("hash_arquivo").notNull(),
    status: text("status").$type<"analisada" | "aplicada" | "cancelada">().notNull().default("analisada"),
    totalLinhas: integer("total_linhas").notNull(),
    totalCorrespondencias: integer("total_correspondencias").notNull().default(0),
    totalAmbiguidades: integer("total_ambiguidades").notNull().default(0),
    totalNaoEncontrados: integer("total_nao_encontrados").notNull().default(0),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    aplicadoPor: text("aplicado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm,
    aplicadoEm: timestamp("aplicado_em", { withTimezone: true })
  },
  (table) => [
    unique("compras_importacoes_preco_base_empresa_hash_unico").on(table.empresaId, table.hashArquivo),
    check(
      "compras_importacoes_preco_base_status_check",
      sql`${table.status} in ('analisada', 'aplicada', 'cancelada')`
    ),
    check(
      "compras_importacoes_preco_base_totais_check",
      sql`${table.totalLinhas} >= 0 and ${table.totalCorrespondencias} >= 0 and ${table.totalAmbiguidades} >= 0 and ${table.totalNaoEncontrados} >= 0`
    ),
    index("compras_importacoes_preco_base_empresa_criado_idx").on(table.empresaId, table.criadoEm)
  ]
);

export const comprasImportacoesPrecoBaseItens = pgTable(
  "compras_importacoes_preco_base_itens",
  {
    id: idUuid,
    importacaoId: uuid("importacao_id")
      .notNull()
      .references(() => comprasImportacoesPrecoBase.id, { onDelete: "cascade" }),
    numeroLinha: integer("numero_linha").notNull(),
    codigoInformado: text("codigo_informado"),
    eanInformado: text("ean_informado"),
    descricaoInformada: text("descricao_informada").notNull(),
    descricaoNormalizada: text("descricao_normalizada").notNull(),
    valorInformado: numeric("valor_informado", { precision: 14, scale: 4 }).notNull(),
    produtoId: uuid("produto_id").references(() => produtos.id, { onDelete: "restrict" }),
    resultado: text("resultado").$type<"correspondencia" | "ambiguidade" | "nao_encontrado" | "invalido">().notNull(),
    detalhe: text("detalhe"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("compras_importacoes_preco_base_itens_importacao_linha_unica").on(table.importacaoId, table.numeroLinha),
    check("compras_importacoes_preco_base_itens_linha_check", sql`${table.numeroLinha} > 0`),
    check("compras_importacoes_preco_base_itens_valor_check", sql`${table.valorInformado} >= 0`),
    check(
      "compras_importacoes_preco_base_itens_resultado_check",
      sql`${table.resultado} in ('correspondencia', 'ambiguidade', 'nao_encontrado', 'invalido')`
    ),
    index("compras_importacoes_preco_base_itens_importacao_resultado_idx").on(table.importacaoId, table.resultado)
  ]
);

export const produtosPrecosBase = pgTable(
  "produtos_precos_base",
  {
    id: idUuid,
    empresaId,
    produtoId: uuid("produto_id").notNull(),
    valor: numeric("valor", { precision: 14, scale: 4 }).notNull(),
    origem: text("origem").$type<"importacao" | "rodada">().notNull(),
    importacaoItemId: uuid("importacao_item_id").references(() => comprasImportacoesPrecoBaseItens.id, {
      onDelete: "restrict"
    }),
    // Fase 2: base vinda de rodada aponta a rodada que a gerou. Substitui `referencia_externa`, que
    // era placeholder de texto sem FK. FK simples (produtos_precos_base tem empresa_id, mesma empresa
    // garantida no codigo). `referencia_externa` sai na migration seguinte (drop isolado).
    rodadaId: uuid("rodada_id").references((): AnyPgColumn => comprasRodadas.id, { onDelete: "restrict" }),
    validoDesde: timestamp("valido_desde", { withTimezone: true }).notNull().defaultNow(),
    validoAte: timestamp("valido_ate", { withTimezone: true }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm
  },
  (table) => [
    foreignKey({
      name: "produtos_precos_base_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("restrict"),
    check("produtos_precos_base_valor_check", sql`${table.valor} >= 0`),
    check("produtos_precos_base_origem_check", sql`${table.origem} in ('importacao', 'rodada')`),
    check(
      "produtos_precos_base_origem_referencia_check",
      sql`(${table.origem} = 'importacao' and ${table.importacaoItemId} is not null) or (${table.origem} = 'rodada' and ${table.rodadaId} is not null)`
    ),
    check(
      "produtos_precos_base_validade_check",
      sql`${table.validoAte} is null or ${table.validoAte} > ${table.validoDesde}`
    ),
    uniqueIndex("produtos_precos_base_atual_unico_idx")
      .on(table.empresaId, table.produtoId)
      .where(sql`${table.validoAte} is null`),
    index("produtos_precos_base_empresa_produto_historico_idx").on(table.empresaId, table.produtoId, table.validoDesde)
  ]
);

// R-222 (PROJECT_BRAIN/55): historico de compras por fornecedor x produto, vindo da planilha de
// discriminacao e (depois) do recebimento. Duas fases como o preco-base: a ANALISE guarda cada linha
// com o resultado do pareamento; a APLICACAO grava so as pareadas, em `compras_historico_precos`
// (imutavel). Nada aqui altera `produtos_precos_base`.
export const fornecedoresAliases = pgTable(
  "fornecedores_aliases",
  {
    id: idUuid,
    empresaId,
    fornecedorId: uuid("fornecedor_id").notNull(),
    aliasNormalizado: text("alias_normalizado").notNull(),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoEm
  },
  (table) => [
    unique("fornecedores_aliases_empresa_alias_unico").on(table.empresaId, table.aliasNormalizado),
    foreignKey({
      name: "fornecedores_aliases_fornecedor_empresa_fk",
      columns: [table.fornecedorId, table.empresaId],
      foreignColumns: [fornecedores.id, fornecedores.empresaId]
    }).onDelete("cascade"),
    index("fornecedores_aliases_fornecedor_idx").on(table.fornecedorId)
  ]
);

export const comprasHistoricoImportacoes = pgTable(
  "compras_historico_importacoes",
  {
    id: idUuid,
    empresaId,
    nomeArquivo: text("nome_arquivo").notNull(),
    hashArquivo: text("hash_arquivo").notNull(),
    status: text("status").$type<"analisada" | "aplicada" | "cancelada">().notNull().default("analisada"),
    totalLinhas: integer("total_linhas").notNull(),
    totalPareadas: integer("total_pareadas").notNull().default(0),
    totalPendentes: integer("total_pendentes").notNull().default(0),
    totalAplicadas: integer("total_aplicadas").notNull().default(0),
    periodoInicio: date("periodo_inicio"),
    periodoFim: date("periodo_fim"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    aplicadoPor: text("aplicado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    aplicadoEm: timestamp("aplicado_em", { withTimezone: true })
  },
  (table) => [
    unique("compras_historico_importacoes_empresa_hash_unico").on(table.empresaId, table.hashArquivo),
    check("compras_historico_importacoes_status_check", sql`${table.status} in ('analisada', 'aplicada', 'cancelada')`),
    check(
      "compras_historico_importacoes_totais_check",
      sql`${table.totalLinhas} >= 0 and ${table.totalPareadas} >= 0 and ${table.totalPendentes} >= 0 and ${table.totalAplicadas} >= 0`
    ),
    index("compras_historico_importacoes_empresa_criado_idx").on(table.empresaId, table.criadoEm)
  ]
);

export const comprasHistoricoImportacaoItens = pgTable(
  "compras_historico_importacao_itens",
  {
    id: idUuid,
    importacaoId: uuid("importacao_id")
      .notNull()
      .references(() => comprasHistoricoImportacoes.id, { onDelete: "cascade" }),
    numeroLinha: integer("numero_linha").notNull(),
    fornecedorInformado: text("fornecedor_informado").notNull(),
    fornecedorNormalizado: text("fornecedor_normalizado").notNull(),
    produtoInformado: text("produto_informado").notNull(),
    produtoNormalizado: text("produto_normalizado").notNull(),
    dataCompra: date("data_compra"),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }),
    custoUnitario: numeric("custo_unitario", { precision: 14, scale: 4 }),
    documento: text("documento"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "restrict" }),
    produtoId: uuid("produto_id").references(() => produtos.id, { onDelete: "restrict" }),
    resultado: text("resultado")
      .$type<"correspondencia" | "fornecedor_nao_encontrado" | "produto_nao_encontrado" | "ambiguidade" | "invalido">()
      .notNull(),
    detalhe: text("detalhe")
  },
  (table) => [
    unique("compras_historico_itens_linha_unica").on(table.importacaoId, table.numeroLinha),
    check("compras_historico_itens_linha_check", sql`${table.numeroLinha} > 0`),
    check(
      "compras_historico_itens_resultado_check",
      sql`${table.resultado} in ('correspondencia', 'fornecedor_nao_encontrado', 'produto_nao_encontrado', 'ambiguidade', 'invalido')`
    ),
    index("compras_historico_itens_importacao_resultado_idx").on(table.importacaoId, table.resultado)
  ]
);

export const comprasHistoricoPrecos = pgTable(
  "compras_historico_precos",
  {
    id: idUuid,
    empresaId,
    fornecedorId: uuid("fornecedor_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    dataCompra: date("data_compra").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    custoUnitario: numeric("custo_unitario", { precision: 14, scale: 4 }).notNull(),
    documento: text("documento"),
    origem: text("origem").$type<"planilha" | "recebimento">().notNull(),
    importacaoItemId: uuid("importacao_item_id").references(() => comprasHistoricoImportacaoItens.id, {
      onDelete: "restrict"
    }),
    // Reservado para o recebimento gravar a propria linha (decisao 7 do doc 55); sem escritor ainda.
    pedidoItemId: uuid("pedido_item_id").references(() => pedidosItens.id, { onDelete: "restrict" }),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoEm
  },
  (table) => [
    check("compras_historico_precos_quantidade_check", sql`${table.quantidade} > 0`),
    check("compras_historico_precos_custo_check", sql`${table.custoUnitario} > 0`),
    check("compras_historico_precos_origem_check", sql`${table.origem} in ('planilha', 'recebimento')`),
    check(
      "compras_historico_precos_origem_referencia_check",
      sql`(${table.origem} = 'planilha' and ${table.importacaoItemId} is not null and ${table.pedidoItemId} is null) or (${table.origem} = 'recebimento' and ${table.pedidoItemId} is not null and ${table.importacaoItemId} is null)`
    ),
    unique("compras_historico_precos_importacao_unica").on(table.importacaoItemId),
    foreignKey({
      name: "compras_historico_precos_fornecedor_empresa_fk",
      columns: [table.fornecedorId, table.empresaId],
      foreignColumns: [fornecedores.id, fornecedores.empresaId]
    }).onDelete("restrict"),
    foreignKey({
      name: "compras_historico_precos_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("restrict"),
    index("compras_historico_precos_produto_data_idx").on(table.empresaId, table.produtoId, table.dataCompra.desc()),
    index("compras_historico_precos_fornecedor_data_idx").on(
      table.empresaId,
      table.fornecedorId,
      table.dataCompra.desc()
    )
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
  tributacaoSimples: text("tributacao_simples"),
  aliquotaSimples: numeric("aliquota_simples", { precision: 8, scale: 6 }),
  icmsRe: numeric("icms_re", { precision: 8, scale: 6 }),
  baseFiscal: text("base_fiscal"),
  codigoFiscal: text("codigo_fiscal"),
  produtoFiscal: text("produto_fiscal"),
  cstReforma: text("cst_reforma"),
  cClassTrib: text("cclass_trib"),
  aliquotaIbs: numeric("aliquota_ibs", { precision: 8, scale: 6 }),
  aliquotaCbs: numeric("aliquota_cbs", { precision: 8, scale: 6 }),
  origemFiscal: text("origem_fiscal"),
  aliquotaEcf: text("aliquota_ecf"),
  aliquotaEcfId: text("aliquota_ecf_id"),
  estado: text("estado"),
  motivo: text("motivo"),
  conferidoEm: timestamp("conferido_em", { withTimezone: true }),
  pctNcm: numeric("pct_ncm", { precision: 6, scale: 4 }),
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
    refReceituario: text("ref_receituario"),
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
    // Auditoria de cancelamento recebida da automacao. Nao e usuario do Pralis: e o identificador
    // cru do gerente no CREARE, mantido para rastreabilidade sem importar senha ou credencial.
    cancelamentoAutorizadoPorAutomacaoId: text("cancelamento_autorizado_por_automacao_id"),
    cancelamentoAutorizadoPorAutomacao: text("cancelamento_autorizado_por_automacao"),
    cancelamentoJustificativa: text("cancelamento_justificativa"),
    cancelamentoMotivo: text("cancelamento_motivo"),
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

// PEDIDOS de compra/reposicao de estoque. Cada pedido NOVO pertence a um unico fornecedor; o
// fornecedor por item fica apenas como fotografia dos pedidos legados. Agendamento e lembrete de
// revisao/geracao, nunca envia pedido sem revisao humana.
export const pedidos = pgTable(
  "pedidos",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").notNull().default("manual"),
    status: text("status").notNull().default("a_fazer"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "restrict" }),
    dataAgendada: timestamp("data_agendada", { withTimezone: true }),
    recorrencia: text("recorrencia").notNull().default("nenhuma"),
    observacao: text("observacao"),
    criadoPor: text("criado_por"),
    aprovadoPor: text("aprovado_por"),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    // Fase 2: o pedido consolidado nasce de uma rodada. `tipo='rodada'`, e estes apontam a origem.
    // FK simples porque pedidos nao tem (id, empresa_id) unico; a mesma empresa e garantida no codigo.
    solicitacaoId: uuid("solicitacao_id").references((): AnyPgColumn => comprasSolicitacoes.id, {
      onDelete: "restrict"
    }),
    rodadaId: uuid("rodada_id").references((): AnyPgColumn => comprasRodadas.id, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("pedidos_tipo_check", sql`${table.tipo} in ('manual', 'automatico', 'rodada')`),
    // rascunho/aprovado ficam somente para leitura de historico, sem escritor no fluxo novo.
    check(
      "pedidos_status_check",
      sql`${table.status} in ('rascunho', 'aprovado', 'a_fazer', 'enviado', 'cotado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado')`
    ),
    check("pedidos_recorrencia_check", sql`${table.recorrencia} in ('nenhuma', 'semanal', 'quinzenal', 'mensal')`),
    index("pedidos_empresa_status_idx").on(table.empresaId, table.status),
    // Consolidacao por fornecedor: um pedido CONFIRMADO por (rodada, fornecedor). A adjudicacao
    // seguinte acrescenta item ao mesmo pedido enquanto ele estiver confirmado; se ja comecou a ser
    // recebido, nasce um segundo pedido (por isso o indice e parcial em 'confirmado').
    uniqueIndex("pedidos_rodada_fornecedor_confirmado_idx")
      .on(table.rodadaId, table.fornecedorId)
      .where(sql`${table.status} = 'confirmado'`)
  ]
);

// Trilha imutavel do ciclo do pedido. A atualizacao do status e o evento sao gravados juntos na
// transacao de dominio; a tabela e a explicacao de quem fez cada ato e quando.
export const pedidosEventos = pgTable(
  "pedidos_eventos",
  {
    id: idUuid,
    empresaId,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    observacao: text("observacao"),
    // Nulo SO quando o ato e do fornecedor pelo link de cotacao (R-216): ele nao tem conta, e gravar
    // o Comprador como autor de "Retornado" atribuiria a resposta a quem nao respondeu.
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    cotacaoId: uuid("cotacao_id").references((): AnyPgColumn => pedidosCotacoes.id, { onDelete: "restrict" }),
    // Fase 2: o evento 'confirmado' da compra automatica tem como autor a PROPOSTA do fornecedor,
    // nao uma pessoa — e literalmente verdadeiro (R-221, pre-autorizacao pelo preco-base).
    propostaId: uuid("proposta_id").references((): AnyPgColumn => comprasPropostas.id, { onDelete: "restrict" }),
    criadoEm
  },
  (table) => [
    check(
      "pedidos_eventos_autor_check",
      sql`num_nonnulls(${table.criadoPor}, ${table.cotacaoId}, ${table.propostaId}) >= 1`
    ),
    check(
      "pedidos_eventos_status_check",
      sql`${table.status} in ('a_fazer', 'enviado', 'cotado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado')`
    ),
    index("pedidos_eventos_empresa_pedido_criado_idx").on(table.empresaId, table.pedidoId, table.criadoEm)
  ]
);

// Uma conferencia fisica pode receber parte do pedido. A chave de idempotencia impede que retry da
// mesma intencao some o estoque duas vezes.
export const pedidosRecebimentos = pgTable(
  "pedidos_recebimentos",
  {
    id: idUuid,
    empresaId,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    observacao: text("observacao"),
    idempotenciaChave: uuid("idempotencia_chave").notNull(),
    recebidoPor: text("recebido_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("pedidos_recebimentos_empresa_idempotencia_unica").on(table.empresaId, table.idempotenciaChave),
    index("pedidos_recebimentos_empresa_pedido_recebido_idx").on(table.empresaId, table.pedidoId, table.recebidoEm)
  ]
);

// Doc 58 §7: devolucao no recebimento. O que volta ao fornecedor fecha o item sem entrar no estoque.
export const pedidosDevolucoes = pgTable(
  "pedidos_devolucoes",
  {
    id: idUuid,
    empresaId,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    pedidoItemId: uuid("pedido_item_id")
      .notNull()
      .references(() => pedidosItens.id, { onDelete: "restrict" }),
    pedidoRecebimentoId: uuid("pedido_recebimento_id")
      .notNull()
      .references(() => pedidosRecebimentos.id, { onDelete: "restrict" }),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    motivo: text("motivo").notNull(),
    devolvidoPor: text("devolvido_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm
  },
  (table) => [
    unique("pedidos_devolucoes_recebimento_item_unico").on(table.pedidoRecebimentoId, table.pedidoItemId),
    check("pedidos_devolucoes_quantidade_check", sql`${table.quantidade} > 0`),
    check("pedidos_devolucoes_motivo_check", sql`btrim(${table.motivo}) <> ''`),
    index("pedidos_devolucoes_empresa_pedido_idx").on(table.empresaId, table.pedidoId)
  ]
);

// Agenda da conferencia fisica. Agendar nao altera saldo: a divergencia so tera efeito quando a
// regra propria de inventario for definida e implementada.
export const conferenciasEstoque = pgTable(
  "conferencias_estoque",
  {
    id: idUuid,
    empresaId,
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id, { onDelete: "set null" }),
    areaEstoque: text("area_estoque"),
    localVenda: text("local_venda"),
    localEstoque: text("local_estoque"),
    curvaAbc: text("curva_abc").$type<"A" | "B" | "C" | null>(),
    agendadaPara: timestamp("agendada_para", { withTimezone: true }).notNull(),
    observacao: text("observacao"),
    status: text("status").notNull().default("agendada"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm,
    // Doc 57 §2: a conferencia do dia nasce de uma agenda, tem quem conta e um recorte por ranking.
    agendaId: uuid("agenda_id").references((): AnyPgColumn => conferenciasAgendas.id, { onDelete: "set null" }),
    previstoPara: timestamp("previsto_para", { withTimezone: true }),
    responsavelId: text("responsavel_id").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    ranking: text("ranking").$type<RankingConferencia | null>(),
    concluidaPor: text("concluida_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true })
  },
  (table) => [
    check("conferencias_estoque_status_check", sql`${table.status} in ('agendada', 'cancelada', 'concluida')`),
    check(
      "conferencias_estoque_ranking_check",
      sql`${table.ranking} is null or ${table.ranking} in ('mais_vendidos', 'mais_comprados', 'mais_lucro')`
    ),
    unique("conferencias_estoque_agenda_data_unica").on(table.agendaId, table.previstoPara),
    check(
      "conferencias_estoque_curva_abc_check",
      sql`${table.curvaAbc} is null or ${table.curvaAbc} in ('A', 'B', 'C')`
    ),
    index("conferencias_estoque_empresa_agendada_idx").on(table.empresaId, table.agendadaPara)
  ]
);

// Doc 57 §2: agendamento de conferencia de estoque, com a mesma recorrencia do agendamento de pedido.
export const conferenciasAgendas = pgTable(
  "conferencias_agendas",
  {
    id: idUuid,
    empresaId,
    // Quem conta: recebe o aviso no sino na data.
    responsavelId: text("responsavel_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id, { onDelete: "restrict" }),
    ranking: text("ranking").$type<RankingConferencia | null>(),
    areaEstoque: text("area_estoque"),
    localEstoque: text("local_estoque"),
    localVenda: text("local_venda"),
    inicioEm: timestamp("inicio_em", { withTimezone: true }).notNull(),
    fusoHorario: text("fuso_horario").notNull(),
    regra: jsonb("regra").$type<RegraRecorrencia>().notNull(),
    terminoTipo: text("termino_tipo").$type<"nunca" | "data" | "quantidade">().notNull().default("nunca"),
    terminoEm: date("termino_em"),
    terminoQuantidade: integer("termino_quantidade"),
    observacao: text("observacao"),
    status: text("status").$type<"ativa" | "encerrada">().notNull().default("ativa"),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "conferencias_agendas_ranking_check",
      sql`${table.ranking} is null or ${table.ranking} in ('mais_vendidos', 'mais_comprados', 'mais_lucro')`
    ),
    check("conferencias_agendas_status_check", sql`${table.status} in ('ativa', 'encerrada')`),
    check(
      "conferencias_agendas_encerramento_check",
      sql`(${table.status} = 'encerrada') = (${table.encerradaEm} is not null)`
    ),
    check("conferencias_agendas_fuso_check", sql`btrim(${table.fusoHorario}) <> ''`),
    check(
      "conferencias_agendas_termino_check",
      sql`(${table.terminoTipo} = 'nunca' and ${table.terminoEm} is null and ${table.terminoQuantidade} is null) or (${table.terminoTipo} = 'data' and ${table.terminoEm} is not null and ${table.terminoQuantidade} is null) or (${table.terminoTipo} = 'quantidade' and ${table.terminoQuantidade} between 1 and 999 and ${table.terminoEm} is null)`
    ),
    index("conferencias_agendas_empresa_status_idx").on(table.empresaId, table.status)
  ]
);

// A contagem: o saldo do sistema no momento e o que foi contado. NAO move estoque (doc 57 §6.2).
export const conferenciasEstoqueItens = pgTable(
  "conferencias_estoque_itens",
  {
    id: idUuid,
    empresaId,
    conferenciaId: uuid("conferencia_id")
      .notNull()
      .references(() => conferenciasEstoque.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").notNull(),
    saldoSistema: numeric("saldo_sistema", { precision: 14, scale: 3 }).notNull(),
    quantidadeContada: numeric("quantidade_contada", { precision: 14, scale: 3 }),
    contadoPor: text("contado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    contadoEm: timestamp("contado_em", { withTimezone: true })
  },
  (table) => [
    unique("conferencias_estoque_itens_unico").on(table.conferenciaId, table.produtoId),
    foreignKey({
      name: "conferencias_estoque_itens_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("restrict"),
    check(
      "conferencias_estoque_itens_contagem_check",
      sql`${table.quantidadeContada} is null or ${table.quantidadeContada} >= 0`
    ),
    check(
      "conferencias_estoque_itens_autoria_check",
      sql`(${table.quantidadeContada} is null) = (${table.contadoPor} is null and ${table.contadoEm} is null)`
    )
  ]
);

// Doc 57 §3: o sistema envia pelo WhatsApp (ninguem copia link). Fila de saida, processada no tick de Compras.
export const comprasWhatsappEnvios = pgTable(
  "compras_whatsapp_envios",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<"convite" | "pedido_confirmado">().notNull(),
    conviteId: uuid("convite_id").references((): AnyPgColumn => comprasRodadasConvites.id, { onDelete: "cascade" }),
    pedidoId: uuid("pedido_id").references((): AnyPgColumn => pedidos.id, { onDelete: "cascade" }),
    telefone: text("telefone").notNull(),
    status: text("status").$type<"pendente" | "enviado" | "falhou">().notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    mensagemExternaId: text("mensagem_externa_id"),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("compras_whatsapp_envios_tipo_check", sql`${table.tipo} in ('convite', 'pedido_confirmado')`),
    check("compras_whatsapp_envios_status_check", sql`${table.status} in ('pendente', 'enviado', 'falhou')`),
    check(
      "compras_whatsapp_envios_referencia_check",
      sql`(${table.tipo} = 'convite' and ${table.conviteId} is not null) or (${table.tipo} = 'pedido_confirmado' and ${table.pedidoId} is not null)`
    ),
    check("compras_whatsapp_envios_tentativas_check", sql`${table.tentativas} >= 0`),
    index("compras_whatsapp_envios_status_idx").on(table.status, table.criadoEm),
    index("compras_whatsapp_envios_convite_idx").on(table.conviteId)
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

// R-216: cotacao de compra respondida pelo FORNECEDOR, sem login, por link assinado.
//
// O token nunca e gravado: so o hash SHA-256. Ele expira em dias uteis, pode ser revogado (novo
// link, confirmacao ou cancelamento do pedido) e e de uso unico para ENVIAR — rascunho pode ser
// salvo varias vezes ate o envio. Responder muda o pedido para Retornado; NUNCA confirma nem mexe em
// estoque. Quem confirma e o Comprador.
export const pedidosCotacoes = pgTable(
  "pedidos_cotacoes",
  {
    id: idUuid,
    empresaId,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("aberta"),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    // Desconto sobre o pedido inteiro. 'valor' e R$, 'percentual' e pontos percentuais — a mesma
    // convencao do desconto de lancamento. Rateado proporcionalmente entre os itens no calculo.
    descontoGeralTipo: text("desconto_geral_tipo").$type<"valor" | "percentual" | null>(),
    descontoGeralValor: numeric("desconto_geral_valor", { precision: 14, scale: 4 }),
    observacao: text("observacao"),
    prazoEntrega: date("prazo_entrega", { mode: "string" }),
    condicaoPagamento: text("condicao_pagamento"),
    // Totais congelados no ENVIO, recalculados pelo servidor (nunca confiados ao navegador).
    totalBruto: numeric("total_bruto", { precision: 14, scale: 2 }),
    totalFinal: numeric("total_final", { precision: 14, scale: 2 }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm,
    respondidaEm: timestamp("respondida_em", { withTimezone: true }),
    revogadaEm: timestamp("revogada_em", { withTimezone: true })
  },
  (table) => [
    check("pedidos_cotacoes_status_check", sql`${table.status} in ('aberta', 'respondida', 'revogada')`),
    check(
      "pedidos_cotacoes_desconto_geral_tipo_check",
      sql`${table.descontoGeralTipo} is null or ${table.descontoGeralTipo} in ('valor', 'percentual')`
    ),
    uniqueIndex("pedidos_cotacoes_token_hash_unico").on(table.tokenHash),
    // No maximo UM link aberto por pedido: gerar outro revoga o anterior na mesma transacao.
    uniqueIndex("pedidos_cotacoes_pedido_aberta_unica")
      .on(table.pedidoId)
      .where(sql`${table.status} = 'aberta'`),
    index("pedidos_cotacoes_empresa_pedido_idx").on(table.empresaId, table.pedidoId)
  ]
);

export const pedidosCotacoesItens = pgTable(
  "pedidos_cotacoes_itens",
  {
    id: idUuid,
    cotacaoId: uuid("cotacao_id")
      .notNull()
      .references(() => pedidosCotacoes.id, { onDelete: "cascade" }),
    pedidoItemId: uuid("pedido_item_id")
      .notNull()
      .references(() => pedidosItens.id, { onDelete: "restrict" }),
    indisponivel: boolean("indisponivel").notNull().default(false),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    descontoTipo: text("desconto_tipo").$type<"valor" | "percentual" | null>(),
    descontoValor: numeric("desconto_valor", { precision: 14, scale: 4 }),
    // Preco efetivo por unidade depois do desconto do item E do rateio do desconto geral. E o
    // numero que vira "ultimo valor" da proxima cotacao quando o pedido for confirmado.
    valorUnitarioFinal: numeric("valor_unitario_final", { precision: 14, scale: 4 }),
    totalFinal: numeric("total_final", { precision: 14, scale: 2 })
  },
  (table) => [
    check(
      "pedidos_cotacoes_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('valor', 'percentual')`
    ),
    check("pedidos_cotacoes_itens_valor_check", sql`${table.valorUnitario} is null or ${table.valorUnitario} >= 0`),
    unique("pedidos_cotacoes_itens_cotacao_item_unico").on(table.cotacaoId, table.pedidoItemId)
  ]
);

// Livro razao de estoque: por ora so recebe entrada de compra. Outros tipos so entram quando cada
// fluxo (venda, producao, perda ou inventario) tiver a propria regra auditavel.
export const estoqueMovimentos = pgTable(
  "estoque_movimentos",
  {
    id: idUuid,
    empresaId,
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "restrict" }),
    pedidoItemId: uuid("pedido_item_id")
      .notNull()
      .references(() => pedidosItens.id, { onDelete: "restrict" }),
    pedidoRecebimentoId: uuid("pedido_recebimento_id")
      .notNull()
      .references(() => pedidosRecebimentos.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull().default("recebimento_compra"),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    saldoAnterior: numeric("saldo_anterior", { precision: 14, scale: 3 }).notNull(),
    saldoPosterior: numeric("saldo_posterior", { precision: 14, scale: 3 }).notNull(),
    criadoEm
  },
  (table) => [
    unique("estoque_movimentos_recebimento_item_unico").on(table.pedidoRecebimentoId, table.pedidoItemId),
    check("estoque_movimentos_tipo_check", sql`${table.tipo} = 'recebimento_compra'`),
    check("estoque_movimentos_quantidade_check", sql`${table.quantidade} > 0`),
    check(
      "estoque_movimentos_saldo_check",
      sql`${table.saldoPosterior} = ${table.saldoAnterior} + ${table.quantidade}`
    ),
    index("estoque_movimentos_empresa_produto_criado_idx").on(table.empresaId, table.produtoId, table.criadoEm)
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
    // Nome declarado por quem faz a retirada física. É separado de `criadoPor`, que continua
    // sendo a identidade autenticada usada para permissões e auditoria técnica.
    responsavelNome: text("responsavel_nome"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    // R-205: a Tesouraria declara a composicao fisica sem apagar o total do movimento.
    // Nulos preservam transferencia historica e movimentos que nao representam numerario.
    valorEspecieDeclarado: valorMonetario("valor_especie_declarado"),
    valorMoedasDeclarado: valorMonetario("valor_moedas_declarado"),
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
    check(
      "transferencias_composicao_declarada_check",
      sql`(${table.valorEspecieDeclarado} is null and ${table.valorMoedasDeclarado} is null)
        or (${table.valorEspecieDeclarado} >= 0
            and ${table.valorMoedasDeclarado} >= 0
            and ${table.valorEspecieDeclarado} + ${table.valorMoedasDeclarado} = ${table.valorOriginal})`
    ),
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
        or (${table.status} = 'recebido' and ${table.tipo} = 'abertura'
            and (${table.valorRecebido} is null or ${table.valorRecebido} >= 0))
        or (${table.status} <> 'divergente'
            and not (${table.status} = 'recebido' and ${table.tipo} = 'abertura')
            and ${table.valorRecebido} is null)`
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

// R-205: trilha append-only da contagem fisica. Ela registra tanto a conferencia que bateu
// quanto a divergencia; nao reaproveita a tabela antiga de recusas, que nao conhece moedas.
export const transferenciasConferenciasFisicas = pgTable(
  "transferencias_conferencias_fisicas",
  {
    id: idUuid,
    empresaId,
    transferenciaId: uuid("transferencia_id").notNull(),
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    etapa: text("etapa").notNull().$type<"abertura" | "retorno_sangria">(),
    resultado: text("resultado").notNull().$type<"convergente" | "divergente">(),
    encerraConferencia: boolean("encerra_conferencia").notNull().default(false),
    valorEspecieDeclarado: valorMonetario("valor_especie_declarado").notNull(),
    valorMoedasDeclarado: valorMonetario("valor_moedas_declarado").notNull(),
    valorEspecieContado: valorMonetario("valor_especie_contado").notNull(),
    valorMoedasContado: valorMonetario("valor_moedas_contado").notNull(),
    observacao: text("observacao"),
    conferidoPor: text("conferido_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    conferidoEm: timestamp("conferido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.transferenciaId, table.empresaId],
      foreignColumns: [transferencias.id, transferencias.empresaId],
      name: "transferencias_conferencias_fisicas_transferencia_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "transferencias_conferencias_fisicas_fechamento_empresa_fk"
    }).onDelete("restrict"),
    check("transferencias_conferencias_fisicas_etapa_check", sql`${table.etapa} in ('abertura', 'retorno_sangria')`),
    check(
      "transferencias_conferencias_fisicas_resultado_check",
      sql`${table.resultado} in ('convergente', 'divergente')`
    ),
    check(
      "transferencias_conferencias_fisicas_valores_check",
      sql`${table.valorEspecieDeclarado} >= 0 and ${table.valorMoedasDeclarado} >= 0
        and ${table.valorEspecieContado} >= 0 and ${table.valorMoedasContado} >= 0`
    ),
    check(
      "transferencias_conferencias_fisicas_resultado_observacao_check",
      sql`(${table.resultado} = 'convergente'
            and ${table.valorEspecieDeclarado} = ${table.valorEspecieContado}
            and ${table.valorMoedasDeclarado} = ${table.valorMoedasContado}
            and ${table.observacao} is null)
        or (${table.resultado} = 'divergente'
            and (${table.valorEspecieDeclarado} <> ${table.valorEspecieContado}
              or ${table.valorMoedasDeclarado} <> ${table.valorMoedasContado})
            and ${table.observacao} is not null
            and length(btrim(${table.observacao})) > 0)`
    ),
    uniqueIndex("transferencias_conferencias_fisicas_desfecho_unico")
      .on(table.transferenciaId)
      .where(sql`${table.encerraConferencia}`),
    index("transferencias_conferencias_fisicas_transferencia_idx").on(table.transferenciaId, table.conferidoEm)
  ]
);

// R-206: provas pertencem ao fechamento, suportam uma ou varias folhas e varios comprovantes.
// A IA nasce desativada; o arquivo nunca depende dela para continuar valido.
export const fechamentosCaixaAnexos = pgTable(
  "fechamentos_caixa_anexos",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    tipo: text("tipo").notNull().$type<"folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare">(),
    caminho: text("caminho").notNull(),
    nomeOriginal: text("nome_original").notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    mimeType: text("mime_type").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    sha256: text("sha256").notNull(),
    iaStatus: text("ia_status").notNull().default("desativada"),
    iaResultado: jsonb("ia_resultado"),
    iaErro: text("ia_erro"),
    iaAnalisadoEm: timestamp("ia_analisado_em", { withTimezone: true }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "fechamentos_caixa_anexos_fechamento_empresa_fk"
    }).onDelete("restrict"),
    check(
      "fechamentos_caixa_anexos_tipo_check",
      sql`${table.tipo} in ('folha_fechamento', 'comprovante_cartao', 'relatorio_vendas_creare')`
    ),
    check("fechamentos_caixa_anexos_tamanho_check", sql`${table.tamanhoBytes} > 0`),
    check(
      "fechamentos_caixa_anexos_ia_status_check",
      sql`${table.iaStatus} in ('desativada', 'pendente', 'processando', 'concluida', 'falhou')`
    ),
    index("fechamentos_caixa_anexos_fechamento_tipo_idx").on(table.fechamentoCaixaId, table.tipo, table.criadoEm)
  ]
);

// R-208: um fechamento tem UM relatorio revisado da maquininha. As fotos permanecem em
// `fechamentos_caixa_anexos` como provas multiplas; atrelar o relatorio a uma foto faria a
// informacao desaparecer ou ficar errada quando o operador corrigisse uma das imagens.
export const fechamentosCaixaRelatoriosMaquininha = pgTable(
  "fechamentos_caixa_relatorios_maquininha",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    // Retrato do turno que abriu o caixa. O servidor o preenche; a IA nunca decide esse periodo.
    turnoNome: text("turno_nome").notNull(),
    // V1 preserva o JSON dos fechamentos ja realizados. V2 guarda os dois cortes, para que o
    // liquido seja sempre final - inicial por meio de pagamento.
    versao: integer("versao").notNull().default(1),
    numeroMaquininha: text("numero_maquininha"),
    creditoInicial: valorMonetario("credito_inicial"),
    debitoInicial: valorMonetario("debito_inicial"),
    pixInicial: valorMonetario("pix_inicial"),
    voucherInicial: valorMonetario("voucher_inicial"),
    creditoFinal: valorMonetario("credito_final"),
    debitoFinal: valorMonetario("debito_final"),
    pixFinal: valorMonetario("pix_final"),
    voucherFinal: valorMonetario("voucher_final"),
    anexoInicialId: uuid("anexo_inicial_id").references(() => fechamentosCaixaAnexos.id, { onDelete: "restrict" }),
    anexoFinalId: uuid("anexo_final_id").references(() => fechamentosCaixaAnexos.id, { onDelete: "restrict" }),
    // V6: a leitura da tarde referencia explicitamente a leitura acumulada da manha do mesmo
    // PDV/maquininha/dia operacional. A FK impede que a cadeia auditavel aponte para um relatorio removido.
    leituraReferenciaRelatorioId: uuid("leitura_referencia_relatorio_id").references(
      (): AnyPgColumn => fechamentosCaixaRelatoriosMaquininha.id,
      { onDelete: "restrict" }
    ),
    dadosRevisados: jsonb("dados_revisados").notNull(),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "fechamentos_caixa_relatorios_maquininha_fechamento_empresa_fk"
    }).onDelete("restrict"),
    unique("fechamentos_caixa_relatorios_maquininha_fechamento_unico").on(table.fechamentoCaixaId),
    index("fechamentos_caixa_relatorios_maquininha_empresa_idx").on(table.empresaId, table.criadoEm),
    index("fechamentos_caixa_relatorios_maquininha_referencia_idx").on(table.leituraReferenciaRelatorioId)
  ]
);

// O relatorio gerado e um retrato auditavel do intervalo que foi bloqueado no inicio do
// fechamento. Mantemos as formas cruas, agrupamentos e cancelamentos no JSON para nenhuma
// forma vinda do CREARE desaparecer por ainda nao ter categoria operacional.
export const fechamentosCaixaRelatoriosVendas = pgTable(
  "fechamentos_caixa_relatorios_vendas",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    periodoInicio: timestamp("periodo_inicio", { withTimezone: true }).notNull(),
    periodoFim: timestamp("periodo_fim", { withTimezone: true }).notNull(),
    dados: jsonb("dados").notNull(),
    geradoPor: text("gerado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    geradoEm: timestamp("gerado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "fechamentos_caixa_relatorios_vendas_fechamento_empresa_fk"
    }).onDelete("restrict"),
    unique("fechamentos_caixa_relatorios_vendas_fechamento_unico").on(table.fechamentoCaixaId),
    index("fechamentos_caixa_relatorios_vendas_empresa_idx").on(table.empresaId, table.geradoEm)
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
    // R-208: lacre menor enviado ABERTO dentro de um malote Cofre -> PDV. Enquanto
    // `transferenciaId` e nulo ele esta disponivel somente para o Caixa que recebeu esta ida;
    // quando a sangria acontece, `transferenciaId` passa a ser o movimento Caixa -> Cofre sem
    // apagar a proveniencia fisica do lacre.
    transferenciaDistribuicaoId: uuid("transferencia_distribuicao_id"),
    // Ponta do movimento que o lacre selou: 'saida' (ida), 'retorno' (volta/sangria) ou
    // 'fechamento' (selo aberto dentro do malote de ida, reservado ao fechamento do Caixa).
    origem: text("origem").notNull(),
    rompido: boolean("rompido").notNull().default(false),
    criadoEm
  },
  (table) => [
    check("lacres_origem_check", sql`${table.origem} in ('saida', 'retorno', 'fechamento')`),
    check(
      "lacres_distribuicao_retorno_check",
      sql`${table.transferenciaDistribuicaoId} is null
        or (${table.origem} = 'retorno'
            and ${table.transferenciaDistribuicaoId} is distinct from ${table.transferenciaId}
            and (${table.transferenciaId} is not null or ${table.rompido} = false))`
    ),
    unique("lacres_numero_unico").on(table.empresaId, table.numero),
    index("lacres_transf_idx").on(table.transferenciaId),
    foreignKey({
      columns: [table.transferenciaDistribuicaoId, table.empresaId],
      foreignColumns: [transferencias.id, transferencias.empresaId],
      name: "lacres_distribuicao_empresa_fk"
    })
      .onDelete("restrict")
      .onUpdate("no action"),
    index("lacres_distribuicao_disponivel_idx")
      .on(table.transferenciaDistribuicaoId)
      .where(
        sql`${table.transferenciaDistribuicaoId} is not null
          and ${table.transferenciaId} is null
          and ${table.rompido} = false`
      )
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
    // R-229 · turno do posto que abriu o caixa (manha/tarde): decide a etapa da maquininha.
    turnoCaixa: text("turno_caixa").$type<"manha" | "tarde">(),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId),
    usuarioCaixaId: text("usuario_caixa_id").references(() => perfisUsuarios.usuarioId),
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    dataMovimento: date("data_movimento").notNull(),
    dataHoraAbertura: timestamp("data_hora_abertura", { withTimezone: true }),
    abertoEm: timestamp("aberto_em", { withTimezone: true }),
    dataHoraFechamento: timestamp("data_hora_fechamento", { withTimezone: true }),
    fechamentoIniciadoEm: timestamp("fechamento_iniciado_em", { withTimezone: true }),
    fechamentoIniciadoPor: text("fechamento_iniciado_por").references(() => perfisUsuarios.usuarioId),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    fechadoPor: text("fechado_por").references(() => perfisUsuarios.usuarioId),
    tokenEdicao: text("token_edicao"),
    observacao: text("observacao"),
    // R-040: o lacre digitado na abertura, que identificou a transferencia confirmada. A coluna
    // `malote_abertura_id` foi removida na 0026 (o vinculo agora e transferencias.caixa_id).
    // `divida_cofre` e legado da R8 revogada pela R-001 (o fundo nao e emprestimo): sempre 0.
    lacreAbertura: text("lacre_abertura"),
    // R-207: nomes declarados na folha da abertura. Os IDs autenticados continuam como trilha
    // tecnica; estes textos preservam o registro operacional mesmo apos renomear cadastros.
    caixaResponsavelNomeAbertura: text("caixa_responsavel_nome_abertura"),
    supervisorResponsavelNomeAbertura: text("supervisor_responsavel_nome_abertura"),
    // R-200: o selo fisico aplicado ao encerrar a gaveta. Nao e o lacre de uma transferencia de
    // retorno: existe mesmo quando o saldo ja e zero ou ha quebra. Historico anterior a R-200
    // permanece nulo; o servico exige o campo em todo fechamento novo.
    lacreFechamento: text("lacre_fechamento"),
    caixaResponsavelNomeFechamento: text("caixa_responsavel_nome_fechamento"),
    supervisorResponsavelNomeFechamento: text("supervisor_responsavel_nome_fechamento"),
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
    // R-206: retrato fisico informado no ato de fechar. Historico anterior continua nulo.
    valorFisicoEsperadoFechamento: valorMonetario("valor_fisico_esperado_fechamento"),
    valorEspecieFechamento: valorMonetario("valor_especie_fechamento"),
    valorMoedasFechamento: valorMonetario("valor_moedas_fechamento"),
    status: text("status").notNull().default("aberto"),
    criadoPor: text("criado_por"),
    criadoEm
  },
  (table) => [
    check("fechamentos_caixa_status_check", sql`${table.status} in ('aberto', 'em_fechamento', 'fechado', 'ajustado')`),
    check(
      "fechamentos_caixa_turno_caixa_check",
      sql`${table.turnoCaixa} is null or ${table.turnoCaixa} in ('manha', 'tarde')`
    ),
    check(
      "fechamentos_caixa_composicao_fechamento_check",
      sql`(${table.valorFisicoEsperadoFechamento} is null
            and ${table.valorEspecieFechamento} is null
            and ${table.valorMoedasFechamento} is null)
        or (${table.valorFisicoEsperadoFechamento} >= 0
            and ${table.valorEspecieFechamento} >= 0
            and ${table.valorMoedasFechamento} >= 0)`
    ),
    // O legado nao tem esses nomes e permanece nulo. Em atos novos, os dois responsaveis andam
    // juntos e nunca podem ser vazios; duas colunas unicas apagariam a prova da abertura ao fechar.
    check(
      "fechamentos_caixa_responsaveis_abertura_check",
      sql`(${table.caixaResponsavelNomeAbertura} is null and ${table.supervisorResponsavelNomeAbertura} is null)
        or (length(btrim(${table.caixaResponsavelNomeAbertura})) > 0
          and length(btrim(${table.supervisorResponsavelNomeAbertura})) > 0)`
    ),
    check(
      "fechamentos_caixa_responsaveis_fechamento_check",
      sql`(${table.caixaResponsavelNomeFechamento} is null and ${table.supervisorResponsavelNomeFechamento} is null)
        or (${table.status} in ('fechado', 'ajustado')
          and length(btrim(${table.caixaResponsavelNomeFechamento})) > 0
          and length(btrim(${table.supervisorResponsavelNomeFechamento})) > 0)`
    ),
    unique("fechamentos_caixa_id_empresa_unica").on(table.id, table.empresaId),
    uniqueIndex("fechamentos_caixa_pdv_aberto_unico_idx")
      .on(table.pdvId)
      .where(sql`${table.status} in ('aberto', 'em_fechamento')`),
    uniqueIndex("fechamentos_caixa_operador_aberto_unico_idx")
      .on(table.empresaId, table.usuarioCaixaId)
      .where(sql`${table.status} in ('aberto', 'em_fechamento') and ${table.usuarioCaixaId} is not null`),
    index("fechamentos_caixa_empresa_data_idx").on(table.empresaId, table.dataMovimento)
  ]
);

// Conferência final é uma trilha própria e append-only. Não reaproveita o status operacional do
// Caixa nem a confirmação individual de transferência: Tesouraria pode registrar uma divergência
// e, depois de resolvê-la no fluxo correto, fazer uma nova conferência sem apagar a anterior.
export const fechamentosCaixaConferenciasTesouraria = pgTable(
  "fechamentos_caixa_conferencias_tesouraria",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    resultado: text("resultado").notNull().$type<"conferido" | "divergente">(),
    observacao: text("observacao"),
    conferidoPor: text("conferido_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    conferidoEm: timestamp("conferido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "fechamentos_caixa_conferencias_tesouraria_caixa_empresa_fk"
    }).onDelete("restrict"),
    check(
      "fechamentos_caixa_conferencias_tesouraria_resultado_check",
      sql`${table.resultado} in ('conferido', 'divergente')`
    ),
    check(
      "fechamentos_caixa_conferencias_tesouraria_observacao_check",
      sql`${table.resultado} = 'conferido'
        or (${table.observacao} is not null and length(btrim(${table.observacao})) > 0)`
    ),
    index("fechamentos_caixa_conferencias_tesouraria_caixa_idx").on(table.fechamentoCaixaId, table.conferidoEm)
  ]
);

// Registro operacional de parada do computador do PDV durante um Caixa aberto. Cada linha e um
// intervalo imutavel: o servidor abre a ocorrencia e somente marca o retorno; nunca regrava o
// instante ou os motivos informados pelo operador.
export const caixaIndisponibilidades = pgTable(
  "caixa_indisponibilidades",
  {
    id: idUuid,
    empresaId,
    fechamentoCaixaId: uuid("fechamento_caixa_id").notNull(),
    motivos: text("motivos").array().notNull(),
    motivoOutro: text("motivo_outro"),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
    retornadoEm: timestamp("retornado_em", { withTimezone: true }),
    registradoPor: text("registrado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    retornadoPor: text("retornado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.fechamentoCaixaId, table.empresaId],
      foreignColumns: [fechamentosCaixa.id, fechamentosCaixa.empresaId],
      name: "caixa_indisponibilidades_caixa_empresa_fk"
    }).onDelete("restrict"),
    check(
      "caixa_indisponibilidades_motivos_check",
      sql`cardinality(${table.motivos}) > 0
        and ${table.motivos} <@ array[
          'falta_energia', 'oscilacao_eletrica', 'internet_caiu', 'cabo_desconectado',
          'computador_travou', 'limpeza_manutencao', 'atualizacao_sistema', 'outro'
        ]::text[]`
    ),
    check(
      "caixa_indisponibilidades_outro_check",
      sql`(('outro' = any(${table.motivos}) and length(btrim(coalesce(${table.motivoOutro}, ''))) > 0)
        or ('outro' <> all(${table.motivos}) and ${table.motivoOutro} is null))`
    ),
    check(
      "caixa_indisponibilidades_periodo_check",
      sql`${table.retornadoEm} is null or ${table.retornadoEm} >= ${table.iniciadoEm}`
    ),
    uniqueIndex("caixa_indisponibilidades_uma_aberta_por_caixa_idx")
      .on(table.fechamentoCaixaId)
      .where(sql`${table.retornadoEm} is null`),
    index("caixa_indisponibilidades_caixa_inicio_idx").on(table.fechamentoCaixaId, table.iniciadoEm)
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
    // `campanha` aponta para `campanhas.id`; `lancamento_vencimento` para uma despesa ou mercadoria.
    tipo: text("tipo")
      .$type<
        | "quebra_caixa"
        | "transferencia_divergencia"
        | "transferencia_prazo_confirmacao"
        | "mensagem_admin"
        | "campanha"
        | "lancamento_vencimento"
        | "compras_decisao_pendente"
        | "compras_agendamento_conferir"
        | "conferencia_estoque_fazer"
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
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir', 'conferencia_estoque_fazer')`
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
    index("admissoes_testes_empresa_status_fim_idx").on(table.empresaId, table.status, table.fimCombinadoEm, table.id)
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
    index("admissoes_testes_historico_teste_idx").on(table.empresaId, table.testeId, table.ocorridoEm, table.id)
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
    origem: text("origem").$type<"teste_efetivado" | "admissao_direta">().notNull().default("teste_efetivado"),
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
    check("admissoes_processos_status_check", sql`${table.status} in ('iniciado', 'pausado', 'cancelado')`),
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
    check("admissoes_processos_origem_check", sql`${table.origem} in ('teste_efetivado', 'admissao_direta')`),
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
    index("admissoes_processos_empresa_status_criado_idx").on(table.empresaId, table.status, table.criadoEm, table.id)
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
    // E4 (M3) — dados contratuais para o Questor. Todos anuláveis e sem default: o DP preenche.
    questorTipoSalario: smallint("questor_tipo_salario"),
    salarioCentavos: bigint("salario_centavos", { mode: "number" }),
    descricaoSalario: text("descricao_salario"),
    diasExperiencia: integer("dias_experiencia"),
    diasProrrogacao: integer("dias_prorrogacao"),
    questorTipoContrato: text("questor_tipo_contrato"),
    questorSindicato: text("questor_sindicato"),
    questorTipoAdmissao: smallint("questor_tipo_admissao"),
    pcdCotista: boolean("pcd_cotista"),
    utilizaCtpsDigital: boolean("utiliza_ctps_digital"),
    possuiAlvara: boolean("possui_alvara"),
    jaExpostoAgenteNocivo: boolean("ja_exposto_agente_nocivo"),
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
    check("admissoes_processos_internos_ctps_uf_check", sql`${table.ctpsUf} is null or ${table.ctpsUf} ~ '^[A-Z]{2}$'`),
    // E4 (M3): domínios e tamanhos do layout oficial (A.TIPOSALARIO, VALORSAL Numérico 16/2,
    // DESCRSAL 999, DIACONTREXP Inteiro 5, DIAPRORROGCONTREXP Inteiro 4, CODIGOTIPOCONTR 3,
    // CODIGOSIND 5, B.TIPOADM 1..7).
    check(
      "internos_questor_tipo_salario_check",
      sql`${table.questorTipoSalario} is null or ${table.questorTipoSalario} in (1, 2, 5, 6, 7)`
    ),
    check(
      "internos_salario_check",
      sql`${table.salarioCentavos} is null or ${table.salarioCentavos} between 1 and 999999999999999`
    ),
    check(
      "internos_descricao_salario_check",
      sql`${table.descricaoSalario} is null or length(btrim(${table.descricaoSalario})) between 1 and 999`
    ),
    // Doc: DESCRSAL obrigatório se TIPOSALARIO = 2 (Comissão/Variável) ou 6 (Tarefa) — e não pode
    // ser só espaços. O coalesce evita que NULL torne a expressão desconhecida (CHECK aprovaria).
    check(
      "internos_descricao_salario_condicional_check",
      sql`${table.questorTipoSalario} is null or ${table.questorTipoSalario} not in (2, 6) or length(btrim(coalesce(${table.descricaoSalario}, ''))) > 0`
    ),
    check(
      "internos_dias_experiencia_check",
      sql`${table.diasExperiencia} is null or ${table.diasExperiencia} between 0 and 99999`
    ),
    check(
      "internos_dias_prorrogacao_check",
      sql`${table.diasProrrogacao} is null or ${table.diasProrrogacao} between 0 and 9999`
    ),
    check(
      "internos_questor_tipo_contrato_check",
      sql`${table.questorTipoContrato} is null or ${table.questorTipoContrato} ~ '^[0-9]{1,3}$'`
    ),
    check(
      "internos_questor_sindicato_check",
      sql`${table.questorSindicato} is null or ${table.questorSindicato} ~ '^[0-9]{1,5}$'`
    ),
    check(
      "internos_questor_tipo_admissao_check",
      sql`${table.questorTipoAdmissao} is null or ${table.questorTipoAdmissao} between 1 and 7`
    ),
    check(
      "admissoes_processos_internos_pis_check",
      sql`${table.pisPasepNit} is null or ${table.pisPasepNit} ~ '^[0-9]{11}$'`
    ),
    index("admissoes_processos_internos_exame_idx").on(table.empresaId, table.exameSituacao)
  ]
);

/**
 * ADM-003 V2 â€” o convite que leva o candidato a ficha.
 *
 * Guarda SO o hash do token. O token em claro e mostrado uma vez a quem o gerou e nao e recuperavel
 * â€” mesma disciplina de `caixa_autorizacoes`. Guardar o segredo em claro faria do backup uma copia
 * das chaves.
 *
 * Sem `atualizado_em` e sem trigger, de proposito: convite nao se edita. Acesso e revogacao tem
 * colunas proprias, e a linha nunca muda de identidade.
 */
export const admissoesConvites = pgTable(
  "admissoes_convites",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    // GRAVADO, nao derivado: o prazo combinado com a pessoa nao pode mudar porque a regra mudou.
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    avisoPrivacidadeVersao: text("aviso_privacidade_versao").notNull(),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm,
    primeiroAcessoEm: timestamp("primeiro_acesso_em", { withTimezone: true }),
    ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    revogadoPor: text("revogado_por").references(() => perfisUsuarios.usuarioId)
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_convites_processo_empresa_fk"
    }).onDelete("cascade"),
    // Alvo da FK composta da trilha: o evento do candidato aponta para o convite que o produziu.
    unique("admissoes_convites_id_empresa_unica").on(table.id, table.empresaId),
    unique("admissoes_convites_token_hash_unico").on(table.tokenHash),
    check("admissoes_convites_token_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check("admissoes_convites_validade_check", sql`${table.expiraEm} > ${table.criadoEm}`),
    // Revogar tem duas colunas, e elas andam juntas ou nao andam.
    check("admissoes_convites_revogacao_check", sql`num_nonnulls(${table.revogadoEm}, ${table.revogadoPor}) <> 1`),
    check(
      "admissoes_convites_acesso_check",
      sql`${table.ultimoAcessoEm} is null or ${table.primeiroAcessoEm} is not null`
    ),
    // UM convite vigente por processo. Reemitir exige revogar o anterior na MESMA transacao â€” a
    // pre-checagem sozinha nao segura duas chamadas simultaneas.
    uniqueIndex("admissoes_convites_processo_vigente_unico")
      .on(table.processoId)
      .where(sql`${table.revogadoEm} is null`),
    index("admissoes_convites_empresa_processo_idx").on(table.empresaId, table.processoId, table.criadoEm)
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
    // ANULAVEL desde a V2: o candidato NAO tem perfil no sistema â€” ele e um estranho com um link.
    // Quem age por fora aparece pelo convite que o autorizou, e o CHECK abaixo garante que sempre
    // ha exatamente um autor. Usuario tecnico "sistema" foi recusado: criaria ator falso na
    // trilha, e a trilha existe justamente para dizer quem fez.
    atorUsuarioId: text("ator_usuario_id").references(() => perfisUsuarios.usuarioId),
    conviteId: uuid("convite_id"),
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
    foreignKey({
      columns: [table.conviteId, table.empresaId],
      foreignColumns: [admissoesConvites.id, admissoesConvites.empresaId],
      name: "admissoes_processos_historico_convite_empresa_fk"
    }),
    // EXATAMENTE um autor: ou o ato e interno e tem usuario, ou veio pelo convite. Nunca os dois,
    // nunca nenhum â€” trilha sem autor nao e trilha.
    check(
      "admissoes_processos_historico_autoria_check",
      sql`num_nonnulls(${table.atorUsuarioId}, ${table.conviteId}) = 1`
    ),
    check(
      "admissoes_processos_historico_acao_check",
      sql`${table.acao} in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'efetivado', 'cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada')`
    ),
    check("admissoes_processos_historico_versao_check", sql`${table.versao} > 0`),
    // Idempotencia da transicao no banco: repetir um cancelamento nao grava segundo evento.
    //
    // PARCIAL, como o irmao de `admissoes_testes_historico` (0034). Ele nasceu simples na 0035, e a
    // diferenca custava caro: sem versao nova o segundo evento colidia com o primeiro, entao revelar
    // um CPF precisava AVANCAR a versao — e avancar a versao e um UPDATE na linha raiz, que grava
    // `atualizado_por` e dispara a trigger de `atualizado_em`. O detalhe passava a mostrar como
    // "Alterado por" quem apenas LEU o documento.
    //
    // `cpf_revelado` nao incrementa versao e acontece quantas vezes o DP revelar. A unicidade das
    // acoes FUNCIONAIS nao muda: repetir um cancelamento segue recusado pelo banco.
    //
    // A V2 amplia a excecao: convite e ficha tambem NAO mexem em `admissoes_processos`, entao
    // tambem nao consomem versao dele. A forma negativa e deliberada â€” ela diz "o indice vale para
    // tudo, menos os eventos que nao consomem versao", que e a regra de verdade.
    uniqueIndex("admissoes_processos_historico_evento_unico")
      .on(table.processoId, table.versao)
      .where(
        sql`${table.acao} not in ('cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada')`
      ),
    index("admissoes_processos_historico_processo_idx").on(
      table.empresaId,
      table.processoId,
      table.ocorridoEm,
      table.id
    )
  ]
);

/**
 * ADM-003 V3 â€” a ficha que o candidato preenche. Uma por processo.
 *
 * `situacao` e PROPRIA da ficha e nao e o status do processo: o processo pode seguir `iniciado`
 * enquanto a ficha vai de rascunho a aprovada. Misturar os dois faria a lista de admissoes mudar
 * porque alguem salvou um rascunho.
 *
 * Documentos entram como NUMERO, nunca como arquivo â€” anexo e a V5, e depende da politica de
 * documentos que ainda nao existe.
 */
export const admissoesProcessosFicha = pgTable(
  "admissoes_processos_ficha",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    situacao: text("situacao").notNull().default("rascunho"),
    versao: integer("versao").notNull().default(1),
    nomeSocial: text("nome_social"),
    nascimento: date("nascimento"),
    sexo: text("sexo"),
    estadoCivil: text("estado_civil"),
    racaCor: text("raca_cor"),
    grauInstrucao: text("grau_instrucao"),
    nacionalidade: text("nacionalidade"),
    naturalidade: text("naturalidade"),
    nomeMae: text("nome_mae"),
    nomePai: text("nome_pai"),
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    municipio: text("municipio"),
    uf: text("uf"),
    telefone: text("telefone"),
    email: text("email"),
    rgNumero: text("rg_numero"),
    rgOrgao: text("rg_orgao"),
    rgUf: text("rg_uf"),
    rgEmissao: date("rg_emissao"),
    tituloEleitor: text("titulo_eleitor"),
    tituloZona: text("titulo_zona"),
    tituloSecao: text("titulo_secao"),
    banco: text("banco"),
    agencia: text("agencia"),
    conta: text("conta"),
    contaDigito: text("conta_digito"),
    contaTipo: text("conta_tipo"),
    // E5 (Questor) — campos comuns do candidato. Anuláveis: o rascunho aceita tudo vazio. Os de
    // saúde (deficiência, reabilitação) NÃO estão aqui: dependem da base legal e do aviso (Q11).
    naturalidadeUf: text("naturalidade_uf"),
    // Código IBGE do município do endereço (vem do ViaCEP). Conversão para o Questor depende da Q5.
    municipioIbge: text("municipio_ibge"),
    // Nacionalidade da lista oficial, quando a ficha diz "Estrangeira".
    nacionalidadeEspecifica: text("nacionalidade_especifica"),
    primeiroEmprego: boolean("primeiro_emprego"),
    recebeSeguroDesemprego: boolean("recebe_seguro_desemprego"),
    // Ausencia de dependente e DECLARACAO, nao tabela vazia: tabela vazia tambem e "nao respondeu".
    semDependentes: boolean("sem_dependentes"),
    avisoPrivacidadeVersao: text("aviso_privacidade_versao"),
    avisoAceitoEm: timestamp("aviso_aceito_em", { withTimezone: true }),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    revisadoEm: timestamp("revisado_em", { withTimezone: true }),
    revisadoPor: text("revisado_por").references(() => perfisUsuarios.usuarioId),
    revisaoPendencias: text("revisao_pendencias"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_processos_ficha_processo_empresa_fk"
    }).onDelete("cascade"),
    unique("admissoes_processos_ficha_processo_unico").on(table.processoId),
    check(
      "admissoes_processos_ficha_situacao_check",
      sql`${table.situacao} in ('rascunho', 'enviada', 'devolvida', 'aprovada')`
    ),
    check("admissoes_processos_ficha_versao_check", sql`${table.versao} > 0`),
    check("admissoes_processos_ficha_uf_check", sql`${table.uf} is null or ${table.uf} ~ '^[A-Z]{2}$'`),
    check("admissoes_processos_ficha_rg_uf_check", sql`${table.rgUf} is null or ${table.rgUf} ~ '^[A-Z]{2}$'`),
    check("admissoes_processos_ficha_cep_check", sql`${table.cep} is null or ${table.cep} ~ '^[0-9]{8}$'`),
    check(
      "admissoes_processos_ficha_naturalidade_uf_check",
      sql`${table.naturalidadeUf} is null or ${table.naturalidadeUf} ~ '^[A-Z]{2}$'`
    ),
    check(
      "admissoes_processos_ficha_municipio_ibge_check",
      sql`${table.municipioIbge} is null or ${table.municipioIbge} ~ '^[0-9]{7}$'`
    ),
    // O ciclo inteiro num CHECK so: enviada exige aceite e declaracao de dependentes; devolvida
    // exige pendencia escrita, senao o candidato recebe de volta sem saber o que corrigir.
    check(
      "admissoes_processos_ficha_coerencia_check",
      sql`(
        (${table.situacao} = 'rascunho' and ${table.enviadoEm} is null and ${table.revisadoEm} is null)
        or (${table.situacao} = 'enviada' and ${table.enviadoEm} is not null and ${table.revisadoEm} is null
            and ${table.avisoAceitoEm} is not null and ${table.avisoPrivacidadeVersao} is not null
            and ${table.semDependentes} is not null)
        or (${table.situacao} = 'devolvida' and ${table.enviadoEm} is not null
            and ${table.revisadoEm} is not null and ${table.revisadoPor} is not null
            and ${table.revisaoPendencias} is not null)
        or (${table.situacao} = 'aprovada' and ${table.enviadoEm} is not null
            and ${table.revisadoEm} is not null and ${table.revisadoPor} is not null)
      )`
    ),
    index("admissoes_processos_ficha_empresa_situacao_idx").on(table.empresaId, table.situacao),
    // Aceite de TESTE tem de ser separavel por consulta, nao por memoria de quem estava la.
    index("admissoes_processos_ficha_aviso_teste_idx")
      .on(table.empresaId)
      .where(sql`${table.avisoPrivacidadeVersao} like 'AVISO-TESTE-%'`)
  ]
);

export const admissoesProcessosFichaAnexos = pgTable(
  "admissoes_processos_ficha_anexos",
  {
    id: idUuid,
    empresaId,
    fichaId: uuid("ficha_id")
      .notNull()
      .references(() => admissoesProcessosFicha.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => admissoesProcessos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    nomeOriginal: text("nome_original").notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    caminho: text("caminho").notNull(),
    mimeType: text("mime_type").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    criadoEm
  },
  (table) => [
    unique("admissoes_processos_ficha_anexos_ficha_tipo_unico").on(table.fichaId, table.tipo),
    check(
      "admissoes_processos_ficha_anexos_tipo_check",
      sql`${table.tipo} in ('rg', 'cpf', 'titulo_eleitor', 'certidao_nascimento_casamento', 'comprovante_residencia', 'foto_3x4', 'ctps_digital', 'pis_pasep_nit', 'certificado_reservista', 'comprovante_escolaridade', 'certificados_profissionais', 'aso_admissional')`
    ),
    check("admissoes_processos_ficha_anexos_tamanho_check", sql`${table.tamanhoBytes} > 0`),
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_processos_ficha_anexos_processo_empresa_fk"
    }).onDelete("cascade"),
    index("admissoes_processos_ficha_anexos_empresa_ficha_idx").on(table.empresaId, table.fichaId)
  ]
);

/**
 * ADM-003 V4 â€” dependentes declarados na ficha. Zero ou muitos.
 *
 * Sao dados de TERCEIROS, possivelmente menores, de gente que pode nunca ser admitida. O CPF e
 * opcional de proposito: crianca costuma nao ter, e exigir criaria dado falso.
 */
export const admissoesProcessosDependentes = pgTable(
  "admissoes_processos_dependentes",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    nomeCompleto: text("nome_completo").notNull(),
    nascimento: date("nascimento").notNull(),
    parentesco: text("parentesco").notNull(),
    cpf: text("cpf"),
    finalidades: text("finalidades")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // E5 (Questor) — campos comuns do dependente. Fumo e álcool (saúde) NÃO estão aqui: Q11.
    sexo: text("sexo"),
    estadoCivil: text("estado_civil"),
    grauInstrucao: text("grau_instrucao"),
    nacionalidade: text("nacionalidade"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_processos_dependentes_processo_empresa_fk"
    }).onDelete("cascade"),
    check("admissoes_processos_dependentes_nome_check", sql`length(btrim(${table.nomeCompleto})) > 0`),
    // ADM-003 V4 (D-7). O banco confere o DIGITO VERIFICADOR, e nao so o formato.
    //
    // Ate aqui a regra vivia so no Zod, e o banco aceitava 11 digitos quaisquer. Um caminho novo que
    // esquecesse o contrato gravaria CPF invalido de um TERCEIRO — possivelmente uma crianca — e
    // ninguem descobriria ate alguem precisar do dado. Aqui a regra vale para qualquer caminho.
    //
    // A expressao e inline, e nao uma funcao, de proposito: funcao chamada por CHECK precisa existir
    // ANTES do `drizzle-kit push`, o que obrigaria a cria-la tambem em `db/setup-dev.mjs` e em
    // `tests/setup/testcontainers.ts` — o mesmo caminho de provisionamento que ja nos custou tabela
    // sem trigger. Expressao inline nao tem o que faltar no push.
    //
    // Modulo 11 da Receita, a mesma conta de `shared/src/admissoes/cpf.ts`: soma ponderada, vezes 10,
    // resto por 11 — e o resto 10 vira 0, que e o que o resto por 10 no fim faz.
    //
    // O CASE nao e enfeite: o Postgres NAO garante ordem de avaliacao dentro de um AND. Com `and`, o
    // `::int` pode rodar antes do regex, e um valor com letra viraria erro 22P02 em vez de violacao de
    // CHECK — rejeitado do mesmo jeito, mas por uma porta que o tratamento de erro nao conhece. CASE e
    // o mecanismo que a documentacao garante: so calcula digito depois de saber que sao 11 digitos.
    //
    // A guarda de sequencia repetida NAO e redundante: as onze sequencias (000..., 111...) passam na
    // aritmetica do modulo 11 e precisam ser recusadas a parte. Ela usa `repeat` em vez do retrovisor
    // `\1` de regex porque, dentro de template literal, `\1` e escape octal invalido: o texto cozido
    // chega `undefined` no `sql` do Drizzle e a migration nasceria quebrada sem ninguem ver.
    check(
      "admissoes_processos_dependentes_cpf_check",
      sql`${table.cpf} is null or case
        when ${table.cpf} !~ '^[0-9]{11}$' then false
        when ${table.cpf} = repeat(substring(${table.cpf}, 1, 1), 11) then false
        else
          substring(${table.cpf}, 10, 1)::int = (((
            10 * substring(${table.cpf}, 1, 1)::int + 9 * substring(${table.cpf}, 2, 1)::int + 8 * substring(${table.cpf}, 3, 1)::int +
            7 * substring(${table.cpf}, 4, 1)::int + 6 * substring(${table.cpf}, 5, 1)::int + 5 * substring(${table.cpf}, 6, 1)::int +
            4 * substring(${table.cpf}, 7, 1)::int + 3 * substring(${table.cpf}, 8, 1)::int + 2 * substring(${table.cpf}, 9, 1)::int
            ) * 10) % 11) % 10
          and substring(${table.cpf}, 11, 1)::int = (((
            11 * substring(${table.cpf}, 1, 1)::int + 10 * substring(${table.cpf}, 2, 1)::int + 9 * substring(${table.cpf}, 3, 1)::int +
            8 * substring(${table.cpf}, 4, 1)::int + 7 * substring(${table.cpf}, 5, 1)::int + 6 * substring(${table.cpf}, 6, 1)::int +
            5 * substring(${table.cpf}, 7, 1)::int + 4 * substring(${table.cpf}, 8, 1)::int + 3 * substring(${table.cpf}, 9, 1)::int +
            2 * substring(${table.cpf}, 10, 1)::int
            ) * 10) % 11) % 10
      end`
    ),
    uniqueIndex("admissoes_processos_dependentes_cpf_unico")
      .on(table.processoId, table.cpf)
      .where(sql`${table.cpf} is not null`),
    unique("admissoes_processos_dependentes_id_processo_empresa_unico").on(table.id, table.processoId, table.empresaId),
    index("admissoes_processos_dependentes_empresa_processo_idx").on(table.empresaId, table.processoId)
  ]
);

export const admissoesProcessosDependentesAnexos = pgTable(
  "admissoes_processos_dependentes_anexos",
  {
    id: idUuid,
    empresaId,
    dependenteId: uuid("dependente_id").notNull(),
    processoId: uuid("processo_id").notNull(),
    tipo: text("tipo").notNull(),
    nomeOriginal: text("nome_original").notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    caminho: text("caminho").notNull(),
    mimeType: text("mime_type").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.dependenteId, table.processoId, table.empresaId],
      foreignColumns: [
        admissoesProcessosDependentes.id,
        admissoesProcessosDependentes.processoId,
        admissoesProcessosDependentes.empresaId
      ],
      name: "admissoes_processos_dependentes_anexos_dependente_fk"
    }).onDelete("cascade"),
    uniqueIndex("admissoes_processos_dependentes_anexos_tipo_unico").on(table.dependenteId, table.tipo),
    index("admissoes_processos_dependentes_anexos_empresa_dependente_idx").on(table.empresaId, table.dependenteId),
    check(
      "admissoes_processos_dependentes_anexos_tipo_check",
      sql`${table.tipo} in ('certidao_nascimento_rg', 'cpf', 'cartao_vacina', 'comprovante_escolaridade')`
    ),
    check("admissoes_processos_dependentes_anexos_tamanho_check", sql`${table.tamanhoBytes} > 0`)
  ]
);

type StatusSincronizacaoGoogle = "pendente" | "processando" | "concluida" | "falhou";

export const admissoesGoogleSincronizacoes = pgTable(
  "admissoes_google_sincronizacoes",
  {
    id: idUuid,
    empresaId,
    processoId: uuid("processo_id").notNull(),
    status: text("status").$type<StatusSincronizacaoGoogle>().notNull().default("pendente"),
    driveRootFolderId: text("drive_root_folder_id").notNull(),
    driveColaboradorFolderId: text("drive_colaborador_folder_id"),
    sheetsColaboradorRowNumber: integer("sheets_colaborador_row_number"),
    sheetsColaboradorMetadataId: text("sheets_colaborador_metadata_id"),
    bloqueioToken: text("bloqueio_token"),
    bloqueioAte: timestamp("bloqueio_ate", { withTimezone: true }),
    tentativa: integer("tentativa").notNull().default(0),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_google_sincronizacoes_processo_empresa_fk"
    }).onDelete("restrict"),
    unique("admissoes_google_sincronizacoes_processo_unico").on(table.processoId, table.empresaId),
    unique("admissoes_google_sincronizacoes_id_processo_empresa_unico").on(table.id, table.processoId, table.empresaId),
    check(
      "admissoes_google_sincronizacoes_status_check",
      sql`${table.status} in ('pendente', 'processando', 'concluida', 'falhou')`
    ),
    check("admissoes_google_sincronizacoes_tentativa_check", sql`${table.tentativa} >= 0`),
    check(
      "admissoes_google_sincronizacoes_row_check",
      sql`${table.sheetsColaboradorRowNumber} is null or ${table.sheetsColaboradorRowNumber} > 0`
    ),
    index("admissoes_google_sincronizacoes_fila_idx").on(table.status, table.proximaTentativaEm, table.criadoEm)
  ]
);

export const admissoesGoogleDependentes = pgTable(
  "admissoes_google_dependentes",
  {
    id: idUuid,
    sincronizacaoId: uuid("sincronizacao_id").notNull(),
    empresaId,
    processoId: uuid("processo_id").notNull(),
    dependenteId: uuid("dependente_id").notNull(),
    status: text("status").$type<StatusSincronizacaoGoogle>().notNull().default("pendente"),
    driveDependenteFolderId: text("drive_dependente_folder_id"),
    sheetsRowNumber: integer("sheets_row_number"),
    sheetsMetadataId: text("sheets_metadata_id"),
    bloqueioToken: text("bloqueio_token"),
    bloqueioAte: timestamp("bloqueio_ate", { withTimezone: true }),
    tentativa: integer("tentativa").notNull().default(0),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.sincronizacaoId, table.processoId, table.empresaId],
      foreignColumns: [
        admissoesGoogleSincronizacoes.id,
        admissoesGoogleSincronizacoes.processoId,
        admissoesGoogleSincronizacoes.empresaId
      ],
      name: "admissoes_google_dependentes_sincronizacao_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.dependenteId, table.processoId, table.empresaId],
      foreignColumns: [
        admissoesProcessosDependentes.id,
        admissoesProcessosDependentes.processoId,
        admissoesProcessosDependentes.empresaId
      ],
      name: "admissoes_google_dependentes_dependente_fk"
    }).onDelete("restrict"),
    unique("admissoes_google_dependentes_unico").on(table.sincronizacaoId, table.dependenteId),
    check(
      "admissoes_google_dependentes_status_check",
      sql`${table.status} in ('pendente', 'processando', 'concluida', 'falhou')`
    ),
    check("admissoes_google_dependentes_tentativa_check", sql`${table.tentativa} >= 0`),
    check(
      "admissoes_google_dependentes_row_check",
      sql`${table.sheetsRowNumber} is null or ${table.sheetsRowNumber} > 0`
    ),
    index("admissoes_google_dependentes_fila_idx").on(table.status, table.proximaTentativaEm, table.criadoEm)
  ]
);

export const admissoesGoogleArquivos = pgTable(
  "admissoes_google_arquivos",
  {
    id: idUuid,
    sincronizacaoId: uuid("sincronizacao_id").notNull(),
    empresaId,
    processoId: uuid("processo_id").notNull(),
    dependenteId: uuid("dependente_id"),
    origem: text("origem").$type<"colaborador" | "dependente">().notNull(),
    colaboradorAnexoId: uuid("colaborador_anexo_id"),
    dependenteAnexoId: uuid("dependente_anexo_id"),
    tipoDocumento: text("tipo_documento").notNull(),
    driveFolderId: text("drive_folder_id"),
    driveFileId: text("drive_file_id"),
    driveWebViewLink: text("drive_web_view_link"),
    status: text("status").$type<StatusSincronizacaoGoogle>().notNull().default("pendente"),
    tentativa: integer("tentativa").notNull().default(0),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.sincronizacaoId, table.processoId, table.empresaId],
      foreignColumns: [
        admissoesGoogleSincronizacoes.id,
        admissoesGoogleSincronizacoes.processoId,
        admissoesGoogleSincronizacoes.empresaId
      ],
      name: "admissoes_google_arquivos_sincronizacao_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "admissoes_google_arquivos_processo_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.dependenteId, table.processoId, table.empresaId],
      foreignColumns: [
        admissoesProcessosDependentes.id,
        admissoesProcessosDependentes.processoId,
        admissoesProcessosDependentes.empresaId
      ],
      name: "admissoes_google_arquivos_dependente_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.colaboradorAnexoId],
      foreignColumns: [admissoesProcessosFichaAnexos.id],
      name: "admissoes_google_arquivos_colaborador_anexo_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.dependenteAnexoId],
      foreignColumns: [admissoesProcessosDependentesAnexos.id],
      name: "admissoes_google_arquivos_dependente_anexo_fk"
    }).onDelete("restrict"),
    check(
      "admissoes_google_arquivos_origem_check",
      sql`(
        ${table.origem} = 'colaborador'
        and ${table.dependenteId} is null
        and ${table.colaboradorAnexoId} is not null
        and ${table.dependenteAnexoId} is null
      ) or (
        ${table.origem} = 'dependente'
        and ${table.dependenteId} is not null
        and ${table.colaboradorAnexoId} is null
        and ${table.dependenteAnexoId} is not null
      )`
    ),
    check(
      "admissoes_google_arquivos_status_check",
      sql`${table.status} in ('pendente', 'processando', 'concluida', 'falhou')`
    ),
    check("admissoes_google_arquivos_tentativa_check", sql`${table.tentativa} >= 0`),
    uniqueIndex("admissoes_google_arquivos_colaborador_anexo_unico")
      .on(table.colaboradorAnexoId)
      .where(sql`${table.colaboradorAnexoId} is not null`),
    uniqueIndex("admissoes_google_arquivos_dependente_anexo_unico")
      .on(table.dependenteAnexoId)
      .where(sql`${table.dependenteAnexoId} is not null`),
    uniqueIndex("admissoes_google_arquivos_drive_file_unico")
      .on(table.driveFileId)
      .where(sql`${table.driveFileId} is not null`),
    index("admissoes_google_arquivos_fila_idx").on(table.status, table.proximaTentativaEm, table.criadoEm)
  ]
);

export const colaboradoresVinculos = pgTable(
  "colaboradores_vinculos",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id").notNull(),
    // Cada processo de admissão pode efetivar uma única vez. É a barreira final de idempotência
    // contra duplo clique/retry depois de o serviço já ter feito as validações.
    processoId: uuid("processo_id").notNull(),
    numeroSequencial: integer("numero_sequencial").notNull(),
    matricula: text("matricula").notNull(),
    status: text("status").$type<"ativo" | "desligado">().notNull().default("ativo"),
    admitidoEm: date("admitido_em").notNull(),
    desligadoEm: timestamp("desligado_em", { withTimezone: true }),
    desligadoPor: text("desligado_por").references(() => perfisUsuarios.usuarioId),
    // Lista de motivos só entra quando o DP definir o vocabulário. Até lá é texto obrigatório no
    // ato de desligar — mais honesto que gravar um código legal fictício.
    motivoDesligamento: text("motivo_desligamento"),
    funcaoId: uuid("funcao_id").notNull(),
    funcaoNome: text("funcao_nome").notNull(),
    funcaoCbo: text("funcao_cbo"),
    turnoId: uuid("turno_id"),
    turnoRotulo: text("turno_rotulo"),
    turnoEtiqueta: text("turno_etiqueta").$type<EtiquetaTurno>(),
    turnoHoraInicio: time("turno_hora_inicio"),
    turnoHoraFim: time("turno_hora_fim"),
    turnoDiasSemana: text("turno_dias_semana").array().$type<DiaSemana[]>(),
    jornadaHorario: text("jornada_horario"),
    // Código do contrato deste vínculo no Questor (CODIGOFUNCCONTR, inteiro de até 7 dígitos). É a
    // coluna 1 do CSV de eventos variáveis e a chave para casar relatórios Conplus com o vínculo.
    // Nulo até o DP informar: o Questor atribui o código na admissão, o Pralís não inventa.
    questorCodigoContrato: text("questor_codigo_contrato"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.colaboradorId, table.empresaId],
      foreignColumns: [colaboradores.id, colaboradores.empresaId],
      name: "colaboradores_vinculos_colaborador_empresa_fk"
    }).onDelete("restrict"),
    uniqueIndex("colaboradores_vinculos_empresa_questor_contrato_unico")
      .on(table.empresaId, table.questorCodigoContrato)
      .where(sql`${table.questorCodigoContrato} is not null`),
    check(
      "colaboradores_vinculos_questor_contrato_check",
      sql`${table.questorCodigoContrato} is null or ${table.questorCodigoContrato} ~ '^[0-9]{1,7}$'`
    ),
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "colaboradores_vinculos_processo_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.funcaoId, table.empresaId],
      foreignColumns: [funcoesOperacionais.id, funcoesOperacionais.empresaId],
      name: "colaboradores_vinculos_funcao_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.turnoId, table.empresaId],
      foreignColumns: [turnos.id, turnos.empresaId],
      name: "colaboradores_vinculos_turno_empresa_fk"
    }).onDelete("restrict"),
    unique("colaboradores_vinculos_processo_unico").on(table.processoId),
    // Alvo das FKs compostas da linha do tempo e das etapas de desligamento.
    unique("colaboradores_vinculos_id_empresa_unica").on(table.id, table.empresaId),
    unique("colaboradores_vinculos_empresa_numero_unico").on(table.empresaId, table.numeroSequencial),
    unique("colaboradores_vinculos_empresa_matricula_unica").on(table.empresaId, table.matricula),
    check("colaboradores_vinculos_numero_check", sql`${table.numeroSequencial} > 0`),
    check("colaboradores_vinculos_matricula_check", sql`${table.matricula} ~ '^[A-Z0-9]{2,8}-[0-9]{6}$'`),
    check("colaboradores_vinculos_status_check", sql`${table.status} in ('ativo', 'desligado')`),
    check("colaboradores_vinculos_funcao_nome_check", sql`length(btrim(${table.funcaoNome})) > 0`),
    check(
      "colaboradores_vinculos_funcao_cbo_check",
      sql`${table.funcaoCbo} is null or ${table.funcaoCbo} ~ '^[0-9]{6}$'`
    ),
    check(
      "colaboradores_vinculos_turno_retrato_check",
      sql`(
        ${table.turnoId} is null
        and ${table.turnoRotulo} is null and ${table.turnoEtiqueta} is null
        and ${table.turnoHoraInicio} is null and ${table.turnoHoraFim} is null and ${table.turnoDiasSemana} is null
      ) or (
        ${table.turnoId} is not null
        and ${table.turnoRotulo} is not null and ${table.turnoEtiqueta} is not null
        and ${table.turnoHoraInicio} is not null and ${table.turnoHoraFim} is not null and ${table.turnoDiasSemana} is not null
      )`
    ),
    check(
      "colaboradores_vinculos_jornada_check",
      sql`(${table.turnoId} is not null and ${table.jornadaHorario} is null) or (${table.turnoId} is null and ${table.jornadaHorario} is not null and length(btrim(${table.jornadaHorario})) > 0)`
    ),
    check(
      "colaboradores_vinculos_desligamento_check",
      sql`(
        ${table.status} = 'ativo'
        and ${table.desligadoEm} is null and ${table.desligadoPor} is null and ${table.motivoDesligamento} is null
      ) or (
        ${table.status} = 'desligado'
        and ${table.desligadoEm} is not null and ${table.desligadoPor} is not null
        and ${table.motivoDesligamento} is not null and length(btrim(${table.motivoDesligamento})) > 0
      )`
    ),
    uniqueIndex("colaboradores_vinculos_colaborador_ativo_unico")
      .on(table.colaboradorId)
      .where(sql`${table.status} = 'ativo'`),
    index("colaboradores_vinculos_empresa_colaborador_idx").on(table.empresaId, table.colaboradorId, table.criadoEm),
    index("colaboradores_vinculos_empresa_status_idx").on(table.empresaId, table.status, table.admitidoEm)
  ]
);

// Dados privados ficam fora da tabela raiz de colaboradores, que tambem e consumida por
// operacoes de Caixa. Cada tabela usa a FK composta para impedir que uma ficha de uma empresa
// aponte para o colaborador de outra.
export const colaboradoresDadosPessoais = pgTable(
  "colaboradores_dados_pessoais",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id").notNull(),
    nomeSocial: text("nome_social"),
    nascimento: date("nascimento"),
    sexo: text("sexo").$type<"Masculino" | "Feminino">(),
    estadoCivil: text("estado_civil"),
    racaCor: text("raca_cor"),
    grauInstrucao: text("grau_instrucao"),
    nacionalidade: text("nacionalidade"),
    naturalidade: text("naturalidade"),
    nomeMae: text("nome_mae"),
    nomePai: text("nome_pai"),
    rgNumero: text("rg_numero"),
    rgOrgao: text("rg_orgao"),
    rgUf: text("rg_uf"),
    rgEmissao: date("rg_emissao"),
    tituloEleitor: text("titulo_eleitor"),
    tituloZona: text("titulo_zona"),
    tituloSecao: text("titulo_secao"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.colaboradorId, table.empresaId],
      foreignColumns: [colaboradores.id, colaboradores.empresaId],
      name: "colaboradores_dados_pessoais_colaborador_empresa_fk"
    }).onDelete("restrict"),
    unique("colaboradores_dados_pessoais_colaborador_unico").on(table.colaboradorId),
    check(
      "colaboradores_dados_pessoais_sexo_check",
      sql`${table.sexo} is null or ${table.sexo} in ('Masculino', 'Feminino')`
    ),
    check("colaboradores_dados_pessoais_rg_uf_check", sql`${table.rgUf} is null or ${table.rgUf} ~ '^[A-Z]{2}$'`)
  ]
);

export const colaboradoresEnderecos = pgTable(
  "colaboradores_enderecos",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id").notNull(),
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    municipio: text("municipio"),
    uf: text("uf"),
    telefone: text("telefone"),
    email: text("email"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.colaboradorId, table.empresaId],
      foreignColumns: [colaboradores.id, colaboradores.empresaId],
      name: "colaboradores_enderecos_colaborador_empresa_fk"
    }).onDelete("restrict"),
    unique("colaboradores_enderecos_colaborador_unico").on(table.colaboradorId),
    check("colaboradores_enderecos_cep_check", sql`${table.cep} is null or ${table.cep} ~ '^[0-9]{8}$'`),
    check("colaboradores_enderecos_uf_check", sql`${table.uf} is null or ${table.uf} ~ '^[A-Z]{2}$'`),
    check(
      "colaboradores_enderecos_telefone_check",
      sql`${table.telefone} is null or ${table.telefone} ~ '^[0-9]{10,11}$'`
    )
  ]
);

export const colaboradoresDadosBancarios = pgTable(
  "colaboradores_dados_bancarios",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id").notNull(),
    banco: text("banco"),
    agencia: text("agencia"),
    conta: text("conta"),
    contaDigito: text("conta_digito"),
    contaTipo: text("conta_tipo"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.colaboradorId, table.empresaId],
      foreignColumns: [colaboradores.id, colaboradores.empresaId],
      name: "colaboradores_dados_bancarios_colaborador_empresa_fk"
    }).onDelete("restrict"),
    unique("colaboradores_dados_bancarios_colaborador_unico").on(table.colaboradorId)
  ]
);

export const colaboradoresOnboarding = pgTable(
  "colaboradores_onboarding",
  {
    id: idUuid,
    empresaId,
    vinculoId: uuid("vinculo_id").notNull(),
    etapa: text("etapa").$type<"em_cadastro">().notNull().default("em_cadastro"),
    versao: integer("versao").notNull().default(1),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.vinculoId, table.empresaId],
      foreignColumns: [colaboradoresVinculos.id, colaboradoresVinculos.empresaId],
      name: "colaboradores_onboarding_vinculo_empresa_fk"
    }).onDelete("restrict"),
    unique("colaboradores_onboarding_vinculo_unico").on(table.vinculoId),
    check("colaboradores_onboarding_etapa_check", sql`${table.etapa} = 'em_cadastro'`),
    check("colaboradores_onboarding_versao_check", sql`${table.versao} > 0`),
    index("colaboradores_onboarding_empresa_etapa_idx").on(table.empresaId, table.etapa, table.atualizadoEm)
  ]
);

/**
 * Histórico próprio do colaborador. Só guarda o tipo do ato e nomes de campos, nunca os valores
 * pessoais anteriores/depois. Assim a linha do tempo é auditável sem virar uma segunda cópia de PII.
 */
export const colaboradoresEventos = pgTable(
  "colaboradores_eventos",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id").notNull(),
    vinculoId: uuid("vinculo_id"),
    processoId: uuid("processo_id"),
    tipo: text("tipo")
      .$type<"efetivado" | "recontratado" | "dados_cadastrais_atualizados" | "vinculo_desligado">()
      .notNull(),
    camposAlterados: jsonb("campos_alterados")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    atorUsuarioId: text("ator_usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.colaboradorId, table.empresaId],
      foreignColumns: [colaboradores.id, colaboradores.empresaId],
      name: "colaboradores_eventos_colaborador_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.vinculoId, table.empresaId],
      foreignColumns: [colaboradoresVinculos.id, colaboradoresVinculos.empresaId],
      name: "colaboradores_eventos_vinculo_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "colaboradores_eventos_processo_empresa_fk"
    }).onDelete("restrict"),
    check(
      "colaboradores_eventos_tipo_check",
      sql`${table.tipo} in ('efetivado', 'recontratado', 'dados_cadastrais_atualizados', 'vinculo_desligado')`
    ),
    index("colaboradores_eventos_empresa_colaborador_idx").on(
      table.empresaId,
      table.colaboradorId,
      table.ocorridoEm,
      table.id
    )
  ]
);

// ================================================================================================
// FASE 2 — rodada de cotacao multi-fornecedor (R-221, PROJECT_BRAIN/54)
//
// Fluxo: solicitacao sem fornecedor -> rodada -> convites -> propostas versionadas -> vencedor por
// item -> compra consolidada. As tabelas estao em ordem de dependencia de FK (alvo antes do
// referenciador). Toda tabela tem empresa_id e, quando e alvo de FK composta, UNIQUE (id, empresa_id)
// para o isolamento por empresa viver no banco.
// ================================================================================================

export const comprasSolicitacoes = pgTable(
  "compras_solicitacoes",
  {
    id: idUuid,
    empresaId,
    status: text("status")
      .$type<"rascunho" | "em_cotacao" | "parcialmente_comprada" | "comprada" | "encerrada" | "cancelada">()
      .notNull()
      .default("rascunho"),
    // `rapida` e o atalho "pedido rapido" (decisao 2): o dado registra que foi atalho, o mecanismo e o
    // mesmo da rodada normal.
    origem: text("origem").$type<"manual" | "sugestao" | "rapida" | "agendamento">().notNull(),
    observacao: text("observacao"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm,
    encerradaEm: timestamp("encerrada_em", { withTimezone: true })
  },
  (table) => [
    check(
      "compras_solicitacoes_status_check",
      sql`${table.status} in ('rascunho', 'em_cotacao', 'parcialmente_comprada', 'comprada', 'encerrada', 'cancelada')`
    ),
    // `agendamento`: nasce sozinha na data de um agendamento de pedido (doc 56), para o comprador conferir.
    check("compras_solicitacoes_origem_check", sql`${table.origem} in ('manual', 'sugestao', 'rapida', 'agendamento')`),
    check(
      "compras_solicitacoes_encerramento_check",
      sql`(${table.status} in ('encerrada', 'cancelada', 'comprada')) = (${table.encerradaEm} is not null)`
    ),
    unique("compras_solicitacoes_id_empresa_unica").on(table.id, table.empresaId),
    index("compras_solicitacoes_empresa_status_idx").on(table.empresaId, table.status, table.criadoEm)
  ]
);

export const comprasSolicitacoesItens = pgTable(
  "compras_solicitacoes_itens",
  {
    id: idUuid,
    empresaId,
    solicitacaoId: uuid("solicitacao_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    descricaoProduto: text("descricao_produto").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    estoqueAtual: numeric("estoque_atual", { precision: 14, scale: 3 }),
    estoqueMin: numeric("estoque_min", { precision: 14, scale: 3 }),
    estoqueMax: numeric("estoque_max", { precision: 14, scale: 3 })
  },
  (table) => [
    foreignKey({
      name: "compras_solicitacoes_itens_solicitacao_empresa_fk",
      columns: [table.solicitacaoId, table.empresaId],
      foreignColumns: [comprasSolicitacoes.id, comprasSolicitacoes.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "compras_solicitacoes_itens_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("restrict"),
    check("compras_solicitacoes_itens_quantidade_check", sql`${table.quantidade} > 0`),
    // Alvo da FK composta de compras_rodadas_itens (o envelope aponta a linha de necessidade).
    unique("compras_solicitacoes_itens_id_empresa_unica").on(table.id, table.empresaId),
    // Produto repetido na mesma solicitacao = duas adjudicacoes para a mesma necessidade. Invariante.
    unique("compras_solicitacoes_itens_solicitacao_produto_unica").on(table.solicitacaoId, table.produtoId),
    index("compras_solicitacoes_itens_solicitacao_idx").on(table.solicitacaoId)
  ]
);

// Agendamento de pedido (PROJECT_BRAIN/56). A serie guarda a regra; as datas futuras sao CALCULADAS
// (shared/compras/recorrencia). Uma ocorrencia so vira linha quando acontece (solicitacao para o
// comprador conferir), quando e cancelada ou quando e movida ("editar so esta").
export const pedidosAgendas = pgTable(
  "pedidos_agendas",
  {
    id: idUuid,
    empresaId,
    // O subgrupo escolhido no card (ou o grupo, quando nao ha subgrupo).
    grupoMercadoriaId: uuid("grupo_mercadoria_id").notNull(),
    responsavelId: text("responsavel_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    inicioEm: timestamp("inicio_em", { withTimezone: true }).notNull(),
    fusoHorario: text("fuso_horario").notNull(),
    regra: jsonb("regra").$type<RegraRecorrencia>().notNull(),
    terminoTipo: text("termino_tipo").$type<"nunca" | "data" | "quantidade">().notNull().default("nunca"),
    terminoEm: date("termino_em"),
    terminoQuantidade: integer("termino_quantidade"),
    prazoRespostaHoras: integer("prazo_resposta_horas").notNull(),
    margemVariacaoPercentual: smallint("margem_variacao_percentual").notNull().default(10),
    // Doc 58 §8: a loja recebe pedido nesta janela (o fornecedor ve na cotacao).
    recebimentoInicio: time("recebimento_inicio"),
    recebimentoFim: time("recebimento_fim"),
    status: text("status").$type<"ativa" | "encerrada">().notNull().default("ativa"),
    serieAnteriorId: uuid("serie_anterior_id").references((): AnyPgColumn => pedidosAgendas.id, {
      onDelete: "restrict"
    }),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("pedidos_agendas_id_empresa_unica").on(table.id, table.empresaId),
    foreignKey({
      name: "pedidos_agendas_grupo_empresa_fk",
      columns: [table.grupoMercadoriaId, table.empresaId],
      foreignColumns: [gruposMercadorias.id, gruposMercadorias.empresaId]
    }).onDelete("restrict"),
    check("pedidos_agendas_status_check", sql`${table.status} in ('ativa', 'encerrada')`),
    check(
      "pedidos_agendas_encerramento_check",
      sql`(${table.status} = 'encerrada') = (${table.encerradaEm} is not null)`
    ),
    check("pedidos_agendas_prazo_check", sql`${table.prazoRespostaHoras} between 1 and 720`),
    check("pedidos_agendas_margem_check", sql`${table.margemVariacaoPercentual} in (10, 20, 30, 40)`),
    check(
      "pedidos_agendas_recebimento_check",
      sql`(${table.recebimentoInicio} is null) = (${table.recebimentoFim} is null) and (${table.recebimentoFim} is null or ${table.recebimentoFim} > ${table.recebimentoInicio})`
    ),
    check("pedidos_agendas_fuso_check", sql`btrim(${table.fusoHorario}) <> ''`),
    check(
      "pedidos_agendas_termino_check",
      sql`(${table.terminoTipo} = 'nunca' and ${table.terminoEm} is null and ${table.terminoQuantidade} is null) or (${table.terminoTipo} = 'data' and ${table.terminoEm} is not null and ${table.terminoQuantidade} is null) or (${table.terminoTipo} = 'quantidade' and ${table.terminoQuantidade} between 1 and 999 and ${table.terminoEm} is null)`
    ),
    index("pedidos_agendas_empresa_status_idx").on(table.empresaId, table.status)
  ]
);

export const pedidosAgendasProdutos = pgTable(
  "pedidos_agendas_produtos",
  {
    id: idUuid,
    empresaId,
    agendaId: uuid("agenda_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    // Opcional: vazio = sugestao pelo estoque (maximo - saldo) na data.
    quantidadePadrao: numeric("quantidade_padrao", { precision: 14, scale: 3 })
  },
  (table) => [
    unique("pedidos_agendas_produtos_unico").on(table.agendaId, table.produtoId),
    foreignKey({
      name: "pedidos_agendas_produtos_agenda_empresa_fk",
      columns: [table.agendaId, table.empresaId],
      foreignColumns: [pedidosAgendas.id, pedidosAgendas.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "pedidos_agendas_produtos_produto_empresa_fk",
      columns: [table.produtoId, table.empresaId],
      foreignColumns: [produtos.id, produtos.empresaId]
    }).onDelete("restrict"),
    check(
      "pedidos_agendas_produtos_quantidade_check",
      sql`${table.quantidadePadrao} is null or ${table.quantidadePadrao} > 0`
    )
  ]
);

export const pedidosAgendaOcorrencias = pgTable(
  "pedidos_agenda_ocorrencias",
  {
    id: idUuid,
    empresaId,
    agendaId: uuid("agenda_id").notNull(),
    // Instante calculado pela regra: chave contra a mesma data criada duas vezes pelo agendador.
    previstoPara: timestamp("previsto_para", { withTimezone: true }).notNull(),
    // Igual ao previsto, ou a nova data de "editar so esta".
    dataAtual: timestamp("data_atual", { withTimezone: true }).notNull(),
    situacao: text("situacao")
      .$type<"agendada" | "aguardando_conferencia" | "enviada" | "cancelada">()
      .notNull()
      .default("aguardando_conferencia"),
    solicitacaoId: uuid("solicitacao_id").references(() => comprasSolicitacoes.id, { onDelete: "restrict" }),
    enviadaPor: text("enviada_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    canceladaPor: text("cancelada_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("pedidos_agenda_ocorrencias_unica").on(table.agendaId, table.previstoPara),
    foreignKey({
      name: "pedidos_agenda_ocorrencias_agenda_empresa_fk",
      columns: [table.agendaId, table.empresaId],
      foreignColumns: [pedidosAgendas.id, pedidosAgendas.empresaId]
    }).onDelete("cascade"),
    check(
      "pedidos_agenda_ocorrencias_situacao_check",
      sql`${table.situacao} in ('agendada', 'aguardando_conferencia', 'enviada', 'cancelada')`
    ),
    check(
      "pedidos_agenda_ocorrencias_conferencia_check",
      sql`${table.situacao} not in ('aguardando_conferencia', 'enviada') or ${table.solicitacaoId} is not null`
    ),
    check(
      "pedidos_agenda_ocorrencias_envio_check",
      sql`(${table.situacao} = 'enviada') = (${table.enviadaEm} is not null and ${table.enviadaPor} is not null)`
    ),
    check(
      "pedidos_agenda_ocorrencias_cancelamento_check",
      sql`(${table.situacao} = 'cancelada') = (${table.canceladaEm} is not null and ${table.canceladaPor} is not null)`
    ),
    index("pedidos_agenda_ocorrencias_empresa_situacao_idx").on(table.empresaId, table.situacao, table.dataAtual)
  ]
);

export const comprasRodadas = pgTable(
  "compras_rodadas",
  {
    id: idUuid,
    empresaId,
    solicitacaoId: uuid("solicitacao_id").notNull(),
    numero: integer("numero").notNull(),
    status: text("status").$type<"aberta" | "fechada" | "cancelada">().notNull().default("aberta"),
    // null = usa o padrao (2 dias uteis da R-216); o comprador pode sobrescrever por rodada.
    prazoRespostaHoras: integer("prazo_resposta_horas"),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    // Snapshot do fuso da empresa na abertura: o vencimento ja corrido continua explicavel depois.
    fusoHorario: text("fuso_horario").notNull(),
    // Decisao 14: teto de compra automatica da rodada. null = sem teto.
    tetoValor: numeric("teto_valor", { precision: 14, scale: 2 }),
    // Doc 57: variacao de quantidade aceita (para menos e para mais, na resposta e na separacao). Null = rodada
    // de antes da regra (sem limite).
    margemVariacaoPercentual: smallint("margem_variacao_percentual"),
    // Doc 58 §8: a janela de recebimento da loja, congelada na abertura.
    recebimentoInicio: time("recebimento_inicio"),
    recebimentoFim: time("recebimento_fim"),
    abertaPor: text("aberta_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    abertaEm: timestamp("aberta_em", { withTimezone: true }).notNull().defaultNow(),
    // null no fechamento automatico por prazo: nao ha autor humano (decisao 6).
    fechadaPor: text("fechada_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    fechadaEm: timestamp("fechada_em", { withTimezone: true }),
    motivoFechamento: text("motivo_fechamento"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "compras_rodadas_recebimento_check",
      sql`(${table.recebimentoInicio} is null) = (${table.recebimentoFim} is null) and (${table.recebimentoFim} is null or ${table.recebimentoFim} > ${table.recebimentoInicio})`
    ),
    check(
      "compras_rodadas_margem_check",
      sql`${table.margemVariacaoPercentual} is null or ${table.margemVariacaoPercentual} in (10, 20, 30, 40)`
    ),
    check("compras_rodadas_status_check", sql`${table.status} in ('aberta', 'fechada', 'cancelada')`),
    check("compras_rodadas_prazo_check", sql`${table.prazoRespostaHoras} is null or ${table.prazoRespostaHoras} > 0`),
    check("compras_rodadas_teto_check", sql`${table.tetoValor} is null or ${table.tetoValor} > 0`),
    check("compras_rodadas_expira_check", sql`${table.expiraEm} > ${table.abertaEm}`),
    check("compras_rodadas_fechamento_check", sql`(${table.status} = 'aberta') = (${table.fechadaEm} is null)`),
    check(
      "compras_rodadas_motivo_check",
      sql`${table.fechadaEm} is null or ${table.motivoFechamento} in ('prazo', 'comprador', 'cancelada')`
    ),
    // Fechamento por prazo e sem autor humano; qualquer fechamento com autor nao e por prazo.
    check(
      "compras_rodadas_motivo_autor_check",
      sql`${table.motivoFechamento} is distinct from 'prazo' or ${table.fechadaPor} is null`
    ),
    unique("compras_rodadas_id_empresa_unica").on(table.id, table.empresaId),
    unique("compras_rodadas_solicitacao_numero_unica").on(table.solicitacaoId, table.numero),
    foreignKey({
      name: "compras_rodadas_solicitacao_empresa_fk",
      columns: [table.solicitacaoId, table.empresaId],
      foreignColumns: [comprasSolicitacoes.id, comprasSolicitacoes.empresaId]
    }).onDelete("restrict"),
    // Uma rodada aberta por solicitacao (sobe o nivel do antigo "1 cotacao aberta por pedido").
    uniqueIndex("compras_rodadas_solicitacao_aberta_unica")
      .on(table.solicitacaoId)
      .where(sql`${table.status} = 'aberta'`),
    // A unica consulta do agendador: rodada aberta com prazo vencido.
    index("compras_rodadas_expira_aberta_idx")
      .on(table.expiraEm)
      .where(sql`${table.status} = 'aberta'`),
    index("compras_rodadas_empresa_solicitacao_idx").on(table.empresaId, table.solicitacaoId)
  ]
);

export const comprasRodadasItens = pgTable(
  "compras_rodadas_itens",
  {
    id: idUuid,
    empresaId,
    rodadaId: uuid("rodada_id").notNull(),
    solicitacaoItemId: uuid("solicitacao_item_id").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    // Base congelada no instante da abertura: a compra automatica compara contra isto, imutavel
    // enquanto os fornecedores respondem.
    precoBaseValor: numeric("preco_base_valor", { precision: 14, scale: 4 }),
    precoBaseId: uuid("preco_base_id").references(() => produtosPrecosBase.id, { onDelete: "restrict" })
  },
  (table) => [
    foreignKey({
      name: "compras_rodadas_itens_rodada_empresa_fk",
      columns: [table.rodadaId, table.empresaId],
      foreignColumns: [comprasRodadas.id, comprasRodadas.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "compras_rodadas_itens_solicitacao_item_empresa_fk",
      columns: [table.solicitacaoItemId, table.empresaId],
      foreignColumns: [comprasSolicitacoesItens.id, comprasSolicitacoesItens.empresaId]
    }).onDelete("restrict"),
    check("compras_rodadas_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("compras_rodadas_itens_base_check", sql`(${table.precoBaseId} is null) = (${table.precoBaseValor} is null)`),
    unique("compras_rodadas_itens_id_empresa_unica").on(table.id, table.empresaId),
    unique("compras_rodadas_itens_rodada_item_unica").on(table.rodadaId, table.solicitacaoItemId),
    index("compras_rodadas_itens_rodada_idx").on(table.rodadaId)
  ]
);

export const comprasRodadasConvites = pgTable(
  "compras_rodadas_convites",
  {
    id: idUuid,
    empresaId,
    rodadaId: uuid("rodada_id").notNull(),
    fornecedorId: uuid("fornecedor_id").notNull(),
    // So o hash SHA-256; o token sai uma vez. Prazo e um so (o da rodada), por isso sem expira_em.
    tokenHash: text("token_hash").notNull(),
    status: text("status")
      .$type<"aberto" | "aguardando_comprador" | "encerrado" | "revogado">()
      .notNull()
      .default("aberto"),
    whatsappEnviado: text("whatsapp_enviado"),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm,
    atualizadoEm,
    respondidoEm: timestamp("respondido_em", { withTimezone: true }),
    revogadoEm: timestamp("revogado_em", { withTimezone: true })
  },
  (table) => [
    check(
      "compras_rodadas_convites_status_check",
      sql`${table.status} in ('aberto', 'aguardando_comprador', 'encerrado', 'revogado')`
    ),
    foreignKey({
      name: "compras_rodadas_convites_rodada_empresa_fk",
      columns: [table.rodadaId, table.empresaId],
      foreignColumns: [comprasRodadas.id, comprasRodadas.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "compras_rodadas_convites_fornecedor_empresa_fk",
      columns: [table.fornecedorId, table.empresaId],
      foreignColumns: [fornecedores.id, fornecedores.empresaId]
    }).onDelete("restrict"),
    unique("compras_rodadas_convites_id_empresa_unica").on(table.id, table.empresaId),
    uniqueIndex("compras_rodadas_convites_token_hash_unico").on(table.tokenHash),
    unique("compras_rodadas_convites_rodada_fornecedor_unica").on(table.rodadaId, table.fornecedorId),
    index("compras_rodadas_convites_empresa_rodada_idx").on(table.empresaId, table.rodadaId)
  ]
);

export const comprasConvitesItens = pgTable(
  "compras_convites_itens",
  {
    id: idUuid,
    empresaId,
    conviteId: uuid("convite_id").notNull(),
    rodadaItemId: uuid("rodada_item_id").notNull()
  },
  (table) => [
    foreignKey({
      name: "compras_convites_itens_convite_empresa_fk",
      columns: [table.conviteId, table.empresaId],
      foreignColumns: [comprasRodadasConvites.id, comprasRodadasConvites.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "compras_convites_itens_rodada_item_empresa_fk",
      columns: [table.rodadaItemId, table.empresaId],
      foreignColumns: [comprasRodadasItens.id, comprasRodadasItens.empresaId]
    }).onDelete("restrict"),
    unique("compras_convites_itens_id_empresa_unica").on(table.id, table.empresaId),
    unique("compras_convites_itens_convite_item_unica").on(table.conviteId, table.rodadaItemId),
    index("compras_convites_itens_rodada_item_idx").on(table.rodadaItemId)
  ]
);

export const comprasPropostas = pgTable(
  "compras_propostas",
  {
    id: idUuid,
    empresaId,
    conviteId: uuid("convite_id").notNull(),
    versao: integer("versao").notNull(),
    // Fornecedor e contraproposta do comprador no MESMO livro, distintos por autor_tipo (decisao 7).
    autorTipo: text("autor_tipo").$type<"fornecedor" | "comprador">().notNull(),
    autorUsuarioId: text("autor_usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    status: text("status").$type<"rascunho" | "enviada">().notNull(),
    // Um frete por proposta, rateado so sobre os itens livres no envio (decisao 5).
    frete: numeric("frete", { precision: 14, scale: 2 }),
    descontoGeralTipo: text("desconto_geral_tipo"),
    descontoGeralValor: numeric("desconto_geral_valor", { precision: 14, scale: 4 }),
    observacao: text("observacao"),
    prazoEntrega: date("prazo_entrega", { mode: "string" }),
    condicaoPagamento: text("condicao_pagamento"),
    totalBruto: numeric("total_bruto", { precision: 14, scale: 2 }),
    totalFinal: numeric("total_final", { precision: 14, scale: 2 }),
    criadoEm,
    atualizadoEm,
    enviadaEm: timestamp("enviada_em", { withTimezone: true })
  },
  (table) => [
    check("compras_propostas_autor_tipo_check", sql`${table.autorTipo} in ('fornecedor', 'comprador')`),
    check(
      "compras_propostas_autor_check",
      sql`(${table.autorTipo} = 'comprador' and ${table.autorUsuarioId} is not null) or (${table.autorTipo} = 'fornecedor' and ${table.autorUsuarioId} is null)`
    ),
    check("compras_propostas_status_check", sql`${table.status} in ('rascunho', 'enviada')`),
    // Contraproposta do comprador nasce enviada; rascunho e so do fornecedor.
    check("compras_propostas_rascunho_check", sql`${table.autorTipo} = 'fornecedor' or ${table.status} = 'enviada'`),
    check("compras_propostas_frete_check", sql`${table.frete} is null or ${table.frete} >= 0`),
    check(
      "compras_propostas_desconto_geral_tipo_check",
      sql`${table.descontoGeralTipo} is null or ${table.descontoGeralTipo} in ('valor', 'percentual')`
    ),
    unique("compras_propostas_id_empresa_unica").on(table.id, table.empresaId),
    // Livro de versoes: nada sobrescreve (decisao 7).
    unique("compras_propostas_convite_versao_unica").on(table.conviteId, table.versao),
    // Um rascunho vivo por convite: o autosave tem sempre um alvo unico.
    uniqueIndex("compras_propostas_convite_rascunho_unica")
      .on(table.conviteId)
      .where(sql`${table.status} = 'rascunho'`),
    foreignKey({
      name: "compras_propostas_convite_empresa_fk",
      columns: [table.conviteId, table.empresaId],
      foreignColumns: [comprasRodadasConvites.id, comprasRodadasConvites.empresaId]
    }).onDelete("cascade"),
    index("compras_propostas_empresa_convite_idx").on(table.empresaId, table.conviteId, table.versao)
  ]
);

export const comprasPropostasItens = pgTable(
  "compras_propostas_itens",
  {
    id: idUuid,
    empresaId,
    propostaId: uuid("proposta_id").notNull(),
    conviteItemId: uuid("convite_item_id").notNull(),
    indisponivel: boolean("indisponivel").notNull().default(false),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    descontoTipo: text("desconto_tipo"),
    descontoValor: numeric("desconto_valor", { precision: 14, scale: 4 }),
    valorUnitarioFinal: numeric("valor_unitario_final", { precision: 14, scale: 4 }),
    freteRateado: numeric("frete_rateado", { precision: 14, scale: 2 }),
    // GRAVADO, nao recalculado na leitura: e o numero comparado com o preco-base e o que alimenta a
    // base nova. Forma de dinheiro congelada com a linha.
    custoFinalUnitario: numeric("custo_final_unitario", { precision: 14, scale: 4 }),
    totalFinal: numeric("total_final", { precision: 14, scale: 2 }),
    // Doc 57 §5: quanto o fornecedor TEM do produto, e por que nao tem ("sem estoque" ou "nao trabalha mais").
    quantidadeDisponivel: numeric("quantidade_disponivel", { precision: 14, scale: 3 }),
    motivoIndisponivel: text("motivo_indisponivel").$type<"sem_estoque" | "nao_trabalha">()
  },
  (table) => [
    check("compras_propostas_itens_valor_check", sql`${table.valorUnitario} is null or ${table.valorUnitario} >= 0`),
    check(
      "compras_propostas_itens_quantidade_disponivel_check",
      sql`${table.quantidadeDisponivel} is null or ${table.quantidadeDisponivel} > 0`
    ),
    check(
      "compras_propostas_itens_motivo_check",
      sql`${table.motivoIndisponivel} is null or (${table.indisponivel} and ${table.motivoIndisponivel} in ('sem_estoque', 'nao_trabalha'))`
    ),
    check(
      "compras_propostas_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('valor', 'percentual')`
    ),
    foreignKey({
      name: "compras_propostas_itens_proposta_empresa_fk",
      columns: [table.propostaId, table.empresaId],
      foreignColumns: [comprasPropostas.id, comprasPropostas.empresaId]
    }).onDelete("cascade"),
    foreignKey({
      name: "compras_propostas_itens_convite_item_empresa_fk",
      columns: [table.conviteItemId, table.empresaId],
      foreignColumns: [comprasConvitesItens.id, comprasConvitesItens.empresaId]
    }).onDelete("restrict"),
    unique("compras_propostas_itens_id_empresa_unica").on(table.id, table.empresaId),
    unique("compras_propostas_itens_proposta_item_unica").on(table.propostaId, table.conviteItemId),
    index("compras_propostas_itens_convite_item_idx").on(table.conviteItemId)
  ]
);

export const comprasAdjudicacoes = pgTable(
  "compras_adjudicacoes",
  {
    id: idUuid,
    empresaId,
    rodadaItemId: uuid("rodada_item_id").notNull(),
    propostaItemId: uuid("proposta_item_id").notNull(),
    fornecedorId: uuid("fornecedor_id").notNull(),
    // FK simples: pedidos nao tem (id, empresa_id) unico e pedidos_itens nem tem empresa_id. A mesma
    // empresa e garantida porque a adjudicacao e criada na mesma transacao que cria o pedido.
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "restrict" }),
    pedidoItemId: uuid("pedido_item_id")
      .notNull()
      .references(() => pedidosItens.id, { onDelete: "restrict" }),
    modo: text("modo").$type<"automatica" | "comprador">().notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    custoFinalUnitario: numeric("custo_final_unitario", { precision: 14, scale: 4 }).notNull(),
    precoBaseValor: numeric("preco_base_valor", { precision: 14, scale: 4 }),
    // Excecao acima da base exige aprovador nomeado; a automatica (pre-autorizada) nao tem autor.
    aprovadoPor: text("aprovado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    criadoEm
  },
  (table) => [
    check("compras_adjudicacoes_modo_check", sql`${table.modo} in ('automatica', 'comprador')`),
    check(
      "compras_adjudicacoes_aprovador_check",
      sql`(${table.modo} = 'automatica' and ${table.aprovadoPor} is null) or (${table.modo} = 'comprador' and ${table.aprovadoPor} is not null)`
    ),
    foreignKey({
      name: "compras_adjudicacoes_rodada_item_empresa_fk",
      columns: [table.rodadaItemId, table.empresaId],
      foreignColumns: [comprasRodadasItens.id, comprasRodadasItens.empresaId]
    }).onDelete("restrict"),
    foreignKey({
      name: "compras_adjudicacoes_proposta_item_empresa_fk",
      columns: [table.propostaItemId, table.empresaId],
      foreignColumns: [comprasPropostasItens.id, comprasPropostasItens.empresaId]
    }).onDelete("restrict"),
    foreignKey({
      name: "compras_adjudicacoes_fornecedor_empresa_fk",
      columns: [table.fornecedorId, table.empresaId],
      foreignColumns: [fornecedores.id, fornecedores.empresaId]
    }).onDelete("restrict"),
    // "Resposta tardia nunca substitui compra realizada" (R-218): um vencedor por item da rodada.
    unique("compras_adjudicacoes_rodada_item_unica").on(table.rodadaItemId),
    // Uma linha de preco vence no maximo um item.
    unique("compras_adjudicacoes_proposta_item_unica").on(table.propostaItemId),
    index("compras_adjudicacoes_pedido_idx").on(table.pedidoId),
    index("compras_adjudicacoes_empresa_fornecedor_idx").on(table.empresaId, table.fornecedorId)
  ]
);
