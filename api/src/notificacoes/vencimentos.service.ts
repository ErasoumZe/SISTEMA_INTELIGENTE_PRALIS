import { diaNegocio, somarDias } from "@padaria/shared/datas";
import { paraCentavos } from "@padaria/shared/dinheiro";
import {
  criarNotificacoesRepository,
  listarDestinatariosAvisoDeVencimentoRepository,
  listarLancamentosParaAvisoDeVencimento,
  removerAvisosDeVencimentoForaDaJanela
} from "./notificacoes.repository.js";

function tituloDoAviso(dominio: "despesa" | "mercadoria", dataVencimento: string, hoje: string): string {
  const nome = dominio === "despesa" ? "Despesa" : "Mercadoria";
  if (dataVencimento < hoje) return `${nome} vencida em ${dataVencimento}`;
  if (dataVencimento === hoje) return `${nome} vence hoje`;
  const dias = Math.round(
    (new Date(`${dataVencimento}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()) / 86_400_000
  );
  return `${nome} vence em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

// Sincronizado junto ao sino: não exige cron externo e não cria duplicidade. Para cada consulta do
// destinatário, alerta D-3/D-2/D-1 e no vencimento. Depois de reconhecido, o aviso permanece
// lido: somente um novo fato operacional deve reabrir uma pendência.
export async function sincronizarAvisosDeVencimento(empresaId: string): Promise<void> {
  const hoje = diaNegocio(new Date());
  const lancamentos = await listarLancamentosParaAvisoDeVencimento(empresaId, somarDias(hoje, 3));
  await removerAvisosDeVencimentoForaDaJanela(
    empresaId,
    lancamentos.map((lancamento) => lancamento.id)
  );
  if (!lancamentos.length) return;

  const destinatarios = await listarDestinatariosAvisoDeVencimentoRepository(empresaId);
  for (const lancamento of lancamentos) {
    await criarNotificacoesRepository({
      empresaId,
      tipo: "lancamento_vencimento",
      destinatariosUsuarioIds: destinatarios,
      referenciaId: lancamento.id,
      titulo: tituloDoAviso(lancamento.dominio, lancamento.dataVencimento, hoje),
      valorCentavos: paraCentavos(Number(lancamento.valor))
    });
  }
}
