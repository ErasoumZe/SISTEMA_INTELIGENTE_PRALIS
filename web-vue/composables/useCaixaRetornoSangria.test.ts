import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaixaStatus } from "~/types/padaria";
import type { RetornoSaldoPayload } from "~/utils/caixa-acoes";
import { useCaixaRetornoSangria } from "./useCaixaRetornoSangria";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));

function montar() {
  const status = ref({
    caixaAberto: {
      id: "cx-1",
      empresaId: "emp-1",
      status: "aberto",
      caixaResponsavelNomeAbertura: "Operadora",
      usuarioCaixaNome: "Usuária"
    },
    resumo: { saldo: 100 },
    planejamentosPendentes: [{ id: "planejamento", valor: 25 }]
  } as CaixaStatus);
  const empresaId = ref("emp-1");
  const permitido = ref(true);
  const salvando = ref(false);
  const carregarStatus = vi.fn(async () => {
    status.value = { ...status.value, caixaAberto: { ...status.value.caixaAberto! } };
  });
  const carregarLacres = vi.fn(async () => [
    { id: "lacre-1", numero: "S-001" },
    { id: "lacre-2", numero: "S-002" }
  ]);
  const retornarSaldo = vi.fn(async (payload: RetornoSaldoPayload) => {
    payload.aoConcluir?.(false);
    return false;
  });
  const fechar = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const retorno = scope.run(() =>
    useCaixaRetornoSangria({
      status,
      empresaId,
      permitido,
      salvando,
      carregarStatus,
      carregarLacres,
      retornarSaldo,
      fechar
    })
  )!;
  function preencher() {
    Object.assign(retorno.entrega, {
      valor: "50",
      valorEspecie: "40",
      valorMoedas: "10",
      lacreId: "lacre-1",
      responsavelNome: "Operadora",
      observacao: "Retorno"
    });
  }
  return {
    retorno,
    status,
    empresaId,
    permitido,
    salvando,
    carregarStatus,
    carregarLacres,
    retornarSaldo,
    fechar,
    preencher
  };
}

