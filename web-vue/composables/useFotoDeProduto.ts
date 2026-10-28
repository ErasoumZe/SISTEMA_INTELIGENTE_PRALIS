import { ref } from "vue";

/**
 * Exibicao da foto do produto.
 *
 * **Nao da para usar `<img src="http://api/...">` direto** — a API fica em outra origem e o
 * `@fastify/helmet` responde `Cross-Origin-Resource-Policy: same-origin`, entao o navegador bloqueia
 * a imagem com `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. O endpoint responde 200, o teste de
 * integracao passa, e a foto simplesmente nao aparece: so a validacao no navegador pega isso.
 *
 * A saida e a mesma que o resto do sistema ja usa para foto de documento (`useFotoDocumento`):
 * baixar com credenciais e exibir por object URL. O object URL e SEMPRE revogado antes de trocar e
 * ao desmontar — senao cada troca de foto vaza um blob na memoria da aba.
 */
export function useFotoDeProduto() {
  const endereco = ref("");
  const carregando = ref(false);

  function revogar() {
    if (endereco.value.startsWith("blob:")) URL.revokeObjectURL(endereco.value);
    endereco.value = "";
  }

  /** Preview local de um arquivo ainda nao enviado. */
  function mostrarArquivoLocal(arquivo: File) {
    revogar();
    endereco.value = URL.createObjectURL(arquivo);
  }

  /** Baixa a foto ja gravada. `produtoId` nulo ou produto sem foto limpa o preview. */
  /** `rota`: "/api/produtos" (loja) ou "/api/produtos/base" (base geral). */
  async function carregar(apiUrl: string, produtoId: string | null, temFoto: boolean, rota = "/api/produtos") {
    if (!produtoId || !temFoto) {
      revogar();
      return;
    }
    carregando.value = true;
    try {
      const resposta = await fetch(`${apiUrl}${rota}/${produtoId}/foto`, { credentials: "include" });
      if (!resposta.ok) {
        revogar();
        return;
      }
      const blob = await resposta.blob();
      revogar();
      endereco.value = URL.createObjectURL(blob);
    } catch {
      revogar();
    } finally {
      carregando.value = false;
    }
  }

  onBeforeUnmount(revogar);

  return { endereco, carregando, carregar, mostrarArquivoLocal, revogar };
}
