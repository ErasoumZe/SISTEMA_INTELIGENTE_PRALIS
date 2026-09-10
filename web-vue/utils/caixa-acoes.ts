// Acoes de caixa (orquestracao: API + status + notificacao), extraidas do AppWorkspace via
// INJECAO DE DEPENDENCIA (ADR-005/spec): a factory recebe um port de API e callbacks, entao e
// testavel com fakes, sem runtime Nuxt. O componente injeta as dependencias reais.
import type { DadosExternos } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";

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
  confirmar: (mensagem: string, titulo?: string, textoConfirmar?: string) => Promise<boolean>;
};

export type AberturaCaixaPayload = {
  pdvId: string;
  usuarioCaixaId: string;
  turnoId?: string | null;
  maquininhaId?: string | null;
  observacao: string | null;
};
// D6: `lacreRetorno` e o lacre do retorno FINAL, criado pelo proprio fechamento quando ainda ha
// sobra. Opcional pela R-026. D5: cada entrega leva o seu, e nenhum movimento executado e editado.
export type FechamentoPayload = { caixaId: string; observacao: string | null; lacreRetorno?: string | null };
// B2: `idempotenciaChave` e da INTENCAO, nao da requisicao. Quem a gera e a tela (uma vez, e a
// conserva no retry); aqui ela so trafega. Sem ela o servidor nao tem como distinguir "entregar
// outros R$ 100" de "o POST anterior caiu e o navegador reenviou".
// `aoConcluir` existe porque `emit` do Vue nao devolve o retorno do handler, e a TELA precisa saber
// o desfecho para decidir se limpa os campos e se roda a chave. Sem ele so restaria limpar no
// otimismo — que e exatamente o defeito que esta entrega corrige.
export type RetornoSaldoPayload = {
  caixaId: string;
  valor: number;
  lacre?: string | null;
  observacao: string | null;
  idempotenciaChave: string;
  aoConcluir?: (sucesso: boolean) => void;
};

export function criarAcoesCaixa(deps: DepsAcoesCaixa) {
  async function recarregarTela() {
    const tela = deps.telaAtiva();
    if (tela) await deps.carregarDadosTela(tela, deps.empresaId());
  }

  async function abrirCaixaOperacional(payload: AberturaCaixaPayload): Promise<boolean> {
    if (
      !(await deps.confirmar("Confirma a abertura deste caixa para o turno informado?", "Abrir caixa", "Abrir caixa"))
    ) {
      return false;
    }
    deps.setSalvando(true);
    try {
      // /abrir responde o id criado (nao CaixaStatus); re-busca o status canonico.
      await deps.api.post("/api/caixa/abrir", {
        empresaId: deps.empresaId(),
        ...payload
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

  // Devolve `false` tanto em erro quanto em confirmacao negada. A tela usa isso para decidir se
  // limpa os campos: limpar antes de saber o desfecho apagava o valor e o lacre que o operador
  // acabou de digitar sempre que a API recusava — e ele tinha de digitar tudo de novo, no escuro.
  async function retornarSaldoOperacional(payload: RetornoSaldoPayload): Promise<boolean> {
    const sucesso = await postarRetorno(payload);
    payload.aoConcluir?.(sucesso);
    return sucesso;
  }

  async function postarRetorno(payload: RetornoSaldoPayload): Promise<boolean> {
    if (
      !(await deps.confirmar(
        `Confirma a entrega de ${dinheiro(payload.valor)} ao cofre principal?`,
        "Entregar ao cofre",
        "Entregar ao cofre"
      ))
    ) {
      return false;
    }
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/${payload.caixaId}/transferencia-cofre`, {
        tipo: "retorno",
        valor: payload.valor,
        // D5: cada entrega fisica leva o proprio lacre. Opcional pela R-026.
        lacre: payload.lacre ?? null,
        observacao: payload.observacao,
        idempotenciaChave: payload.idempotenciaChave
      });
      deps.notificar("Retorno ao cofre lançado com sucesso.");
      await deps.carregarStatusCaixa(deps.empresaId());
      await recarregarTela();
      return true;
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return false;
    } finally {
      deps.setSalvando(false);
    }
  }

  async function fecharCaixaOperacional(payload: FechamentoPayload): Promise<boolean> {
    if (
      !(await deps.confirmar(
        "Confirma o fechamento deste caixa? Se ainda houver dinheiro físico, o retorno ao Cofre será registrado no mesmo ato.",
        "Fechar caixa",
        "Fechar caixa"
      ))
    ) {
      return false;
    }
    deps.setSalvando(true);
    try {
      // /fechar responde 204; re-busca o status canonico (evita crash em .resumo).
      // D6: o mesmo POST devolve a sobra restante ao cofre e fecha, numa unica transacao. O VALOR
      // do retorno nao vai daqui — o servidor usa a sobra que ele mesmo apurou sob trava.
      await deps.api.post(`/api/caixa/${payload.caixaId}/fechar`, {
        observacao: payload.observacao,
        lacreRetorno: payload.lacreRetorno ?? null
      });
      await deps.carregarStatusCaixa(deps.empresaId());
      deps.notificar("Caixa fechado com sucesso.");
      await recarregarTela();
      return true;
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return false;
    } finally {
      deps.setSalvando(false);
    }
  }

  return { abrirCaixaOperacional, retornarSaldoOperacional, fecharCaixaOperacional };
}
