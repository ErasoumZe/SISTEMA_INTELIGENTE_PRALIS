import type { JsonValue } from "@padaria/shared";
import { ErroApiCliente, useApi } from "~/composables/useApi";

export type ArquivoBaixadoQuestor = {
  nomeArquivo: string;
  sha256: string | null;
  exportacaoId: string | null;
  reutilizado: boolean;
};

function nomeDoCabecalho(cabecalho: string | null, padrao: string): string {
  const achado = cabecalho?.match(/filename="([^"]+)"/u);
  return achado?.[1] ?? padrao;
}

/**
 * Download dos arquivos Questor (TXT/CSV). As rotas devolvem o arquivo cru, não o envelope `{ data }`,
 * então o erro (problem details) é lido aqui para a tela mostrar a mensagem e o código do servidor.
 */
export function useArquivoQuestor() {
  const { apiUrl } = useApi();

  async function baixar(rota: string, corpo?: Record<string, JsonValue>): Promise<ArquivoBaixadoQuestor> {
    const resposta = await fetch(`${apiUrl}${rota}`, {
      method: corpo === undefined ? "GET" : "POST",
      credentials: "include",
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store"
    });
    if (!resposta.ok) {
      const problema = (await resposta.json().catch(() => null)) as {
        title?: string;
        code?: string;
        details?: JsonValue;
      } | null;
      throw new ErroApiCliente(
        problema?.title ?? "Não foi possível gerar o arquivo.",
        resposta.status,
        problema?.code,
        problema?.details
      );
    }
    const nomeArquivo = nomeDoCabecalho(resposta.headers.get("content-disposition"), "questor.txt");
    const url = URL.createObjectURL(await resposta.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
    return {
      nomeArquivo,
      sha256: resposta.headers.get("x-questor-sha256"),
      exportacaoId: resposta.headers.get("x-questor-exportacao-id"),
      reutilizado: resposta.headers.get("x-questor-reutilizado") === "true"
    };
  }

  return { baixar };
}
