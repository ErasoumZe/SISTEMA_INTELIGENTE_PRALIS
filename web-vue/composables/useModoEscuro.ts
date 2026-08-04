// Modo claro/escuro global. Faz DUAS coisas, e as duas sao necessarias:
//  1. seta data-theme no <html> — e o que dispara a inversao da camada de tokens --cx-*
//     em main.css (uma redefinicao das primitivas; todo o resto do CSS herda);
//  2. troca o tema do Vuetify (padariaLight <-> padariaDark) — sem isto os componentes
//     Vuetify continuam calculados como claros por dentro, e o escuro so valia para o
//     CSS proprio. Era o que a pilha de --v-theme-* com !important tentava remendar.
// Persiste em localStorage.
import { getCurrentInstance } from "vue";
import { useTheme } from "vuetify";

const CHAVE = "padaria.modoEscuro";

export function useModoEscuro() {
  const escuro = useState("padaria.modo-escuro", () => false);

  // useTheme() so resolve dentro do setup de um componente. O guard segue o mesmo padrao
  // do useApi: quem chamar fora de um componente continua tendo o data-theme funcionando.
  let temaVuetify: ReturnType<typeof useTheme> | null = null;
  if (getCurrentInstance()) {
    try {
      temaVuetify = useTheme();
    } catch {
      temaVuetify = null;
    }
  }

  function aplicar() {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", escuro.value ? "dark" : "light");
    }
    temaVuetify?.change(escuro.value ? "padariaDark" : "padariaLight");
  }

  function inicializar() {
    if (typeof window === "undefined") return;
    const salvo = window.localStorage?.getItem(CHAVE);
    escuro.value =
      salvo === "1" || (salvo === null && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches));
    aplicar();
  }

  function alternar() {
    escuro.value = !escuro.value;
    aplicar();
    if (typeof window !== "undefined") window.localStorage?.setItem(CHAVE, escuro.value ? "1" : "0");
  }

  return { escuro, inicializar, alternar };
}
