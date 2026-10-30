import { computed, ref } from "vue";
import { buscarDuvidas, type Duvida, type TemaDuvida } from "~/utils/duvidas";

// O que a janela de duvidas mostra: UMA coisa por vez. Nada de historico rolando — o operador no caixa
// pergunta, le a resposta e volta ao trabalho. Sem IA: a resposta e uma pergunta pronta achada pela busca.
export type TelaDuvida =
  | { tipo: "inicio" }
  | { tipo: "resposta"; duvida: Duvida }
  | { tipo: "opcoes"; termo: string; duvidas: Duvida[] }
  | { tipo: "nada"; termo: string };

const MAX_OPCOES = 3;
const MAX_COMUNS = 3;

export function useChatDuvidas(duvidas: readonly Duvida[]) {
  const tela = ref<TelaDuvida>({ tipo: "inicio" });
  const tema = ref<TemaDuvida | null>(null);

  // As primeiras perguntas do assunto da tela (a base ja esta na ordem do fluxo, da mais comum para a menos).
  const comuns = computed(() =>
    tema.value ? duvidas.filter((d) => d.tema === tema.value).slice(0, MAX_COMUNS) : duvidas.slice(0, MAX_COMUNS)
  );

  function iniciar(temaDaTela: TemaDuvida | null) {
    tema.value = temaDaTela;
    tela.value = { tipo: "inicio" };
  }

  // Achou uma so: ja responde. Achou varias: as 3 mais parecidas viram opcoes para tocar.
  function perguntar(texto: string) {
    const termo = texto.trim();
    if (!termo) return;
    const achadas = buscarDuvidas(duvidas, termo).slice(0, MAX_OPCOES);
    const [primeira] = achadas;
    if (!primeira) tela.value = { tipo: "nada", termo };
    else if (achadas.length === 1) tela.value = { tipo: "resposta", duvida: primeira };
    else tela.value = { tipo: "opcoes", termo, duvidas: achadas };
  }

  function escolher(duvida: Duvida) {
    tela.value = { tipo: "resposta", duvida };
  }

  function voltar() {
    tela.value = { tipo: "inicio" };
  }

  return { tela, comuns, iniciar, perguntar, escolher, voltar };
}
