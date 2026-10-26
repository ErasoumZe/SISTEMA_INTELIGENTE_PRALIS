import { OAuth2Client } from "google-auth-library";
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

export function criarClienteGoogle(): OAuth2Client {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REFRESH_TOKEN: refreshToken } = env;
  if (!clientId || !clientSecret || !refreshToken) throw new GoogleConfiguracaoAusenteError();

  const cliente = new OAuth2Client(clientId, clientSecret);
  cliente.setCredentials({ refresh_token: refreshToken });
  return cliente;
}

export function idsGoogleConfigurados(): { driveFolderId: string; spreadsheetId: string } {
  const { GOOGLE_DRIVE_FOLDER_ID: driveFolderId, GOOGLE_SPREADSHEET_ID: spreadsheetId } = env;
  if (!driveFolderId || !spreadsheetId) throw new GoogleConfiguracaoAusenteError();
  return { driveFolderId, spreadsheetId };
}
