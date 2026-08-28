// Mesmo padrao do useModoEscuro.ts: `getCurrentInstance` nao e auto-importado pelo Nuxt.
import { getCurrentInstance } from "vue";

/**
 * Quais grupos do menu estao abertos (VIS-E7c, com o `sessionStorage` acrescentado no VIS-E7f).
 *
 * DUAS CAMADAS, e cada uma resolve um problema diferente:
 *
 * 1. `useState` do Nuxt — sobrevive a NAVEGACAO. A casca REMONTA a cada rota (cada pagina renderiza
 *    o seu proprio AppWorkspace -> AppShell), e foi isso que o VIS-E6i mediu marcando o no do DOM e
 *    vendo a marca sumir. Um `ref` dentro do AppSidebar nasceria `{}` a cada navegacao e a sanfona
 *    fecharia na cara do usuario o que ele acabou de abrir.
 * 2. `sessionStorage` — sobrevive ao F5. O `useState` morre com o documento; recarregar a pagina
 *    devolvia tudo ao padrao.
 *
 * A versao anterior deste arquivo justificava NAO usar `sessionStorage`, alegando risco de
 * descompasso de hidratacao. A justificativa caiu, e o motivo dela cair e o COMO: o storage e lido
 * SO NO CLIENTE e SO DEPOIS DA MONTAGEM. No servidor e na primeira pintura o estado e o mesmo dos
 * dois lados — `{}`, que o `gruposIniciais` transforma em "tudo aberto" —, entao nao ha o que
 * divergir. O ajuste da preferencia acontece depois, num segundo passo, e nao durante a hidratacao.
 *
 * A ORDEM E O DETALHE QUE FAZ ISSO FUNCIONAR. O watch do AppSidebar roda com `immediate: true`, no
 * setup, ANTES do `onMounted`: nesse momento todo grupo e desconhecido e vira `true`. Se a
 * hidratacao mesclasse com o estado atual mandando, esse `true` apagaria o `false` que o usuario
 * salvou. Por isso o que vem do storage TEM PRECEDENCIA (`{ ...abertos.value, ...lido }`), e o
 * `hidratado` e virado em seguida para o watch do AppSidebar rodar de novo — e so entao o grupo da
 * tela ativa e forcado a aberto, por cima de tudo. Preferencia do usuario ganha do padrao; a tela
 * ativa ganha da preferencia.
 *
 * Banco continua fora de questao: e outra frente e exigiria autorizacao do Marco (RD-04).
 */
const CHAVE = "padaria.grupos-menu-abertos";

export function useGruposAbertos() {
  const abertos = useState<Record<string, boolean>>("sidebar-grupos-abertos", () => ({}));
  const hidratado = useState<boolean>("sidebar-grupos-abertos.hidratado", () => false);

  // `onMounted` so existe dentro do setup de um componente. O guard segue o padrao do useModoEscuro:
  // quem chamar fora de um componente continua tendo o estado em memoria funcionando.
  if (getCurrentInstance()) {
    onMounted(() => {
      if (!hidratado.value) {
        try {
          const bruto = window.sessionStorage?.getItem(CHAVE);
          // A anotacao e conveniencia para o `Object.entries` abaixo, nao garantia: `JSON.parse` le
          // o que estiver la. Quem garante e o filtro de runtime na linha seguinte. (`unknown`
          // explicito e proibido pelo `no-restricted-syntax` do eslint.config.mjs:71.)
          const lido = bruto ? (JSON.parse(bruto) as Partial<Record<string, boolean>>) : null;
          if (lido && typeof lido === "object" && !Array.isArray(lido)) {
            // So booleano entra. Storage e editavel pelo usuario, e um valor estranho aqui viraria
            // um grupo que nao abre nem fecha.
            const limpo: Record<string, boolean> = {};
            for (const [titulo, valor] of Object.entries(lido)) {
              if (typeof valor === "boolean") limpo[titulo] = valor;
            }
            abertos.value = { ...abertos.value, ...limpo };
          }
        } catch {
          // Aba anonima, storage cheio ou JSON corrompido: a sanfona continua funcionando em
          // memoria. Preferencia perdida nao vale uma tela quebrada.
        }
        hidratado.value = true;
      }

      watch(
        abertos,
        (valor) => {
          try {
            window.sessionStorage?.setItem(CHAVE, JSON.stringify(valor));
          } catch {
            // idem: gravar e melhoria, nao requisito.
          }
        },
        { deep: true }
      );
    });
  }

  return { abertos, hidratado };
}
