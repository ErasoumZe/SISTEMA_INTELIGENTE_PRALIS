import { describe, expect, it } from "vitest";
import { permissoesAcessoTotal, type Permissao } from "@padaria/shared";
import { montarBlocosRelatorio } from "./blocos-relatorio";

// Estes testes existem por um motivo so: garantir que o painel NUNCA mostre um bloco de relatorio
// a quem nao pode ver o dado por tras dele. A regra e "voce ve o bloco se ja pode ver o dado", e
// nenhuma permissao nova nasce aqui.
function comPermissoes(lista: Permissao[]) {
  const set = new Set(lista);
  return (permissao: Permissao) => set.has(permissao);
}

const TODAS = comPermissoes([...permissoesAcessoTotal]);
const NENHUMA = comPermissoes([]);

describe("o bloco so aparece para quem ja ve o dado", () => {
  it.each([
    ["caixas_abertos", "caixas_gerenciar"],
    ["pendencias", "fechamento_com_diferenca_visualizar"],
    ["curva_abc", "relatorio_produtos_visualizar"],
    ["creare", "integracoes_visualizar"]
  ] as const)("%s some sem a permissao %s", (id, permissao) => {
    const semEsta = comPermissoes([...permissoesAcessoTotal].filter((p) => p !== permissao));
    expect(montarBlocosRelatorio(semEsta).map((b) => b.id)).not.toContain(id);
    // e aparece com ela sozinha, para o teste nao passar por acidente de outra permissao
    expect(montarBlocosRelatorio(comPermissoes([permissao])).map((b) => b.id)).toEqual([id]);
  });

  it("a faixa inteira some quando nenhuma das quatro esta liberada", () => {
    expect(montarBlocosRelatorio(NENHUMA)).toEqual([]);
  });

  it("com acesso total, os quatro aparecem na ordem decidida", () => {
    expect(montarBlocosRelatorio(TODAS).map((b) => b.id)).toEqual([
      "caixas_abertos",
      "pendencias",
      "curva_abc",
      "creare"
    ]);
  });

  // O caso que motivou a regra: quem OPERA caixa nao e quem GERENCIA caixas.
  it("quem so opera caixa nao ve o bloco de caixas abertos", () => {
    expect(montarBlocosRelatorio(comPermissoes(["caixa_operar"]))).toEqual([]);
  });

  it("nenhuma permissao inventada: toda permissao usada existe no acesso total", () => {
    const conhecidas = new Set<string>(permissoesAcessoTotal);
    for (const bloco of montarBlocosRelatorio(TODAS)) {
      expect(conhecidas.has(bloco.permissao), `${bloco.permissao} nao existe no sistema`).toBe(true);
    }
  });
});

describe("dado: nada ficticio", () => {
  it("sem leitura, o valor e null — nunca zero", () => {
    for (const bloco of montarBlocosRelatorio(TODAS)) expect(bloco.valor).toBeNull();
  });

  it("zero de verdade e diferente de sem leitura", () => {
    const blocos = montarBlocosRelatorio(TODAS, { caixasAbertos: 0, pendencias: 3 });
    expect(blocos.find((b) => b.id === "caixas_abertos")?.valor).toBe(0);
    expect(blocos.find((b) => b.id === "pendencias")?.valor).toBe(3);
  });

  // Curva ABC e Creare exigem chamada nova a partir do painel (Etapa 3): ate la nao inventam numero.
  it.each(["curva_abc", "creare"] as const)("%s nao mostra numero enquanto nao estiver ligado", (id) => {
    const blocos = montarBlocosRelatorio(TODAS, { caixasAbertos: 9, pendencias: 9 });
    expect(blocos.find((b) => b.id === id)?.valor).toBeNull();
  });

  it("dado nao vaza para bloco sem permissao", () => {
    const so = montarBlocosRelatorio(comPermissoes(["fechamento_com_diferenca_visualizar"]), {
      caixasAbertos: 4,
      pendencias: 2
    });
    expect(so.map((b) => b.id)).toEqual(["pendencias"]);
    expect(so[0]?.valor).toBe(2);
  });
});
