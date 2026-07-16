// Acoes de caixa (orquestracao: API + status + notificacao), extraidas do AppWorkspace via
// INJECAO DE DEPENDENCIA (ADR-005/spec): a factory recebe um port de API e callbacks, entao e
// testavel com fakes, sem runtime Nuxt. O componente injeta as dependencias reais.
import type { DadosExternos } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";
import { dataHoraParaUtc } from "~/utils/formatacao";

type PortApi = {
  post: <T>(rota: string, body: DadosExternos) => Promise<T>;
};

export type DepsAcoesCaixa = {
  api: PortApi;
  empresaId: () => string;
  telaAtiva: () => string;
  resumoSaldo: () => number | null;
  setSalvando: (valor: boolean) => void;
  carregarStatusCaixa: (idEmpresa: string) => Promise<void>;
  carregarDadosTela: (tela: string, idEmpresa: string) => Promise<void>;
  notificar: (mensagem: string, tipo?: string) => void;
  mensagemErro: (error: DadosExternos) => string;
  confirmar: (mensagem: string) => boolean;
};

export type AberturaCaixaPayload = {
  pdvId: string;
  usuarioCaixaId: string;
  turnoId?: string | null;
  dataHoraAbertura: string;
  observacao: string | null;
};
export type AcertoFechamentoPayload = { caixaId: string; observacao: string | null };

export function criarAcoesCaixa(deps: DepsAcoesCaixa) {
  async function recarregarTela() {
    const tela = deps.telaAtiva();
    if (tela) await deps.carregarDadosTela(tela, deps.empresaId());
  }

  async function abrirCaixaOperacional(payload: AberturaCaixaPayload): Promise<boolean> {
    deps.setSalvando(true);
    try {
      // /abrir responde o id criado (nao CaixaStatus); re-busca o status canonico.
      await deps.api.post("/api/caixa/abrir", {
        empresaId: deps.empresaId(),
        ...payload,
        dataHoraAbertura: dataHoraParaUtc(payload.dataHoraAbertura)
      });
      await deps.carregarStatusCaixa(deps.empresaId());
      await recarregarTela();
      deps.notificar("Caixa aberto com sucesso.");
      return true;
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return false;
    } finally {
      deps.setSalvando(false);
    }
  }

  async function acertarSaldoOperacional(payload: AcertoFechamentoPayload): Promise<void> {
    const saldo = deps.resumoSaldo();
    if (saldo === null || !deps.confirmar(`A diferenca de ${dinheiro(saldo)} sera atribuida ao usuario do caixa.`)) {
      return;
    }
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/${payload.caixaId}/acertar-saldo`, { observacao: payload.observacao });
      deps.notificar("Saldo ajustado com sucesso.");
      await deps.carregarStatusCaixa(deps.empresaId());
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
    } finally {
      deps.setSalvando(false);
    }
  }

  async function fecharCaixaOperacional(payload: AcertoFechamentoPayload): Promise<void> {
    deps.setSalvando(true);
    try {
      // /fechar responde 204; re-busca o status canonico (evita crash em .resumo).
      await deps.api.post(`/api/caixa/${payload.caixaId}/fechar`, { observacao: payload.observacao });
      await deps.carregarStatusCaixa(deps.empresaId());
      deps.notificar("Caixa fechado com sucesso.");
      await recarregarTela();
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
    } finally {
      deps.setSalvando(false);
    }
  }

  return { abrirCaixaOperacional, acertarSaldoOperacional, fecharCaixaOperacional };
}
