import { computed, nextTick, ref, watch, type Ref } from "vue";
import {
  camposAlteradosFolha,
  leituraDaSugestao,
  leituraFolhaCreareVazia,
  leituraParaEnvio,
  leiturasFolhaCreareEmMemoria,
  rotuloCampoFolha,
  type LeituraFolhaCreare,
  type SugestaoFolhaCreare
} from "~/utils/folha-creare";

// R-225 · estado da folha do CREARE na etapa Vendas: leitura da IA, memoria por anexo (voltar para a etapa nao
// chama a IA de novo nem apaga a correcao), aviso de valor mudado depois de gerar e a correcao manual
// (numeros lidos pela IA travados; mudou algum, a justificativa e obrigatoria).
export function useLeituraFolhaCreare(opcoes: {
  anexoId: Ref<string>;
  gerado: Ref<boolean>;
  aviso: Ref<string>;
  lerComIa: (anexoId: string) => Promise<SugestaoFolhaCreare>;
}) {
  const leitura = ref<LeituraFolhaCreare>(leituraFolhaCreareVazia());
  const sugestao = ref<SugestaoFolhaCreare | null>(null);
  // Os campos so aparecem depois de anexar E ler (ou quando a leitura falha e o operador preenche).
  const pronta = ref(false);
  // Valor corrigido depois de gerar: o relatorio (e a comparacao do Relatorio final) ficou velho.
  const alterada = ref(false);
  const corrigindo = ref(false);
  const justificativa = ref("");
  const alteradosPelaCorrecao = computed(() => camposAlteradosFolha(leitura.value, sugestao.value));
  const faltaJustificativa = computed(
    () => alteradosPelaCorrecao.value.length > 0 && justificativa.value.trim().length < 5
  );
  let aplicando = false;

  function definir(nova: LeituraFolhaCreare, lida: SugestaoFolhaCreare | null) {
    aplicando = true;
    leitura.value = nova;
    sugestao.value = lida;
    pronta.value = true;
    alterada.value = false;
    corrigindo.value = false;
    justificativa.value = "";
    void nextTick(() => {
      aplicando = false;
    });
  }

  watch(
    leitura,
    (atual) => {
      if (aplicando || !pronta.value) return;
      if (opcoes.anexoId.value) {
        leiturasFolhaCreareEmMemoria.set(opcoes.anexoId.value, { leitura: atual, sugestao: sugestao.value });
      }
      if (opcoes.gerado.value) alterada.value = true;
    },
    { deep: true }
  );

  async function ler(anexoId: string) {
    const guardada = leiturasFolhaCreareEmMemoria.get(anexoId);
    if (guardada) {
      definir(guardada.leitura, guardada.sugestao);
      return;
    }
    const lida = await opcoes.lerComIa(anexoId);
    definir(leituraDaSugestao(lida), lida);
    leiturasFolhaCreareEmMemoria.set(anexoId, { leitura: leitura.value, sugestao: lida });
    const pendentes = lida.camposDuvidosos.length
      ? " Revise: " + lida.camposDuvidosos.map(rotuloCampoFolha).join(", ") + "."
      : "";
    opcoes.aviso.value = lida.documentoLegivel
      ? "A leitura preencheu os valores visíveis da folha. Confira antes de gerar." + pendentes
      : "A leitura não confirmou a legibilidade da folha. Confira e preencha os campos visíveis." + pendentes;
  }

  function indisponivel() {
    pronta.value = true;
    opcoes.aviso.value =
      "A folha foi anexada. A leitura automática não ficou disponível; preencha os valores do cupom.";
  }

  // Ao voltar para a etapa, a leitura revisada que gerou o relatorio reaparece (so no modelo atual, v4).
  function restaurarDoRelatorio(lida: SugestaoFolhaCreare | undefined, versao: number) {
    if (lida && versao >= 4 && !pronta.value) definir(leituraDaSugestao(lida), lida);
  }

  function reiniciar() {
    sugestao.value = null;
    pronta.value = false;
  }

  function paraEnvio() {
    return leituraParaEnvio(
      leitura.value,
      sugestao.value,
      alteradosPelaCorrecao.value.length
        ? { justificativa: justificativa.value.trim(), campos: alteradosPelaCorrecao.value }
        : null
    );
  }

  return {
    leitura,
    sugestao,
    pronta,
    alterada,
    corrigindo,
    justificativa,
    alteradosPelaCorrecao,
    faltaJustificativa,
    ler,
    indisponivel,
    restaurarDoRelatorio,
    reiniciar,
    paraEnvio
  };
}
