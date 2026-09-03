// ADM-003 V5 — o que o DP ve dos dependentes, e principalmente o que ele NAO ve.
//
// Monta o componente real com o Vuetify real (a `v-chip` e o unico componente de biblioteca aqui).
// A prova que importa e negativa: nenhum digito de CPF chega ao DOM, porque nenhum chega ao
// componente — o contrato (`DependenteRevisaoDto`) so tem `cpfInformado`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { DependenteRevisaoDto } from "@padaria/shared";
import FichaRevisaoDependentes from "~/components/admissoes/FichaRevisaoDependentes.vue";

const PASTA = dirname(fileURLToPath(import.meta.url));

function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

const COM_CPF: DependenteRevisaoDto = {
  id: "11111111-1111-4111-8111-111111111111",
  nomeCompleto: "Dependente Com Documento",
  nascimento: "2015-03-01",
  parentesco: "Filho(a)",
  cpfInformado: true,
  finalidades: ["Imposto de renda", "Plano de saúde"]
};

const SEM_CPF: DependenteRevisaoDto = {
  id: "22222222-2222-4222-8222-222222222222",
  nomeCompleto: "Dependente Sem Documento",
  nascimento: "2024-11-20",
  parentesco: "Filho(a)",
  cpfInformado: false,
  finalidades: []
};

function montar(props: { dependentes: DependenteRevisaoDto[]; semDependentes: boolean | null }) {
  const vuetify = createVuetify({ components, directives });
  return mount(FichaRevisaoDependentes, { global: { plugins: [vuetify] }, props });
}

function texto(wrapper: ReturnType<typeof montar>): string {
  return wrapper.text().replace(/\s+/gu, " ").trim();
}

describe("a lista de dependentes do DP", () => {
  it("Deve_ListarNomeParentescoENascimento_NaOrdemRecebida", () => {
    const wrapper = montar({ dependentes: [COM_CPF, SEM_CPF], semDependentes: false });
    const itens = wrapper.findAll("li").map((li) => li.text().replace(/\s+/gu, " ").trim());
    expect(itens).toHaveLength(2);
    expect(itens[0]).toContain("Dependente Com Documento");
    expect(itens[0]).toContain("Filho(a)");
    // Data-only formatada sem passar por `Date`: 01/03/2015, e nao 28/02 em fuso negativo.
    expect(itens[0]).toContain("01/03/2015");
    expect(itens[0]).toContain("Imposto de renda · Plano de saúde");
    expect(itens[1]).toContain("Dependente Sem Documento");
    expect(itens[1]).toContain("Finalidade não informada");
  });

  it("Deve_DizerSeOCpfFoiInformado_SemNenhumDigito", () => {
    const wrapper = montar({ dependentes: [COM_CPF, SEM_CPF], semDependentes: false });
    const itens = wrapper.findAll("li").map((li) => li.text().replace(/\s+/gu, " ").trim());
    expect(itens[0]).toContain("CPF informado");
    expect(itens[0]).not.toContain("Sem CPF");
    expect(itens[1]).toContain("Sem CPF");
    expect(itens[1]).not.toContain("CPF informado");
    // Nenhuma sequencia de 11 digitos, nem CPF pontuado, nem mascara com bullets: nada a mascarar.
    const html = wrapper.html();
    expect(html).not.toMatch(/\d{11}/u);
    expect(html).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u);
    expect(html).not.toContain("•••");
    // E a tela diz ao DP, em texto, que o numero nao e exibido — para ninguem procurar um botao.
    expect(texto(wrapper)).toContain("O número do CPF dos dependentes não é exibido");
  });

  it("Deve_MostrarOsTresEstadosDaDeclaracao_Quando_ListaVazia", () => {
    // `null` e "nao respondeu": a tela nao pode transformar isso em "nao tem".
    expect(texto(montar({ dependentes: [], semDependentes: null }))).toContain("Não respondeu");
    expect(texto(montar({ dependentes: [], semDependentes: null }))).toContain("ainda não respondeu");

    expect(texto(montar({ dependentes: [], semDependentes: true }))).toContain("Declarou que não tem dependentes");
    expect(texto(montar({ dependentes: [], semDependentes: true }))).toContain("Nenhum dependente a informar");

    // Incoerente A — o servidor recusa o envio assim, mas o rascunho aceita; o DP precisa ver.
    expect(texto(montar({ dependentes: [], semDependentes: false }))).toContain(
      "Declarou que tem dependentes, mas nenhum foi cadastrado"
    );
  });

  it("Deve_ASecaoTerTitulo_E_ARegiaoSerNomeada", () => {
    const wrapper = montar({ dependentes: [COM_CPF], semDependentes: false });
    const titulo = wrapper.find("h2");
    expect(titulo.text()).toBe("Dependentes");
    expect(wrapper.find("section").attributes("aria-labelledby")).toBe(titulo.attributes("id"));
  });

  it("Deve_NenhumComponenteDaRevisaoTocarEmCpf_AlemDoIndicador", () => {
    // Guarda de fonte, para as quatro pecas da tela: a unica grafia de CPF permitida e o indicador
    // `cpfInformado` e o texto que explica ao DP que o numero nao aparece. Qualquer outra — uma
    // mascara, um `revelar`, um campo `cpf` solto — e uma segunda porta para o dado.
    for (const arquivo of [
      "FichaRevisaoPage.vue",
      "FichaRevisaoCampos.vue",
      "FichaRevisaoDependentes.vue",
      "FichaRevisaoDecisao.vue"
    ]) {
      const codigo = semComentarios(readFileSync(join(PASTA, arquivo), "utf8"))
        .replace(/cpfInformado/gu, "")
        .replace(/CPF informado|Sem CPF|O número do CPF dos dependentes não é exibido/gu, "");
      expect(codigo, arquivo).not.toMatch(/cpf/iu);
      expect(codigo, arquivo).not.toMatch(/revelar|mascararCpf|cpfTotalmenteMascarado/u);
    }
  });
});
