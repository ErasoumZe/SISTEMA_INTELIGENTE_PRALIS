// Catalogo de funcoes operacionais — o dialogo de criar e renomear.
//
// O que este arquivo protege: que o dialogo NAO liga nem desliga a funcao (isso e ato da linha), que
// ele nao oferece excluir, e que o CBO vazio vira ausencia em vez de erro.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { FuncaoOperacionalDto } from "@padaria/shared";
import FuncaoOperacionalDialog from "~/components/funcoes/FuncaoOperacionalDialog.vue";

const PASTA = dirname(fileURLToPath(import.meta.url));

function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

beforeAll(() => {
  class ObservadorInerte {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("ResizeObserver", ObservadorInerte);
  vi.stubGlobal("IntersectionObserver", ObservadorInerte);
  vi.stubGlobal("visualViewport", {
    width: 1280,
    height: 800,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener() {},
    removeEventListener() {}
  });
});

beforeEach(() => {
  document.body.innerHTML = "";
});

const FUNCAO: FuncaoOperacionalDto = {
  id: "f1",
  empresaId: "e1",
  nome: "PADEIRO",
  cbo: "848505",
  ativo: true,
  emUso: true
};

function montar(cenario: { funcao?: FuncaoOperacionalDto | null; erro?: string; salvando?: boolean } = {}) {
  const vuetify = createVuetify({ components, directives });
  return mount(FuncaoOperacionalDialog, {
    attachTo: document.body,
    global: { plugins: [vuetify], stubs: { transition: false } },
    props: {
      aberto: true,
      funcao: cenario.funcao ?? null,
      salvando: cenario.salvando ?? false,
      erro: cenario.erro ?? ""
    }
  });
}

function campo(nome: string): HTMLInputElement | undefined {
  return document.querySelector<HTMLInputElement>(`[data-campo="${nome}"] input`) ?? undefined;
}

function botao(rotulo: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.replace(/\s+/gu, " ").trim() === rotulo
  );
}

async function digitar(nome: string, valor: string) {
  const alvo = campo(nome);
  if (!alvo) throw new Error(`campo ausente: ${nome}`);
  alvo.value = valor;
  alvo.dispatchEvent(new Event("input"));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("o dialogo cria e renomeia, e nada mais", () => {
  it("Deve_NaoLigarNemDesligarAFuncao", () => {
    // Ativar e desativar sao atos proprios, com botao proprio na linha. Um interruptor aqui dentro
    // faria a pessoa desativar sem perceber ao corrigir um nome.
    montar({ funcao: FUNCAO });
    expect(document.querySelector(".v-switch")).toBeNull();
    expect(document.body.textContent).not.toContain("Ativa");
    expect(botao("Desativar")).toBeUndefined();
    expect(botao("Reativar")).toBeUndefined();
  });

  it("Deve_NaoOferecerExcluir", () => {
    // Nao ha exclusao em lugar nenhum desta vertical — nem rota, nem botao.
    montar({ funcao: FUNCAO });
    expect(botao("Excluir")).toBeUndefined();
    const codigo = semComentarios(readFileSync(join(PASTA, "FuncaoOperacionalDialog.vue"), "utf8"));
    expect(codigo).not.toContain("Excluir");
    expect(codigo.toLowerCase()).not.toContain("apidelete");
  });

  it("Deve_HidratarNaEdicao_E_NascerVazioNaCriacao", async () => {
    const comAlvo = montar({ funcao: FUNCAO });
    expect(campo("nome")?.value).toBe("PADEIRO");
    expect(campo("cbo")?.value).toBe("848505");
    expect(document.body.textContent).toContain("Editar função");
    comAlvo.unmount();

    montar({ funcao: null });
    expect(campo("nome")?.value).toBe("");
    expect(campo("cbo")?.value).toBe("");
    expect(document.body.textContent).toContain("Nova função operacional");
  });

  it("Deve_ExigirNome", async () => {
    const wrapper = montar({ funcao: null });
    await digitar("nome", "   ");
    botao("Salvar")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.emitted("salvar")).toBeUndefined();
    expect(document.body.textContent).toContain("Informe o nome da função.");
  });

  it("Deve_RecusarCboForaDeSeisDigitos_E_AceitarVazio", async () => {
    const wrapper = montar({ funcao: null });
    await digitar("nome", "Balconista");
    await digitar("cbo", "12345");
    botao("Salvar")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.emitted("salvar")).toBeUndefined();
    expect(document.body.textContent).toContain("O CBO tem 6 dígitos.");

    // Vazio nao e erro: quem nao sabe o codigo nao pode ficar preso. E vai como ausencia, nao "".
    await digitar("cbo", "");
    botao("Salvar")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.emitted("salvar")).toEqual([[{ nome: "Balconista", cbo: null }]]);
  });

  it("Deve_AparaOsEspacosDoNome", async () => {
    const wrapper = montar({ funcao: null });
    await digitar("nome", "  Faxineiro  ");
    botao("Salvar")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Sem o aparo, " Faxineiro" e "Faxineiro" seriam duas funcoes: o unique compara o nome cru.
    expect(wrapper.emitted("salvar")).toEqual([[{ nome: "Faxineiro", cbo: null }]]);
  });

  it("Deve_AvisarQue_RenomearAlcancaORegistroAntigo", () => {
    // O nome da funcao NAO tem retrato nos registros que a usam — diferente do turno. Renomear muda
    // o que aparece tambem no que ja foi feito, e a tela diz isso antes de deixar renomear.
    montar({ funcao: FUNCAO });
    expect(document.body.textContent).toContain("Renomear muda como ela aparece também nos registros");

    document.body.innerHTML = "";
    montar({ funcao: { ...FUNCAO, emUso: false } });
    expect(document.body.textContent).not.toContain("Renomear muda como ela aparece");
  });

  it("Deve_MostrarOErroDoServidor_SemFechar", () => {
    // O caso mais provavel e nome repetido, que se resolve mudando uma palavra — fechar perderia o
    // que ja foi digitado.
    montar({ funcao: null, erro: "Já existe uma função com este nome nesta empresa." });
    expect(document.body.textContent).toContain("Já existe uma função com este nome nesta empresa.");
    expect(campo("nome")).toBeDefined();
  });
});
