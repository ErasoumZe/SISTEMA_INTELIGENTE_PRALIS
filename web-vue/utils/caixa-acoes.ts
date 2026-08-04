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
  setSalvando: (valor: boolean) => void;
  carregarStatusCaixa: (idEmpresa: string) => Promise<void>;
  carregarDadosTela: (tela: string, idEmpresa: string) => Promise<void>;
  notificar: (mensagem: string, tipo?: string) => void;
  mensagemErro: (error: DadosExternos) => string;
  confirmar: (mensagem: string) => Promise<boolean>;
};

export type AberturaCaixaPayload = {
  pdvId: string;
  usuarioCaixaId: string;
  turnoId?: string | null;
  maquininhaId?: string | null;
  dataHoraAbertura: string;
  observacao: string | null;
};
export type FechamentoPayload = { caixaId: string; observacao: string | null };
export type RetornoSaldoPayload = FechamentoPayload & { valor: number };

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

  async function retornarSaldoOperacional(payload: RetornoSaldoPayload): Promise<void> {
    if (!(await deps.confirmar(`Lançar retorno de ${dinheiro(payload.valor)} para o cofre principal?`))) return;
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/${payload.caixaId}/transferencia-cofre`, {
        tipo: "retorno",
        valor: payload.valor,
        observacao: payload.observacao
      });
      deps.notificar("Retorno ao cofre lançado com sucesso.");
      await deps.carregarStatusCaixa(deps.empresaId());
      await recarregarTela();
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
    } finally {
      deps.setSalvando(false);
    }
  }

  async function fecharCaixaOperacional(payload: FechamentoPayload): Promise<void> {
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

  return { abrirCaixaOperacional, retornarSaldoOperacional, fecharCaixaOperacional };
}
