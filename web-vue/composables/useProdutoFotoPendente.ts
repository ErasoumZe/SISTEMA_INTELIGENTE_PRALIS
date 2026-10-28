/**
 * Foto do produto aplicada SÓ AO SALVAR (paralelo). Antes a foto subia e era removida na hora: a
 * pessoa trocava a foto, clicava "Cancelar" e a troca já estava gravada.
 *
 * Escolher guarda o arquivo; remover limpa o `fotoUrl` do formulário. Depois que o produto é salvo,
 * `aplicarDepoisDeSalvar` usa as rotas que já existem (`POST`/`DELETE .../foto`). Se a foto falhar,
 * o produto JÁ está salvo: devolve o aviso em vez de fingir que deu certo ou de pedir para salvar de
 * novo (salvar de novo um produto novo criaria outro).
 */
export function useProdutoFotoPendente() {
  const { apiDelete, apiUrl } = useApi();

  const fotoPendente = ref<File | null>(null);
  /** `fotoUrl` como está gravado: base para saber se a pessoa removeu a foto. */
  const fotoUrlSalva = ref<string | null>(null);

  function marcarSalva(fotoUrl: string | null) {
    fotoUrlSalva.value = fotoUrl;
    fotoPendente.value = null;
  }

  async function enviar(rota: string, id: string, arquivo: File): Promise<string> {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    // Multipart: o `useApi` so fala JSON. Este e o unico envio de foto do cadastro de produto.
    const resposta = await fetch(`${apiUrl}${rota}/${id}/foto`, {
      method: "POST",
      credentials: "include",
      body: corpo
    });
    if (!resposta.ok) throw new Error("foto");
    const corpoResposta = (await resposta.json()) as { data?: { fotoUrl?: string } };
    return corpoResposta.data?.fotoUrl ?? "";
  }

  /**
   * Aplica a foto do formulário depois do salvamento. Devolve o `fotoUrl` final e, se falhou, a
   * mensagem para o aviso.
   */
  async function aplicarDepoisDeSalvar(entrada: {
    rota: string;
    id: string;
    fotoUrlDoFormulario: string | null;
  }): Promise<{ fotoUrl: string | null; falha: string }> {
    try {
      if (fotoPendente.value) {
        const fotoUrl = await enviar(entrada.rota, entrada.id, fotoPendente.value);
        marcarSalva(fotoUrl);
        return { fotoUrl, falha: "" };
      }
      if (fotoUrlSalva.value && !entrada.fotoUrlDoFormulario) {
        await apiDelete(`${entrada.rota}/${entrada.id}/foto`);
      }
      marcarSalva(entrada.fotoUrlDoFormulario);
      return { fotoUrl: entrada.fotoUrlDoFormulario, falha: "" };
    } catch {
      return {
        fotoUrl: fotoUrlSalva.value,
        falha: "Produto salvo, mas a foto não foi atualizada. Abra o produto e tente de novo."
      };
    }
  }

  return { fotoPendente, fotoUrlSalva, marcarSalva, aplicarDepoisDeSalvar };
}
