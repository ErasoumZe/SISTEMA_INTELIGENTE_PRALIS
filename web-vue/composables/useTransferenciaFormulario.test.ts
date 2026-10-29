import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { formOperacaoVazio, opcoesVazias } from "~/utils/domain";

const form = ref(formOperacaoVazio());
const opcoesEmpresa = ref({
  ...opcoesVazias(),
  contas: [
    { id: "cofre", nome: "Cofre", ehCofre: true },
    { id: "pdv-1", nome: "Conta PDV 1", ehContaPdv: true },
    { id: "banco", nome: "Banco" }
  ]
});

vi.mock("~/components/workspace/workspace-context", () => ({
  useWorkspaceContext: () => ({
    modalOperacaoAberto: ref(true),
    entidadeNova: ref("transferencia"),
    empresaId: ref("emp-1"),
    operacaoEditandoId: ref(""),
    form,
    opcoesEmpresa,
    salvandoOperacao: ref(false),
    salvarOperacao: vi.fn(),
    abrirOperacao: vi.fn()
  })
}));
vi.mock("~/composables/useApi", () => ({ useApi: () => ({ apiGet: vi.fn(async () => []) }) }));

const { useTransferenciaFormulario } = await import("./useTransferenciaFormulario");

// Pedido do Marco (29/10): no malote para o Caixa digita-se so dinheiro fisico e moedas; o valor da transferencia
// e a soma. A regra (fisico + moedas = valor total) continua conferida no salvar.
describe("valor da transferência no malote para o Caixa", () => {
  function montar(destino: string) {
    form.value = { ...formOperacaoVazio(), contaOrigemId: "cofre", contaDestinoId: destino };
    const scope = effectScope();
    const tela = scope.run(() => useTransferenciaFormulario())!;
    return { tela, scope };
  }

  it("o total é a soma de dinheiro físico e moedas", async () => {
    const { tela, scope } = montar("pdv-1");
    expect(tela.preparandoMaloteParaCaixa.value).toBe(true);
    form.value.valorEspecieDeclarado = "90";
    form.value.valorMoedasDeclarado = "10.5";
    await nextTick();
    expect(form.value.valorOriginal).toBe("100.5");
    expect(tela.totalSaida.value).toBe(100.5);
    expect(tela.composicaoMaloteBate.value).toBe(true);
    scope.stop();
  });

  it("fora do malote para o Caixa físico + moedas viram o total, sem gravar composição", async () => {
    const { tela, scope } = montar("banco");
    expect(tela.preparandoMaloteParaCaixa.value).toBe(false);
    tela.campoFisico.value = "200";
    tela.campoMoedas.value = "50";
    await nextTick();
    expect(form.value.valorOriginal).toBe("250");
    expect(tela.totalDigitado.value).toBe(250);
    expect(form.value.valorEspecieDeclarado).toBe("");
    expect(form.value.valorMoedasDeclarado).toBe("");
    scope.stop();
  });

  it("transferência comum aberta para editar mostra o valor gravado como dinheiro físico", async () => {
    form.value = { ...formOperacaoVazio(), contaOrigemId: "cofre", contaDestinoId: "banco", valorOriginal: "1500" };
    const scope = effectScope();
    const tela = scope.run(() => useTransferenciaFormulario())!;
    await nextTick();
    expect(tela.campoFisico.value).toBe("1500");
    expect(form.value.valorOriginal).toBe("1500");
    scope.stop();
  });

  it("os valores digitados acompanham a troca de destino", async () => {
    const { tela, scope } = montar("banco");
    tela.campoFisico.value = "80";
    tela.campoMoedas.value = "20";
    await nextTick();
    form.value.contaDestinoId = "pdv-1";
    await nextTick();
    expect(form.value.valorEspecieDeclarado).toBe("80");
    expect(form.value.valorMoedasDeclarado).toBe("20");
    expect(form.value.valorOriginal).toBe("100");
    scope.stop();
  });
});
