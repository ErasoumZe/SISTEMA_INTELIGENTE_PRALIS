import { ref } from "vue";

// Foto do documento (nota/cupom) de despesas e mercadorias. O gerente fotografa ao lancar; a
// retaguarda ve a foto ao discriminar. A API fica em outra origem (sessao por cookie), entao a
// imagem e baixada com credenciais e exibida via object URL (nao da para usar <img src> direto).
export function useFotoDocumento() {
  const arquivo = ref<File | null>(null);
  const previewUrl = ref("");
  const existente = ref(false);

  function revogar() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = "";
  }

  // Zera o estado ao abrir/fechar o modal, liberando o object URL anterior.
  function limpar() {
    revogar();
    arquivo.value = null;
    existente.value = false;
  }

  // v-file-input pode emitir File, File[] ou null conforme a versao do Vuetify.
  function selecionar(entrada: File | File[] | null) {
    const selecionado = Array.isArray(entrada) ? (entrada[0] ?? null) : entrada;
    revogar();
    arquivo.value = selecionado;
    if (selecionado && selecionado.type.startsWith("image/")) {
      previewUrl.value = URL.createObjectURL(selecionado);
    }
  }

  // Baixa a foto ja anexada (edicao/discriminacao) para preview. Se nao for imagem (ex.: PDF),
  // mantem apenas o marcador de "documento anexado".
  async function carregarExistente(apiUrl: string, endpoint: string, id: string, rota = "foto") {
    existente.value = true;
    try {
      const resposta = await fetch(`${apiUrl}/api/${endpoint}/${id}/${rota}`, { credentials: "include" });
      if (!resposta.ok) return;
      const blob = await resposta.blob();
      if (blob.type.startsWith("image/")) {
        revogar();
        previewUrl.value = URL.createObjectURL(blob);
      }
    } catch {
      // sem preview; o marcador de anexo ainda e exibido
    }
  }

  // Envia o arquivo selecionado apos o lancamento existir (precisa do id). Devolve o caminho
  // relativo salvo (ou null quando nada foi anexado).
  async function enviar(
    apiUrl: string,
    endpoint: string,
    id: string,
    rota = "foto",
    chaveResposta = "fotoDocumentoUrl"
  ): Promise<string | null> {
    if (!arquivo.value) return null;
    const formData = new FormData();
    formData.append("arquivo", arquivo.value);
    const resposta = await fetch(`${apiUrl}/api/${endpoint}/${id}/${rota}`, {
      method: "POST",
      credentials: "include",
      body: formData
    });
    if (!resposta.ok) throw new Error("Nao foi possivel enviar a foto do documento.");
    const corpo = (await resposta.json()) as { data?: Record<string, string | undefined> } | null;
    return corpo?.data?.[chaveResposta] ?? "anexada";
  }

  return { arquivo, previewUrl, existente, limpar, selecionar, carregarExistente, enviar };
}
