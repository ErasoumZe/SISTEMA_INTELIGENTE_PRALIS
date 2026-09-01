import { createHash, randomBytes } from "node:crypto";
import type { PerfilUsuario } from "@padaria/shared";
import {
  avisoVigenteDoAmbiente,
  diasDeValidadeDoConvite,
  type ConviteDto,
  type ConviteEmitidoDto,
  type PainelConviteDto
} from "@padaria/shared";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, naoEncontrado } from "../erros.js";
import { env } from "../env.js";
import { atorDoPerfil, empresaDoAtor } from "./ator.js";
import {
  criarConviteRepository,
  obterConviteVigenteRepository,
  revogarConviteVigenteRepository
} from "./convites.repository.js";
import {
  avancarVersaoProcessoRepository,
  bloquearInternosRepository,
  bloquearProcessoRepository,
  registrarEventoProcessoRepository
} from "./processos.repository.js";

/**
 * ADM-003 V2 â€” emissao e revogacao do convite ao candidato.
 *
 * O token e gerado aqui, mostrado UMA vez e nunca mais: o banco guarda so o SHA-256. Mesma
 * disciplina de `caixa_autorizacoes` â€” guardar o segredo em claro faria do backup uma copia das
 * chaves. A diferenca e o tamanho: aquele token e ditado por voz e vive 15 minutos; este viaja num
 * link e vive 14 dias, entao precisa de entropia de verdade.
 */

const BYTES_DO_TOKEN = 32;

function gerarToken(): string {
  return randomBytes(BYTES_DO_TOKEN).toString("hex");
}

export function hashTokenConvite(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function ehProducao(): boolean {
  return env.NODE_ENV === "production";
}

function expirado(convite: { expiraEm: Date }): boolean {
  return convite.expiraEm.getTime() <= Date.now();
}

function paraDto(linha: {
  id: string;
  expiraEm: Date;
  criadoEm: Date;
  criadoPorNome: string | null;
  avisoPrivacidadeVersao: string;
  primeiroAcessoEm: Date | null;
  ultimoAcessoEm: Date | null;
}): ConviteDto {
  return {
    id: linha.id,
    expiraEm: linha.expiraEm.toISOString(),
    criadoEm: linha.criadoEm.toISOString(),
    criadoPorNome: linha.criadoPorNome,
    avisoPrivacidadeVersao: linha.avisoPrivacidadeVersao,
    expirado: expirado(linha),
    primeiroAcessoEm: linha.primeiroAcessoEm?.toISOString() ?? null,
    ultimoAcessoEm: linha.ultimoAcessoEm?.toISOString() ?? null
  };
}

/**
 * **G-2** â€” a guarda de emissao. Sem aviso que valha no ambiente, o sistema e INCAPAZ de emitir.
 *
 * Devolve o motivo, ou vazio quando da para emitir. E texto porque a tela mostra a razao em vez de
 * um botao morto: dizer "indisponivel" sem dizer por que faz o DP tentar de novo.
 */
function motivoDeNaoPoderEmitir(): string {
  if (avisoVigenteDoAmbiente(ehProducao()) === null) {
    return "O aviso de privacidade vigente e de teste e nao vale em producao. Nenhum convite e emitido.";
  }
  return "";
}

/** O que a tela do DP precisa saber sobre o convite deste processo. */
export async function obterPainelConvite(processoId: string, perfil?: PerfilUsuario): Promise<PainelConviteDto> {
  const empresaId = empresaDoAtor(perfil);
  const motivo = motivoDeNaoPoderEmitir();
  const vigente = await obterConviteVigenteRepository(processoId, empresaId);
  const convite = vigente ? paraDto(vigente) : null;

  if (motivo) return { situacao: "indisponivel", motivo, convite };
  if (!convite) return { situacao: "ausente", motivo: "", convite: null };
  return { situacao: convite.expirado ? "expirado" : "vigente", motivo: "", convite };
}

/**
 * Emite o convite. Reemitir REVOGA o anterior na mesma transacao.
 *
 * A revogacao nao e cortesia: o unique parcial `(processo_id) where revogado_em is null` nao conhece
 * `expira_em`, entao um convite vencido e nao revogado ocuparia a vaga para sempre e o DP nao
 * conseguiria mandar link novo para quem perdeu o prazo. Revogar antes de inserir e o que mantem a
 * reemissao possivel â€” e o unique e quem garante isso sob concorrencia, nao a pre-checagem.
 */
export async function emitirConvite(processoId: string, perfil?: PerfilUsuario): Promise<ConviteEmitidoDto> {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);

  const motivo = motivoDeNaoPoderEmitir();
  if (motivo) throw conflito(motivo, "CONVITE_INDISPONIVEL");
  const avisoVersao = avisoVigenteDoAmbiente(ehProducao());
  if (avisoVersao === null) throw conflito(motivo, "CONVITE_INDISPONIVEL");

  const token = gerarToken();
  const expiraEm = new Date(Date.now() + diasDeValidadeDoConvite * 24 * 60 * 60 * 1000);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(processoId, empresaId, tx);
    if (!alvo) throw naoEncontrado("Processo de admissao nao encontrado");
    if (alvo.status !== "iniciado") {
      throw conflito("Este processo nao esta em andamento.", "PROCESSO_NAO_CONVIDAVEL");
    }
    await recusarSeExameNaoEstaApto(processoId, empresaId, tx);

    await revogarConviteVigenteRepository({ processoId, empresaId, revogadoPor: ator }, tx);
    const criado = await criarConviteRepository(
      {
        empresaId,
        processoId,
        tokenHash: hashTokenConvite(token),
        expiraEm,
        avisoPrivacidadeVersao: avisoVersao,
        criadoPor: ator
      },
      tx
    );

    const avancada = await avancarVersaoProcessoRepository(
      { id: processoId, empresaId, versaoAtual: alvo.versao, atorUsuarioId: ator },
      tx
    );
    if (avancada === null) throw conflito("Este processo mudou enquanto voce trabalhava.", "VERSAO_CONFLITANTE");
    await registrarEventoProcessoRepository(
      { processoId, empresaId, versao: avancada.versao, acao: "convite_gerado", atorUsuarioId: ator, camposAlterados: [] },
      tx
    );

    const vigente = await obterConviteVigenteRepository(processoId, empresaId, tx);
    if (!vigente) throw new Error("Convite emitido nao encontrado na mesma transacao");
    // O token em claro sai AQUI, e so aqui. Nao ha rota que o devolva depois.
    return { ...paraDto(vigente), token, id: criado.id };
  });
}

