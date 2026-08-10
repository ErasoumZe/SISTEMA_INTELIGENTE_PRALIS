// Fio de ABRIR e SALVAR um lancamento, extraido do AppWorkspace por INJECAO DE DEPENDENCIA
// (ADR-005, mesmo padrao de `caixa-acoes.ts`): a factory recebe um port de API e os refs, entao roda
// com fakes, sem runtime Nuxt. O componente injeta o real.
//
// Existe porque a ORDEM aqui e a regra, e ela nao tinha prova: reset do formulario → opcoes →
// GET do detalhe → transformacao → preenchimento → e SO ENTAO abrir o modal. O teste anterior
// mexia nos refs a mao e chamava `montarPayloadOperacao` por conta propria, entao passava verde com
// o modal abrindo antes do preenchimento, com o reset removido ou com o PUT virando POST.
import type { DadosExternos } from "@padaria/shared";
import type { Recorrencia } from "@padaria/shared/recorrencia";
import type { Ref } from "vue";
import type { EntidadeOperacional, Opcao, OperacaoForm } from "~/types/padaria";
import {
  estadoRecorrenciaVazio,
  formOperacaoDeDetalhe,
  itemDespesaVazio,
  itemMercadoriaVazio,
  montarPayloadOperacao,
  validarOperacaoParaEnvio,
  type EstadoRecorrencia,
  type ItemDespesaForm,
  type ItemMercadoriaForm,
  type ItemVendaForm,
  type OperacaoDetalhe,
  type TipoPagamentoForm
} from "~/utils/operacoes";
import { formOperacaoVazio } from "~/utils/domain";

/** O que as quatro rotas de lancamento devolvem no salvar. */
export type OperacaoSalva = { id: string; computar: boolean; serie?: number; serieLimitada?: boolean };

type PortApi = {
  get: <T>(rota: string) => Promise<T>;
  post: <T>(rota: string, body: DadosExternos) => Promise<T>;
  put: <T>(rota: string, body: DadosExternos) => Promise<T>;
};

/** Os refs que o fio escreve. Mesma variante de `tema-acoes.ts`, que tambem recebe refs direto. */
export type RefsLancamento = {
  form: Ref<OperacaoForm>;
  entidadeNova: Ref<EntidadeOperacional>;
  operacaoEditandoId: Ref<string>;
  modalOperacaoAberto: Ref<boolean>;
  discriminandoDespesa: Ref<boolean>;
  discriminandoMercadoria: Ref<boolean>;
  itensVenda: Ref<ItemVendaForm[]>;
  tiposPagamento: Ref<TipoPagamentoForm[]>;
  itensDespesa: Ref<ItemDespesaForm[]>;
  itensMercadoria: Ref<ItemMercadoriaForm[]>;
  recorrencia: Ref<EstadoRecorrencia>;
};

export type DepsLancamento = {
  api: PortApi;
  refs: RefsLancamento;
  /** `despesas` | `mercadorias` | ... — o mapa vive em `utils/domain`. */
  rotaDaEntidade: (entidade: EntidadeOperacional) => string;
  empresaId: () => string;
  /** R-121: conta do PDV do caixa aberto quando quem lanca e operador; "" para retaguarda. */
  contaTravadaDoCaixa: () => string;
  produtos: () => Opcao[];
  /** Ja no formato do payload (`montarRecorrencia`), nao o estado da tela. */
  recorrencia: () => Recorrencia | undefined;
  /** Carga das listas do formulario. Fica fora do fio: e outra fronteira de rede, ja testada. */
  carregarOpcoes: (entidade: EntidadeOperacional) => Promise<void>;
  /** So as FOTOS, que sao composables e nao refs. Todo o resto do reset vive no fio, e e testado. */
  limparFotos: () => void;
  notificar: (mensagem: string, tipo?: string) => void;
};

