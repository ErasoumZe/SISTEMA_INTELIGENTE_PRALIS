import type { ApiPaginated, ApiSuccess, AuthSession, ProblemDetails, TemaAplicacao } from "@padaria/shared";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type PaginatedClientResult<T> = {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
};

function isProblemDetails(valor: unknown): valor is ProblemDetails {
  return Boolean(valor && typeof valor === "object" && "title" in valor && "status" in valor);
}

function isApiSuccess<T>(valor: unknown): valor is ApiSuccess<T> {
  return Boolean(valor && typeof valor === "object" && "ok" in valor && (valor as { ok?: unknown }).ok === true);
}

async function lerJson(resposta: Response) {
  const texto = await resposta.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

function mensagemErroApi(body: unknown) {
  if (isProblemDetails(body)) return body.title;
  if (body && typeof body === "object" && "erro" in body) return String((body as { erro?: unknown }).erro);
  if (body && typeof body === "object" && "error" in body) return String((body as { error?: unknown }).error);
  return typeof body === "string" ? body : "Erro na requisicao";
}

async function rawRequest(apiUrl: string, method: HttpMethod, rota: string, body?: unknown) {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (resposta.status === 204) return undefined;
  const payload = await lerJson(resposta);
  if (!resposta.ok) throw new Error(mensagemErroApi(payload));
  return payload;
}

async function request<T>(apiUrl: string, method: HttpMethod, rota: string, body?: unknown): Promise<T> {
  const payload = await rawRequest(apiUrl, method, rota, body);
  if (isApiSuccess<T>(payload)) return payload.data;
  return payload as T;
}

async function requestPaginado<T>(apiUrl: string, rota: string): Promise<PaginatedClientResult<T>> {
  const payload = await rawRequest(apiUrl, "GET", rota);
  if (!isApiSuccess<T[]>(payload) || !("meta" in payload)) {
    return { itens: [], total: 0, page: 1, pageSize: 10 };
  }
  const paginado = payload as ApiPaginated<T>;
  return {
    itens: paginado.data,
    total: paginado.meta.pagination.total,
    page: paginado.meta.pagination.page,
    pageSize: paginado.meta.pagination.pageSize
  };
}

export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = String(config.public.apiUrl || "http://localhost:4100");

  async function apiGet<T>(rota: string) {
    return request<T>(apiUrl, "GET", rota);
  }

  async function apiGetPaginado<T>(rota: string) {
    return requestPaginado<T>(apiUrl, rota);
  }

  async function apiPost<T>(rota: string, body: unknown) {
    return request<T>(apiUrl, "POST", rota, body);
  }

  async function apiPut<T>(rota: string, body: unknown) {
    return request<T>(apiUrl, "PUT", rota, body);
  }

  async function apiDelete<T>(rota: string) {
    return request<T>(apiUrl, "DELETE", rota);
  }

  async function carregarSessao(): Promise<AuthSession | null> {
    const resposta = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
    if (resposta.status === 401) return null;
    const payload = await lerJson(resposta);
    if (!resposta.ok) throw new Error(mensagemErroApi(payload));
    return isApiSuccess<AuthSession>(payload) ? payload.data : (payload as AuthSession);
  }

  function aplicarTema(tema: TemaAplicacao) {
    document.documentElement.style.setProperty("--padaria-background", tema.corFundo);
    document.documentElement.style.setProperty("--padaria-card", tema.corCartao);
    document.documentElement.style.setProperty("--v-theme-primary", tema.corPrimaria);
    document.documentElement.style.setProperty("--v-theme-secondary", tema.corSecundaria);
  }

  return { apiUrl, apiGet, apiGetPaginado, apiPost, apiPut, apiDelete, carregarSessao, aplicarTema };
}
