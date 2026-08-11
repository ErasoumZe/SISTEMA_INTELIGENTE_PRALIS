// CX-M06 — B-04: o credor permitido e a limpeza do credor incompativel na troca de categoria.
//
// A regra vive numa funcao pura porque ela tem DOIS consumidores — os chips do
// `useOperacaoLancamento` e a troca de categoria do `AppWorkspace` — e antes estava escrita duas
// vezes, com respostas diferentes (o mapa `CREDORES` dizia uma coisa, `trocarCategoriaLancamento`
// limpava outra). Uma definicao so, provada aqui.
import { describe, expect, it } from "vitest";
import { CREDORES_POR_CATEGORIA, limparCredorIncompativel } from "~/utils/credor-categoria";
import { montarPayloadOperacao } from "~/utils/operacoes";
import { formOperacaoVazio } from "~/utils/domain";
import type { OperacaoForm } from "~/types/padaria";

function formCom(campos: Partial<OperacaoForm>): OperacaoForm {
  return { ...formOperacaoVazio(), ...campos };
}

function payloadDe(entidade: "despesa" | "mercadoria" | "retirada", form: OperacaoForm) {
  return montarPayloadOperacao(entidade, {
    empresaId: "empresa-a",
    form,
    itensVenda: [],
    tiposPagamento: [],
    itensDespesa: [],
    itensMercadoria: [],
    discriminandoDespesa: false,
    discriminandoMercadoria: false,
    produtos: []
  });
}

describe("CREDORES_POR_CATEGORIA", () => {
  // FOTO 2 (PROJECT_BRAIN/14:83-87) + R-128.
  it("Deve_RefletirODesenhoVigente", () => {
    expect(CREDORES_POR_CATEGORIA.mercadoria).toEqual(["fornecedor"]);
    expect(CREDORES_POR_CATEGORIA.despesa).toEqual(["fornecedor", "colaborador"]);
    expect(CREDORES_POR_CATEGORIA.retirada).toEqual(["fornecedor", "socio_gestor"]);
  });

  it("Deve_NaoOferecerColaboradorEmMercadoria", () => {
    expect(CREDORES_POR_CATEGORIA.mercadoria).not.toContain("colaborador");
  });

  // R-128: colaborador saiu da retirada NOVA (segue no historico, pelo caminho do registro aberto).
  it("Deve_NaoOferecerColaboradorEmRetirada", () => {
    expect(CREDORES_POR_CATEGORIA.retirada).not.toContain("colaborador");
  });
});

describe("limparCredorIncompativel - estado do formulario", () => {
  it("Deve_ApagarColaboradorECredorTipo_Quando_DestinoEMercadoria", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });
    limparCredorIncompativel(form, "mercadoria");
    expect(form.colaboradorId).toBe("");
    expect(form.credorTipo).toBe("");
  });

  it("Deve_ApagarSocioGestor_Quando_DestinoEMercadoria", () => {
    const form = formCom({ socioGestorId: "socio-1", credorTipo: "socio_gestor" });
    limparCredorIncompativel(form, "mercadoria");
    expect(form.socioGestorId).toBe("");
    expect(form.credorTipo).toBe("");
  });

  it("Deve_ApagarSocioGestor_Quando_DestinoEDespesa", () => {
    const form = formCom({ socioGestorId: "socio-1", credorTipo: "socio_gestor" });
    limparCredorIncompativel(form, "despesa");
    expect(form.socioGestorId).toBe("");
    expect(form.credorTipo).toBe("");
  });

  it("Deve_ApagarColaborador_Quando_DestinoERetirada", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });
    limparCredorIncompativel(form, "retirada");
    expect(form.colaboradorId).toBe("");
    expect(form.credorTipo).toBe("");
  });

  it("Deve_PreservarFornecedor_Quando_DestinoERetirada", () => {
    const form = formCom({ fornecedorId: "fornecedor-1", credorTipo: "fornecedor" });
    limparCredorIncompativel(form, "retirada");
    expect(form.fornecedorId).toBe("fornecedor-1");
    expect(form.credorTipo).toBe("fornecedor");
  });

  it("Deve_PreservarColaborador_Quando_DestinoEDespesa", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });
    limparCredorIncompativel(form, "despesa");
    expect(form.colaboradorId).toBe("colaborador-1");
    expect(form.credorTipo).toBe("colaborador");
  });

  it("Deve_NaoTocarNaContaDoCaixa", () => {
    const form = formCom({ contaOrigemId: "conta-do-pdv", colaboradorId: "colaborador-1" });
    limparCredorIncompativel(form, "mercadoria");
    expect(form.contaOrigemId).toBe("conta-do-pdv");
  });

  it("Deve_NaoTocarEmEntidadeQueNaoTemCredorTipado", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });
    limparCredorIncompativel(form, "transferencia");
    expect(form.colaboradorId).toBe("colaborador-1");
    expect(form.credorTipo).toBe("colaborador");
  });
});

