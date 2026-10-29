import { JWT, OAuth2Client } from "google-auth-library";
import { env } from "../env.js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets"
] as const;

export class GoogleConfiguracaoAusenteError extends Error {
  readonly code = "GOOGLE_NOT_CONFIGURED";

  constructor() {
    super("Integracao Google nao configurada");
    this.name = "GoogleConfiguracaoAusenteError";
  }
}

/**
 * Chave da conta de servico como o paralelo a le (`normalizePrivateKey`, copiado literalmente): o painel
 * entrega o PEM em uma linha com `\n` literal (Coolify), com quebras reais, entre aspas, com CRLF ou com
 * TODAS as quebras trocadas por espaco. Reconstroi o envelope e o corpo em linhas de 64 caracteres.
 */
export const normalizarChavePrivada = (bruta: string): string => {
  const semAspas = bruta
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim();
  if (semAspas === "") return "";
  const comQuebras = semAspas
    .split("\\r\\n")
    .join("\n")
    .split("\\n")
    .join("\n")
    .split("\\r")
    .join("\n")
    .split("\r\n")
    .join("\n")
    .split("\r")
    .join("\n")
    .trim();
  const partesPem = comQuebras.match(/^-----BEGIN ([A-Z0-9 ]+)-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END \1-----$/);
  if (partesPem) {
    const [, tipo, corpoComEspacos] = partesPem;
    const corpo = corpoComEspacos!.replace(/\s+/g, "");
    const linhas = corpo.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${tipo}-----\n${linhas.join("\n")}\n-----END ${tipo}-----\n`;
  }
  return `${comQuebras}\n`;
};

/**
 * Cliente Google do ERP. Com o OAuth da conta (admissao) configurado, segue igual a antes. Sem ele, usa a
 * CONTA DE SERVICO, a mesma credencial do "cadastro de produtos paralelo" (`GOOGLE_SERVICE_ACCOUNT_*`), que
 * ja e editora da planilha de cadastro. Sem nenhuma das duas, a integracao nao esta configurada (28/10/2026:
 * em producao o OAuth estava vazio e o fiscal nao lia a planilha).
 */
export function criarClienteGoogle(): OAuth2Client {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REFRESH_TOKEN: refreshToken } = env;
  if (clientId && clientSecret && refreshToken) {
    const cliente = new OAuth2Client(clientId, clientSecret);
    cliente.setCredentials({ refresh_token: refreshToken });
    return cliente;
  }
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chave = normalizarChavePrivada(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "");
  if (email && chave) return new JWT({ email, key: chave, scopes: [...GOOGLE_SCOPES] });
  throw new GoogleConfiguracaoAusenteError();
}

export function idsGoogleConfigurados(): { driveFolderId: string; spreadsheetId: string } {
  const { GOOGLE_DRIVE_FOLDER_ID: driveFolderId, GOOGLE_SPREADSHEET_ID: spreadsheetId } = env;
  if (!driveFolderId || !spreadsheetId) throw new GoogleConfiguracaoAusenteError();
  return { driveFolderId, spreadsheetId };
}
