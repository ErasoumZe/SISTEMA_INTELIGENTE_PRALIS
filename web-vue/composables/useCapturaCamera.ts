import { ref, type Ref } from "vue";

// "Camera" nos formularios de anexo. No CELULAR o `<input type="file" capture>` abre a camera nativa. No
// COMPUTADOR o navegador ignora o `capture` e abre o seletor de arquivos (parecia "Camera abrindo a Galeria").
// Aqui, no computador com webcam, abrimos a webcam (CapturaCameraDialog); no celular, ou sem webcam / sem
// permissao, mantemos o caminho de antes (clicar no input). A foto tirada entra pelo MESMO handler `change` do
// input, entao quem recebe o arquivo (envio, leitura por IA) nao muda.

export function podeUsarWebcam(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  // Ponteiro "grosso" = celular/tablet: la o `capture` do input ja abre a camera nativa, melhor que a webcam.
  const toque = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return !toque;
}

// Entrega o arquivo ao input como se a pessoa o tivesse escolhido (mesmo evento `change`).
export function entregarArquivoAoInput(input: HTMLInputElement, arquivo: File) {
  const lista = new DataTransfer();
  lista.items.add(arquivo);
  input.files = lista.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function useCapturaCamera(input: Ref<HTMLInputElement | null>) {
  const aberta = ref(false);

  function abrir() {
    if (podeUsarWebcam()) aberta.value = true;
    else input.value?.click();
  }
  function aoCapturar(arquivo: File) {
    if (input.value) entregarArquivoAoInput(input.value, arquivo);
  }
  // Sem webcam ou sem permissao: volta ao seletor de arquivos, para a pessoa nao ficar sem caminho.
  function aoIndisponivel() {
    aberta.value = false;
    input.value?.click();
  }

  return { aberta, abrir, aoCapturar, aoIndisponivel };
}
