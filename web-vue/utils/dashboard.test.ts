import { describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesAcessoTotal } from "@padaria/shared";
import { FAIXA_DIA, FAIXA_IR_PARA, FAIXA_PRECISA, FAIXA_RELATORIOS } from "./dashboard-demo";
import { MOTIVO_PADRAO, atalhosDoPainel, metricasPermitidas } from "./dashboard";
import { itemPorTela } from "./domain";
import { usePermissoes } from "~/composables/usePermissoes";

// Estes casos substituem os que morreram com `atalhos-home.test.ts` e `blocos-relatorio.test.ts`
// quando a dashboard deixou de espelhar o menu. Foram reescritos, não copiados: a estrutura mudou,
// as duas garantias não.
//
//   1. o painel não inventa acesso — nem card, nem atalho
//   2. tela desabilitada aparece MARCADA, com o motivo, igual ao menu — não some e não vira link

const TODAS = (p: Permissao) => permissoesAcessoTotal.includes(p);
const NENHUMA = () => false;
const so = (lista: Permissao[]) => (p: Permissao) => lista.includes(p);

const TODAS_AS_METRICAS = [...FAIXA_DIA, ...FAIXA_PRECISA, ...FAIXA_RELATORIOS];

describe("metricasPermitidas — você vê o card se já pode ver o dado", () => {
  it("sem nenhuma permissão, nenhum card aparece", () => {
    expect(metricasPermitidas(TODAS_AS_METRICAS, NENHUMA)).toEqual([]);
  });

  // O caso que motivou a regra: quem OPERA caixa não é quem GERENCIA caixas.
  it("quem só opera caixa não vê os cards de gestão", () => {
    expect(metricasPermitidas(TODAS_AS_METRICAS, so(["caixa_operar"]))).toEqual([]);
  });

  it("cada card aparece com a SUA permissão sozinha, e some sem ela", () => {
    for (const metrica of TODAS_AS_METRICAS) {
      expect(metricasPermitidas([metrica], so([metrica.permissao])), metrica.id).toHaveLength(1);
      expect(metricasPermitidas([metrica], NENHUMA), metrica.id).toEqual([]);
    }
    // Anti-falso-verde: sem isto o `for` acima passaria sobre uma lista vazia.
    expect(TODAS_AS_METRICAS.length).toBeGreaterThan(5);
  });

  it("nenhum card exige permissão que não existe no sistema", () => {
    for (const metrica of TODAS_AS_METRICAS) {
      expect(permissoesAcessoTotal, metrica.id).toContain(metrica.permissao);
    }
  });

  it("preserva a ordem declarada", () => {
    expect(metricasPermitidas(FAIXA_DIA, TODAS).map((m) => m.id)).toEqual(FAIXA_DIA.map((m) => m.id));
  });
});

describe("metricasPermitidas — dado: nada fictício vira zero", () => {
  it("valor null continua null; quem escreve decide o travessão", () => {
    const semLeitura = TODAS_AS_METRICAS.filter((m) => m.valor === null);
    expect(semLeitura.length).toBeGreaterThan(0);
    for (const m of metricasPermitidas(semLeitura, TODAS)) expect(m.valor, m.id).toBeNull();
  });

  it("nenhum valor monetário está em centavos por engano", () => {
    // `dinheiro()` faz toLocaleString direto no número (domain.ts:613), então o valor é em REAIS.
    // Um literal em centavos renderiza cem vezes maior — foi o que aconteceu na primeira versão.
    for (const m of TODAS_AS_METRICAS) {
      if (m.formato !== "dinheiro" || m.valor === null) continue;
      expect(m.valor, `${m.id} parece centavos`).toBeLessThan(1_000_000);
    }
  });
});

describe("atalhosDoPainel — o painel não inventa acesso", () => {
  const menuDo = (permissoes: Permissao[], caixaAberto = true) => {
    const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
      permissoes,
      caixaAberto
    );
    return {
      telas: telasPermitidas.value,
      desabilitadas: telasDesabilitadasMenu.value,
      motivos: motivosTelasDesabilitadas.value
    };
  };

  it("não oferece tela que a lista de entrada não trouxe", () => {
    const { telas, desabilitadas, motivos } = menuDo(["entradas_visualizar"]);
    const ids = atalhosDoPainel(FAIXA_IR_PARA, telas, desabilitadas, motivos).map((a) => a.id);
    const permitidas = new Set(telas.map((t) => t.id));
    for (const id of ids) expect(permitidas.has(id), id).toBe(true);
  });

  it("lista de entrada vazia devolve painel vazio", () => {
    expect(atalhosDoPainel(FAIXA_IR_PARA, [])).toEqual([]);
  });

  it("perfil restrito vê menos atalhos que acesso total", () => {
    const restrito = menuDo(["entradas_visualizar"]);
    const total = menuDo([...permissoesAcessoTotal]);
    expect(atalhosDoPainel(FAIXA_IR_PARA, restrito.telas).length).toBeLessThan(
      atalhosDoPainel(FAIXA_IR_PARA, total.telas).length
    );
  });

  it("preserva a ordem dos cinco, não a do menu", () => {
    const { telas } = menuDo([...permissoesAcessoTotal]);
    const ids = atalhosDoPainel(FAIXA_IR_PARA, telas).map((a) => a.id);
    expect(ids).toEqual(FAIXA_IR_PARA.filter((id) => ids.includes(id)));
  });

  it("todo id da FAIXA 4 é uma tela de verdade, com rota", () => {
    for (const id of FAIXA_IR_PARA) expect(itemPorTela[id], id).toBeDefined();
  });
});

describe("atalhosDoPainel — tela desabilitada diz o mesmo que o menu", () => {
  it("continua aparecendo, marcada, em vez de sumir", () => {
    const telas = [itemPorTela["caixa"]!, itemPorTela["entradas"]!];
    const atalhos = atalhosDoPainel(["caixa", "entradas"], telas, ["caixa"], {});
    expect(atalhos.map((a) => a.id)).toEqual(["caixa", "entradas"]);
    expect(atalhos.find((a) => a.id === "caixa")?.desabilitada).toBe(true);
  });

  it("carrega o motivo do menu, e cai no padrão quando não há", () => {
    const telas = [itemPorTela["caixa"]!];
    const comMotivo = atalhosDoPainel(["caixa"], telas, ["caixa"], { caixa: "Abra um caixa." });
    expect(comMotivo[0]!.motivo).toBe("Abra um caixa.");
    const semMotivo = atalhosDoPainel(["caixa"], telas, ["caixa"], {});
    expect(semMotivo[0]!.motivo).toBe(MOTIVO_PADRAO);
  });

  it("desabilitar uma não contamina as outras", () => {
    const telas = [itemPorTela["caixa"]!, itemPorTela["entradas"]!];
    const atalhos = atalhosDoPainel(["caixa", "entradas"], telas, ["caixa"], {});
    expect(atalhos.find((a) => a.id === "entradas")?.desabilitada).toBe(false);
  });
});
