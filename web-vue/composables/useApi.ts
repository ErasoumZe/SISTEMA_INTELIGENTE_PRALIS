import { getCurrentInstance } from "vue";
import { useTheme } from "vuetify";
import type { ApiPaginated, ApiSuccess, AuthSession, ProblemDetails, TemaAplicacao } from "@padaria/shared";
import { inkParaSuperficie } from "~/utils/tema";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type PaginatedClientResult<T> = {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
};

function isProblemDetails(valor: unknown): valor is ProblemDetails {
  return Boolean(valor && typeof valor === "object" && "title" in valor && "status" in valor);
}

// Erro de API que preserva o status HTTP e o codigo do ProblemDetails (ex.: DUPLICATE_PRODUCT).
export class ErroApiCliente extends Error {
  status: number;
  codigo?: string;
  constructor(mensagem: string, status: number, codigo?: string) {
    super(mensagem);
    this.name = "ErroApiCliente";
    this.status = status;
    this.codigo = codigo;
  }
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

// Erros de validacao (VALIDATION_ERROR) trazem `details` = [{ caminho, mensagem }]. Sem isso o
// usuario so via "Requisicao invalida" e nao sabia QUAL campo faltou. Aqui anexamos os campos.
function detalhesValidacao(details: unknown): string {
  if (!Array.isArray(details)) return "";
  return details
    .map((item) => {
      if (!item || typeof item !== "object" || !("mensagem" in item)) return "";
      const caminho = "caminho" in item ? String((item as { caminho?: unknown }).caminho) : "";
      const mensagem = String((item as { mensagem?: unknown }).mensagem);
      return caminho ? `${caminho}: ${mensagem}` : mensagem;
    })
    .filter(Boolean)
    .join("; ");
}

function mensagemErroApi(body: unknown) {
  if (isProblemDetails(body)) {
    const detalhes = detalhesValidacao(body.details);
    return detalhes ? `${body.title} (${detalhes})` : body.title;
  }
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
  if (!resposta.ok) {
    const codigo = isProblemDetails(payload) ? payload.code : undefined;
    throw new ErroApiCliente(mensagemErroApi(payload), resposta.status, codigo);
  }
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

  // Tema do Vuetify — para que os componentes color="primary"/"secondary"/etc. sigam a aparencia.
  // useTheme() usa inject e so vale em setup; useApi() tambem roda em middleware (fora de setup),
  // por isso so capturamos quando ha instancia ativa. aplicarTema so e chamado de componentes.
  let temaVuetify: ReturnType<typeof useTheme> | null = null;
  if (getCurrentInstance()) {
    try {
      temaVuetify = useTheme();
    } catch {
      temaVuetify = null;
    }
  }

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

  async function apiPatch<T>(rota: string, body: unknown) {
    return request<T>(apiUrl, "PATCH", rota, body);
  }

  async function apiDelete<T>(rota: string) {
    return request<T>(apiUrl, "DELETE", rota);
  }

  async function carregarSessao(): Promise<AuthSession | null> {
    const resposta = await fetch(`${apiUrl}/api/me`, { credentials: "include", cache: "no-store" });
    if (resposta.status === 401) return null;
    const payload = await lerJson(resposta);
    if (!resposta.ok) throw new Error(mensagemErroApi(payload));
    return isApiSuccess<AuthSession>(payload) ? payload.data : (payload as AuthSession);
  }

  function aplicarTema(tema: TemaAplicacao, temaResumoCaixa: TemaAplicacao = tema) {
    // Cores do Vuetify via API de tema: regenera as triplas RGB reativamente, entao todos os
    // componentes color="primary"/"secondary"/"success"/"warning"/"error" seguem a aparencia.
    // (Antes gravavamos --v-theme-primary como hex, formato invalido para o Vuetify -> nao pegava.)
    const cores = temaVuetify?.themes.value["padariaLight"]?.colors;
    if (cores) {
      cores["primary"] = tema.corPrimaria;
      cores["secondary"] = tema.corSecundaria;
      cores["success"] = tema.corSucesso;
      cores["warning"] = tema.corAviso;
      cores["error"] = tema.corErro;
      cores["background"] = tema.corFundo;
      cores["surface"] = tema.corCartao;
    }
    // Texto (ink) que contrasta com o cartao personalizado — mantem menu/cards legiveis quando a
    // empresa escolhe um cartao escuro (modo escuro segue protegido pelos !important em main.css).
    const raiz = document.documentElement.style;
    const { ink, inkSoft } = inkParaSuperficie(tema.corCartao);
    // Camada de identidade Pralis (--pralis-*, definida em :root) — sobreposta aqui inline para
    // que fundo/cartao/texto do menu tambem sigam a aparencia da empresa.
    raiz.setProperty("--pralis-canvas", tema.corFundo);
    raiz.setProperty("--pralis-surface", tema.corCartao);
    raiz.setProperty("--pralis-ink", ink);
    raiz.setProperty("--pralis-ink-soft", inkSoft);
    // Variaveis proprias (hex) usadas pelo CSS da aplicacao (sidebar, cards, resumo de caixa).
    document.documentElement.style.setProperty("--padaria-background", tema.corFundo);
    document.documentElement.style.setProperty("--padaria-card", tema.corCartao);
    document.documentElement.style.setProperty("--padaria-foreground", ink);
    document.documentElement.style.setProperty("--padaria-brand", tema.corPrimaria);
    document.documentElement.style.setProperty("--padaria-accent", tema.corSecundaria);
    document.documentElement.style.setProperty("--padaria-card-entrada", temaResumoCaixa.corAviso);
    document.documentElement.style.setProperty("--padaria-card-transferencia", temaResumoCaixa.corSecundaria);
    document.documentElement.style.setProperty("--padaria-card-despesa", temaResumoCaixa.corErro);
    document.documentElement.style.setProperty("--padaria-card-retirada", temaResumoCaixa.corPrimaria);
    document.documentElement.style.setProperty("--padaria-card-saldo", temaResumoCaixa.corSucesso);
  }

  return { apiUrl, apiGet, apiGetPaginado, apiPost, apiPut, apiPatch, apiDelete, carregarSessao, aplicarTema };
}