describe("limparCredorIncompativel - payload que sai para a API", () => {
  it("Deve_NaoEnviarColaborador_Quando_DespesaComColaboradorViraMercadoria", () => {
    const form = formCom({ fornecedorId: "", colaboradorId: "colaborador-1", credorTipo: "colaborador" });

    expect(payloadDe("mercadoria", form).colaboradorId).toBe("colaborador-1");

    limparCredorIncompativel(form, "mercadoria");
    form.fornecedorId = "fornecedor-1";
    form.credorTipo = "fornecedor";

    const payload = payloadDe("mercadoria", form);
    expect(payload.colaboradorId).toBeNull();
    expect(payload.socioGestorId).toBeNull();
    expect(payload.fornecedorId).toBe("fornecedor-1");
    expect(payload.credorTipo).toBe("fornecedor");
  });

  it("Deve_NaoEnviarSocioGestor_Quando_RetiradaComSocioViraDespesa", () => {
    const form = formCom({ socioGestorId: "socio-1", credorTipo: "socio_gestor" });
    limparCredorIncompativel(form, "despesa");

    const payload = payloadDe("despesa", form);
    expect(payload.socioGestorId).toBeNull();
    expect(payload.credorTipo).toBeNull();
  });

  it("Deve_NaoEnviarColaborador_Quando_DespesaComColaboradorViraRetirada", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });
    limparCredorIncompativel(form, "retirada");

    const payload = payloadDe("retirada", form);
    expect(payload.colaboradorId).toBeNull();
    expect(payload.credorTipo).toBeNull();
  });

  // Os dois casos acima NAO cobrem o `credorTipo` sem credor: `limparCredorIncompativel` ja zerou o
  // tipo antes do payload, entao `"" || null` daria `null` do mesmo jeito e a assercao passa com ou
  // sem a guarda. O estado que importa vem de OUTRO caminho — `escolherTipoCredor`, que grava o tipo
  // e zera os tres ids de proposito — e ali o tipo esta PREENCHIDO com todos os ids vazios.
  it("Deve_OmitirOCredorTipo_Quando_OChipFoiClicadoESemCredorEscolhido", () => {
    // Exatamente o que `escolherTipoCredor("fornecedor")` deixa no formulario.
    const form = formCom({ fornecedorId: "", colaboradorId: "", socioGestorId: "", credorTipo: "fornecedor" });

    // Na despesa o credor e OPCIONAL, entao clicar no chip e salvar sem escolher e caminho normal —
    // e `exigirCredorCoerenteDaDespesa` recusa `credorTipo` sem id com 400.
    expect(payloadDe("despesa", form).credorTipo).toBeNull();
  });

  it("Deve_ManterOCredorTipo_Quando_HaCredorEscolhido", () => {
    const form = formCom({ colaboradorId: "colaborador-1", credorTipo: "colaborador" });

    expect(payloadDe("despesa", form).credorTipo).toBe("colaborador");
  });
});
