import { randomUUID } from "node:crypto";
import {
  atualizarArquivoGoogle,
  atualizarDependenteGoogle,
  atualizarLinhaColaboradorGoogle,
  atualizarPastaColaboradorGoogle,
  concluirDependenteGoogle,
  concluirSincronizacaoGoogle,
  falharArquivoGoogle,
  falharDependenteGoogle,
  falharSincronizacaoGoogle,
  obterOuCriarArquivoGoogle,
  obterOuCriarDependenteGoogle,
  obterOuCriarSincronizacaoGoogle,
  reivindicarSincronizacaoGoogle,
  type CriarArquivoGoogleInput,
  type CriarDependenteGoogleInput,
  type CriarSincronizacaoGoogleInput
} from "./google-sync.repository.js";

type ControleSincronizacao = Awaited<ReturnType<typeof obterOuCriarSincronizacaoGoogle>>;
type ControleDependente = Awaited<ReturnType<typeof obterOuCriarDependenteGoogle>>;
type ControleArquivo = Awaited<ReturnType<typeof obterOuCriarArquivoGoogle>>;

export type GoogleSyncStore = {
  obterOuCriarSincronizacao: (input: CriarSincronizacaoGoogleInput) => Promise<ControleSincronizacao>;
  reivindicarSincronizacao: (
    id: string,
    empresaId: string,
    token: string,
    bloqueioAte: Date
  ) => Promise<ControleSincronizacao>;
  concluirSincronizacao: (id: string, empresaId: string, token: string) => Promise<ControleSincronizacao>;
  falharSincronizacao: (
    id: string,
    empresaId: string,
    token: string,
    erro: { codigo: string; mensagem: string; proximaTentativaEm: Date | null }
  ) => Promise<ControleSincronizacao>;
  atualizarPastaColaborador: (
    id: string,
    empresaId: string,
    token: string,
    pastaId: string
  ) => Promise<ControleSincronizacao>;
  obterOuCriarDependente: (input: CriarDependenteGoogleInput) => Promise<ControleDependente>;
  obterOuCriarArquivo: (input: CriarArquivoGoogleInput) => Promise<ControleArquivo>;
  atualizarArquivo: (
    id: string,
    drive: { pastaId: string; arquivoId: string; link: string | null }
  ) => Promise<ControleArquivo>;
  atualizarDependente: (
    id: string,
    dados: { pastaId?: string; linha?: number; metadataId?: string }
  ) => Promise<ControleDependente>;
  concluirDependente: (id: string) => Promise<ControleDependente>;
  falharDependente: (id: string, erro: { codigo: string; mensagem: string }) => Promise<ControleDependente>;
  falharArquivo: (id: string, erro: { codigo: string; mensagem: string }) => Promise<ControleArquivo>;
  atualizarLinhaColaborador: (
    id: string,
    dados: { linha?: number; metadataId?: string }
  ) => Promise<ControleSincronizacao>;
};

const storePadrao: GoogleSyncStore = {
  obterOuCriarSincronizacao: (input) => obterOuCriarSincronizacaoGoogle(input),
  reivindicarSincronizacao: (id, empresaId, token, bloqueioAte) =>
    reivindicarSincronizacaoGoogle(id, empresaId, token, bloqueioAte),
  concluirSincronizacao: (id, empresaId, token) => concluirSincronizacaoGoogle(id, empresaId, token),
  falharSincronizacao: (id, empresaId, token, erro) => falharSincronizacaoGoogle(id, empresaId, token, erro),
  atualizarPastaColaborador: (id, empresaId, token, pastaId) =>
    atualizarPastaColaboradorGoogle(id, empresaId, token, pastaId),
  obterOuCriarDependente: (input) => obterOuCriarDependenteGoogle(input),
  obterOuCriarArquivo: (input) => obterOuCriarArquivoGoogle(input),
  atualizarArquivo: (id, drive) => atualizarArquivoGoogle(id, drive),
  atualizarDependente: (id, dados) => atualizarDependenteGoogle(id, dados),
  concluirDependente: (id) => concluirDependenteGoogle(id),
  falharDependente: (id, erro) => falharDependenteGoogle(id, erro),
  falharArquivo: (id, erro) => falharArquivoGoogle(id, erro),
  atualizarLinhaColaborador: (id, dados) => atualizarLinhaColaboradorGoogle(id, dados)
};

export class GoogleSyncFailure extends Error {
  constructor(
    public readonly code: "GOOGLE_SYNC_BUSY" | "GOOGLE_SYNC_FAILED",
    message: string
  ) {
    super(message);
    this.name = "GoogleSyncFailure";
  }
}

