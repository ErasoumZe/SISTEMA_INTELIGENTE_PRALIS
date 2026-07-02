/**
 * Backfill de codigos de produto (legado): atribui codigo interno (sequencial 5 digitos por empresa)
 * e codigo externo (PR-XXXX-XXXX) aos produtos que ainda nao tem. Idempotente — so preenche o que falta
 * e continua a numeracao a partir do maximo ja existente por empresa. Rodar apenas sob ordem explicita.
 */
import "dotenv/config";
import pg from "pg";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "./src/schema/schema.js";
import { produtos } from "./src/schema/app.schema.js";
import { eq } from "drizzle-orm";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function bloco(tamanho: number): string {
  let saida = "";
  for (let i = 0; i < tamanho; i += 1) saida += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return saida;
}
function gerarCodigoExterno(): string {
  return `PR-${bloco(4)}-${bloco(4)}`;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const todos = await db
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno
    })
    .from(produtos)
    .orderBy(asc(produtos.criadoEm));

  // Maximo de codigo interno ja usado por empresa (para continuar a sequencia).
  const maxPorEmpresa = new Map<string, number>();
  for (const p of todos) {
    if (p.codigoInterno && /^[0-9]+$/.test(p.codigoInterno)) {
      const atual = maxPorEmpresa.get(p.empresaId) ?? 0;
      maxPorEmpresa.set(p.empresaId, Math.max(atual, Number(p.codigoInterno)));
    }
  }

  let internos = 0;
  for (const p of todos) {
    if (p.codigoInterno) continue;
    const proximo = (maxPorEmpresa.get(p.empresaId) ?? 0) + 1;
    maxPorEmpresa.set(p.empresaId, proximo);
    await db
      .update(produtos)
      .set({ codigoInterno: String(proximo).padStart(5, "0") })
      .where(eq(produtos.id, p.id));
    internos += 1;
  }

  // Codigos externos ja usados (para garantir unicidade global).
  const usados = new Set<string>();
  for (const p of todos) if (p.codigo) usados.add(p.codigo);

  let externos = 0;
  for (const p of todos) {
    if (p.codigo) continue;
    let candidato = gerarCodigoExterno();
    while (usados.has(candidato)) candidato = gerarCodigoExterno();
    usados.add(candidato);
    await db.update(produtos).set({ codigo: candidato }).where(eq(produtos.id, p.id));
    externos += 1;
  }

  console.log(`[backfill-codigos] codigo interno atribuido: ${internos}; codigo externo atribuido: ${externos}`);
  await pool.end();
}

main().catch((erro) => {
  console.error("[backfill-codigos] falhou:", erro);
  process.exit(1);
});
