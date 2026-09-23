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
  lacreAbertura: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
  valorEspecieContado?: number;
  valorMoedasContado?: number;
  observacaoDivergencia?: string | null;
  observacao: string | null;
};
export type FechamentoPayload = {
  caixaId: string;
  observacao: string | null;
  lacreFechamento: string;
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
  valorEspecieFechamento: number;
  valorMoedasFechamento: number;
  // A tela do Caixa possui uma revisão própria com todos os campos e anexos. Este marcador evita
  // um segundo popup genérico depois que a operadora já confirmou o retrato completo.
  confirmadoPelaRevisao?: true;
};
// B2: `idempotenciaChave` e da INTENCAO, nao da requisicao. Quem a gera e a tela (uma vez, e a
// conserva no retry); aqui ela so trafega. Sem ela o servidor nao tem como distinguir "entregar
// outros R$ 100" de "o POST anterior caiu e o navegador reenviou".
// `aoConcluir` existe porque `emit` do Vue nao devolve o retorno do handler, e a TELA precisa saber
// o desfecho para decidir se limpa os campos e se roda a chave. Sem ele so restaria limpar no
// otimismo — que e exatamente o defeito que esta entrega corrige.
export type RetornoSaldoPayload = {
  caixaId: string;
  valor: number;
  valorEspecie: number;
  valorMoedas: number;
  lacre: string;
  responsavelNome: string;
  observacao: string | null;
  idempotenciaChave: string;
  aoConcluir?: (sucesso: boolean) => void;
};
export type ExecutarPlanejamentoPayload = { caixaId: string; planejamentoId: string };
export type CancelarPlanejamentoPayload = {
  planejamentoId: string;
  motivo: string;
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
    const observacao = payload.observacao ? `\nObservação: ${payload.observacao}` : "";
    if (
      !(await deps.confirmar(
        `Confirme a saída ao cofre:\nValor total: ${dinheiro(payload.valor)}\nDinheiro físico: ${dinheiro(payload.valorEspecie)}\nMoedas: ${dinheiro(payload.valorMoedas)}\nLacre: ${payload.lacre}\nResponsável: ${payload.responsavelNome}${observacao}`,
        "Confirmar retorno / sangria",
        "Confirmar e salvar"
      ))
    ) {
      return false;
    }
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/${payload.caixaId}/transferencia-cofre`, {
        valor: payload.valor,
        valorEspecie: payload.valorEspecie,
        valorMoedas: payload.valorMoedas,
        lacre: payload.lacre,
        responsavelNome: payload.responsavelNome,
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
      !payload.confirmadoPelaRevisao &&
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
        lacreFechamento: payload.lacreFechamento,
        caixaResponsavelNome: payload.caixaResponsavelNome,
        supervisorResponsavelNome: payload.supervisorResponsavelNome,
        valorEspecieFechamento: payload.valorEspecieFechamento,
        valorMoedasFechamento: payload.valorMoedasFechamento
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

  async function executarPlanejamentoRetorno(payload: ExecutarPlanejamentoPayload): Promise<boolean> {
    if (
      !(await deps.confirmar(
        "Confirma a execução desta transferência de retorno programada? O valor e o lacre reservados serão usados.",
        "Executar retorno",
        "Executar"
      ))
    ) {
      return false;
    }
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/${payload.caixaId}/planejamentos-retorno/${payload.planejamentoId}/executar`, {});
      await deps.carregarStatusCaixa(deps.empresaId());
      await recarregarTela();
      deps.notificar("Transferência de retorno executada e aguardando conferência.");
      return true;
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      return false;
    } finally {
      deps.setSalvando(false);
    }
  }

  async function cancelarPlanejamentoRetorno(payload: CancelarPlanejamentoPayload): Promise<boolean> {
    deps.setSalvando(true);
    try {
      await deps.api.post(`/api/caixa/planejamentos-retorno/${payload.planejamentoId}/cancelar`, {
        motivo: payload.motivo.trim()
      });
      // A Tesouraria nao opera um Caixa proprio. Recarregar `/api/caixa/status` aqui faria um
      // cancelamento ja confirmado parecer falha para perfis sem `caixa_operar`.
      await recarregarTela();
      deps.notificar("Transferência de retorno programada cancelada com auditoria.");
      payload.aoConcluir?.(true);
      return true;
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
      payload.aoConcluir?.(false);
      return false;
    } finally {
      deps.setSalvando(false);
    }
  }

  return {
    abrirCaixaOperacional,
    retornarSaldoOperacional,
    fecharCaixaOperacional,
    executarPlanejamentoRetorno,
    cancelarPlanejamentoRetorno
  };
}
