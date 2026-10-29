import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TransferenciaSemLacreDialog from "./TransferenciaSemLacreDialog.vue";
import type { Opcao } from "~/types/padaria";

const apiPost = vi.fn();
vi.mock("~/composables/useApi", () => ({ useApi: () => ({ apiPost }) }));

const contas: Opcao[] = [
  { id: "cofre", nome: "Cofre", ehCofre: true, saldoAtual: 1000 },
  { id: "pdv-2", nome: "Conta PDV 2", ehContaPdv: true },
  { id: "banco", nome: "Banco" }
];

function montar() {
  return mount(TransferenciaSemLacreDialog, {
    props: { modelValue: true, empresaId: "emp-1", contas },
    global: {
      stubs: {
        "v-icon": true,
        "v-dialog": { props: ["modelValue"], template: '<div v-if="modelValue"><slot /></div>' },
        CampoDinheiro: {
          inheritAttrs: false,
          props: ["modelValue", "label"],
          emits: ["update:modelValue"],
          template:
            '<input :value="modelValue" :data-teste="$attrs[\'data-teste\']" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        }
      }
    }
  });
}

// R-231 · sem lacre: origem, destino, fisico + moedas (total = soma) e observacao opcional.
describe("TransferenciaSemLacreDialog", () => {
  beforeEach(() => apiPost.mockReset());

  it("já abre com o Cofre de origem e não oferece conta de PDV como origem", () => {
    const tela = montar();
    const origem = tela.find<HTMLSelectElement>("[data-teste='sem-lacre-origem']");
    expect(origem.element.value).toBe("cofre");
    expect(origem.findAll("option").map((opcao) => opcao.text())).not.toContain("Conta PDV 2");
  });

  it("envia físico + moedas e o total é a soma", async () => {
    apiPost.mockResolvedValue({ id: "tr-1" });
    const tela = montar();
    await tela.find("[data-teste='sem-lacre-destino']").setValue("pdv-2");
    expect(tela.text()).toContain("caixa aberto");
    await tela.find("[data-teste='sem-lacre-fisico']").setValue("80");
    await tela.find("[data-teste='sem-lacre-moedas']").setValue("20");
    expect(tela.text()).toContain("100,00");

    await tela.find("[data-teste='sem-lacre-salvar']").trigger("click");
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith("/api/transferencias/sem-lacre", {
      empresaId: "emp-1",
      contaOrigemId: "cofre",
      contaDestinoId: "pdv-2",
      valorEspecieDeclarado: 80,
      valorMoedasDeclarado: 20,
      observacao: null
    });
    expect(tela.emitted("criada")).toHaveLength(1);
    expect(tela.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  it("sem valor ou sem destino o botão fica travado", async () => {
    const tela = montar();
    const salvar = tela.find("[data-teste='sem-lacre-salvar']");
    expect(salvar.attributes("disabled")).toBeDefined();
    await tela.find("[data-teste='sem-lacre-destino']").setValue("banco");
    expect(salvar.attributes("disabled")).toBeDefined();
  });

  it("recusa do servidor (PDV sem caixa aberto) aparece e o modal fica aberto", async () => {
    apiPost.mockRejectedValue(new Error("O PDV de destino não tem caixa aberto."));
    const tela = montar();
    await tela.find("[data-teste='sem-lacre-destino']").setValue("pdv-2");
    await tela.find("[data-teste='sem-lacre-fisico']").setValue("10");
    await tela.find("[data-teste='sem-lacre-salvar']").trigger("click");
    await flushPromises();
    expect(tela.find("[role='alert']").text()).toContain("não tem caixa aberto");
    expect(tela.emitted("criada")).toBeUndefined();
  });
});
