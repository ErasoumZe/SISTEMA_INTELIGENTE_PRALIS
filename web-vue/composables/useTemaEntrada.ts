// AS TELAS DE ENTRADA ABREM SEMPRE NO ESCURO. Decisao de Marco, 28/08/2026: o fundo animado do
// login nao ficou bom no tema claro, e em vez de manter duas versoes do mesmo desenho, a entrada
// passa a ter um tema so. Quem prefere claro escolhe DENTRO do sistema, e continua com a escolha.
//
// A REGRA QUE NAO PODE SER QUEBRADA: isto NAO grava preferencia. Se estas telas escrevessem "dark"
// no localStorage, quem prefere claro perderia a escolha so por passar pelo login — e passar pelo
// login e obrigatorio. Entao aqui so se LE o estado atual, forca-se o escuro enquanto a tela vive,
// e devolve-se exatamente o que estava antes quando ela sai.
//
// Sao DUAS coisas a restaurar, e esquecer a segunda foi o defeito do VIS-13:
//   1. o atributo `data-theme` no <html>, que vira a camada de tokens --cx-*;
//   2. o tema do VUETIFY, sem o qual os componentes continuam calculados como claros por dentro.
// `useModoEscuro.aplicar()` faz as duas; aqui as duas sao desfeitas.
import { getCurrentInstance, onMounted, onUnmounted } from "vue";
import { useTheme } from "vuetify";

export function useTemaEntrada() {
  // `useTheme()` so resolve dentro do setup de um componente. Mesmo guard do `useModoEscuro`.
  let temaVuetify: ReturnType<typeof useTheme> | null = null;
  if (getCurrentInstance()) {
    try {
      temaVuetify = useTheme();
    } catch {
      temaVuetify = null;
    }
  }

  // NO <html> PELO `useHead`, e nao so por `setAttribute` no `onMounted`: medido, o HTML servido
  // NAO tinha `data-theme` nenhum, entao a primeira pintura saia na camada CLARA de tokens e so
  // virava escura depois da hidratacao — uma piscada de tema errado justamente na tela de entrada.
  // O `useHead` poe o atributo ja na resposta do servidor, e a tela nasce escura.
  useHead({ htmlAttrs: { "data-theme": "dark" } });

  let atributoAnterior: string | null = null;
  let vuetifyAnterior: string | null = null;

  onMounted(() => {
    if (typeof document === "undefined") return;
    atributoAnterior = document.documentElement.getAttribute("data-theme");
    vuetifyAnterior = temaVuetify?.global.name.value ?? null;
    document.documentElement.setAttribute("data-theme", "dark");
    // O tema do VUETIFY nao vem do `useHead` — ele e estado do plugin, nao atributo de HTML. Sem
    // esta linha os componentes continuam calculados como claros por dentro, que foi exatamente o
    // sintoma que apareceu quando eu media forcando so o atributo.
    temaVuetify?.change("padariaDark");
  });

  onUnmounted(() => {
    if (typeof document === "undefined") return;
    // `null` quer dizer que o atributo NAO EXISTIA antes (carga direta em /login, sem passar pelo
    // app). Nesse caso ele tem de voltar a nao existir, e nao virar "light": o AppShell chama
    // `inicializar()` ao montar e e ele quem decide, lendo o localStorage e a preferencia do
    // sistema operacional. Cravar "light" aqui atropelaria quem tem o SO no escuro.
    if (atributoAnterior === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", atributoAnterior);
    if (vuetifyAnterior) temaVuetify?.change(vuetifyAnterior);
  });
}
