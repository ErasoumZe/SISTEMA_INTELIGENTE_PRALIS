// CX-M06 — o fio REAL de abrir e salvar um lancamento.
//
// Substitui o teste que dizia exercitar "a ordem assincrona real" e so mexia em refs a mao: ele
// escrevia o resultado que a transformacao do detalhe deveria produzir, escolhia a ordem correta de
// abertura e nunca montava o PUT. Quatro mutacoes de producao passavam verdes.
//
// Aqui a unica coisa simulada e a FRONTEIRA HTTP (`api.get`/`api.put`). Reset do formulario,
// transformacao do detalhe, preenchimento, ordem de abertura e montagem da requisicao sao codigo de
// producao — o mesmo que o AppWorkspace chama.
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { criarAcoesLancamento, type DepsLancamento } from "~/utils/lancamento-acoes";
import { formOperacaoVazio } from "~/utils/domain";
import {
  estadoRecorrenciaVazio,
  itemDespesaVazio,
  itemMercadoriaVazio,
  type ItemVendaForm,
  type OperacaoDetalhe,
  type TipoPagamentoForm
} from "~/utils/operacoes";
// Mapa REAL de rotas: reimplementa-lo aqui faria o teste provar a propria copia.
import { endpointOperacaoPorEntidade } from "~/utils/domain";
import type { Recorrencia } from "@padaria/shared/recorrencia";
import type { EntidadeOperacional } from "~/types/padaria";

/** Corpo que sai para a API — so os campos que estes casos afirmam. */
type CorpoLancamento = {
  colaboradorId: string | null;
  fornecedorId: string | null;
  socioGestorId: string | null;
  contaOrigemId: string | null;
  recorrencia?: Recorrencia;
};
type ChamadaApi = { rota: string; corpo: CorpoLancamento };

/** Detalhe como a API devolve — e nao como o formulario o guarda. E o que a transformacao converte. */
function detalheDeRetiradaLegada(): OperacaoDetalhe {
  return {
    id: "retirada-antiga",
    dataReferencia: "2026-08-01",
    dataVencimento: "2026-08-01",
    dataPagamento: null,
    descricao: "Retirada historica",
    observacao: null,
    valorOriginal: 25,
    valorAcrescimo: 0,
    valorDesconto: 0,
    contaOrigemId: "conta-banco",
    colaboradorId: "colaborador-1",
    // O registro do historico tem `credor_tipo` NULO — quem responde pelo tipo e o id preenchido.
    credorTipo: null,
    grupoRetiradaId: "grupo-1",
    computar: true
  };
}

function montarFio(over: Partial<DepsLancamento> = {}) {
  const refs = {
    form: ref(formOperacaoVazio()),
    entidadeNova: ref<EntidadeOperacional>("despesa"),
    operacaoEditandoId: ref(""),
    modalOperacaoAberto: ref(false),
    discriminandoDespesa: ref(false),
    discriminandoMercadoria: ref(false),
    itensVenda: ref<ItemVendaForm[]>([]),
    tiposPagamento: ref<TipoPagamentoForm[]>([]),
    itensDespesa: ref([itemDespesaVazio()]),
    itensMercadoria: ref([itemMercadoriaVazio()]),
    recorrencia: ref(estadoRecorrenciaVazio())
  };

  // Registra a ordem real dos efeitos: e o que prova que o modal abre DEPOIS do preenchimento.
  const ordem: string[] = [];
  // As chamadas ficam em arrays TIPADOS: ler `mock.calls` exigiria cast, e o corpo do PUT e
  // justamente o que estes testes precisam afirmar campo a campo.
  const puts: ChamadaApi[] = [];
  const posts: ChamadaApi[] = [];
  // `vi.fn()` sem implementacao tipada e o que casa com o port generico do fio — mesmo padrao de
  // `caixa-acoes.test.ts`. A captura tipada fica nos arrays acima.
  const api = {
    get: vi.fn().mockImplementation(async () => {
      ordem.push("get");
      return detalheDeRetiradaLegada();
    }),
    post: vi.fn().mockImplementation(async (rota: string, corpo: CorpoLancamento) => {
      posts.push({ rota, corpo });
      return { id: "novo", computar: true };
    }),
    put: vi.fn().mockImplementation(async (rota: string, corpo: CorpoLancamento) => {
      puts.push({ rota, corpo });
      return { id: "retirada-antiga", computar: true };
    })
  };

  const deps: DepsLancamento = {
    api,
    refs,
    rotaDaEntidade: (entidade) => endpointOperacaoPorEntidade[entidade],
    empresaId: () => "empresa-a",
    contaTravadaDoCaixa: () => "",
    produtos: () => [],
    // Uma serie de verdade: com `undefined` os dois ramos (novo e edicao) produziam payload sem
    // `recorrencia`, e a assercao de que a edicao NAO regenera a serie nao provava nada.
    recorrencia: () => ({ frequencia: "mes", repeticoes: 12 }),
    carregarOpcoes: vi.fn(async () => {
      ordem.push("opcoes");
    }),
    limparFotos: vi.fn(() => {
      ordem.push("limpar");
    }),
    notificar: vi.fn(),
    ...over
  };

  // O modal so entra na ordem quando de fato abre.
  const acoes = criarAcoesLancamento(deps);
  return { acoes, refs, deps, api, ordem, puts, posts };
}

