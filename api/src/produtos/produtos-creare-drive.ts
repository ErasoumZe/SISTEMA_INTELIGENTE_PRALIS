import { z } from "zod";
import { env } from "../env.js";
import {
  cabecalhoGoogle,
  executarGoogle,
  executarGoogleJson,
  obterTokenGoogle,
  type GoogleFetcher
} from "../google/google-errors.js";
import { sobTeste } from "../google/google-sheets-gateway.js";
import {
  CreareIndisponivelError,
  empresaDaLojaCreare,
  gerarTxtCompleto,
  lojaCreareDaEmpresa
} from "./produtos-creare.service.js";

/**
 * Publica o TXT do cadastro da loja na pasta do Google Drive dela — porte de `creare-drive.service.ts` e
 * `creare-drive.client.ts` do app oficial (R-222). DESLIGADO ate a virada (`CREARE_DRIVE_ENABLED`).
 *
 * - A maquina da loja enxerga a pasta do Drive montada; a API nao. O Drive para Desktop entrega o arquivo.
 * - O arquivo e o CATALOGO INTEIRO da loja: publicar so o produto salvo faria o segundo salvamento apagar
 *   o primeiro antes da importacao no PDV.
 * - So ATUALIZA arquivo que ja existe, nunca cria (no oficial a conta de servico nao tem cota no "Meu
 *   Drive" de uma conta Gmail; o arquivo e criado UMA vez por uma pessoa). `sem_arquivo` e esse recado.
 * - NUNCA LANCA: salvar produto nao pode falhar porque o Google esta fora do ar.
 */
export type ResultadoPublicacao =
  | "publicado"
  | "desligado"
  | "sem_pasta"
  | "sem_arquivo"
  | "sem_depara"
  | "sem_produtos"
  | "falhou";

export interface DriveGateway {
  /** Id do arquivo com esse nome na pasta, ou `null` se ele nao existe la. */
  acharArquivo(pastaId: string, nome: string): Promise<string | null>;
  atualizarArquivo(arquivoId: string, conteudo: Buffer): Promise<void>;
}

export class CreareDriveSobTesteError extends Error {
  constructor(operacao: string) {
    super(
      `Bloqueado: o cliente REAL do Google Drive foi acionado dentro de um teste (${operacao}). ` +
        "Injete um duble de DriveGateway em vez de usar o cliente real."
    );
    this.name = "CreareDriveSobTesteError";
  }
}

/** Cliente real (OAuth do ERP, escopo `drive`: o arquivo e do dono da pasta, nao do app). */
export class GoogleDriveCreareGateway implements DriveGateway {
  constructor(
    private readonly fetcher: GoogleFetcher = (input, init) => fetch(input, init),
    private readonly tokenProvider: () => Promise<string> = obterTokenGoogle
  ) {}

  private async token(operacao: string): Promise<string> {
    // A mesma trava do Sheets: aqui o estrago seria entregar um arquivo de teste na pasta do PDV.
    if (sobTeste()) throw new CreareDriveSobTesteError(operacao);
    return this.tokenProvider();
  }

