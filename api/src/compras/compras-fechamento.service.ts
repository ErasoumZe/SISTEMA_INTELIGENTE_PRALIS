// MODULO DO COMPRADOR — fechamento da rodada por prazo (Fase 2, R-221 decisoes 6 e 12). Roda no
// agendador in-process do `server.ts`, no molde de `processarTransferenciasTemporais`. NAO e
// importado pelo modulo publico do fornecedor (isolamento).
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { statusSolicitacaoAposFechamento, type EncerrarRodadaPayload } from "@padaria/shared/compras";
import { sqlTravarPrecoBaseDaEmpresa, sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { rodadaItensAdjudicadosRepository } from "./compras-adjudicacao.repository.js";
import { solicitacaoDaRodadaRepository } from "./compras-decisao.repository.js";
import {
  atualizarStatusSolicitacaoRepository,
  comprasAutomaticasDaRodadaRepository,
  encerrarConvitesDaRodadaRepository,
  fecharRodadaRepository,
  listarRodadasVencidasRepository,
  substituirPrecoBaseRepository,
  totalItensDaRodadaRepository,
  travarRodadaRepository,
  type RodadaVencida
} from "./compras-fechamento.repository.js";

export type ResultadoFechamento = {
  rodadaId: string;
  fechada: boolean;
  comprados: number;
  pendentes: number;
  basesAtualizadas: number;
};

const NAO_FECHADA = (rodadaId: string): ResultadoFechamento => ({
  rodadaId,
  fechada: false,
  comprados: 0,
  pendentes: 0,
  basesAtualizadas: 0
});

/**
 * Fecha UMA rodada vencida numa transacao propria. Idempotente: revalida estado e prazo sob a trava,
 * entao um segundo tick (ou outra instancia) encontra a rodada ja fechada e nao faz nada.
 *
 * O que muda, tudo ou nada: rodada -> fechada (motivo 'prazo', sem autor humano); convites ainda
 * abertos -> encerrado; solicitacao -> comprada/parcialmente_comprada; base vigente dos itens
 * comprados AUTOMATICAMENTE passa a ser o custo final pago; aviso no sino se sobrou item sem vencedor.
 */
export function fecharRodadaPorPrazo(rodada: RodadaVencida, agora: Date): Promise<ResultadoFechamento> {
  return fecharRodada(rodada, { motivo: "prazo" }, agora);
}

/** Quem fecha e por que: o prazo nao tem autor humano; o "encerrar agora" tem o Comprador. */
type OrigemFechamento = { motivo: "prazo" } | { motivo: "comprador"; usuarioId: string };

async function fecharRodada(
  rodada: RodadaVencida,
  origem: OrigemFechamento,
  agora: Date
): Promise<ResultadoFechamento> {
  return executarEmTransacao(async (tx) => {
    // Ordem canonica de travas (doc 54): advisory da solicitacao -> rodada FOR UPDATE.
    await tx.execute(sqlTravarRodadaDeCompras(rodada.solicitacaoId));
    const travada = await travarRodadaRepository(rodada.id, tx);
    if (!travada || travada.status !== "aberta") return NAO_FECHADA(rodada.id);
    // So o fechamento por prazo exige o prazo vencido; o Comprador pode encerrar antes.
    if (origem.motivo === "prazo" && travada.expiraEm.getTime() > agora.getTime()) {
      return NAO_FECHADA(rodada.id);
    }

    const total = await totalItensDaRodadaRepository(travada.id, tx);
    const adjudicados = (await rodadaItensAdjudicadosRepository(travada.id, tx)).size;
    const pendentes = total - adjudicados;

    const fechou = await fecharRodadaRepository(
      {
        rodadaId: travada.id,
        fechadaEm: agora,
        motivo: origem.motivo,
        fechadaPor: origem.motivo === "comprador" ? origem.usuarioId : null
      },
      tx
    );
    if (!fechou) return NAO_FECHADA(rodada.id);
    await encerrarConvitesDaRodadaRepository(travada.id, tx);
    await atualizarStatusSolicitacaoRepository(
      {
        solicitacaoId: travada.solicitacaoId,
        empresaId: travada.empresaId,
        status: statusSolicitacaoAposFechamento(total, adjudicados),
        agora
      },
      tx
    );

    // Decisao 12: a base nova e o que a padaria PAGOU (custo final gravado da adjudicacao). Custo zero
    // e produto inativo ficam fora da base, como na importacao (R-220).
    let basesAtualizadas = 0;
    const paraBase = (await comprasAutomaticasDaRodadaRepository(travada.id, tx))
      .filter((compra) => compra.produtoAtivo && Number(compra.custoFinalUnitario) > 0)
      // Ordem fixa por produto: duas rodadas que trocam bases dos mesmos produtos nao se travam em ABBA.
      .sort((a, b) => a.produtoId.localeCompare(b.produtoId));
    // Rodadas de solicitacoes DIFERENTES nao compartilham a advisory da solicitacao; a troca da base e
    // do produto da empresa, entao ela serializa pela trava da base (a mesma da carga inicial).
    if (paraBase.length) await tx.execute(sqlTravarPrecoBaseDaEmpresa(travada.empresaId));
    for (const compra of paraBase) {
      await substituirPrecoBaseRepository(
        {
          empresaId: travada.empresaId,
          produtoId: compra.produtoId,
          valor: compra.custoFinalUnitario,
          rodadaId: travada.id,
          criadoPor: travada.abertaPor,
          agora
        },
        tx
      );
      basesAtualizadas += 1;
    }

    if (pendentes > 0) {
      // Decisao 14: o que nao foi resolvido cai no sino do Comprador, nao depende de ninguem olhar a tela.
      await criarNotificacoesRepository(
        {
          empresaId: travada.empresaId,
          tipo: "compras_decisao_pendente",
          destinatariosUsuarioIds: [travada.abertaPor],
          referenciaId: travada.id,
          titulo: "Rodada de compra encerrada com itens para decidir",
          reabrir: true
        },
        tx
      );
    }

    return { rodadaId: travada.id, fechada: true, comprados: adjudicados, pendentes, basesAtualizadas };
  });
}

/**
 * Tick do agendador. A lista fica FORA de transacao de escrita (e so o roteiro) e cada rodada fecha
 * na propria transacao: uma rodada com defeito nao desfaz nem bloqueia as outras. A falha de uma e
 * entregue a `aoFalhar` e a rodada volta a ser tentada no proximo tick (continua `aberta`).
 */
export async function fecharRodadasVencidas(
  agora = new Date(),
  aoFalhar?: (rodadaId: string, erro: Error) => void
): Promise<ResultadoFechamento[]> {
  const resultados: ResultadoFechamento[] = [];
  for (const rodada of await listarRodadasVencidasRepository(agora)) {
    try {
      resultados.push(await fecharRodadaPorPrazo(rodada, agora));
    } catch (erro) {
      aoFalhar?.(rodada.id, erro instanceof Error ? erro : new Error("falha ao fechar a rodada"));
    }
  }
  return resultados;
}

/**
 * "Encerrar rodada agora": o Comprador fecha antes do prazo (motivo `comprador`). Mesma transacao e
 * mesmas consequencias do fechamento por prazo (convites, solicitacao, base do que foi comprado
 * sozinho, aviso). Existe porque a excecao so vale com a rodada fechada: sem isto, uma compra urgente
 * acima da base esperaria o prazo inteiro.
 */
export async function encerrarRodadaAgora(
  rodadaId: string,
  payload: EncerrarRodadaPayload,
  perfil: PerfilUsuario
): Promise<ResultadoFechamento> {
  if (!podeAcessarEmpresa(perfil, payload.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  const solicitacaoId = await solicitacaoDaRodadaRepository(rodadaId, payload.empresaId);
  if (!solicitacaoId) throw naoEncontrado("Rodada nao encontrada");
  const resultado = await fecharRodada(
    { id: rodadaId, empresaId: payload.empresaId, solicitacaoId },
    { motivo: "comprador", usuarioId: perfil.usuarioId },
    new Date()
  );
  if (!resultado.fechada) throw naoProcessavel("A rodada ja nao esta aberta", "RODADA_NAO_ABERTA");
  return resultado;
}