export async function revogarConvite(processoId: string, perfil?: PerfilUsuario): Promise<void> {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(processoId, empresaId, tx);
    if (!alvo) throw naoEncontrado("Processo de admissao nao encontrado");

    const revogado = await revogarConviteVigenteRepository({ processoId, empresaId, revogadoPor: ator }, tx);
    if (revogado === null) throw conflito("Nao ha convite vigente para revogar.", "CONVITE_AUSENTE");

    const avancada = await avancarVersaoProcessoRepository(
      { id: processoId, empresaId, versaoAtual: alvo.versao, atorUsuarioId: ator },
      tx
    );
    if (avancada === null) throw conflito("Este processo mudou enquanto voce trabalhava.", "VERSAO_CONFLITANTE");
    await registrarEventoProcessoRepository(
      { processoId, empresaId, versao: avancada.versao, acao: "convite_revogado", atorUsuarioId: ator, camposAlterados: [] },
      tx
    );
  });
}

/**
 * O convite so sai com ASO apto. E guarda de SERVIDOR: o botao desabilitado e conveniencia, e quem
 * chama a rota direto nao ve botao nenhum.
 */
async function recusarSeExameNaoEstaApto(processoId: string, empresaId: string, tx: TransacaoBanco) {
  // `bloquear` e nao apenas ler: entre a checagem e a insercao do convite alguem poderia gravar
  // um ASO nao apto, e o link sairia para quem acabou de ser reprovado.
  const internos = await bloquearInternosRepository(processoId, empresaId, tx);
  if (!internos || internos.exameSituacao !== "aso_apto") {
    throw conflito(
      "O exame admissional precisa estar apto antes de convidar o candidato.",
      "EXAME_NAO_APTO"
    );
  }
}
