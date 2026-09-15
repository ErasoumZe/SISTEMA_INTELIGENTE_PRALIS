import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { CampanhaComProgresso } from "@padaria/shared/campanhas";
import CampanhaProgresso from "./CampanhaProgresso.vue";

function campanha(over: Partial<CampanhaComProgresso> = {}): CampanhaComProgresso {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    empresaId: "11111111-1111-4111-8111-111111111112",
    titulo: "Meta de marco",
    mensagem: "Bata a meta.",
    inicio: "2026-03-01",
    fim: "2026-03-31",
    metaValor: 1000,
    bonificacaoTipo: "dinheiro",
    bonificacaoValor: 100,
    bonificacaoTexto: null,
    status: "ativa",
    criadoPor: "u1",
    criadoEm: "2026-03-01T10:00:00.000Z",
    pdvs: [],
    totalVendido: 500,
    percentualDaMeta: 50,
    naoAtribuido: 0,
    ...over
  };
}

function montar(props: { campanha: CampanhaComProgresso }) {
  return mount(CampanhaProgresso, { props });
}

// `Intl` em pt-BR separa "R$" do numero com espaco NAO SEPARAVEL (U+00A0). Comparar com espaco
// comum falha sem que nada esteja errado na tela — normalizar aqui evita um teste que mente.
function texto(tela: ReturnType<typeof montar>) {
  return tela.text().replaceAll(" ", " ");
}

describe("CampanhaProgresso", () => {
  it("mostra o vendido, a meta e o percentual", () => {
    const tela = montar({ campanha: campanha() });
    expect(texto(tela)).toContain("R$ 500,00");
    expect(texto(tela)).toContain("R$ 1.000,00");
    expect(texto(tela)).toContain("50%");
  });

  // A barra para em 100 para nao estourar o desenho, mas o numero mostra o real: truncar o texto
  // esconderia exatamente o resultado que a campanha existe para comemorar.
  it("trava a barra em 100% mas continua dizendo o percentual real", () => {
    const tela = montar({ campanha: campanha({ totalVendido: 1500, percentualDaMeta: 150 }) });
    expect(texto(tela)).toContain("150%");
    expect(tela.find(".campanha-progresso__barra").attributes("style")).toContain("width: 100%");
  });

  it("nao deixa a barra negativa quando ainda nao houve venda", () => {
    const tela = montar({ campanha: campanha({ totalVendido: 0, percentualDaMeta: 0 }) });
    expect(tela.find(".campanha-progresso__barra").attributes("style")).toContain("width: 0%");
  });

  it("silencia o aviso de orfas quando nao existe nenhuma", () => {
    const tela = montar({ campanha: campanha({ naoAtribuido: 0 }) });
    expect(texto(tela)).not.toContain("sem PDV identificado");
  });

  // R-198: a venda orfa precisa ser VISIVEL para auditoria, mas a tela tem que dizer, com todas as
  // letras, que ela nao conta — senao o operador soma os dois numeros de cabeca e cobra o premio.
  it("mostra a venda sem PDV e diz que ela nao entra na meta", () => {
    const tela = montar({ campanha: campanha({ naoAtribuido: 700 }) });
    expect(texto(tela)).toContain("R$ 700,00");
    expect(texto(tela)).toContain("sem PDV identificado");
    expect(texto(tela)).toContain("não entram");
  });

  it("descreve o progresso para leitor de tela", () => {
    const tela = montar({ campanha: campanha() });
    const barra = tela.find('[role="progressbar"]');
    expect(barra.attributes("aria-valuenow")).toBe("50");
    expect(barra.attributes("aria-label")).toContain("Meta de marco");
  });
});
