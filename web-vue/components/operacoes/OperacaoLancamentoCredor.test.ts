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
import { contaTravadaDeCaixa } from "~/utils/perfil-caixa";
import type { PerfilUsuario } from "@padaria/shared";
import type { EntidadeOperacional, Opcao, OperacaoForm } from "~/types/padaria";

const CONTA_PDV = "conta-do-pdv";
const CONTA_BANCO = "conta-banco";
const CONTA_COFRE = "conta-cofre";

type Cenario = {
  contas?: Opcao[];
  /** Conta do PDV do caixa ABERTO. So vira trava se o PERFIL for operacional. */
  pdvContaId?: string;
  /** Nome do PDV, reserva quando a conta do caixa nao esta entre as contas vinculadas. */
  pdvNome?: string;
  /** Cargo real. "Caixa" = operador; "Financeiro"/"Tesouraria"/"Gerencia" = retaguarda. */
  cargo?: string;
  permissoes?: PerfilUsuario["permissoes"];
  categoria?: EntidadeOperacional;
  /** Preenchido = registro ABERTO para edicao. Muda o ramo do credor legado e o da conta. */
  editandoId?: string;
  form?: Partial<OperacaoForm>;
};

function conta(id: string, nome: string): Opcao {
  return { id, nome };
}

function perfilDe(cargo: string, permissoes: PerfilUsuario["permissoes"]): PerfilUsuario {
  return {
    usuarioId: "u",
    colaboradorId: "c",
    cargoIds: ["cargo"],
    cargos: [{ id: "cargo", nome: cargo }],
    role: "usuario_comum",
    nome: cargo,
    email: `${cargo}@teste.local`,
    permissoes
  };
}

