import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CargosAcessoResumo } from "@padaria/shared/permissoes";
import PermissoesCargos from "./PermissoesCargos.vue";

const resumoBase: CargosAcessoResumo = {
  cargos: [
    { id: "c-caixa", nome: "Caixa", temPadrao: true, aceitaContaPosto: true, permitidas: 11, pessoas: 6 },
    { id: "c-gerente", nome: "Caixa Gerente", temPadrao: true, aceitaContaPosto: true, permitidas: 32, pessoas: 0 },
    { id: "c-proprio", nome: "Cargo da Loja", temPadrao: false, aceitaContaPosto: false, permitidas: 3, pessoas: 1 }
  ],
  padroesFaltando: ["Tesouraria"],
  contasPosto: [
    {
      usuarioId: "u-pdv4m",
      nome: "PDV 4 · Manhã",
      email: "pdv4.manha@email.com",
      posto: "PDV 4 · Manhã",
      cargoId: "c-caixa",
      cargoNome: "Caixa",
      acessoIndividual: true
    }
  ]
};

const stubs = {
  "v-alert": { template: '<div v-bind="$attrs"><slot /></div>' },
  "v-progress-linear": true,
  "v-chip": { template: "<span><slot /></span>" },
  "v-spacer": true,
  "v-select": {
    props: ["modelValue", "items", "label", "disabled"],
    emits: ["update:modelValue"],
    template:
      '<select :aria-label="label" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.title }}</option></select>'
  },
  "v-btn": { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>' },
  "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue" data-teste="dialogo"><slot /></div>' },
  "v-card": { template: "<section><slot /></section>" },
  "v-card-title": { template: "<h3><slot /></h3>" },
  "v-card-text": { template: "<p><slot /></p>" },
  "v-card-actions": { template: "<div><slot /></div>" }
};

function montar(podeEditar = true) {
  const apiGet = vi.fn().mockResolvedValue(structuredClone(resumoBase));
  const apiPost = vi.fn().mockResolvedValue({});
  const apiPut = vi.fn().mockResolvedValue({});
  vi.stubGlobal("useApi", () => ({ apiGet, apiPost, apiPut }));
  const wrapper = mount(PermissoesCargos, { props: { empresaId: "emp-1", podeEditar }, global: { stubs } });
  return { wrapper, apiGet, apiPost, apiPut };
}

const botao = (wrapper: ReturnType<typeof montar>["wrapper"], texto: string) =>
  wrapper.findAll("button").find((item) => item.text().includes(texto))!;

afterEach(() => vi.unstubAllGlobals());

describe("PermissoesCargos", () => {
  it("mostra os cargos, o que falta criar e a conta com acesso individual", async () => {
    const { wrapper, apiGet } = montar();
    await flushPromises();
    expect(apiGet).toHaveBeenCalledWith("/api/permissoes/cargos-acesso?empresaId=emp-1");
    expect(wrapper.findAll('[data-teste="cargo-card"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("Criar Tesouraria");
    expect(wrapper.text()).toContain("Cargo próprio, sem padrão do sistema");
    expect(wrapper.text()).toContain("Acesso individual: o cargo não vale");
  });

  it("restaura o padrao so depois de confirmar", async () => {
    const { wrapper, apiPost } = montar();
    await flushPromises();
    await botao(wrapper, "Restaurar padrão").trigger("click");
    expect(apiPost).not.toHaveBeenCalled();
    expect(wrapper.get('[data-teste="dialogo"]').text()).toContain('Restaurar o cargo "Caixa"?');
    await wrapper.get('[data-teste="dialogo"]').findAll("button").at(-1)!.trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/permissoes/cargo/c-caixa/restaurar-padrao", {});
    expect(wrapper.get('[data-teste="cargos-aviso"]').text()).toContain("restaurado para o padrão");
  });

  it("cria o cargo que falta e faz a conta seguir so o cargo", async () => {
    const { wrapper, apiPost } = montar();
    await flushPromises();
    await botao(wrapper, "Criar Tesouraria").trigger("click");
    await wrapper.get('[data-teste="dialogo"]').findAll("button").at(-1)!.trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/permissoes/cargos-acesso/padrao", {
      empresaId: "emp-1",
      nome: "Tesouraria"
    });

    await botao(wrapper, "Seguir só o cargo").trigger("click");
    await wrapper.get('[data-teste="dialogo"]').findAll("button").at(-1)!.trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/permissoes/contas-posto/u-pdv4m/seguir-cargo", { empresaId: "emp-1" });
  });

  it("troca o cargo da conta de posto pelo seletor, com confirmacao", async () => {
    const { wrapper, apiPut } = montar();
    await flushPromises();
    await wrapper.get("select").setValue("c-gerente");
    expect(wrapper.get('[data-teste="dialogo"]').text()).toContain('Passar PDV 4 · Manhã para "Caixa Gerente"?');
    await wrapper.get('[data-teste="dialogo"]').findAll("button").at(-1)!.trigger("click");
    await flushPromises();
    expect(apiPut).toHaveBeenCalledWith("/api/permissoes/contas-posto/u-pdv4m/cargo", {
      empresaId: "emp-1",
      cargoId: "c-gerente"
    });
  });

  it("sem permissao de editar so mostra", async () => {
    const { wrapper } = montar(false);
    await flushPromises();
    expect(wrapper.text()).not.toContain("Criar Tesouraria");
    expect(wrapper.text()).not.toContain("Restaurar padrão");
    expect(wrapper.get("select").attributes("disabled")).toBeDefined();
  });

  it("conta de posto so pode ir para Caixa ou Caixa Gerente", async () => {
    const { wrapper } = montar();
    await flushPromises();
    const opcoes = wrapper
      .get("select")
      .findAll("option")
      .map((opcao) => opcao.text());
    expect(opcoes).toEqual(["Caixa", "Caixa Gerente"]);
  });
});
