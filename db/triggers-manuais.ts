import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Triggers de `atualizado_em` escritos A MAO nas migrations.
 *
 * A 0002 instala os dela percorrendo um ARRAY LITERAL de nomes de tabela, e nao volta atras: toda
 * tabela criada depois precisa do proprio bloco `create trigger` na migration que a cria. Quem
 * provisiona por `drizzle-kit migrate` recebe esses blocos de graca — eles estao no SQL.
 *
 * Quem provisiona por `drizzle-kit push` (dev e Testcontainers) NAO recebe: o push aplica o schema
 * Drizzle, que nao conhece trigger. Ate a 0034 isso nao aparecia, porque a 0002 aplicada depois do
 * push cobria tudo que existia. A partir dali, dev e teste passaram a rodar com tabelas sem o
 * trigger que producao tem.
 *
 * Este modulo e a fonte UNICA da lista: ele le o SQL versionado. Nao ha segunda lista para divergir
 * — nem aqui, nem no setup de dev, nem no teste de migrations, que importam todos daqui.
 */

export type TriggerManual = { arquivo: string; nome: string; tabela: string };

// Sobe procurando a pasta de migrations em vez de fixar um caminho relativo: o mesmo modulo roda de
// `db/` (dev, tsx, type-stripping) e de `db/dist/` (build), e um `./migrations` so estaria certo num
// dos dois. O journal e o marcador — e o arquivo que so existe na pasta certa.
function acharDirMigracoes(): string {
  let atual = dirname(fileURLToPath(import.meta.url));
  for (let subidas = 0; subidas < 5; subidas += 1) {
    const candidato = join(atual, "migrations");
    if (existsSync(join(candidato, "meta", "_journal.json"))) return candidato;
    const acima = dirname(atual);
    if (acima === atual) break;
    atual = acima;
  }
  throw new Error("pasta db/migrations nao encontrada a partir de " + import.meta.url);
}

const dirMigracoes = acharDirMigracoes();

// A 0002 fica de fora da varredura de proposito: ela nao declara trigger, ela GERA os dela por
// `format()` dentro de um `do $$`, e o texto do format cairia na busca por "create trigger" sem
// nunca casar com o padrao. Ela ja e aplicada inteira, e antes desta funcao.
const ARQUIVO_DA_FUNCAO = "0002_hardening_atualizado_em.sql";

const SUFIXO = "_set_atualizado_em";

// Padrao ACEITO, e o unico. Qualquer `create trigger` que nao case exatamente com isto e recusado
// em vez de ignorado: um trigger de outra natureza nao pode entrar caladamente num provisionamento
// que promete instalar so os de `atualizado_em`.
const PADRAO_ACEITO =
  /create\s+trigger\s+"([a-z0-9_]+)"\s+before\s+update\s+on\s+"([a-z0-9_]+)"\s+for\s+each\s+row\s+execute\s+function\s+set_atualizado_em\(\)/gi;

const QUALQUER_CREATE_TRIGGER = /create\s+trigger\b/gi;

/** Le as migrations e devolve os triggers manuais declarados, na ordem dos arquivos. */
export function lerTriggersManuais(): TriggerManual[] {
  const encontrados: TriggerManual[] = [];
  const arquivos = readdirSync(dirMigracoes)
    .filter((nome) => nome.endsWith(".sql") && nome !== ARQUIVO_DA_FUNCAO)
    .sort();

  for (const arquivo of arquivos) {
    const sql = readFileSync(join(dirMigracoes, arquivo), "utf8");
    const totalDeclarado = [...sql.matchAll(QUALQUER_CREATE_TRIGGER)].length;
    const aceitos = [...sql.matchAll(PADRAO_ACEITO)];
    if (aceitos.length !== totalDeclarado) {
      throw new Error(
        `${arquivo}: ${totalDeclarado - aceitos.length} "create trigger" fora do padrao de ` +
          `atualizado_em. Este provisionamento so instala triggers ${SUFIXO}; qualquer outro precisa ` +
          `de decisao propria, nao de reaplicacao automatica.`
      );
    }

    for (const achado of aceitos) {
      const nome = achado[1] ?? "";
      const tabela = achado[2] ?? "";
      if (nome !== `${tabela}${SUFIXO}`) {
        throw new Error(
          `${arquivo}: trigger "${nome}" na tabela "${tabela}" foge da convencao ` +
            `<tabela>${SUFIXO}. O nome carrega a tabela — quem procura por sufixo perderia este.`
        );
      }
      encontrados.push({ arquivo, nome, tabela });
    }
  }

  return encontrados;
}

/**
 * O que este modulo le do banco: presenca (contagem de linhas) e o nome resolvido de uma tabela.
 * Mais nada — por isso a linha e tao estreita.
 */
export type LinhaDeSondagem = { tabela?: string | null };

/** Conexao ja aberta. Estrutural para servir tanto ao `Client` quanto ao `Pool` do `pg`. */
export type ClienteSql = {
  query(texto: string, valores?: string[]): Promise<{ rows: LinhaDeSondagem[] }>;
};

/**
 * Instala, DEPOIS do push, os triggers manuais que ainda faltam. Devolve os que instalou.
 *
 * Exige a funcao `set_atualizado_em` ja criada (a 0002 e quem cria) e nunca duplica: trigger que ja
 * existe e pulado. Tabela ausente tambem e pulada — o push pode ter rodado sobre um schema parcial,
 * e falhar ali seria pior que o silencio, porque o proprio teste de paridade cobra o conjunto.
 */
export async function aplicarTriggersManuais(cliente: ClienteSql): Promise<TriggerManual[]> {
  const declarados = lerTriggersManuais();
  if (declarados.length === 0) return [];

  const funcao = await cliente.query("select 1 from pg_proc where proname = 'set_atualizado_em'");
  if (funcao.rows.length === 0) {
    throw new Error("funcao set_atualizado_em ausente: aplique a 0002 antes de instalar os triggers manuais.");
  }

  const instalados: TriggerManual[] = [];
  for (const trigger of declarados) {
    const existente = await cliente.query(
      `select 1
         from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
        where not tg.tgisinternal and tg.tgname = $1 and c.relname = $2`,
      [trigger.nome, trigger.tabela]
    );
    if (existente.rows.length > 0) continue;

    const alvo = await cliente.query("select to_regclass($1) as tabela", [`public.${trigger.tabela}`]);
    if (!alvo.rows[0]?.tabela) continue;

    // Identificador nao vai por parametro no Postgres. Ambos vieram do regex acima, restrito a
    // [a-z0-9_], e o nome ja foi conferido contra a convencao — nao ha texto livre aqui.
    await cliente.query(
      `create trigger "${trigger.nome}" before update on "${trigger.tabela}" ` +
        "for each row execute function set_atualizado_em()"
    );
    instalados.push(trigger);
  }

  return instalados;
}
