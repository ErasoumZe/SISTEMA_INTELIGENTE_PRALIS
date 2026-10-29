import { JWT, OAuth2Client } from "google-auth-library";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../api/src/env.js";
import {
  criarClienteGoogle,
  GoogleConfiguracaoAusenteError,
  normalizarChavePrivada
} from "../../api/src/google/google-auth.js";

// 28/10/2026: em producao o OAuth do ERP estava vazio e o fiscal do cadastro nao lia a planilha. O ERP passa a
// aceitar a CONTA DE SERVICO, a mesma credencial do "cadastro de produtos paralelo".
const MIOLO = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC" + "A".repeat(100);
const PEM = `-----BEGIN PRIVATE KEY-----\n${MIOLO.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;

const originais = {
  id: env.GOOGLE_CLIENT_ID,
  segredo: env.GOOGLE_CLIENT_SECRET,
  refresh: env.GOOGLE_REFRESH_TOKEN,
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  chave: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
};
const definir = (valores: Partial<Record<keyof typeof originais, string | undefined>>) => {
  const alvo = env as unknown as Record<string, string | undefined>;
  alvo["GOOGLE_CLIENT_ID"] = valores.id;
  alvo["GOOGLE_CLIENT_SECRET"] = valores.segredo;
  alvo["GOOGLE_REFRESH_TOKEN"] = valores.refresh;
  alvo["GOOGLE_SERVICE_ACCOUNT_EMAIL"] = valores.email;
  alvo["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] = valores.chave;
};

afterEach(() => definir(originais));

describe("normalizarChavePrivada (igual ao normalizePrivateKey do paralelo)", () => {
  it("converte \\n LITERAL em quebra real (caso do Coolify)", () => {
    expect(normalizarChavePrivada(PEM.replace(/\n/g, "\\n"))).toBe(PEM);
  });
  it("aceita CRLF, aspas e o PEM achatado com espacos", () => {
    expect(normalizarChavePrivada(PEM.replace(/\n/g, "\r\n"))).toBe(PEM);
    expect(normalizarChavePrivada(`"${PEM.trim()}"`)).toBe(PEM);
    expect(normalizarChavePrivada(PEM.replace(/\n/g, " "))).toBe(PEM);
  });
  it("vazio continua vazio", () => {
    expect(normalizarChavePrivada("  ")).toBe("");
  });
});

describe("criarClienteGoogle", () => {
  it("com o OAuth configurado, segue usando o OAuth (comportamento de antes)", () => {
    definir({
      id: "cliente",
      segredo: "segredo",
      refresh: "refresh",
      email: "conta@x.iam.gserviceaccount.com",
      chave: PEM
    });
    const cliente = criarClienteGoogle();
    expect(cliente).toBeInstanceOf(OAuth2Client);
    expect(cliente).not.toBeInstanceOf(JWT);
  });
  it("sem OAuth, usa a conta de servico com os escopos de Drive e Sheets", () => {
    definir({ email: "conta@x.iam.gserviceaccount.com", chave: PEM.replace(/\n/g, "\\n") });
    const cliente = criarClienteGoogle() as JWT;
    expect(cliente).toBeInstanceOf(JWT);
    expect(cliente.email).toBe("conta@x.iam.gserviceaccount.com");
    expect(cliente.key).toBe(PEM);
    expect(cliente.scopes).toEqual([
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets"
    ]);
  });
  it("sem nenhuma credencial, a integracao nao esta configurada", () => {
    definir({});
    expect(() => criarClienteGoogle()).toThrow(GoogleConfiguracaoAusenteError);
  });
});
