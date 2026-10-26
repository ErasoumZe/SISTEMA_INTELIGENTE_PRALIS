import { criarClienteGoogle, GOOGLE_SCOPES, idsGoogleConfigurados } from "./google-auth.js";

type RecursoGoogle = {
  status: "ok" | "inacessivel" | "indisponivel";
  nome?: string;
  motivo?: string;
  alternativas?: string[];
};

export class GoogleConnectionError extends Error {
  readonly status = 503;
  readonly code = "GOOGLE_CONNECTION_FAILED";
  readonly details: { pasta: RecursoGoogle; planilha: RecursoGoogle };

  constructor(details: { pasta: RecursoGoogle; planilha: RecursoGoogle }) {
    super("Nao foi possivel validar o acesso aos recursos Google configurados");
    this.name = "GoogleConnectionError";
    this.details = details;
  }
}

type DriveFileResponse = { name?: string; mimeType?: string; trashed?: boolean };
type SpreadsheetResponse = { properties?: { title?: string } };

function alternativaDrive(): string[] {
  return [
    "Confirme que a pasta foi compartilhada com a conta que autorizou o refresh token.",
    "O escopo drive.file nao libera automaticamente todo o Drive; ele cobre arquivos criados pelo app ou abertos/concedidos a ele.",
    "Se a pasta existente continuar inacessivel, reavalie a autorizacao com um escopo Drive mais amplo antes de solicitar novos escopos."
  ];
}

function alternativaPlanilha(): string[] {
  return [
    "Confirme que a planilha foi compartilhada com a conta que autorizou o refresh token.",
    "Confirme que o ID da planilha corresponde ao arquivo correto.",
    "O escopo spreadsheets permite leitura e escrita na planilha, mas nao substitui a permissao de acesso ao arquivo."
  ];
}

async function acessarJson<T>(
  url: string,
  token: string
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, status: 0 };
  }
  if (!resposta.ok) return { ok: false, status: resposta.status };
  return { ok: true, data: (await resposta.json()) as T };
}

function resultadoFalha(status: number, alternativas: string[]): RecursoGoogle {
  if (status === 401 || status === 403 || status === 404) {
    return { status: "inacessivel", motivo: "ACESSO_NEGADO_OU_RECURSO_NAO_ENCONTRADO", alternativas };
  }
  return { status: "indisponivel", motivo: "SERVICO_GOOGLE_INDISPONIVEL" };
}

async function verificarPasta(token: string, id: string): Promise<RecursoGoogle> {
  const resposta = await acessarJson<DriveFileResponse>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType,trashed`,
    token
  );
  if (!resposta.ok) return resultadoFalha(resposta.status, alternativaDrive());
  if (resposta.data.mimeType !== "application/vnd.google-apps.folder" || resposta.data.trashed) {
    return { status: "inacessivel", motivo: "RECURSO_NAO_E_UMA_PASTA_ATIVA", alternativas: alternativaDrive() };
  }
  return { status: "ok", nome: resposta.data.name ?? "Pasta sem nome" };
}

async function verificarPlanilha(token: string, id: string): Promise<RecursoGoogle> {
  const resposta = await acessarJson<SpreadsheetResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=properties.title`,
    token
  );
  if (!resposta.ok) return resultadoFalha(resposta.status, alternativaPlanilha());
  return { status: "ok", nome: resposta.data.properties?.title ?? "Planilha sem titulo" };
}

export async function testarConexaoGoogle(): Promise<{
  status: "conectado";
  escopos: readonly string[];
  pasta: RecursoGoogle;
  planilha: RecursoGoogle;
}> {
  const cliente = criarClienteGoogle();
  const { driveFolderId, spreadsheetId } = idsGoogleConfigurados();
  let tokenResposta: { token?: string | null };
  try {
    tokenResposta = await cliente.getAccessToken();
  } catch {
    throw new GoogleConnectionError({
      pasta: { status: "indisponivel", motivo: "REFRESH_TOKEN_INVALIDO_OU_AUTORIZACAO_INDISPONIVEL" },
      planilha: { status: "indisponivel", motivo: "REFRESH_TOKEN_INVALIDO_OU_AUTORIZACAO_INDISPONIVEL" }
    });
  }
  if (!tokenResposta.token) {
    throw new GoogleConnectionError({
      pasta: { status: "indisponivel", motivo: "ACCESS_TOKEN_NAO_OBTIDO" },
      planilha: { status: "indisponivel", motivo: "ACCESS_TOKEN_NAO_OBTIDO" }
    });
  }

  const [pasta, planilha] = await Promise.all([
    verificarPasta(tokenResposta.token, driveFolderId),
    verificarPlanilha(tokenResposta.token, spreadsheetId)
  ]);
  if (pasta.status !== "ok" || planilha.status !== "ok") throw new GoogleConnectionError({ pasta, planilha });
  return { status: "conectado", escopos: GOOGLE_SCOPES, pasta, planilha };
}
