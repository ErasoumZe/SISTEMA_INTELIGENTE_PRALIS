import { describe, expect, it } from "vitest";
import { permissoes } from "@padaria/shared";
import { COLUNAS_GRADE_PERMISSOES, TELAS_GRADE_PERMISSOES, montarGradePermissoes } from "./grade-permissoes";
import { regrasComOcultasPreservadas, type ListasPermissoesPersistidas } from "./permissoes-payload";

const prefixosOperacionais = TELAS_GRADE_PERMISSOES.map((tela) => `${tela.prefixo}_`);
const catalogoOperacional = permissoes.filter((codigo) =>
  prefixosOperacionais.some((prefixo) => codigo.startsWith(prefixo))
);

function gradeDoCatalogo() {
  return montarGradePermissoes((tela) => permissoes.filter((codigo) => codigo.startsWith(`${tela.prefixo}_`)));
}

describe("grade de permissões operacionais", () => {
  it("representa exatamente uma vez cada código operacional do catálogo", () => {
    const representados = gradeDoCatalogo().flatMap((linha) =>
      linha.celulas.flatMap((celula) => (celula.codigo ? [celula.codigo] : []))
    );

    expect(new Set(representados)).toEqual(new Set(catalogoOperacional));
    expect(representados).toHaveLength(new Set(representados).size);
  });

  it("expõe D/Pago, efetuar, conferir e aprovar pelos sufixos reais", () => {
    const representados = new Set(
      gradeDoCatalogo().flatMap((linha) => linha.celulas.flatMap((celula) => (celula.codigo ? [celula.codigo] : [])))
    );

    for (const dominio of ["transferencias", "despesas", "mercadorias", "retiradas"]) {
      expect(representados.has(`${dominio}_efetuar`)).toBe(true);
      expect(representados.has(`${dominio}_conferir`)).toBe(true);
      expect(representados.has(`${dominio}_visualizar_dpago`)).toBe(true);
      expect(representados.has(`${dominio}_editar_dpago`)).toBe(true);
      expect(representados.has(`${dominio}_excluir_dpago`)).toBe(true);
    }
    expect(representados.has("mercadorias_aprovar")).toBe(true);
  });

  it("não mantém aliases sem efeito que não existem no catálogo", () => {
    const sufixos = COLUNAS_GRADE_PERMISSOES.flatMap((coluna) => [...coluna.sufixos]);

    expect(sufixos).not.toContain("visualizar_pago");
    expect(sufixos).not.toContain("visualizar_valor");
    expect(sufixos).not.toContain("ver_pago");
    expect(sufixos).not.toContain("editar_pago");
    expect(sufixos).not.toContain("editar_valor");
    expect(sufixos).not.toContain("excluir_pago");
    expect(sufixos).not.toContain("excluir_valor");
  });

  it("deixa célula sem ação como traço, sem inventar código", () => {
    const entradas = gradeDoCatalogo().find((linha) => linha.prefixo === "entradas");
    const colunaConferir = COLUNAS_GRADE_PERMISSOES.findIndex((coluna) =>
      (coluna.sufixos as readonly string[]).includes("conferir")
    );

    expect(entradas?.celulas[colunaConferir]?.codigo).toBeNull();
  });
});

describe("save da grade com permissões ocultas", () => {
  it("preserva as ocultas ao editar as novas ações operacionais", () => {
    const cargoId = "11111111-1111-4111-8111-111111111111";
    const ocultasPersistidas = {
      relatorio_dre_visualizar: true,
      menu_relatorio_dre_mostrar: true
    };
    const listas: ListasPermissoesPersistidas = {
      cargosPermissoes: [{ id: cargoId, cargoId, regras: ocultasPersistidas }],
      setoresPermissoes: [],
      usuariosPermissoes: []
    };
    const regrasDaGrade = {
      despesas_efetuar: true,
      transferencias_conferir: false,
      mercadorias_aprovar: true,
      retiradas_visualizar_dpago: true,
      retiradas_editar_dpago: false,
      retiradas_excluir_dpago: true
    };

    expect(
      regrasComOcultasPreservadas(
        { tipoPermissao: "cargo", cargoId, setorId: "", usuarioId: "", regras: regrasDaGrade },
        listas
      )
    ).toEqual({ ...ocultasPersistidas, ...regrasDaGrade });
  });
});
