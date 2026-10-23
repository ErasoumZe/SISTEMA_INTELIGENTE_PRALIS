import { idsGoogleConfigurados } from "./google-auth.js";
import { cabecalhoGoogle, executarGoogleJson, obterTokenGoogle, type GoogleFetcher } from "./google-errors.js";
import { GoogleResourceOutsideRootError } from "./google-errors.js";

const MIME_PASTA = "application/vnd.google-apps.folder";
const CAMPOS_ARQUIVO = "id,name,mimeType,parents,webViewLink,trashed";
const MAX_NIVEIS_PASTA = 30;

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
};

type DriveFileList = { files?: DriveFile[] };

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  link: string;
};

export type UploadGoogleDriveInput = {
  parentFolderId: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
};

export type GoogleDriveServiceOptions = {
  fetcher?: GoogleFetcher;
  tokenProvider?: () => Promise<string>;
  rootFolderId?: string;
};

function fetcherPadrao(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function nomeDriveSeguro(nome: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|]/gu, "_").trim();
  if (!limpo) throw new Error("Nome do arquivo ou pasta obrigatorio");
  return limpo.slice(0, 180);
}

function valorQuery(valor: string): string {
  return valor.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export class GoogleDriveService {
  private readonly fetcher: GoogleFetcher;
  private readonly tokenProvider: () => Promise<string>;
  private readonly rootFolderId: string;

  constructor(opcoes: GoogleDriveServiceOptions = {}) {
    this.fetcher = opcoes.fetcher ?? fetcherPadrao;
    this.tokenProvider = opcoes.tokenProvider ?? obterTokenGoogle;
    this.rootFolderId = opcoes.rootFolderId ?? idsGoogleConfigurados().driveFolderId;
  }

  private async token(): Promise<string> {
    return this.tokenProvider();
  }

  private async obterArquivo(id: string): Promise<DriveFile> {
    const token = await this.token();
    return executarGoogleJson<DriveFile>(
      this.fetcher,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${CAMPOS_ARQUIVO}`,
      { headers: cabecalhoGoogle(token) },
      "consultar recurso do Drive"
    );
  }

  async verificarPastaDentroDaRaiz(folderId: string): Promise<void> {
    if (folderId === this.rootFolderId) return;

    let atual = folderId;
    const vistos = new Set<string>();
    for (let nivel = 0; nivel < MAX_NIVEIS_PASTA; nivel += 1) {
      if (vistos.has(atual)) break;
      vistos.add(atual);
      const arquivo = await this.obterArquivo(atual);
      if (arquivo.mimeType !== MIME_PASTA || arquivo.trashed) throw new GoogleResourceOutsideRootError();
      if (arquivo.parents?.includes(this.rootFolderId)) return;
      const proximo = arquivo.parents?.[0];
      if (!proximo) break;
      if (proximo === this.rootFolderId) return;
      atual = proximo;
    }
    throw new GoogleResourceOutsideRootError();
  }

  async localizarPasta(nome: string, parentFolderId = this.rootFolderId): Promise<GoogleDriveFile | null> {
    await this.verificarPastaDentroDaRaiz(parentFolderId);
    const token = await this.token();
    const query = [
      `'${valorQuery(parentFolderId)}' in parents`,
      `name = '${valorQuery(nomeDriveSeguro(nome))}'`,
      `mimeType = '${MIME_PASTA}'`,
      "trashed = false"
    ].join(" and ");
    const resposta = await executarGoogleJson<DriveFileList>(
      this.fetcher,
      `https://www.googleapis.com/drive/v3/files?fields=files(${CAMPOS_ARQUIVO})&pageSize=10&q=${encodeURIComponent(query)}`,
      { headers: cabecalhoGoogle(token) },
      "localizar pasta no Drive"
    );
    const pasta = resposta.files?.find((arquivo) => arquivo.mimeType === MIME_PASTA && !arquivo.trashed);
    return pasta?.id ? this.converterArquivo(pasta) : null;
  }

  async localizarArquivo(nome: string, parentFolderId: string, mimeType?: string): Promise<GoogleDriveFile | null> {
    await this.verificarPastaDentroDaRaiz(parentFolderId);
    const token = await this.token();
    const query = [
      `'${valorQuery(parentFolderId)}' in parents`,
      `name = '${valorQuery(nomeDriveSeguro(nome))}'`,
      "trashed = false",
      ...(mimeType ? [`mimeType = '${valorQuery(mimeType)}'`] : [])
    ].join(" and ");
    const resposta = await executarGoogleJson<DriveFileList>(
      this.fetcher,
      `https://www.googleapis.com/drive/v3/files?fields=files(${CAMPOS_ARQUIVO})&pageSize=10&q=${encodeURIComponent(query)}`,
      { headers: cabecalhoGoogle(token) },
      "localizar arquivo no Drive"
    );
    const arquivo = resposta.files?.find((item) => !item.trashed && (!mimeType || item.mimeType === mimeType));
    return arquivo?.id ? this.converterArquivo(arquivo) : null;
  }

  async localizarOuCriarPasta(nome: string, parentFolderId = this.rootFolderId): Promise<GoogleDriveFile> {
    const existente = await this.localizarPasta(nome, parentFolderId);
    if (existente) return existente;

    const token = await this.token();
    const resposta = await executarGoogleJson<DriveFile>(
      this.fetcher,
      "https://www.googleapis.com/drive/v3/files?fields=" + CAMPOS_ARQUIVO,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ name: nomeDriveSeguro(nome), mimeType: MIME_PASTA, parents: [parentFolderId] })
      },
      "criar pasta no Drive"
    );
    return this.converterArquivo(resposta);
  }

  async enviarArquivo(input: UploadGoogleDriveInput): Promise<GoogleDriveFile> {
    await this.verificarPastaDentroDaRaiz(input.parentFolderId);
    const token = await this.token();
    const boundary = `padaria-google-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: nomeDriveSeguro(input.fileName),
      parents: [input.parentFolderId],
      mimeType: input.mimeType
    });
    const prefixo = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
      "utf8"
    );
    const sufixo = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const resposta = await executarGoogleJson<DriveFile>(
      this.fetcher,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=" + CAMPOS_ARQUIVO,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, `multipart/related; boundary=${boundary}`),
        body: Buffer.concat([prefixo, Buffer.from(input.data), sufixo])
      },
      "enviar arquivo para o Drive"
    );
    return this.converterArquivo(resposta);
  }

  private converterArquivo(arquivo: DriveFile): GoogleDriveFile {
    if (!arquivo.id || !arquivo.name || !arquivo.mimeType || arquivo.trashed) {
      throw new Error("Resposta invalida do Drive");
    }
    return {
      id: arquivo.id,
      name: arquivo.name,
      mimeType: arquivo.mimeType,
      link: arquivo.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(arquivo.id)}`
    };
  }
}