describe("abrirLancamento - a ordem real", () => {
  it("Deve_AbrirOModalSomenteDepoisDoPreenchimento", async () => {
    const { acoes, refs, ordem } = montarFio();

    const promessa = acoes.abrirLancamento("retirada", "retirada-antiga");
    // Enquanto o GET nao resolveu, o modal continua FECHADO.
    expect(refs.modalOperacaoAberto.value).toBe(false);
    await promessa;

    expect(ordem).toEqual(["limpar", "opcoes", "get"]);
    expect(refs.modalOperacaoAberto.value).toBe(true);
  });

  it("Deve_ResetarOFormularioAntesDeBuscarODetalhe", async () => {
    const { acoes, refs, api } = montarFio();
    refs.form.value = { ...formOperacaoVazio(), descricao: "sujeira do lancamento anterior" };
    refs.discriminandoDespesa.value = true;

    api.get.mockImplementation(async () => {
      // No instante do GET o formulario ja tem de estar limpo.
      expect(refs.form.value.descricao).toBe("");
      expect(refs.discriminandoDespesa.value).toBe(false);
      return detalheDeRetiradaLegada();
    });

    await acoes.abrirLancamento("retirada", "retirada-antiga");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("Deve_PreencherPelaTransformacaoDeProducao_Quando_ODetalheChega", async () => {
    const { acoes, refs } = montarFio();

    await acoes.abrirLancamento("retirada", "retirada-antiga");

    // Nada aqui foi escrito pelo teste: veio de `formOperacaoDeDetalhe`.
    expect(refs.form.value.colaboradorId).toBe("colaborador-1");
    expect(refs.form.value.contaOrigemId).toBe("conta-banco");
    expect(refs.form.value.valorOriginal).toBe("25");
    // R-127: sem `observacao` gravada, o campo cai na `descricao` — senao salvar apagaria o texto.
    expect(refs.form.value.observacao).toBe("Retirada historica");
    expect(refs.operacaoEditandoId.value).toBe("retirada-antiga");
  });

  it("Deve_BuscarNaRotaDaEntidade", async () => {
    const { acoes, api } = montarFio();
    await acoes.abrirLancamento("retirada", "retirada-antiga");
    expect(api.get).toHaveBeenCalledWith("/api/retiradas/retirada-antiga");
  });

  it("Deve_NaoAbrirOModal_Quando_ODetalheFalha", async () => {
    const { acoes, refs, api } = montarFio();
    api.get.mockRejectedValue(new Error("500"));

    await expect(acoes.abrirLancamento("retirada", "retirada-antiga")).rejects.toThrow();
    expect(refs.modalOperacaoAberto.value).toBe(false);
  });

  it("Deve_AbrirSemBuscarDetalhe_Quando_OLancamentoENovo", async () => {
    const { acoes, refs, api } = montarFio();
    await acoes.abrirLancamento("despesa");
    expect(api.get).not.toHaveBeenCalled();
    expect(refs.operacaoEditandoId.value).toBe("");
    expect(refs.modalOperacaoAberto.value).toBe(true);
  });
});

describe("enviarLancamento - a requisicao que sai", () => {
  it("Deve_MandarPutComOCredorLegadoIntacto_Quando_ORegistroEstaEmEdicao", async () => {
    const { acoes, api, puts, posts } = montarFio();
    await acoes.abrirLancamento("retirada", "retirada-antiga");

    const enviada = await acoes.enviarLancamento();

    expect(api.post).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
    expect(puts).toHaveLength(1);
    const chamada = puts[0]!;
    expect(chamada.rota).toBe("/api/retiradas/retirada-antiga");
    // O payload do legado: so o colaborador gravado, e nenhum outro credor junto.
    expect(chamada.corpo.colaboradorId).toBe("colaborador-1");
    expect(chamada.corpo.fornecedorId).toBeNull();
    expect(chamada.corpo.socioGestorId).toBeNull();
    expect(chamada.corpo.contaOrigemId).toBe("conta-banco");
    // Recorrencia NAO vai na edicao: editar um lancamento da serie nao regenera a serie.
    expect(chamada.corpo.recorrencia).toBeUndefined();
    expect(enviada?.editandoId).toBe("retirada-antiga");
  });

  // R-122: a conta GRAVADA nao e mais a do PDV aberto → o servidor devolve 403 com certeza. A tela
  // ja exibia o aviso sob o campo travado, mas deixava preencher tudo para tomar a recusa no fim.
  it("Deve_BarrarAntesDeEnviar_Quando_AContaGravadaNaoEADoCaixa", async () => {
    const { acoes, refs, api, deps } = montarFio({ contaTravadaDoCaixa: () => "conta-do-pdv" });
    await acoes.abrirLancamento("retirada", "retirada-antiga"); // detalhe traz `conta-banco`
    refs.form.value.observacao = "Corrigindo o valor";

    expect(await acoes.enviarLancamento()).toBeNull();

    expect(api.put).not.toHaveBeenCalled();
    expect(deps.notificar).toHaveBeenCalledWith(expect.stringContaining("Tesouraria"), "error");
  });

  // ...e o contraste: mesma conta, o envio segue normal. Sem ele, a guarda acima poderia barrar TUDO.
  it("Deve_Enviar_Quando_AContaGravadaEADoCaixa", async () => {
    const { acoes, refs, puts } = montarFio({ contaTravadaDoCaixa: () => "conta-banco" });
    await acoes.abrirLancamento("retirada", "retirada-antiga");
    refs.form.value.observacao = "Corrigindo o valor";

    await acoes.enviarLancamento();

    expect(puts).toHaveLength(1);
  });

  it("Deve_MandarPostSemId_Quando_OLancamentoENovo", async () => {
    const { acoes, refs, api, posts } = montarFio();
    await acoes.abrirLancamento("retirada");
    refs.form.value.observacao = "Retirada nova";
    refs.form.value.fornecedorId = "fornecedor-1";
    refs.form.value.credorTipo = "fornecedor";
    refs.form.value.valorOriginal = "10";

    await acoes.enviarLancamento();

    expect(api.put).not.toHaveBeenCalled();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.rota).toBe("/api/retiradas");
    // Na CRIACAO a serie VAI junto — e o contraste que torna a assercao do PUT significativa.
    expect(posts[0]!.corpo.recorrencia).toEqual({ frequencia: "mes", repeticoes: 12 });
  });

  // O reset dos auxiliares mora no fio justamente para ter esta prova: enquanto era closure do
  // AppWorkspace, apagar o reset da recorrencia deixava a suite inteira verde — e o efeito e criar
  // uma segunda serie de 12 sem o usuario perceber.
  it("Deve_ZerarRecorrenciaEItens_Quando_OModalEReaberto", async () => {
    const { acoes, refs } = montarFio();
    refs.recorrencia.value = { aberta: true, numero: "12", frequencia: "mes", dias: [true, false] };
    refs.itensDespesa.value = [itemDespesaVazio(), itemDespesaVazio(), itemDespesaVazio()];
    refs.itensVenda.value = [
      { descricaoProduto: "sujeira", quantidade: "3", valorUnitario: "9", valorTotal: "27", produtoId: "p1" }
    ];

    await acoes.abrirLancamento("despesa");

    expect(refs.recorrencia.value).toEqual(estadoRecorrenciaVazio());
    expect(refs.itensDespesa.value).toHaveLength(1);
    expect(refs.itensVenda.value).toHaveLength(1);
    expect(refs.itensVenda.value[0]!.descricaoProduto).toBe("");
  });

  it("Deve_NaoEnviar_Quando_APreValidacaoBarra", async () => {
    const { acoes, refs, api, deps } = montarFio();
    // Mercadoria COM texto e SEM fornecedor: a pre-validacao de producao recusa antes da rede. O
    // texto e preenchido de proposito, para a recusa ser a do fornecedor e nao a da observacao.
    await acoes.abrirLancamento("mercadoria");
    refs.form.value.observacao = "Mercadoria sem credor";

    const enviada = await acoes.enviarLancamento();

    expect(enviada).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(deps.notificar).toHaveBeenCalledWith(expect.stringContaining("fornecedor"), "error");
  });
});
