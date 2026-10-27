import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consultarTodos } from "../../setup/integracao.js";
import { COMANDO_POSTGRES_SEM_DURABILIDADE, PARAMETROS_SEM_DURABILIDADE } from "../../setup/postgres-efemero.js";
import { lerTriggersManuais } from "@padaria/db/triggers-manuais";

const raizRepositorio = fileURLToPath(new URL("../../..", import.meta.url));

// Quantidade de migrations esperadas = entradas do journal (fonte da verdade do drizzle-kit).
// Derivado do arquivo para o teste nao quebrar por numero magico a cada nova migration.
const journalMigracoes = JSON.parse(
  readFileSync(new URL("../../../db/migrations/meta/_journal.json", import.meta.url), "utf8")
) as { entries: unknown[] };
const totalMigracoesEsperado = journalMigracoes.entries.length;

// --- triggers de `atualizado_em` ----------------------------------------------------------------
//
// O conjunto esperado e DERIVADO das migrations, nao digitado. Um numero fixo aqui envelhece a cada
// tabela nova: era `21`, virou mentira quando a 0034 e a 0035 entraram, e o gate so acusou muito
// depois do commit.
//
// Duas origens, e o teste precisa cobrir as duas:
//   - a 0002 instala percorrendo um ARRAY LITERAL de nomes de tabela;
//   - toda tabela criada DEPOIS precisa do `create trigger` escrito a mao na propria migration, porque
//     a 0002 nao volta atras. Foi assim na 0034 (funcoes_operacionais, admissoes_testes) e na 0035
//     (admissoes_processos).
//
// A segunda metade vem de `lerTriggersManuais`, o MESMO modulo que o provisionamento de dev e o de
// Testcontainers usam para instalar. Se o teste tivesse a propria varredura, ele poderia passar
// concordando consigo mesmo enquanto o provisionamento instalava outra coisa.
const dirMigracoes = fileURLToPath(new URL("../../../db/migrations", import.meta.url));

function tabelasDoArrayDa0002(): string[] {
  const sql = readFileSync(join(dirMigracoes, "0002_hardening_atualizado_em.sql"), "utf8");
  const inicio = sql.indexOf("array array[");
  const fim = sql.indexOf("] loop", inicio);
  if (inicio < 0 || fim < 0) throw new Error("bloco de tabelas da 0002 nao encontrado");
  return [...sql.slice(inicio, fim).matchAll(/'([a-z_]+)'/g)].map((achado) => achado[1] ?? "");
}

// Tabelas que TEM a coluna `atualizado_em` e NAO tem o trigger. Nao e o estado desejado — e o estado
// real, declarado aqui para que a lista nao cresca em silencio: uma quinta tabela nesta situacao
// quebra o teste e obriga a decisao. Fechar as quatro exige migration propria, fora deste gate.
const semTriggerConhecidas = [
  // 0070 (fila Google da admissao), 0072 (importacoes Conplus) e 0077 (exportacoes Questor) criaram
  // `atualizado_em` sem o bloco de trigger; os servicos gravam a coluna explicitamente. Declaradas
  // aqui pelo nome ate a decisao da migration que instala os triggers (pendencia registrada).
  "admissoes_google_arquivos",
  "admissoes_google_dependentes",
  "admissoes_google_sincronizacoes",
  "campanhas",
  "conplus_google_sincronizacoes",
  "conplus_importacoes",
  "conplus_registros",
  "fechamentos_caixa_relatorios_maquininha",
  "maquininhas",
  "notas_fiscais",
  "pedidos",
  // 0084 (catalogo mestre BASE): a importacao grava `atualizado_em` explicitamente em toda atualizacao
  // (produtos-catalogo-base.repository.ts); o trigger fica para a mesma pendencia acima.
  "produtos_catalogo_base",
  "questor_eventos_variaveis",
  "questor_eventos_variaveis_lancamentos",
  "questor_exportacoes",
  "regras_recebimento",
  "turnos"
];

const sqlTabelasComTrigger = `
  select distinct event_object_table as tabela
  from information_schema.triggers
  where trigger_name like '%set_atualizado_em'
  order by 1
`;

const sqlTabelasComColuna = `
  select table_name as tabela
  from information_schema.columns
  where table_schema = 'public' and column_name = 'atualizado_em'
  order by 1
`;

const sqlColunas = `
  select table_name, column_name, data_type, is_nullable, coalesce(column_default, '') as column_default
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, column_name
`;

const sqlIndices = `
  select indexname
  from pg_indexes
  where schemaname = 'public'
  order by indexname
`;

