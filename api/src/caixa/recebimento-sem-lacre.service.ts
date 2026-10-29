import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { RecebimentoSemLacrePendente } from "@padaria/shared/caixa";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { ErroDominio } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  buscarCaixaPorIdRepository,
  listarUsuariosTesourariaRepository,
  travarCaixaCompartilhadoRepository
} from "./caixa.repository.js";
import {
  buscarRemetenteDoRecebimentoRepository,
  existeRecebimentoSemLacrePendenteRepository,
  listarRecebimentosSemLacreRepository,
  resolverRecebimentoSemLacreRepository
} from "./recebimento-sem-lacre.repository.js";
import { podeOperarCaixa } from "./caixa-acesso.js";

// R-231 · dinheiro sem lacre a caminho do caixa. O operador confirma (vira entrada) ou marca "Nao recebi" (cancela e
// o valor volta a origem, com aviso a Tesouraria). Enquanto houver um pendente, o caixa nao fecha.

export async function listarRecebimentosSemLacre(
  caixa: { id: string; pdvContaId: string },
  db?: ExecutorBanco
): Promise<RecebimentoSemLacrePendente[]> {
  const linhas = await listarRecebimentosSemLacreRepository(caixa.id, caixa.pdvContaId, db);
  return linhas.map((linha) => ({
    id: linha.id,
    valor: Number(linha.valor),
    valorEspecie: linha.valorEspecie === null ? null : Number(linha.valorEspecie),
    valorMoedas: linha.valorMoedas === null ? null : Number(linha.valorMoedas),
    origemNome: linha.origemNome,
    enviadoPorNome: linha.enviadoPorNome ?? null,
    enviadoEm: linha.enviadoEm.toISOString(),
    observacao: linha.observacao || null
  }));
}

export async function exigirSemRecebimentoSemLacrePendente(
  caixa: { id: string; pdvContaId: string },
  db?: ExecutorBanco
) {
  if (await existeRecebimentoSemLacrePendenteRepository(caixa.id, caixa.pdvContaId, db)) {
    throw new ErroDominio(
      "Há dinheiro sem lacre aguardando confirmação neste caixa. Confirme o recebimento ou marque “Não recebi” antes de fechar.",
      409,
      "RECEBIMENTO_SEM_LACRE_PENDENTE"
    );
  }
}

export async function resolverRecebimentoSemLacre(
  caixaId: string,
  transferenciaId: string,
  recebido: boolean,
  perfil: PerfilUsuario
) {
  return executarEmTransacao(async (tx) => {
    // R-164 · a confirmacao muda os totais do caixa: o caixa e o PRIMEIRO lock (FOR SHARE) e precisa estar aberto.
    const trava = await travarCaixaCompartilhadoRepository(caixaId, tx);
    const caixa = trava ? await buscarCaixaPorIdRepository(caixaId, tx) : null;
    if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw new Error("Caixa nao encontrado");
    if (!podeOperarCaixa(perfil, caixa)) throw new Error("Caixa nao permitido");
    if (trava?.status !== "aberto") {
      throw new ErroDominio("O caixa não está aberto.", 409, "CAIXA_NAO_ABERTO");
    }
    if ((await buscarRemetenteDoRecebimentoRepository(transferenciaId, tx)) === perfil.usuarioId) {
      throw new ErroDominio(
        "Quem enviou o dinheiro não confirma o próprio envio: o operador do caixa confirma.",
        409,
        "RECEBIMENTO_PROPRIO_ENVIO"
      );
    }
    const agora = new Date();
    const linha = await resolverRecebimentoSemLacreRepository(
      { transferenciaId, caixaId, pdvContaId: caixa.pdvContaId, recebido, usuarioId: perfil.usuarioId, agora },
      tx
    );
    if (!linha) {
      throw new ErroDominio("Este recebimento já foi resolvido.", 409, "RECEBIMENTO_SEM_LACRE_RESOLVIDO");
    }
    if (!recebido) {
      const destinatarios = new Set(
        (await listarUsuariosTesourariaRepository(caixa.empresaId, tx))
          .map((item) => item.usuarioId)
          .filter((usuarioId): usuarioId is string => Boolean(usuarioId))
      );
      if (linha.criadoPor) destinatarios.add(linha.criadoPor);
      await criarNotificacoesRepository(
        {
          empresaId: caixa.empresaId,
          tipo: "transferencia_divergencia",
          destinatariosUsuarioIds: [...destinatarios],
          referenciaId: linha.id,
          titulo: `Transferência sem lacre não recebida no ${caixa.pdvNome ?? "PDV"}`,
          valorCentavos: paraCentavos(linha.valor)
        },
        tx
      );
    }
    return { id: linha.id, status: recebido ? "recebido" : "cancelada" };
  });
}
