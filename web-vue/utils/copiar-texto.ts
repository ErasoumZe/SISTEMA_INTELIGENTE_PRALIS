/**
 * Copiar texto para a area de transferencia, com o resultado HONESTO de volta.
 *
 * Primeiro uso de clipboard do repositorio. O desenho segue o unico precedente de API de navegador
 * que pode ser negada — `ProdutoScanner.vue`: envolver em `try`, distinguir a falha, e devolver ao
 * chamador algo com que ele consiga escrever uma mensagem util.
 *
 * Tres armadilhas concretas, e por que cada guarda existe:
 *
 * 1. `navigator.clipboard` NAO existe fora de contexto seguro. Ele e declarado `[SecureContext]`,
 *    entao em `http://<ip-da-lan>` a propriedade simplesmente nao e instalada — e `.writeText` lanca
 *    `TypeError` SINCRONO, que um `.catch()` nao pega. O `lib.dom.d.ts` declara `clipboard` como
 *    nao-opcional, entao o typecheck nao ajuda aqui: a guarda tem de ser em tempo de execucao.
 *    Isso acontece de verdade nesta casa — `npm run preview` serve em `0.0.0.0`, e o teste de
 *    responsivo em 390px e feito abrindo o IP da rede no celular.
 *
 * 2. Mesmo existindo, `writeText` rejeita: sem gesto do usuario, com o gesto ja expirado por um
 *    `await` anterior, ou com o documento sem foco (`NotAllowedError`). Por isso quem chama deve
 *    chamar no proprio handler do clique, antes de qualquer `await`.
 *
 * 3. O caminho de reserva usa `document.execCommand`, que e depreciado mas continua sendo o unico
 *    que funciona em contexto inseguro. Ele exige um elemento SELECIONAVEL no documento, e destroi
 *    a selecao de quem estava lendo a tela — por isso a selecao anterior e restaurada.
 *
 * O que esta funcao NAO faz: dizer que copiou quando nao tem como saber. Se os dois caminhos
 * falharem, ela devolve `false` e quem chama oferece a copia manual. Ressalva honesta: o
 * `execCommand` pode devolver `true` tendo apenas EXECUTADO o comando, sem que a area de
 * transferencia tenha recebido o texto. E o unico sinal que a plataforma da, e e por isso que o
 * texto continua visivel na tela para a pessoa conferir.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (!texto) return false;
  if (typeof navigator !== "undefined") {
    const area = navigator.clipboard as Clipboard | undefined;
    if (area) {
      try {
        await area.writeText(texto);
        return true;
      } catch {
        // Contexto inseguro, gesto expirado ou documento sem foco: tenta o caminho antigo.
      }
    }
  }
  return copiarPelaSelecao(texto);
}

/**
 * O caminho de reserva. Fora da tela, mas NAO escondido: `display: none` e `visibility: hidden` nao
 * sao selecionaveis, e sem selecao o comando nao copia nada.
 */
function copiarPelaSelecao(texto: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.setAttribute("aria-hidden", "true");
  campo.tabIndex = -1;
  // `font-size: 16px` evita o zoom automatico do iOS ao focar um campo.
  campo.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px";

  const selecao = document.getSelection();
  const anterior = selecao && selecao.rangeCount > 0 ? selecao.getRangeAt(0) : null;

  document.body.appendChild(campo);
  try {
    campo.select();
    campo.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
    // Quem estava com um trecho selecionado nao pode perder a selecao por causa da nossa copia.
    if (anterior && selecao) {
      selecao.removeAllRanges();
      selecao.addRange(anterior);
    }
  }
}
