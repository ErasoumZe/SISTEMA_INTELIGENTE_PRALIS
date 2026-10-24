import { describe, expect, it } from "vitest";
import { ERROS_QUESTOR } from "../../shared/src/conplus/index.js";
import { ErroDominio } from "../../api/src/erros.js";
import { comMigrationQuestor, ehMigrationQuestorPendente } from "../../api/src/conplus/questor-comum.service.js";

/**
 * Banco sem as migrations 0073–0075 (ex.: um ambiente ainda não migrado): a rota responde 503 com
 * código próprio em vez de 500 genérico. O erro do driver chega embrulhado pelo Drizzle (`cause`).
 */
const erroPg = (code: string) => Object.assign(new Error("falha de consulta"), { cause: { code } });

describe("Questor — migration pendente", () => {
  it("tabela (42P01) ou coluna (42703) ausente vira 503 QUESTOR_MIGRATION_PENDENTE", async () => {
    for (const code of ["42P01", "42703"]) {
      expect(ehMigrationQuestorPendente(erroPg(code))).toBe(true);
      const promessa = comMigrationQuestor(() => Promise.reject(erroPg(code)));
      await expect(promessa).rejects.toBeInstanceOf(ErroDominio);
      await expect(promessa).rejects.toMatchObject({ status: 503, code: ERROS_QUESTOR.migrationPendente });
    }
  });

  it("qualquer outro erro sobe como está", async () => {
    const original = erroPg("23505");
    expect(ehMigrationQuestorPendente(original)).toBe(false);
    await expect(comMigrationQuestor(() => Promise.reject(original))).rejects.toBe(original);
    const dominio = new ErroDominio("conflito", 409, "X");
    await expect(comMigrationQuestor(() => Promise.reject(dominio))).rejects.toBe(dominio);
  });
});
