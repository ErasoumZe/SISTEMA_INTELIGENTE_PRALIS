// CX-M06 — B-04 (credor conforme a categoria) e B-05 (conta do operador de Caixa, R-121).
//
// Primeiro teste de COMPONENTE da base: monta o `OperacaoLancamentoCredor.vue` real com o
// `useOperacaoLancamento` real. A unica fronteira simulada e o `provide` do AppWorkspace — que e
// um SFC de 2137 linhas preso a `useState`/`useRouter`/~30 chamadas de API e nao monta em teste.
// O contexto e montado com refs/computeds REAIS, espelhando `AppWorkspace.vue:283-296` e
// `:1239-1252`; nada de stub da funcao que esta sendo provada.
import { computed, defineComponent, h, nextTick, provide, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { WORKSPACE_CONTEXT } from "~/components/workspace/workspace-context";
import { OPERACAO_LANCAMENTO_KEY, useOperacaoLancamento } from "~/components/operacoes/useOperacaoLancamento";
import OperacaoLancamentoCredor from "~/components/operacoes/OperacaoLancamentoCredor.vue";
import { formOperacaoVazio, opcoesVazias } from "~/utils/domain";
import { estadoRecorrenciaVazio, itemDespesaVazio, itemMercadoriaVazio } from "~/utils/operacoes";
import type { EntidadeOperacional, Opcao } from "~/types/padaria";

const CONTA_PDV = "conta-do-pdv";
const CONTA_BANCO = "conta-banco";
const CONTA_COFRE = "conta-cofre";

type Cenario = {
  contas?: Opcao[];
  /** "" = perfil de retaguarda (escolhe a conta); preenchido = operador com caixa aberto. */
  pdvContaId?: string;
  /** Nome do PDV, reserva quando a conta do caixa nao esta entre as contas vinculadas. */
  pdvNome?: string;
  categoria?: EntidadeOperacional;
};

function conta(id: string, nome: string): Opcao {
  return { id, nome };
}

function montarBloco(cenario: Cenario = {}) {
  const form = ref(formOperacaoVazio());
  const entidadeNova = ref<EntidadeOperacional>(cenario.categoria ?? "despesa");
  const modalOperacaoAberto = ref(true);
  const operacaoEditandoId = ref("");
  const contas = ref<Opcao[]>(cenario.contas ?? []);
  const pdvContaId = ref(cenario.pdvContaId ?? "");
  const pdvNome = ref(cenario.pdvNome ?? "PDV 01");

  const opcoesEmpresa = computed(() => ({ ...opcoesVazias(), contas: contas.value }));

  // Espelha AppWorkspace.vue:288 e :292-296 — inclusive a reserva pelo nome do PDV, que existe
  // porque a conta do caixa pode nao estar em `contas_usuarios` do operador.
  const contaTravadaDoCaixa = computed(() => pdvContaId.value);
  const contaTravadaDoCaixaNome = computed(() => {
    if (!contaTravadaDoCaixa.value) return "";
    const encontrada = opcoesEmpresa.value.contas.find((item) => item.id === contaTravadaDoCaixa.value);
    return encontrada?.nome ?? pdvNome.value ?? "Conta do caixa aberto";
  });

  // Espelha AppWorkspace.vue:1239-1252 — SEM a limpeza de credor, que e do composable. Se o
  // harness limpasse aqui, o teste provaria o proprio harness em vez do codigo de producao.
  const trocarCategoriaLancamento = async (entidade: EntidadeOperacional) => {
    if (entidade === entidadeNova.value) return;
    entidadeNova.value = entidade;
    form.value.grupoDespesaId = "";
    form.value.grupoMercadoriaId = "";
    form.value.grupoRetiradaId = "";
  };

  const contexto = {
    opcoesEmpresa,
    empresaId: ref("empresa-a"),
    modalOperacaoAberto,
    entidadeNova,
    trocarCategoriaLancamento,
    operacaoEditandoId,
    modoDiscriminacao: ref(false),
    form,
    discriminandoDespesa: ref(false),
    discriminandoMercadoria: ref(false),
    valorTotalOperacao: computed(() => 0),
    itensVenda: ref([]),
    tiposPagamento: ref([]),
    itensDespesa: ref([itemDespesaVazio()]),
    itensMercadoria: ref([itemMercadoriaVazio()]),
    erroDiscriminacaoLinha: ref(null),
    erroDiscriminacaoCampo: ref(null),
    salvandoOperacao: ref(false),
    salvarOperacao: async () => undefined,
    contaTravadaDoCaixa,
    contaTravadaDoCaixaNome,
    podeUsarRecorrencia: computed(() => false),
    recorrencia: ref(estadoRecorrenciaVazio()),
    fotoDocumentoPreview: ref(""),
    fotoDocumentoExistente: ref(false),
    selecionarFotoDocumento: () => undefined,
    fotoNotaPreview: ref(""),
    fotoNotaExistente: ref(false),
    selecionarFotoNota: () => undefined
    // O restante do WorkspaceContext (cadastro/tema/copia) nao e alcancavel por este bloco e por
    // isso fica de fora: `provide` aceita o que o bloco realmente consome, sem assercao de tipo.
  };

  // Tres niveis, como na aplicacao real: AppWorkspace PROVE o contexto → OperacaoLancamentoModal
  // chama o composable uma vez e PROVE o bloco → os blocos INJETAM. `inject` resolve no pai, entao
  // prover e injetar no mesmo componente nao funciona.
  const Modal = defineComponent({
    setup() {
      provide(OPERACAO_LANCAMENTO_KEY, useOperacaoLancamento());
      return () => h(OperacaoLancamentoCredor);
    }
  });

  const Workspace = defineComponent({
    setup() {
      provide(WORKSPACE_CONTEXT, contexto);
      return () => h(Modal);
    }
  });

  const wrapper = mount(Workspace, { global: { stubs: { "v-icon": true } } });
  return { wrapper, form, entidadeNova, contas, pdvContaId, trocarCategoriaLancamento };
}

/** O bloco do campo "Conta" — isola das demais `.lc-campo` (Credor, Grupo, Observacao). */
function campoConta(wrapper: ReturnType<typeof montarBloco>["wrapper"]) {
  const campo = wrapper.findAll(".lc-campo").find((item) => item.find(".lc-campo-lbl").text() === "Conta");
  if (!campo) throw new Error("Campo Conta nao renderizado");
  return campo;
}

function chips(wrapper: ReturnType<typeof montarBloco>["wrapper"]) {
  return wrapper.findAll(".lc-chip").map((item) => item.text());
}

// ===== B-04 — credor conforme a categoria ====================================================

describe("B-04 - o credor oferecido segue a categoria", () => {
  it("Deve_OferecerSomenteFornecedor_Quando_CategoriaEMercadoria", () => {
    const { wrapper } = montarBloco({ categoria: "mercadoria" });
    expect(chips(wrapper)).toEqual(["Fornecedor"]);
    expect(wrapper.text()).not.toContain("Colaborador");
  });

  it("Deve_ManterFornecedorEColaborador_Quando_CategoriaEDespesa", () => {
    const { wrapper } = montarBloco({ categoria: "despesa" });
    expect(chips(wrapper)).toEqual(["Fornecedor", "Colaborador"]);
  });

  // R-128: a retirada e Fornecedor ou Socio/Gestor. Colaborador nao entra em lancamento novo.
  it("Deve_ManterFornecedorESocioGestor_Quando_CategoriaERetirada", () => {
    const { wrapper } = montarBloco({ categoria: "retirada" });
    expect(chips(wrapper)).toEqual(["Fornecedor", "Sócio ou Gestor"]);
  });
});

describe("B-04 - trocar a categoria nao deixa credor incompativel para tras", () => {
  it("Deve_NaoRessuscitarColaborador_Quando_DespesaComColaboradorVaiParaMercadoria", async () => {
    const { wrapper, form, trocarCategoriaLancamento } = montarBloco({ categoria: "despesa" });

    const chipColaborador = wrapper.findAll(".lc-chip").find((item) => item.text() === "Colaborador");
    await chipColaborador!.trigger("click");
    form.value.colaboradorId = "colaborador-1";
    await nextTick();
    expect(form.value.credorTipo).toBe("colaborador");

    await trocarCategoriaLancamento("mercadoria");
    await nextTick();

    // O chip legado so existe para REGISTRO ABERTO em edicao (R-128); num lancamento novo a
    // mercadoria nao pode ganhar Colaborador de volta.
    expect(chips(wrapper)).toEqual(["Fornecedor"]);
    expect(form.value.colaboradorId).toBe("");
    expect(form.value.credorTipo).not.toBe("colaborador");
  });

  it("Deve_LimparColaborador_Quando_DespesaComColaboradorVaiParaRetirada", async () => {
    const { wrapper, form, trocarCategoriaLancamento } = montarBloco({ categoria: "despesa" });

    const chipColaborador = wrapper.findAll(".lc-chip").find((item) => item.text() === "Colaborador");
    await chipColaborador!.trigger("click");
    form.value.colaboradorId = "colaborador-1";

    await trocarCategoriaLancamento("retirada");
    await nextTick();

    // Sem isto o front salva uma retirada NOVA com colaborador — o servidor aceita (o superRefine
    // conta um credor so) e a R-128 e violada no banco.
    expect(form.value.colaboradorId).toBe("");
    expect(form.value.credorTipo).not.toBe("colaborador");
    expect(chips(wrapper)).toEqual(["Fornecedor", "Sócio ou Gestor"]);
  });

  it("Deve_LimparSocioGestor_Quando_RetiradaComSocioVaiParaMercadoria", async () => {
    const { wrapper, form, trocarCategoriaLancamento } = montarBloco({ categoria: "retirada" });

    const chipSocio = wrapper.findAll(".lc-chip").find((item) => item.text() === "Sócio ou Gestor");
    await chipSocio!.trigger("click");
    form.value.socioGestorId = "socio-1";

    await trocarCategoriaLancamento("mercadoria");
    await nextTick();

    expect(form.value.socioGestorId).toBe("");
    expect(chips(wrapper)).toEqual(["Fornecedor"]);
  });

  // R-128 tornou o fornecedor um credor legitimo da retirada: trocar para retirada nao pode mais
  // apagar o fornecedor ja escolhido.
  it("Deve_PreservarFornecedor_Quando_DespesaComFornecedorVaiParaRetirada", async () => {
    const { form, trocarCategoriaLancamento } = montarBloco({ categoria: "despesa" });
    form.value.fornecedorId = "fornecedor-1";
    form.value.credorTipo = "fornecedor";

    await trocarCategoriaLancamento("retirada");
    await nextTick();

    expect(form.value.fornecedorId).toBe("fornecedor-1");
    expect(form.value.credorTipo).toBe("fornecedor");
  });
});

// ===== B-05 — conta do operador de Caixa (R-121) ==============================================

describe("B-05 - a conta do operador vem do PDV, travada", () => {
  it("Deve_MostrarSomenteAContaDoPdvComoLeitura_Quando_OperadorTemVariasContas", () => {
    const { wrapper } = montarBloco({
      contas: [conta(CONTA_PDV, "Caixa PDV 01"), conta(CONTA_BANCO, "Banco"), conta(CONTA_COFRE, "Cofre")],
      pdvContaId: CONTA_PDV
    });

    const campo = campoConta(wrapper);
    const travado = campo.find('input[aria-label="Conta"]');
    expect(travado.exists()).toBe(true);
    expect(travado.attributes("readonly")).toBeDefined();
    expect((travado.element as HTMLInputElement).value).toBe("Caixa PDV 01");
    // Sem seletor: o operador nao ESCOLHE a conta.
    expect(campo.find("select").exists()).toBe(false);
    expect(campo.text()).not.toContain("Banco");
    expect(campo.text()).not.toContain("Cofre");
  });

  // O caso que quebra hoje: R-071 deixa o operador sem nenhuma conta vinculada, e o aviso de lista
  // vazia vence o ramo da conta travada.
  it("Deve_MostrarAContaTravadaSemAvisoFalso_Quando_ContasEstaVazio", () => {
    const { wrapper } = montarBloco({ contas: [], pdvContaId: CONTA_PDV, pdvNome: "PDV 01" });

    const campo = campoConta(wrapper);
    expect(campo.find(".lc-aviso-contas").exists()).toBe(false);
    expect(campo.text()).not.toContain("Nenhuma conta vinculada");

    const travado = campo.find('input[aria-label="Conta"]');
    expect(travado.exists()).toBe(true);
    expect(travado.attributes("readonly")).toBeDefined();
    expect((travado.element as HTMLInputElement).value).toBe("PDV 01");
    expect(campo.find("select").exists()).toBe(false);
  });

  it("Deve_MostrarAContaTravada_Quando_ContasNaoContemAContaDoPdv", () => {
    const { wrapper } = montarBloco({
      contas: [conta(CONTA_BANCO, "Banco")],
      pdvContaId: CONTA_PDV,
      pdvNome: "PDV 01"
    });

    const campo = campoConta(wrapper);
    expect(campo.find(".lc-aviso-contas").exists()).toBe(false);
    expect((campo.find('input[aria-label="Conta"]').element as HTMLInputElement).value).toBe("PDV 01");
    expect(campo.find("select").exists()).toBe(false);
  });

  it("Deve_PreencherOFormulario_Quando_EstadoDoCaixaChegaDepoisDaMontagem", async () => {
    const { wrapper, form, pdvContaId, contas } = montarBloco({ contas: [], pdvContaId: "" });
    expect(form.value.contaOrigemId).toBe("");

    // /api/caixa/status responde depois do primeiro render.
    contas.value = [];
    pdvContaId.value = CONTA_PDV;
    await nextTick();

    expect(form.value.contaOrigemId).toBe(CONTA_PDV);
    expect(campoConta(wrapper).find('input[aria-label="Conta"]').exists()).toBe(true);
  });

  // AppWorkspace.vue:1137 troca o `form` inteiro por um vazio quando o "+ NOVO" reabre o modal ja
  // aberto em outra categoria: a conta travada precisa voltar sozinha.
  it("Deve_ReporAContaTravada_Quando_OFormularioEReiniciado", async () => {
    const { form } = montarBloco({ contas: [], pdvContaId: CONTA_PDV });
    expect(form.value.contaOrigemId).toBe(CONTA_PDV);

    form.value = formOperacaoVazio();
    await nextTick();

    expect(form.value.contaOrigemId).toBe(CONTA_PDV);
  });

  it("Deve_ManterAContaTravada_Quando_ACategoriaMuda", async () => {
    const { form, trocarCategoriaLancamento } = montarBloco({
      contas: [conta(CONTA_PDV, "Caixa PDV 01")],
      pdvContaId: CONTA_PDV,
      categoria: "despesa"
    });
    expect(form.value.contaOrigemId).toBe(CONTA_PDV);

    await trocarCategoriaLancamento("mercadoria");
    await nextTick();
    expect(form.value.contaOrigemId).toBe(CONTA_PDV);

    await trocarCategoriaLancamento("retirada");
    await nextTick();
    expect(form.value.contaOrigemId).toBe(CONTA_PDV);
  });

  it("Deve_ManterOSeletorDeContas_Quando_PerfilEDeRetaguarda", async () => {
    const { wrapper, form } = montarBloco({
      contas: [conta(CONTA_BANCO, "Banco"), conta(CONTA_COFRE, "Cofre")],
      pdvContaId: ""
    });

    const campo = campoConta(wrapper);
    const seletor = campo.find("select");
    expect(seletor.exists()).toBe(true);
    expect(campo.find('input[aria-label="Conta"]').exists()).toBe(false);
    expect(campo.text()).toContain("Banco");
    expect(campo.text()).toContain("Cofre");

    await seletor.setValue(CONTA_COFRE);
    expect(form.value.contaOrigemId).toBe(CONTA_COFRE);
  });

  // Retaguarda REALMENTE sem conta vinculada continua recebendo o aviso — ele nao pode sumir.
  it("Deve_AvisarSemContaVinculada_Quando_RetaguardaNaoTemContas", () => {
    const { wrapper } = montarBloco({ contas: [], pdvContaId: "" });

    const campo = campoConta(wrapper);
    expect(campo.find(".lc-aviso-contas").exists()).toBe(true);
    expect(campo.text()).toContain("Nenhuma conta vinculada");
    expect(campo.find("select").exists()).toBe(false);
  });
});
