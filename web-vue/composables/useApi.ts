import type { AuthSession, TemaAplicacao } from "@padaria/shared";

type HttpMethod = "GET" | "POST" | "PUT";

async function request<T>(apiUrl: string, method: HttpMethod, rota: string, body?: unknown): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!resposta.ok) throw new Error(await resposta.text());
  return resposta.json() as Promise<T>;
}

export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = String(config.public.apiUrl || "http://localhost:4100");

  async function apiGet<T>(rota: string) {
    return request<T>(apiUrl, "GET", rota);
  }

  async function apiPost<T>(rota: string, body: unknown) {
    return request<T>(apiUrl, "POST", rota, body);
  }

  async function apiPut<T>(rota: string, body: unknown) {
    return request<T>(apiUrl, "PUT", rota, body);
  }

  async function carregarSessao(): Promise<AuthSession | null> {
    const resposta = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
    if (resposta.status === 401) return null;
    if (!resposta.ok) throw new Error(await resposta.text());
    return resposta.json() as Promise<AuthSession>;
  }

  function aplicarTema(tema: TemaAplicacao) {
    document.documentElement.style.setProperty("--padaria-background", tema.corFundo);
    document.documentElement.style.setProperty("--padaria-card", tema.corCartao);
    document.documentElement.style.setProperty("--v-theme-primary", tema.corPrimaria);
    document.documentElement.style.setProperty("--v-theme-secondary", tema.corSecundaria);
  }

  return { apiUrl, apiGet, apiPost, apiPut, carregarSessao, aplicarTema };
}
