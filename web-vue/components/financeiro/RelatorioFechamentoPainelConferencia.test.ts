import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatorioFechamentoPainelConferencia from "./RelatorioFechamentoPainelConferencia.vue";

const decisao = (resultado: "conferido" | "divergente") => ({
  resultado,
  observacao: resultado === "divergente" ? "motivo" : null,
  conferidoPor: "u-1",
  conferidoPorNome: "Rodrigo",
  conferidoEm: "2026-10-28"
});

const base = {
  situacao: "fechado_sem_pendencias",
  podeConferirTransferencia: true,
  podeConferirFinal: true,
  retornoVisivel: true,
  pendentes: 0,
  lacreDiferente: false,
  ultima: null,
  enviando: false,
  erro: "",
  dataHora: (valor: unknown) => String(valor)
};

function montar(props: Record<string, unknown> = {}) {
  return shallowMount(RelatorioFechamentoPainelConferencia, {
    props: { ...base, ...props } as never,
    global: {
      stubs: {
        "v-btn": { template: '<button v-bind="$attrs"><slot /></button>' },
        "v-chip": { template: "<span><slot /></span>" },
        "v-alert": { template: '<div v-bind="$attrs"><slot /></div>' }
      }
    }
  });
}

describe("RelatorioFechamentoPainelConferencia", () => {
  it("oferece Fechou certo e Teve quebra quando o caixa fechou sem diferenca", async () => {
    const wrapper = montar();
    expect(wrapper.findAll("button")).toHaveLength(2);
    await wrapper.get('[data-teste="botao-fechou-certo"]').trigger("click");
    expect(wrapper.emitted("fechou-certo")).toHaveLength(1);
  });

  it("com retorno pendente o Fechou certo explica que o retorno entra como declarado", () => {
    const wrapper = montar({ situacao: "aguardando_tesouraria", pendentes: 1 });
    expect(wrapper.text()).toContain("entra como declarado");
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(true);
  });

  it("com retorno pendente e sem permissao de receber nao oferece Fechou certo", () => {
    const wrapper = montar({ situacao: "aguardando_tesouraria", pendentes: 1, podeConferirTransferencia: false });
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(false);
  });

  it("lacre diferente do reservado bloqueia o Fechou certo e diz por que", () => {
    const wrapper = montar({ lacreDiferente: true });
    expect(wrapper.text()).toContain("não bate com o reservado");
  });

  it("Teve quebra aparece junto do Fechou certo, mesmo com o caixa sem diferenca", async () => {
    const wrapper = montar();
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(true);
    await wrapper.get('[data-teste="botao-teve-quebra"]').trigger("click");
    expect(wrapper.emitted("registrar-divergencia")).toHaveLength(1);
  });

  it("com diferenca registrada so resta Teve quebra", () => {
    const wrapper = montar({ situacao: "com_quebra" });
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(false);
    expect(wrapper.find('[data-teste="botao-teve-quebra"]').exists()).toBe(true);
  });

  it("lacre diferente tira o Fechou certo mas deixa Teve quebra", () => {
    const wrapper = montar({ lacreDiferente: true });
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(false);
    expect(wrapper.find('[data-teste="botao-teve-quebra"]').exists()).toBe(true);
  });

  it("sem acesso as transferencias nao finge que esta tudo certo", () => {
    const wrapper = montar({ retornoVisivel: false });
    expect(wrapper.find('[data-teste="botao-fechou-certo"]').exists()).toBe(false);
    expect(wrapper.find('[data-teste="botao-teve-quebra"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Sem permissão para ver as transferências");
  });

  it("caixa ainda nao fechado nao oferece acao", () => {
    const wrapper = montar({ situacao: "em_fechamento" });
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(wrapper.text()).toContain("ainda não foi fechado");
  });

  it("mostra o erro do servidor quando o Fechou certo falha", () => {
    const wrapper = montar({ erro: "Lacre nao confere" });
    expect(wrapper.get('[data-teste="erro-fechou-certo"]').text()).toContain("Lacre nao confere");
  });

  it("ja conferido mostra quem conferiu e Alterar status propoe o oposto", async () => {
    const conferido = montar({ ultima: decisao("conferido") });
    expect(conferido.text()).toContain("Conferido sem pendências · Rodrigo");
    await conferido.get('[data-teste="botao-alterar-status"]').trigger("click");
    expect(conferido.emitted("revisar-final")?.[0]).toEqual(["divergente"]);

    const divergente = montar({ ultima: decisao("divergente") });
    await divergente.get('[data-teste="botao-alterar-status"]').trigger("click");
    expect(divergente.emitted("revisar-final")?.[0]).toEqual(["conferido"]);
  });

  it("sem permissao para a conferencia final nao oferece Alterar status", () => {
    const wrapper = montar({ ultima: decisao("conferido"), podeConferirFinal: false });
    expect(wrapper.find('[data-teste="botao-alterar-status"]').exists()).toBe(false);
  });
});