describe("retorno manual no host de Transferências", () => {
  it("prepara lacres e responsável do Caixa, preservando saldo livre após reservas", async () => {
    const { retorno, carregarLacres } = montar();
    await retorno.preparar();
    expect(carregarLacres).toHaveBeenCalledWith("cx-1");
    expect(retorno.entrega.responsavelNome).toBe("Operadora");
    expect(retorno.saldoLivre.value).toBe(75);
  });

  it.each(["permissao", "caixa", "empresa"] as const)("não prepara nem envia sem %s elegível", async (gate) => {
    const m = montar();
    m.preencher();
    if (gate === "permissao") m.permitido.value = false;
    if (gate === "caixa") m.status.value.caixaAberto = null;
    if (gate === "empresa") m.empresaId.value = "emp-outra";
    await m.retorno.preparar();
    await m.retorno.retornarSaldo();
    expect(m.retorno.podeRetornar.value).toBe(false);
    expect(m.carregarLacres).not.toHaveBeenCalled();
    expect(m.retornarSaldo).not.toHaveBeenCalled();
  });

  it("bloqueia retorno e sangria quando o Caixa entrou em fechamento", async () => {
    const m = montar();
    m.preencher();
    m.status.value.caixaAberto!.status = "em_fechamento";
    await m.retorno.preparar();
    await m.retorno.retornarSaldo();
    expect(m.retorno.podeRetornar.value).toBe(false);
    expect(m.carregarLacres).not.toHaveBeenCalled();
    expect(m.retornarSaldo).not.toHaveBeenCalled();
  });

  it.each(["saldo", "composicao", "lacre", "responsavel", "salvando"] as const)(
    "mantém a guarda de %s",
    async (gate) => {
      const m = montar();
      m.preencher();
      if (gate === "saldo") Object.assign(m.retorno.entrega, { valor: "80", valorEspecie: "70" });
      if (gate === "composicao") m.retorno.entrega.valorEspecie = "30";
      if (gate === "lacre") m.retorno.entrega.lacreId = "";
      if (gate === "responsavel") m.retorno.entrega.responsavelNome = "";
      if (gate === "salvando") m.salvando.value = true;
      await m.retorno.retornarSaldo();
      expect(m.retorno.entregaBloqueada.value).toBe(true);
      expect(m.retornarSaldo).not.toHaveBeenCalled();
    }
  );

  it("falha/cancelamento e refresh do mesmo Caixa preservam intenção, chave e preenchimento", async () => {
    const m = montar();
    await m.retorno.preparar();
    m.preencher();
    await m.retorno.retornarSaldo(true);
    const primeira = m.retornarSaldo.mock.calls[0]![0];
    await m.retorno.preparar();
    await m.retorno.retornarSaldo(true);
    expect(m.retornarSaldo.mock.calls[1]![0].idempotenciaChave).toBe(primeira.idempotenciaChave);
    expect(m.retorno.entrega.valor).toBe("50");
    expect(m.retorno.entrega.lacreId).toBe("lacre-1");
    expect(m.fechar).not.toHaveBeenCalled();
    expect(primeira).toMatchObject({
      caixaId: "cx-1",
      valor: 50,
      valorEspecie: 40,
      valorMoedas: 10,
      lacreId: "lacre-1",
      lacreNumero: "S-001",
      responsavelNome: "Operadora",
      observacao: "Retorno"
    });
  });

  it("alterar intenção roda a chave; sucesso limpa e permite outro retorno sem perder responsável", async () => {
    const m = montar();
    await m.retorno.preparar();
    m.preencher();
    await m.retorno.retornarSaldo();
    const primeira = m.retornarSaldo.mock.calls[0]![0].idempotenciaChave;
    m.retorno.entrega.observacao = "Outra intenção";
    m.retornarSaldo.mockImplementation(async (payload) => {
      payload.aoConcluir?.(true);
      return true;
    });
    await m.retorno.retornarSaldo(false);
    expect(m.retornarSaldo.mock.calls[1]![0].idempotenciaChave).not.toBe(primeira);
    expect(m.retorno.entrega.valor).toBe("");
    expect(m.retorno.entrega.lacreId).toBe("");
    expect(m.retorno.entrega.responsavelNome).toBe("Operadora");
    expect(m.retorno.lacresRetornoDisponiveis.value.map((lacre) => lacre.id)).toEqual(["lacre-2"]);
    expect(m.fechar).not.toHaveBeenCalled();
    m.preencher();
    await m.retorno.retornarSaldo(true);
    expect(m.fechar).toHaveBeenCalledOnce();
  });

  it("trava duplo clique já durante confirmação", async () => {
    const m = montar();
    m.preencher();
    let concluir!: (valor: boolean) => void;
    m.retornarSaldo.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          concluir = resolve;
        })
    );
    const pendente = m.retorno.retornarSaldo();
    await m.retorno.retornarSaldo();
    expect(m.retornarSaldo).toHaveBeenCalledOnce();
    concluir(false);
    await pendente;
    expect(m.retorno.processando.value).toBe(false);
  });

  it("ignora lacres de resposta antiga depois de trocar empresa e Caixa", async () => {
    const m = montar();
    let responder!: (valor: Array<{ id: string; numero: string }>) => void;
    m.carregarLacres.mockImplementation(
      () =>
        new Promise((resolve) => {
          responder = resolve;
        })
    );
    const pendente = m.retorno.preparar();
    await Promise.resolve();
    m.empresaId.value = "emp-2";
    responder([{ id: "velho", numero: "VELHO" }]);
    await pendente;
    expect(m.retorno.lacresRetornoDisponiveis.value).toEqual([]);
    expect(m.retorno.entrega.responsavelNome).toBe("");
  });

  it("falha ao atualizar status bloqueia envio e permite nova tentativa", async () => {
    const m = montar();
    m.preencher();
    m.carregarStatus.mockRejectedValueOnce(new Error("Sem conexão"));
    await m.retorno.preparar();
    await m.retorno.retornarSaldo();
    expect(m.retorno.erroCarga.value).toBe("Sem conexão");
    expect(m.retornarSaldo).not.toHaveBeenCalled();
    await m.retorno.preparar();
    expect(m.retorno.erroCarga.value).toBe("");
    expect(m.retorno.entrega.valor).toBe("50");
  });
});
