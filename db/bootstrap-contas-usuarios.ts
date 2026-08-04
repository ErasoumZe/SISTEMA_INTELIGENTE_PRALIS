/**
 * Bootstrap dos vinculos USUARIO <-> CONTAS (contas_usuarios / FOTO 4).
 *
 * Como a regra "usuario SEM vinculo NAO VE NENHUMA CONTA" (Jose, 27/07) entra em vigor, ao subir a
 * ETAPA 2 nenhum operador conseguiria lancar sem vinculo. Este script SEMEIA os vinculos iniciais
 * derivando-os do HISTORICO REAL: as contas que cada usuario ja usou.
 *
 * Fontes (cada par usuario+conta vira um vinculo):
 *   - transferencias: conta_origem_id e conta_destino_id, por criado_por;
 *   - lancamentos manuais (despesas/mercadorias/retiradas): conta_origem_id, por criado_por;
 *   - caixas (fechamentos_caixa): a conta do PDV, para o operador (usuario_caixa_id) e o criador.
 * Admins (usuario_admin) TAMBEM entram (decisao Jose, 27/07 — nao excluir admin).
 * Usuarios sem historico ficam sem vinculo (cadastro manual depois).
 *
 * Idempotente: INSERT ... ON CONFLICT (conta_id, usuario_id) DO NOTHING. Rodar quantas vezes quiser.
 *
 * Uso:
 *   tsx bootstrap-contas-usuarios.ts              # DRY-RUN: so mostra a contagem, NAO grava
 *   tsx bootstrap-contas-usuarios.ts --apply      # aplica de verdade
 * (npm: `npm run bootstrap:contas-usuarios --workspace @padaria/db -- --apply`)
 */
import "dotenv/config";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "./src/schema/schema.js";

// CTE com os pares (empresa_id, conta_id, usuario_id) derivados do historico.
const DERIVADO = `
with derivado as (
  select empresa_id, conta_origem_id  as conta_id, criado_por as usuario_id from transferencias where conta_origem_id  is not null and criado_por is not null
  union select empresa_id, conta_destino_id, criado_por from transferencias where conta_destino_id is not null and criado_por is not null
  union select empresa_id, conta_origem_id, criado_por from despesas    where conta_origem_id is not null and criado_por is not null
  union select empresa_id, conta_origem_id, criado_por from mercadorias where conta_origem_id is not null and criado_por is not null
  union select empresa_id, conta_origem_id, criado_por from retiradas   where conta_origem_id is not null and criado_por is not null
  union select fc.empresa_id, p.conta_id, fc.usuario_caixa_id from fechamentos_caixa fc join pdvs p on p.id = fc.pdv_id where p.conta_id is not null and fc.usuario_caixa_id is not null
  union select fc.empresa_id, p.conta_id, fc.criado_por       from fechamentos_caixa fc join pdvs p on p.id = fc.pdv_id where p.conta_id is not null and fc.criado_por       is not null
)`;

// Pares novos (que ainda nao existem em contas_usuarios), ja validados contra contas + perfis.
const SELECT_NOVOS = `${DERIVADO}
select distinct c.empresa_id, d.conta_id, d.usuario_id
from derivado d
join contas c on c.id = d.conta_id
join perfis_usuarios pu on pu.usuario_id = d.usuario_id
where not exists (select 1 from contas_usuarios cu where cu.conta_id = d.conta_id and cu.usuario_id = d.usuario_id)`;

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool, { schema });

async function main() {
  const aplicar = process.argv.includes("--apply");
  try {
    const total = await db.execute(sql.raw(`select count(*)::int as n from (${SELECT_NOVOS}) s`));
    const novos = Number((total.rows[0] as { n: number } | undefined)?.n ?? 0);

    const porUsuario = await db.execute(
      sql.raw(`${DERIVADO}
       select pu.nome, pu.role, count(distinct d.conta_id) as contas
       from derivado d
       join perfis_usuarios pu on pu.usuario_id = d.usuario_id
       join contas c on c.id = d.conta_id
       group by pu.nome, pu.role order by contas desc, pu.nome`)
    );
    const linhas = porUsuario.rows as Array<{ nome: string; role: string; contas: string | number }>;

    console.log(`\nVinculos NOVOS a criar (nao existentes): ${novos}`);
    console.log("Por usuario (contas derivadas do historico):");
    for (const l of linhas) console.log(`  - ${l.nome} [${l.role}]: ${l.contas}`);

    if (!aplicar) {
      console.log("\nDRY-RUN — nada foi gravado. Rode com --apply para aplicar.\n");
      return;
    }

    const res = await db.execute(
      sql.raw(`insert into contas_usuarios (empresa_id, conta_id, usuario_id)
       ${DERIVADO}
       select distinct c.empresa_id, d.conta_id, d.usuario_id
       from derivado d
       join contas c on c.id = d.conta_id
       join perfis_usuarios pu on pu.usuario_id = d.usuario_id
       on conflict (conta_id, usuario_id) do nothing`)
    );
    console.log(`\nAPLICADO — ${res.rowCount ?? 0} vinculo(s) inserido(s) (idempotente).\n`);
  } finally {
    await pool.end();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