function erroSeguro(erro: object): { codigo: string; mensagem: string } {
  if (erro instanceof GoogleSyncFailure) return { codigo: erro.code, mensagem: erro.message };
  return { codigo: "GOOGLE_SYNC_FAILED", mensagem: "A sincronizacao de admissao falhou." };
}

function proximaTentativa(attempt: number): Date {
  const atrasoMs = Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempt, 10));
  return new Date(Date.now() + atrasoMs);
}

export type GoogleSyncContext = {
  sincronizacao: ControleSincronizacao;
  bloqueioToken: string;
  salvarPastaColaborador: (pastaId: string) => Promise<ControleSincronizacao>;
  salvarDependente: (input: CriarDependenteGoogleInput) => Promise<ControleDependente>;
  salvarArquivo: (input: CriarArquivoGoogleInput) => Promise<ControleArquivo>;
  salvarResultadoArquivo: (
    arquivoId: string,
    drive: { pastaId: string; arquivoId: string; link: string | null }
  ) => Promise<ControleArquivo>;
  salvarResultadoDependente: (
    dependenteControleId: string,
    dados: { pastaId?: string; linha?: number; metadataId?: string }
  ) => Promise<ControleDependente>;
  concluirDependente: (dependenteControleId: string) => Promise<ControleDependente>;
  falharDependente: (
    dependenteControleId: string,
    erro: { codigo: string; mensagem: string }
  ) => Promise<ControleDependente>;
  falharArquivo: (arquivoControleId: string, erro: { codigo: string; mensagem: string }) => Promise<ControleArquivo>;
  salvarLinhaColaborador: (linha: number, metadataId?: string) => Promise<ControleSincronizacao>;
};

export class GoogleSyncService {
  constructor(
    private readonly store: GoogleSyncStore = storePadrao,
    private readonly duracaoBloqueioMs = 5 * 60_000
  ) {}

  async obterOuCriar(input: CriarSincronizacaoGoogleInput) {
    return this.store.obterOuCriarSincronizacao(input);
  }

  async executarTentativa<T>(
    input: CriarSincronizacaoGoogleInput,
    trabalho: (contexto: GoogleSyncContext) => Promise<T>
  ): Promise<
    { status: "concluida"; sincronizacaoId: string; resultado: T } | { status: "em_andamento"; sincronizacaoId: string }
  > {
    const sincronizacao = await this.obterOuCriar(input);
    if (!sincronizacao) throw new GoogleSyncFailure("GOOGLE_SYNC_FAILED", "Controle de sincronizacao indisponivel.");

    const bloqueioToken = randomUUID();
    const bloqueada = await this.store.reivindicarSincronizacao(
      sincronizacao.id,
      input.empresaId,
      bloqueioToken,
      new Date(Date.now() + this.duracaoBloqueioMs)
    );
    if (!bloqueada) return { status: "em_andamento", sincronizacaoId: sincronizacao.id };

    const contexto: GoogleSyncContext = {
      sincronizacao: bloqueada,
      bloqueioToken,
      salvarPastaColaborador: (pastaId) =>
        this.store.atualizarPastaColaborador(bloqueada.id, input.empresaId, bloqueioToken, pastaId),
      salvarDependente: (dependenteInput) => this.store.obterOuCriarDependente(dependenteInput),
      salvarArquivo: (arquivoInput) => this.store.obterOuCriarArquivo(arquivoInput),
      salvarResultadoArquivo: (arquivoId, drive) => this.store.atualizarArquivo(arquivoId, drive),
      salvarResultadoDependente: (dependenteId, dados) => this.store.atualizarDependente(dependenteId, dados),
      concluirDependente: (dependenteId) => this.store.concluirDependente(dependenteId),
      falharDependente: (dependenteId, erro) => this.store.falharDependente(dependenteId, erro),
      falharArquivo: (arquivoId, erro) => this.store.falharArquivo(arquivoId, erro),
      salvarLinhaColaborador: (linha, metadataId) =>
        this.store.atualizarLinhaColaborador(bloqueada.id, metadataId === undefined ? { linha } : { linha, metadataId })
    };

    try {
      const resultado = await trabalho(contexto);
      await this.store.concluirSincronizacao(bloqueada.id, input.empresaId, bloqueioToken);
      return { status: "concluida", sincronizacaoId: bloqueada.id, resultado };
    } catch (erro) {
      const seguro = erroSeguro(erro instanceof Error ? erro : {});
      await this.store.falharSincronizacao(bloqueada.id, input.empresaId, bloqueioToken, {
        ...seguro,
        proximaTentativaEm: proximaTentativa(bloqueada.tentativa)
      });
      throw new GoogleSyncFailure(
        seguro.codigo === "GOOGLE_SYNC_BUSY" ? "GOOGLE_SYNC_BUSY" : "GOOGLE_SYNC_FAILED",
        seguro.mensagem
      );
    }
  }
}
