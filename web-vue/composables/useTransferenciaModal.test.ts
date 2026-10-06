import { effectScope, ref } from "vue";
import { describe, expect, it } from "vitest";
import { formOperacaoVazio, opcoesVazias } from "~/utils/domain";
import { useTransferenciaModal } from "./useTransferenciaModal";

describe("transferência comum no host", () => {
  it("monta já aberta em edição mantendo múltiplos destinos", () => {
    const scope = effectScope();
    const form = ref({ ...formOperacaoVazio(), contaDestinoId: "conta-1", contasDestinoIds: ["conta-2"] });
    const modal = scope.run(() =>
      useTransferenciaModal({
        aberto: ref(true),
        form,
        opcoesEmpresa: ref(opcoesVazias())
      })
    )!;
    expect(modal.multiploDestino.value).toBe(true);
    expect(modal.destinosSelecionados.value).toEqual(["conta-1", "conta-2"]);
    scope.stop();
  });

  it("monta já aberta em edição mantendo prazo de confirmação", () => {
    const scope = effectScope();
    const form = ref(formOperacaoVazio());
    form.value.tempoConfirmacao = "1h";
    const modal = scope.run(() =>
      useTransferenciaModal({
        aberto: ref(true),
        form,
        opcoesEmpresa: ref(opcoesVazias())
      })
    )!;
    expect(modal.tempoConfirmacaoAberto.value).toBe(true);
    expect(form.value.tempoConfirmacao).toBe("1h");
    scope.stop();
  });
});