  async acharArquivo(pastaId: string, nome: string): Promise<string | null> {
    const token = await this.token("busca do arquivo");
    const escapar = (valor: string) => valor.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    const q = `name = '${escapar(nome)}' and '${escapar(pastaId)}' in parents and trashed = false`;
    const res = await executarGoogleJson<{ files?: Array<{ id?: string }> }>(
      this.fetcher,
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=2&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: cabecalhoGoogle(token) },
      "buscar o arquivo do CREARE no Drive"
    );
    return res.files?.[0]?.id ?? null;
  }

  async atualizarArquivo(arquivoId: string, conteudo: Buffer): Promise<void> {
    const token = await this.token("atualizacao do arquivo");
    await executarGoogle(
      this.fetcher,
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(arquivoId)}?uploadType=media&supportsAllDrives=true`,
      { method: "PATCH", headers: cabecalhoGoogle(token, "text/plain"), body: new Uint8Array(conteudo) },
      "atualizar o arquivo do CREARE no Drive"
    );
  }
}

let gatewayInjetado: DriveGateway | null = null;
/** So para testes: troca o cliente do Drive. */
export function definirDriveDoCreareParaTeste(gateway: DriveGateway | null): void {
  gatewayInjetado = gateway;
}
const drive = (): DriveGateway => gatewayInjetado ?? new GoogleDriveCreareGateway();

/*
 * Chave livre e nao `z.enum`: no Zod um record com chave de enum exige TODAS as chaves, e `{"TNP":"..."}`
 * sozinho era recusado (oficial). As lojas validas sao filtradas depois.
 */
const pastasSchema = z.record(z.string(), z.string().trim().min(1));
const LOJAS_VALIDAS = new Set(["TNP", "LI", "HORA"]);

/** Nunca lanca nem repete o JSON recebido: configuracao nao vaza em log nem em resposta. */
function pastas(): Record<string, string> {
  if (!env.CREARE_DRIVE_FOLDERS_JSON.trim()) return {};
  try {
    const lido = pastasSchema.safeParse(JSON.parse(env.CREARE_DRIVE_FOLDERS_JSON));
    if (!lido.success) return {};
    return Object.fromEntries(Object.entries(lido.data).filter(([loja]) => LOJAS_VALIDAS.has(loja)));
  } catch {
    return {};
  }
}

export const lojasComPastaNoDrive = (): string[] => Object.keys(pastas());

/** O nome e por loja: duas lojas nunca dividem arquivo, nem por engano. */
const nomeDoArquivo = (loja: string) => `cadastro-${loja.toLowerCase()}.txt`;

export async function publicarCreareNoDrive(loja: string): Promise<ResultadoPublicacao> {
  if (!env.CREARE_DRIVE_ENABLED) return "desligado";
  const pasta = pastas()[loja];
  if (!pasta) return "sem_pasta";

  let arquivo: Buffer;
  try {
    arquivo = (await gerarTxtCompleto(await empresaDaLojaCreare(loja))).txt;
  } catch (erro) {
    // Os dois casos esperados ganham nome proprio porque sao ACIONAVEIS na tela.
    if (erro instanceof CreareIndisponivelError && erro.code === "CREARE_DEPARA_MISSING") return "sem_depara";
    if (erro instanceof CreareIndisponivelError && erro.code === "CREARE_EMPTY") return "sem_produtos";
    return "falhou";
  }

  try {
    const existente = await drive().acharArquivo(pasta, nomeDoArquivo(loja));
    if (!existente) return "sem_arquivo";
    await drive().atualizarArquivo(existente, arquivo);
    return "publicado";
  } catch {
    return "falhou";
  }
}

/**
 * O que publicar depois de salvar um produto daquele catalogo: loja mexe so no proprio arquivo; a BASE
 * pode descer para todas (heranca), entao republica todas as configuradas.
 */
export async function publicarCreareAposSalvar(loja: string): Promise<Record<string, ResultadoPublicacao>> {
  if (!env.CREARE_DRIVE_ENABLED) return {};
  const configuradas = lojasComPastaNoDrive();
  const alvos = loja === "BASE" ? configuradas : configuradas.filter((l) => l === loja);
  const resultado: Record<string, ResultadoPublicacao> = {};
  for (const alvo of alvos) resultado[alvo] = await publicarCreareNoDrive(alvo).catch(() => "falhou" as const);
  return resultado;
}

/** Depois do commit de um produto da loja: publica o arquivo DAQUELA loja. Desligado, nem consulta o banco. */
export async function publicarCreareDaEmpresaAposSalvar(
  empresaId: string
): Promise<Record<string, ResultadoPublicacao>> {
  if (!env.CREARE_DRIVE_ENABLED) return {};
  try {
    return await publicarCreareAposSalvar(await lojaCreareDaEmpresa(empresaId));
  } catch {
    return {};
  }
}