function montarBloco(cenario: Cenario = {}) {
  const form = ref({ ...formOperacaoVazio(), ...cenario.form });
  const entidadeNova = ref<EntidadeOperacional>(cenario.categoria ?? "despesa");
  const modalOperacaoAberto = ref(true);
  const operacaoEditandoId = ref(cenario.editandoId ?? "");
  const contas = ref<Opcao[]>(cenario.contas ?? []);
  const pdvContaId = ref(cenario.pdvContaId ?? "");
  const pdvNome = ref(cenario.pdvNome ?? "PDV 01");

  const opcoesEmpresa = computed(() => ({ ...opcoesVazias(), contas: contas.value }));

  // A decisao "e operador?" vem da FUNCAO DE PRODUCAO que o AppWorkspace usa. O harness so escolhe o
  // perfil e o caixa; antes ele injetava `contaTravadaDoCaixa` pronta, e por isso um erro na regra
  // de perfil era invisivel para esta suite.
  const perfil = ref(perfilDe(cenario.cargo ?? "Caixa", cenario.permissoes ?? ["caixa_operar"]));
  const caixaAberto = computed(() => (pdvContaId.value ? { pdvContaId: pdvContaId.value } : null));
  const contaTravadaDoCaixa = computed(() => contaTravadaDeCaixa(perfil.value, caixaAberto.value));
  // Espelha AppWorkspace.vue:292-296 — inclusive a reserva pelo nome do PDV, que existe porque a
  // conta do caixa pode nao estar em `contas_usuarios` do operador.
  const contaTravadaDoCaixaNome = computed(() => {
    if (!contaTravadaDoCaixa.value) return "";
    const encontrada = opcoesEmpresa.value.contas.find((item) => item.id === contaTravadaDoCaixa.value);
    return encontrada?.nome ?? pdvNome.value ?? "Conta do caixa aberto";
  });

  // Espelha AppWorkspace.vue:1239-1249 na INTEGRA: depois da entrega, a funcao de producao so troca
  // a entidade e recarrega as opcoes (fronteira de rede, fora do teste). TODA a limpeza do
  // formulario — grupos e credor — vive no composable e e exercitada de verdade aqui. Enquanto o
  // harness repetia as limpezas, ele provava a si mesmo: reintroduzir a limpeza no AppWorkspace
  // deixava o teste verde.
  const trocarCategoriaLancamento = async (entidade: EntidadeOperacional) => {
    if (entidade === entidadeNova.value) return;
    entidadeNova.value = entidade;
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
  return { wrapper, form, entidadeNova, contas, pdvContaId, operacaoEditandoId, trocarCategoriaLancamento };
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
    expect(form.value.credorTipo).toBe("");
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
    expect(form.value.credorTipo).toBe("");
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

// R-128: o colaborador saiu da retirada NOVA, mas o registro ja GRAVADO com ele tem de reabrir
// inteiro — "a tela nao pode apagar o historico na cara do usuario". E o unico caminho em que a
// limpeza de credor pode destruir dado, entao ele e provado, e nao deduzido.
describe("B-04 - registro aberto para edicao preserva o credor legado (R-128)", () => {
  const RETIRADA_LEGADA = {
    editandoId: "retirada-antiga",
    categoria: "retirada" as const,
    form: { colaboradorId: "colaborador-1", credorTipo: "colaborador" as const }
  };

  it("Deve_OferecerOChipColaborador_Quando_RetiradaGravadaUsaColaborador", () => {
    const { wrapper } = montarBloco(RETIRADA_LEGADA);
    expect(chips(wrapper)).toEqual(["Fornecedor", "Sócio ou Gestor", "Colaborador"]);
  });

  it("Deve_ManterOColaboradorGravado_Quando_ORegistroAntigoEAberto", () => {
    const { form } = montarBloco(RETIRADA_LEGADA);
    expect(form.value.colaboradorId).toBe("colaborador-1");
    expect(form.value.credorTipo).toBe("colaborador");
  });

  // Lancamento NOVO nao ganha o chip de volta — e a diferenca entre o legado e o vazamento que a
  // troca de categoria causava.
  it("Deve_NaoOferecerOChipColaborador_Quando_ARetiradaENova", () => {
    const { wrapper } = montarBloco({
      categoria: "retirada",
      form: { colaboradorId: "colaborador-1", credorTipo: "colaborador" }
    });
    expect(chips(wrapper)).toEqual(["Fornecedor", "Sócio ou Gestor"]);
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

  // O PDV pode ter sido reapontado para outra conta DEPOIS do lancamento. Sobrescrever aqui movia o
  // registro de conta em silencio, e o servidor aprovaria — a conta nova E a do PDV atual. Quem
  // decide a edicao e a trava do servidor (403), nao a tela.
  it("Deve_PreservarAContaGravada_Quando_ORegistroEAbertoParaEdicao", async () => {
    const { form } = montarBloco({
      contas: [conta(CONTA_PDV, "Caixa PDV 01"), conta(CONTA_BANCO, "Banco")],
      pdvContaId: CONTA_PDV,
      editandoId: "despesa-antiga",
      form: { contaOrigemId: CONTA_BANCO }
    });
    await nextTick();
    expect(form.value.contaOrigemId).toBe(CONTA_BANCO);
  });

  // Retaguarda de verdade: cargo Financeiro, COM `caixa_operar` e COM caixa aberto. A regra antiga
  // da tela (`caixa_operar && !caixas_gerenciar`) travaria o campo para ele; a do servidor nao. Quem
  // responde aqui e a funcao de producao compartilhada.
  it("Deve_ManterOSeletorDeContas_Quando_PerfilEDeRetaguarda", async () => {
    const { wrapper, form } = montarBloco({
      contas: [conta(CONTA_BANCO, "Banco"), conta(CONTA_COFRE, "Cofre")],
      cargo: "Financeiro",
      permissoes: ["caixa_operar"],
      pdvContaId: CONTA_PDV
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

  // Quem ESCOLHE a conta e realmente nao tem nenhuma vinculada continua recebendo o aviso — ele nao
  // pode sumir junto com o falso.
  it("Deve_AvisarSemContaVinculada_Quando_RetaguardaNaoTemContas", () => {
    const { wrapper } = montarBloco({
      contas: [],
      cargo: "Tesouraria",
      permissoes: ["caixa_operar"],
      pdvContaId: CONTA_PDV
    });

    const campo = campoConta(wrapper);
    expect(campo.find(".lc-aviso-contas").exists()).toBe(true);
    expect(campo.text()).toContain("Nenhuma conta vinculada");
    expect(campo.find("select").exists()).toBe(false);
  });
});
