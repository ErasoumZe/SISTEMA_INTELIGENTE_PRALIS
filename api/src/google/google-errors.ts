import { criarClienteGoogle } from "./google-auth.js";

export type GoogleFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class GoogleApiError extends Error {
  readonly code = "GOOGLE_API_ERROR";

  constructor(
    readonly status: number,
    readonly operacao: string
  ) {
    super(`Falha segura ao comunicar com o Google durante ${operacao}`);
    this.name = "GoogleApiError";
  }
}

export class GoogleResourceOutsideRootError extends Error {
  readonly code = "GOOGLE_RESOURCE_OUTSIDE_ROOT";
  readonly status = 403;

  constructor() {
    super("O recurso Google esta fora da pasta raiz autorizada");
    this.name = "GoogleResourceOutsideRootError";
  }
}

export class GoogleSheetHeaderError extends Error {
  readonly code = "GOOGLE_SHEET_HEADERS_INVALID";
  readonly status = 422;

  constructor(
    readonly faltantes: readonly string[],
    readonly duplicados: readonly string[]
  ) {
    super("Os cabecalhos obrigatorios da planilha estao ausentes ou duplicados");
    this.name = "GoogleSheetHeaderError";
  }
}

export async function obterTokenGoogle(): Promise<string> {
  try {
    const resposta = await criarClienteGoogle().getAccessToken();
    if (!resposta.token) throw new GoogleApiError(503, "obter token");
    return resposta.token;
  } catch (error) {
    if (error instanceof GoogleApiError) throw error;
    throw new GoogleApiError(503, "obter token");
  }
}

export async function executarGoogle(
  fetcher: GoogleFetcher,
  url: string,
  init: RequestInit,
  operacao: string
): Promise<Response> {
  try {
    const resposta = await fetcher(url, init);
    if (!resposta.ok) throw new GoogleApiError(resposta.status, operacao);
    return resposta;
  } catch (error) {
    if (error instanceof GoogleApiError) throw error;
    throw new GoogleApiError(503, operacao);
  }
}

export async function executarGoogleJson<T>(
  fetcher: GoogleFetcher,
  url: string,
  init: RequestInit,
  operacao: string
): Promise<T> {
  const resposta = await executarGoogle(fetcher, url, init, operacao);
  return (await resposta.json()) as T;
}

export function cabecalhoGoogle(token: string, contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}