/**
 * O PREDICADO dos indices, e nao so o nome.
 *
 * `sqlIndices` compara `indexname`, e nome nao carrega clausula parcial: um indice `WHERE ...` num
 * caminho e total no outro passa despercebido, porque os dois se chamam igual. A migration 0038
 * trocou exatamente o predicado de `admissoes_processos_historico_evento_unico`, entao ela precisa
 * de uma comparacao que enxergue isso.
 *
 * Restrito a `admissoes_%` de proposito: ampliar para o banco inteiro e vertical propria, porque
 * pode revelar drift preexistente em indices que nada tem a ver com esta mudanca — e um vermelho
 * herdado esconderia o que este teste existe para provar.
 */
const sqlIndicesAdmissoes = `
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public' and indexname like 'admissoes_%'
  order by indexname
`;

const sqlConstraints = `
  select conrelid::regclass::text as tabela, conname
  from pg_constraint
  where connamespace = 'public'::regnamespace
  order by 1, 2
`;

/**
 * Caminho OFICIAL de banco novo: o mesmo `drizzle-kit migrate` que o deploy roda
 * (`api:prod:migrate`). Ate 22/10/2026 ele quebrava na 0070 (antiga 0061: FK apontando para a UNIQUE que so nascia
 * na 0071); a 0070 passou a criar a UNIQUE de forma idempotente, e este teste e a prova.
 */