export function criarAcoesLancamento(deps: DepsLancamento) {
  const { refs } = deps;

  /**
   * Escreve no formulario o que o detalhe traz. E a cola que vivia inline no AppWorkspace: MERGE (e
   * nao substituicao) para nao apagar o que a tela ja tinha, e itens atribuidos SO quando o detalhe
   * os traz — senao o registro nao discriminado perderia as linhas em branco padrao.
   */
  function aplicarDetalhe(entidade: EntidadeOperacional, detalhe: OperacaoDetalhe) {
    const preenchido = formOperacaoDeDetalhe(entidade, detalhe);
    refs.form.value = { ...refs.form.value, ...preenchido.form };
    refs.discriminandoDespesa.value = preenchido.discriminandoDespesa;
    refs.discriminandoMercadoria.value = preenchido.discriminandoMercadoria;
    if (preenchido.itensVenda) refs.itensVenda.value = preenchido.itensVenda;
    if (preenchido.tiposPagamento) refs.tiposPagamento.value = preenchido.tiposPagamento;
    if (preenchido.itensDespesa) refs.itensDespesa.value = preenchido.itensDespesa;
    if (preenchido.itensMercadoria) refs.itensMercadoria.value = preenchido.itensMercadoria;
  }

  /**
   * Abre o modal de lancamento — novo ou em edicao.
   *
   * O modal e a ULTIMA coisa: abrir antes do preenchimento faz a tela piscar com o formulario vazio
   * e, no caso do operador, renderizar o campo Conta antes de a conta gravada chegar. Erro no GET
   * NAO abre o modal: e melhor nao abrir do que abrir mentindo.
   */
  async function abrirLancamento(entidade: EntidadeOperacional, id?: string): Promise<OperacaoDetalhe | null> {
    refs.entidadeNova.value = entidade;
    refs.operacaoEditandoId.value = id ?? "";
    refs.form.value = formOperacaoVazio();
    // As flags saem do reset, e nao so de `aplicarDetalhe`: um lancamento NOVO nunca chama
    // `aplicarDetalhe`, e sem zerar aqui ele herdaria a discriminacao do registro anterior.
    refs.discriminandoDespesa.value = false;
    refs.discriminandoMercadoria.value = false;
    refs.itensVenda.value = [
      { descricaoProduto: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "" }
    ];
    refs.tiposPagamento.value = [{ formaPagamentoId: "", totalPago: "", numeroVendas: "1" }];
    refs.itensDespesa.value = [itemDespesaVazio()];
    refs.itensMercadoria.value = [itemMercadoriaVazio()];
    // Recorrencia nunca "vaza" de um lancamento para o proximo: sem este reset, quem criou uma serie
    // de 12 e abriu o modal de novo criaria outra serie de 12 sem perceber. Fica AQUI, e nao numa
    // closure do componente, justamente para ter teste.
    refs.recorrencia.value = estadoRecorrenciaVazio();
    deps.limparFotos();

    await deps.carregarOpcoes(entidade);

    let detalhe: OperacaoDetalhe | null = null;
    if (id) {
      detalhe = await deps.api.get<OperacaoDetalhe>(`/api/${deps.rotaDaEntidade(entidade)}/${id}`);
      aplicarDetalhe(entidade, detalhe);
    }

    refs.modalOperacaoAberto.value = true;
    return detalhe;
  }

  /**
   * Monta o corpo e envia. Devolve `null` quando a pre-validacao barra — quem notifica e o
   * componente, que tambem cuida de fotos, linha local e do 422 da discriminacao.
   *
   * `recorrencia` so vai na CRIACAO: uma serie nao se recria a cada correcao do registro.
   */
  async function enviarLancamento(): Promise<{ salva: OperacaoSalva; editandoId: string; rota: string } | null> {
    const entidade = refs.entidadeNova.value;
    const payload = montarPayloadOperacao(entidade, {
      empresaId: deps.empresaId(),
      form: refs.form.value,
      itensVenda: refs.itensVenda.value,
      tiposPagamento: refs.tiposPagamento.value,
      itensDespesa: refs.itensDespesa.value,
      itensMercadoria: refs.itensMercadoria.value,
      discriminandoDespesa: refs.discriminandoDespesa.value,
      discriminandoMercadoria: refs.discriminandoMercadoria.value,
      produtos: deps.produtos(),
      ...(refs.operacaoEditandoId.value ? {} : { recorrencia: deps.recorrencia() })
    });

    // Pre-validacao no cliente: mensagem clara em PT antes do 400 do servidor. Os `qtdItens*` sao
    // derivados — o validador conta linhas, nao recebe a lista.
    const impedimento = validarOperacaoParaEnvio(entidade, {
      descricao: payload.descricao,
      observacao: payload.observacao,
      grupoDespesaId: payload.grupoDespesaId,
      grupoMercadoriaId: payload.grupoMercadoriaId,
      contaOrigemId: payload.contaOrigemId,
      contaDestinoId: payload.contaDestinoId,
      fornecedorId: payload.fornecedorId,
      colaboradorId: payload.colaboradorId,
      socioGestorId: payload.socioGestorId,
      qtdItensDespesa: payload.itensDespesa.length,
      qtdItensMercadoria: payload.itensMercadoria.length,
      contaTravada: deps.contaTravadaDoCaixa(),
      editando: Boolean(refs.operacaoEditandoId.value)
    });
    if (impedimento) {
      deps.notificar(impedimento, "error");
      return null;
    }

    const editandoId = refs.operacaoEditandoId.value;
    const rota = deps.rotaDaEntidade(entidade);
    const salva = editandoId
      ? await deps.api.put<OperacaoSalva>(`/api/${rota}/${editandoId}`, payload)
      : await deps.api.post<OperacaoSalva>(`/api/${rota}`, payload);
    return { salva, editandoId, rota };
  }

  return { abrirLancamento, aplicarDetalhe, enviarLancamento };
}
