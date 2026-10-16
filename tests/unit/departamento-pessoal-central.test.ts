import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(import.meta.dirname, "..", "..");
const pagina = readFileSync(
  join(raiz, "web-vue", "components", "departamento-pessoal", "DepartamentoPessoalPage.vue"),
  "utf8"
);

describe("Central do Departamento Pessoal", () => {
  it("resume somente as filas que as telas existentes já consultam", () => {
    expect(pagina).toContain('/api/admissoes/testes${consulta({ situacao: "ativo" })}');
    expect(pagina).toContain('/api/admissoes/testes${consulta({ situacao: "ativo", prazo: "vence_hoje" })}');
    expect(pagina).toContain('/api/admissoes/testes${consulta({ situacao: "ativo", prazo: "vencido" })}');
    expect(pagina).toContain('/api/admissoes/processos${consulta({ ficha: "enviada" })}');
    expect(pagina).toContain('/api/admissoes/processos${consulta({ situacao: "pausado" })}');
  });

  it("leva apenas para rotas já publicadas e não oferece clínica ocupacional sem rota", () => {
    for (const rota of [
      "/admissoes_processos",
      "/admissoes_testes",
      "/colaboradores",
      "/funcoes_operacionais",
      "/areas_setores",
      "/turnos"
    ]) {
      expect(pagina).toContain(`to="${rota}"`);
    }
    expect(pagina).not.toContain("clinicas_ocupacionais");
  });
});