function executarMigrate(databaseUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const processo = spawn("npm", ["run", "db:migrate", "--workspace", "@padaria/db"], {
      cwd: raizRepositorio,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=development"].filter(Boolean).join(" ")
      },
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "inherit"
    });
    const timer = setTimeout(() => {
      processo.kill("SIGTERM");
      reject(new Error("drizzle-kit migrate excedeu o timeout"));
    }, 120_000);
    processo.on("error", reject);
    processo.on("exit", (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) resolve();
      else reject(new Error(`drizzle-kit migrate terminou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

function executarSeed(databaseUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const processo = spawn("npm", ["run", "seed:dev", "--workspace", "@padaria/db"], {
      cwd: raizRepositorio,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=development"].filter(Boolean).join(" ")
      },
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "inherit"
    });
    const timer = setTimeout(() => {
      processo.kill("SIGTERM");
      reject(new Error("seed de desenvolvimento excedeu o timeout"));
    }, 180_000);
    processo.on("error", reject);
    processo.on("exit", (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) resolve();
      else reject(new Error(`seed de desenvolvimento terminou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

describe("migracoes integration", () => {
  let container: StartedPostgreSqlContainer;
  let bancoMigrado: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("padaria_migracoes")
      .withUsername("padaria_migracoes")
      .withPassword("padaria_migracoes")
      // Mesmo tratamento do container da suite, da MESMA fonte: este aqui e o mais pesado do
      // repositorio (todas as migrations + seed de desenvolvimento) e pagava a mesma espera de fsync.
      .withCommand([...COMANDO_POSTGRES_SEM_DURABILIDADE])
      .withStartupTimeout(120_000)
      .start();

    await executarMigrate(container.getConnectionUri());
    await executarSeed(container.getConnectionUri());
    bancoMigrado = new pg.Pool({ connectionString: container.getConnectionUri() });
  }, 300_000);

  afterAll(async () => {
    await bancoMigrado?.end();
    await container?.stop();
  });

  // Este container e o SEGUNDO Postgres efemero do repositorio, e o mais pesado: aplica as
  // migrations todas e roda o seed de desenvolvimento. Ele paga a mesma espera de `fsync` que o
  // container da suite pagava — por isso recebe os mesmos parametros, da mesma fonte unica. Sem
  // este caso, o segundo container viraria o novo gargalo e ninguem perceberia.
  it("Deve_RodarSemDurabilidade_Quando_ContainerEhEfemero", async () => {
    // O filtro sai da MESMA constante da assercao. Com a lista literal aqui, acrescentar um quarto
    // parametro quebrava por tamanho de array — vermelho de verdade, mas apontando para o lugar
    // errado. Com `= any($1)`, os dois lados nao tem como divergir.
    const { rows } = await bancoMigrado.query<{ parametro: string; valor: string }>(
      `select name as parametro, setting as valor
         from pg_settings
        where name = any($1)
        order by name`,
      [[...PARAMETROS_SEM_DURABILIDADE]]
    );
    // Comparado como MAPA, nao como lista ordenada. A ordem do `order by name` so casava com a da
    // constante por coincidencia alfabetica; um quarto parametro acrescentado no fim faria o teste
    // falhar por ORDEM — vermelho de verdade, mas mandando quem le investigar o parametro errado.
    expect(Object.fromEntries(rows.map((linha) => [linha.parametro, linha.valor]))).toEqual(
      Object.fromEntries(PARAMETROS_SEM_DURABILIDADE.map((parametro) => [parametro, "off"]))
    );
  });

  it("Deve_AplicarTodasAsEntradasDoJournal_Quando_ProvisionarBancoVazio", async () => {
    const { rows } = await bancoMigrado.query<{ total: number }>(
      "select count(*)::int as total from drizzle.__drizzle_migrations"
    );
    expect(rows[0]?.total).toBe(totalMigracoesEsperado);
  });

  it("Deve_RodarSeedCompleto_Quando_BancoNascerDoZero", async () => {
    const { rows } = await bancoMigrado.query<{ empresas: number; despesas: number; mercadorias: number }>(
      `select
         (select count(*)::int from empresas) as empresas,
         (select count(*)::int from despesas) as despesas,
         (select count(*)::int from mercadorias) as mercadorias`
    );
    expect(rows[0]?.empresas).toBeGreaterThan(0);
    expect(rows[0]?.despesas).toBeGreaterThan(0);
    expect(rows[0]?.mercadorias).toBeGreaterThan(0);
  });

  it("Deve_GerarEstruturaIdenticaAoPush_Quando_ProvisionarViaMigrate", async () => {
    // O banco global dos testes e provisionado por drizzle-kit push (schema direto).
    // Qualquer diferenca estrutural aqui significa drift entre schema e migrations.
    const [colunasMigrate, colunasPush] = await Promise.all([
      bancoMigrado.query(sqlColunas).then((resultado) => resultado.rows),
      consultarTodos(sqlColunas)
    ]);
    expect(colunasMigrate).toEqual(colunasPush);

    const [indicesMigrate, indicesPush] = await Promise.all([
      bancoMigrado.query(sqlIndices).then((resultado) => resultado.rows),
      consultarTodos(sqlIndices)
    ]);
    expect(indicesMigrate).toEqual(indicesPush);

    const [constraintsMigrate, constraintsPush] = await Promise.all([
      bancoMigrado.query(sqlConstraints).then((resultado) => resultado.rows),
      consultarTodos(sqlConstraints)
    ]);
    expect(constraintsMigrate).toEqual(constraintsPush);
  });

  it("P0-0038 Deve_TerOMesmoPredicadoDeIndice_Quando_ProvisionarViaMigrate", async () => {
    const [defsMigrate, defsPush] = await Promise.all([
      bancoMigrado
        .query<{ indexname: string; indexdef: string }>(sqlIndicesAdmissoes)
        .then((resultado) => resultado.rows),
      consultarTodos<{ indexname: string; indexdef: string }>(sqlIndicesAdmissoes)
    ]);
    expect(defsMigrate).toEqual(defsPush);

    // E o predicado tem de ser o da 0038, nos DOIS caminhos: o schema Drizzle e o arquivo .sql
    // podem divergir em silencio, e foi essa divergencia que criou o defeito que a 0038 corrige.
    const alvo = "admissoes_processos_historico_evento_unico";
    for (const [origem, linhas] of [
      ["migrate", defsMigrate],
      ["push", defsPush]
    ] as const) {
      const indice = linhas.find((linha) => linha.indexname === alvo);
      expect(indice, `${alvo} ausente em ${origem}`).toBeDefined();
      expect(indice?.indexdef, origem).toContain("cpf_revelado");
    }
  });

  it("Deve_DisponibilizarUuidV7_Quando_ProvisionarViaMigrate", async () => {
    const { rows } = await bancoMigrado.query<{ id: string }>("select uuid_generate_v7()::text as id");
    const id = rows[0]?.id ?? "";
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("Deve_CriarTriggersDeAtualizadoEm_Quando_ProvisionarViaMigrate", async () => {
    const aMao = lerTriggersManuais();

    // O nome do trigger CARREGA o nome da tabela. Nao e cosmetico: a consulta acha os triggers por
    // `like '%set_atualizado_em'`, entao um nome fora da convencao some do gate sem quebrar nada.
    for (const { arquivo, nome, tabela } of aMao) {
      expect(nome, arquivo).toBe(`${tabela}_set_atualizado_em`);
    }

    // Nomeadas de proposito, e nao so contadas: se uma migration perder o bloco de trigger, o teste
    // diz QUAL tabela ficou sem — a 0002 nao cobre nenhuma delas.
    //
    // Esta lista CRESCE a cada tabela nova com `atualizado_em`, e e assim que tem de ser: o gate
    // disparou quando a 0036 chegou, e acrescentar o nome aqui e a decisao consciente que ele
    // cobra. Trocar por uma contagem seria voltar ao `21` que envelheceu em silencio.
    expect(aMao.map((achado) => achado.tabela).sort()).toEqual([
      "admissoes_processos",
      // ADM-003 V2/V4. `admissoes_convites` NAO entra: convite nao se edita, entao a tabela nem tem
      // `atualizado_em` — e sem a coluna, trigger seria mentira.
      "admissoes_processos_dependentes",
      "admissoes_processos_ficha",
      "admissoes_processos_internos",
      "admissoes_testes",
      "colaboradores_dados_bancarios",
      "colaboradores_dados_pessoais",
      "colaboradores_enderecos",
      "colaboradores_onboarding",
      "colaboradores_vinculos",
      // R-218 (0060): a analise da carga inicial de preco-base muda de estado (analisada ->
      // aplicada) e os itens sao reavaliados, entao as duas tabelas tem `atualizado_em`.
      "compras_importacoes_preco_base",
      "compras_importacoes_preco_base_itens",
      // R-221 (0063): rodada multi-fornecedor. Solicitacao, rodada, convite e proposta mudam de
      // estado ao longo do ciclo, entao tem `atualizado_em`.
      "compras_propostas",
      "compras_rodadas",
      "compras_rodadas_convites",
      "compras_solicitacoes",
      // Doc 57 (0067): a fila do WhatsApp muda de status; a agenda da conferencia e encerrada; a
      // conferencia ganhou conclusao (saiu da lista "com coluna e sem gatilho").
      "compras_whatsapp_envios",
      "conferencias_agendas",
      "conferencias_estoque",
      "configuracoes_menu_empresas",
      // 0078: estado da busca automatica Conplus muda a cada execucao da rotina.
      "conplus_sincronizacao_estado",
      // R-218 (0060): o vinculo fornecedor-produto e decidido depois de criado (pendente ->
      // aprovado/rejeitado).
      "fornecedores_produtos",
      "funcoes_operacionais",
      // Doc 56 (0066): a ocorrencia do agendamento muda de situacao (conferir -> enviada/cancelada) e a
      // serie e encerrada ao editar "esta e as futuras".
      "pedidos_agenda_ocorrencias",
      "pedidos_agendas",
      // R-216 (0058): o rascunho do fornecedor e editado varias vezes ate o envio.
      "pedidos_cotacoes",
      // 0073: configuracao e catalogo Questor sao editados pelo DP.
      "questor_codigos",
      "questor_configuracoes"
    ]);

    const esperadas = [...new Set([...tabelasDoArrayDa0002(), ...aMao.map((achado) => achado.tabela)])].sort();

    const comTriggerMigrate = (await bancoMigrado.query<{ tabela: string }>(sqlTabelasComTrigger)).rows.map(
      (linha) => linha.tabela
    );
    // Igualdade de CONJUNTO, nos dois sentidos: acusa tanto o trigger que a migration prometeu e nao
    // criou quanto o que existe no banco sem migration nenhuma pedindo.
    expect(comTriggerMigrate).toEqual(esperadas);

    // O banco global (push + aplicacao pos-push) precisa ter as mesmas triggers.
    const comTriggerPush = (await consultarTodos<{ tabela: string }>(sqlTabelasComTrigger)).map(
      (linha) => linha.tabela
    );
    expect(comTriggerPush).toEqual(esperadas);

    // A coluna sem o trigger e o defeito silencioso: `atualizado_em` fica parada e ninguem percebe.
    // A lista de excecoes conhecidas esta declarada em `semTriggerConhecidas` — a quinta quebra aqui.
    const comColuna = (await bancoMigrado.query<{ tabela: string }>(sqlTabelasComColuna)).rows.map(
      (linha) => linha.tabela
    );
    expect(comColuna.filter((tabela) => !esperadas.includes(tabela))).toEqual(semTriggerConhecidas);
  });

  it("Deve_AtualizarAtualizadoEm_Quando_EditarRegistro", async () => {
    const empresa = await bancoMigrado.query<{ id: string }>(
      "insert into empresas (nome) values ('Empresa Migracoes') returning id"
    );
    const empresaId = empresa.rows[0]?.id;
    const cargo = await bancoMigrado.query<{ id: string; atualizado_em: Date }>(
      "insert into cargos (empresa_id, nome) values ($1, 'Cargo Migracoes') returning id, atualizado_em",
      [empresaId]
    );
    const cargoId = cargo.rows[0]?.id;
    const antes = cargo.rows[0]?.atualizado_em;

    await bancoMigrado.query("select pg_sleep(0.05)");
    const atualizado = await bancoMigrado.query<{ atualizado_em: Date }>(
      "update cargos set nome = 'Cargo Migracoes Editado' where id = $1 returning atualizado_em",
      [cargoId]
    );
    const depois = atualizado.rows[0]?.atualizado_em;

    expect(antes).toBeInstanceOf(Date);
    expect(depois).toBeInstanceOf(Date);
    expect((depois as Date).getTime()).toBeGreaterThan((antes as Date).getTime());
  });
});
