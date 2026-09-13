import { describe, expect, it } from "vitest";
import { permissoes } from "@padaria/shared";
import {
  codigoRegraMenuOperacional,
  codigosMenuOperacional,
  MODULOS_MENU_OPERACIONAL,
  REGRAS_MENU_OPERACIONAL
} from "./menu-operacional-permissoes";
import { regrasComOcultasPreservadas, type ListasPermissoesPersistidas } from "./permissoes-payload";

describe("permissões do menu operacional", () => {
  it("expõe exatamente as 15 regras reais dos cinco módulos operacionais", () => {
    const codigos = codigosMenuOperacional();

    expect(codigos).toHaveLength(15);
    expect(new Set(codigos).size).toBe(15);
    expect(codigos.every((codigo) => permissoes.includes(codigo as (typeof permissoes)[number]))).toBe(true);
    expect(codigos).toEqual(
      MODULOS_MENU_OPERACIONAL.flatMap((modulo) =>
        REGRAS_MENU_OPERACIONAL.map((regra) => codigoRegraMenuOperacional(modulo, regra))
      )
    );
  });

  it("não mistura controles do menu com ações financeiras da grade principal", () => {
    expect(codigosMenuOperacional().every((codigo) => codigo.startsWith("menu_"))).toBe(true);
    expect(codigosMenuOperacional()).not.toContain("transferencias_efetuar");
    expect(codigosMenuOperacional()).not.toContain("despesas_visualizar_dpago");
  });

  it("preserva regras ocultas ao salvar ajustes do menu operacional", () => {
    const cargoId = "11111111-1111-4111-8111-111111111111";
    const listas: ListasPermissoesPersistidas = {
      cargosPermissoes: [
        {
          id: cargoId,
          cargoId,
          regras: { relatorio_dre_visualizar: true, menu_relatorio_dre_mostrar: true }
        }
      ],
      setoresPermissoes: [],
      usuariosPermissoes: []
    };

    expect(
      regrasComOcultasPreservadas(
        {
          tipoPermissao: "cargo",
          cargoId,
          setorId: "",
          usuarioId: "",
          regras: { menu_entradas_mostrar: true, menu_transferencias_somente_caixa_aberto: false }
        },
        listas
      )
    ).toEqual({
      relatorio_dre_visualizar: true,
      menu_relatorio_dre_mostrar: true,
      menu_entradas_mostrar: true,
      menu_transferencias_somente_caixa_aberto: false
    });
  });
});
