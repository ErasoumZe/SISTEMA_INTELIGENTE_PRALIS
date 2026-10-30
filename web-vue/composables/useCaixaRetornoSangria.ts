import { computed, reactive, ref, watch, type Ref } from "vue";
import { deCentavos, paraCentavos } from "@padaria/shared";
import type { CaixaStatus } from "~/types/padaria";
import type { RetornoSaldoPayload } from "~/utils/caixa-acoes";
import { dinheiro, mensagemErro } from "~/utils/domain";

type LacreRetorno = { id: string; numero: string };
type Dependencias = {
  status: Readonly<Ref<CaixaStatus | null>>;
  empresaId: Readonly<Ref<string>>;
  permitido: Readonly<Ref<boolean>>;
  salvando: Readonly<Ref<boolean>>;
  carregarStatus: () => Promise<void>;
  carregarLacres: (caixaId: string) => Promise<LacreRetorno[]>;
  retornarSaldo: (payload: RetornoSaldoPayload) => Promise<boolean>;
  fechar: () => void;
};

// Extraído de CaixaResumoPage: mesmas contas, composição, lacre e intenção de retry.
// O host muda; a execução continua exclusivamente em criarAcoesCaixa/transferencia-cofre.
export function useCaixaRetornoSangria(deps: Dependencias) {
  const caixaAberto = computed(() => {
    const caixa = deps.status.value?.caixaAberto;
    return caixa?.empresaId === deps.empresaId.value ? caixa : null;
  });
  // Retorno/sangria altera o físico do PDV. A partir do corte, o Caixa já entrou na
  // conferência e não aceita nenhum novo movimento, mesmo que o retrato ainda esteja
  // disponível para a tela de fechamento.
  const podeRetornar = computed(() => deps.permitido.value && caixaAberto.value?.status === "aberto");
  const processando = ref(false);
  const carregando = ref(false);
  const erroCarga = ref("");
  let consultaAtual = 0;
  const lacresRetornoDisponiveis = ref<LacreRetorno[]>([]);
  const saldoAtual = computed(() => Number(deps.status.value?.resumo?.saldo ?? 0));
  const totalPlanejadoCentavos = computed(() =>
    (deps.status.value?.planejamentosPendentes ?? []).reduce(
      (total, planejamento) => total + paraCentavos(planejamento.valor),
      0
    )
  );
  // R-232 · `null` para o operador de caixa (ele nao ve o fisico esperado): sem teto na tela; o servidor valida.
  const saldoLivre = computed(() =>
    deps.status.value?.resumo?.saldo === null
      ? null
      : deCentavos(Math.max(0, paraCentavos(saldoAtual.value) - totalPlanejadoCentavos.value))
  );
  // D1: o valor da entrega e digitavel. Vazio significa "a sobra inteira" — o padrao continua sendo
  // devolver tudo, mas o operador pode enviar parte agora e o resto depois (varios movimentos).
  // `observacao` e propria da entrega, separada da observacao do FECHAMENTO: sao dois atos, e
  // misturar as duas fazia a nota do fechamento virar parte da intencao da entrega — qualquer
  // correcao no texto do fechamento rodaria a chave de idempotencia e liberaria uma entrega dupla.
  const entrega = reactive({
    valor: "",
    valorEspecie: "",
    valorMoedas: "",
    lacreId: "",
    responsavelNome: "",
    observacao: ""
  });

  // B2 · a chave de idempotencia da tela.
  // Regra: uma chave por INTENCAO. Ela nasce no primeiro envio, sobrevive a erro e a cancelamento
  // (o retry precisa da MESMA chave, senao o servidor trata como entrega nova e duplica o dinheiro),
  // e so e trocada quando o ato termina bem ou quando o operador muda de fato o que quer entregar.
  const chaveEntrega = ref("");
  const intencaoDaChave = ref("");

  // `crypto.randomUUID` exige contexto seguro. Em https e em localhost existe; num acesso por IP da
  // rede da loja (http://192.168.x.x) o navegador nao o expoe, e sem o fallback a tela quebraria
  // justamente onde ela roda todo dia.
  function novoUuid(): string {
    const aleatorio = globalThis.crypto;
    if (typeof aleatorio?.randomUUID === "function") return aleatorio.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/gu, (caractere) => {
      const digito = Number(caractere);
      return (digito ^ (Math.floor(Math.random() * 256) & (15 >> (digito / 4)))).toString(16);
    });
  }

  // A "intencao" e o conjunto que o servidor compara para decidir entre retry e ato novo. Se ele
  // mudar, a chave TEM de mudar — senao o servidor devolve 409 e o operador fica travado sem
  // entender por que. Se nao mudar, a chave TEM de ficar — e o que impede a entrega dupla.
  function chaveParaIntencao(assinatura: string): string {
    if (chaveEntrega.value && intencaoDaChave.value === assinatura) return chaveEntrega.value;
    chaveEntrega.value = novoUuid();
    intencaoDaChave.value = assinatura;
    return chaveEntrega.value;
  }

  function limparEntrega() {
    entrega.valor = "";
    entrega.valorEspecie = "";
    entrega.valorMoedas = "";
    entrega.lacreId = "";
    entrega.responsavelNome = "";
    entrega.observacao = "";
    chaveEntrega.value = "";
    intencaoDaChave.value = "";
  }

  // D1: entrega PARCIAL durante o turno. Sem valor digitado, envia a sobra inteira. O servidor
  // recalcula o teto sob trava — o numero que a tela viu nunca e prova de nada.
  const valorEntregaEfetivo = computed(() => {
    const digitado = Number(entrega.valor || 0);
    return digitado > 0 ? digitado : (saldoLivre.value ?? 0);
  });
  // D1 na TELA: o servidor continua sendo a autoridade (ele recalcula sob trava), mas deixar o
  // operador disparar um valor que ja se sabe impossivel so gera 400 e desconfianca. Aqui o aviso
  // e imediato e o botao nao dispara.
  const entregaAcimaDoSaldoLivre = computed(
    () => saldoLivre.value !== null && valorEntregaEfetivo.value > saldoLivre.value
  );
  const entregaComposicaoInvalida = computed(
    () => Number(entrega.valorEspecie || 0) + Number(entrega.valorMoedas || 0) !== valorEntregaEfetivo.value
  );
  const lacreEntregaPendente = computed(() => !entrega.lacreId);
  const entregaBloqueada = computed(
    () =>
      !podeRetornar.value ||
      processando.value ||
      carregando.value ||
      Boolean(erroCarga.value) ||
      Boolean(deps.salvando.value) ||
      valorEntregaEfetivo.value <= 0 ||
      entregaAcimaDoSaldoLivre.value ||
      entregaComposicaoInvalida.value ||
      lacreEntregaPendente.value ||
      !entrega.responsavelNome.trim()
  );

  const entregaIniciada = computed(
    () =>
      entrega.valor.trim().length > 0 ||
      entrega.valorEspecie.trim().length > 0 ||
      entrega.valorMoedas.trim().length > 0 ||
      entrega.lacreId.length > 0 ||
      entrega.observacao.trim().length > 0
  );

  const mensagemErroEntrega = computed(() => {
    if (!entregaIniciada.value) return "";
    if (entregaAcimaDoSaldoLivre.value) return `Máximo disponível: ${dinheiro(saldoLivre.value ?? 0)}.`;
    if (entregaComposicaoInvalida.value) return "Dinheiro físico + moedas deve ser igual ao valor entregue.";
    if (lacreEntregaPendente.value) return "Informe o lacre do retorno / sangria.";
    if (!entrega.responsavelNome.trim()) return "Informe o responsável pela sangria.";
    if (valorEntregaEfetivo.value <= 0) return "Informe um valor para a transferência.";
    return "";
  });

  async function retornarSaldo(fecharModalAoSalvar = false) {
    const caixa = caixaAberto.value;
    // Guarda de duplo clique: enquanto `salvando` estiver ligado o ato nao repete. O botao tambem
    // fica em loading/disabled, mas Enter no campo e clique rapido furam o visual.
    if (!caixa || entregaBloqueada.value) return;
    const valor = valorEntregaEfetivo.value;
    const lacreId = entrega.lacreId;
    const lacreNumero = lacresRetornoDisponiveis.value.find((lacre) => lacre.id === lacreId)?.numero ?? "";
    const observacao = entrega.observacao || null;
    processando.value = true;
    try {
      await deps.retornarSaldo({
        caixaId: caixa.id,
        valor,
        valorEspecie: Number(entrega.valorEspecie || 0),
        valorMoedas: Number(entrega.valorMoedas || 0),
        lacreId,
        lacreNumero,
        responsavelNome: entrega.responsavelNome.trim(),
        observacao,
        idempotenciaChave: chaveParaIntencao(
          `avulsa|${caixa.id}|${valor}|${entrega.valorEspecie}|${entrega.valorMoedas}|${lacreId}|${entrega.responsavelNome.trim()}|${observacao ?? ""}`
        ),
        // Limpa SO no sucesso confirmado. Em erro (ou confirmacao negada) valor, lacre, observacao e
        // a chave ficam de pe: o operador tenta de novo com um clique, e o retry carrega a MESMA
        // chave — que e o que impede a segunda entrega do mesmo envelope.
        aoConcluir: (sucesso: boolean) => {
          if (!sucesso || caixaAberto.value?.id !== caixa.id) return;
          lacresRetornoDisponiveis.value = lacresRetornoDisponiveis.value.filter((lacre) => lacre.id !== lacreId);
          limparEntrega();
          entrega.responsavelNome = caixa.caixaResponsavelNomeAbertura || caixa.usuarioCaixaNome;
          if (fecharModalAoSalvar) deps.fechar();
        }
      });
    } finally {
      processando.value = false;
    }
  }

  watch(
    [deps.empresaId, () => caixaAberto.value?.id, deps.permitido],
    () => {
      consultaAtual++;
      carregando.value = false;
      limparEntrega();
      lacresRetornoDisponiveis.value = [];
      erroCarga.value = "";
    },
    { flush: "sync" }
  );

  async function preparar() {
    if (!podeRetornar.value || processando.value) return;
    const consulta = ++consultaAtual;
    const empresaId = deps.empresaId.value;
    carregando.value = true;
    erroCarga.value = "";
    try {
      await deps.carregarStatus();
      const caixa = caixaAberto.value;
      if (consulta !== consultaAtual || !caixa || !podeRetornar.value || empresaId !== deps.empresaId.value) return;
      const lacres = await deps.carregarLacres(caixa.id);
      if (
        consulta !== consultaAtual ||
        caixa.id !== caixaAberto.value?.id ||
        !podeRetornar.value ||
        empresaId !== deps.empresaId.value
      )
        return;
      lacresRetornoDisponiveis.value = lacres;
      entrega.responsavelNome = caixa.caixaResponsavelNomeAbertura || caixa.usuarioCaixaNome;
    } catch (error) {
      if (consulta !== consultaAtual) return;
      lacresRetornoDisponiveis.value = [];
      erroCarga.value = mensagemErro(error);
    } finally {
      if (consulta === consultaAtual) carregando.value = false;
    }
  }

  return {
    entrega,
    saldoLivre,
    lacresRetornoDisponiveis,
    podeRetornar,
    carregando,
    erroCarga,
    entregaBloqueada,
    mensagemErroEntrega,
    processando,
    preparar,
    retornarSaldo
  };
}
