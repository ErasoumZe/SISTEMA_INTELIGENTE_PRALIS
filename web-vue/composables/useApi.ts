import { getCurrentInstance } from "vue";
import { useTheme } from "vuetify";
import type { ApiPaginated, ApiSuccess, AuthSession, ProblemDetails, TemaAplicacao } from "@padaria/shared";
import { inkParaSuperficie } from "~/utils/tema";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Meta: alguns endpoints mandam mais coisa alem da paginacao (ex.: meta.totais do filtro, no
// historico de caixas). Fica tipado por quem chama; quem nao precisa simplesmente ignora.
type PaginatedClientResult<T, Meta = unknown> = {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
  meta: Meta | null;
};

function isProblemDetails(valor: unknown): valor is ProblemDetails {
  return Boolean(valor && typeof valor === "object" && "title" in valor && "status" in valor);
}

// Erro de API que preserva o status HTTP e o codigo do ProblemDetails (ex.: DUPLICATE_PRODUCT).
export class ErroApiCliente extends Error {
  status: number;
  codigo?: string;
  details?: unknown;
  constructor(mensagem: string, status: number, codigo?: string, details?: unknown) {
    super(mensagem);
    this.name = "ErroApiCliente";
    this.status = status;
    this.codigo = codigo;
    this.details = details;
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
    const details = isProblemDetails(payload) ? payload.details : undefined;
    throw new ErroApiCliente(mensagemErroApi(payload), resposta.status, codigo, details);
  }
  return payload;
}

async function request<T>(apiUrl: string, method: HttpMethod, rota: string, body?: unknown): Promise<T> {
  const payload = await rawRequest(apiUrl, method, rota, body);
  if (isApiSuccess<T>(payload)) return payload.data;
  return payload as T;
}

async function requestPaginado<T, Meta = unknown>(
  apiUrl: string,
  rota: string
): Promise<PaginatedClientResult<T, Meta>> {
  const payload = await rawRequest(apiUrl, "GET", rota);
  if (!isApiSuccess<T[]>(payload) || !("meta" in payload)) {
    return { itens: [], total: 0, page: 1, pageSize: 10, meta: null };
  }
  const paginado = payload as ApiPaginated<T>;
  return {
    itens: paginado.data,
    total: paginado.meta.pagination.total,
    page: paginado.meta.pagination.page,
    pageSize: paginado.meta.pagination.pageSize,
    meta: paginado.meta as Meta
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

  async function apiGetPaginado<T, Meta = unknown>(rota: string) {
    return requestPaginado<T, Meta>(apiUrl, rota);
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
    // empresa escolhe um cartao escuro.
    const raiz = document.documentElement.style;
    const { ink, inkSoft } = inkParaSuperficie(tema.corCartao);
    // PONTE COM A CAMADA DE TOKENS (main.css, bloco --cx-*).
    // As superficies/tintas da empresa passam a ser injetadas num namespace proprio,
    // --empresa-*, que os --cx-* leem com fallback de fabrica:
    //     --cx-canvas: var(--empresa-fundo, #f4f6fa);
    // Duas coisas dependem disso:
    // 1. os quatro vocabularios antigos (--marca-*, --padaria-*, neutros V1, --shell-*)
    //    sao alias de --cx-*, entao continuam recebendo a cor da empresa sem que
    //    precisemos escrever em cada um deles aqui;
    // 2. o modo escuro redefine --cx-*, que ninguem injeta inline. Antes o escuro
    //    disputava com ESTAS linhas e so vencia com !important em cada var — era
    //    isso que sustentava a pilha de !important no main.css.
    // Ao criar token novo de superficie/tinta, ele nasce lendo --empresa-*: nao ha
    // um segundo lugar para lembrar de atualizar.
    raiz.setProperty("--empresa-fundo", tema.corFundo);
    raiz.setProperty("--empresa-superficie", tema.corCartao);
    raiz.setProperty("--empresa-tinta", ink);
    raiz.setProperty("--empresa-tinta-suave", inkSoft);
    // Acento POR TELA (Entradas amarelo, Mercadorias verde...): e o unico valor aqui que
    // muda a cada navegacao, entao segue direto em --padaria-brand/-accent e NAO alimenta
    // a marca da casca (--cx-brand), que precisa ficar estavel entre as telas.
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
