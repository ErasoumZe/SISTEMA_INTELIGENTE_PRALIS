// Orquestracao ASSINCRONA de tema/aparencia (buscar/carregar/abrir/salvar), extraida do AppWorkspace
// via injecao de dependencia (ADR-005). Recebe os refs reativos de tema + um port de API + callbacks;
// a logica PURA de resolucao/merge continua em ~/utils/tema. Testavel com refs vue reais + fakes.
import type { Ref } from "vue";
import type { ConfiguracaoAparenciaEmpresa, DadosExternos, TemaAplicacao } from "@padaria/shared";
import { montarConfiguracaoAparencia, resolverTemaDeConfiguracao } from "~/utils/tema";

type EmpresaComAparencia = { configuracoesAparencia?: ConfiguracaoAparenciaEmpresa | null } | null | undefined;

export type RefsTema = {
  tema: Ref<TemaAplicacao>;
  temaAtual: Ref<TemaAplicacao>;
  temaResumoCaixa: Ref<TemaAplicacao>;
  temaTelaAtual: Ref<string>;
  temaResumoCaixaAtual: Ref<string>;
  temaTelaEdicao: Ref<string>;
  temaSalvando: Ref<boolean>;
  modalTemaAberto: Ref<boolean>;
};

export type DepsAcoesTema = {
  refs: RefsTema;
  empresaId: () => string;
  telaAtiva: () => string;
  empresaAtiva: () => EmpresaComAparencia;
  telaResumoCaixa: string;
  api: {
    get: <T>(rota: string) => Promise<T>;
    put: <T>(rota: string, body: DadosExternos) => Promise<T>;
  };
  aplicarTema: (atual: TemaAplicacao, resumo: TemaAplicacao) => void;
  notificar: (mensagem: string, tipo?: string) => void;
  mensagemErro: (error: DadosExternos) => string;
  temaPadrao: () => TemaAplicacao;
};

export function criarAcoesTema(deps: DepsAcoesTema) {
  const r = deps.refs;

  // Chave de cache "empresa:tela" — usada para saber se o tema carregado ainda vale (invalidacao).
  function chaveTema(tela: string) {
    return `${deps.empresaId()}:${tela}`;
  }

  function resolverTemaEmpresa(tela: string) {
    return resolverTemaDeConfiguracao(deps.empresaAtiva()?.configuracoesAparencia, tela);
  }

  // Tema local (se a empresa ja tem a config) ou busca na API.
  async function buscarTema(tela: string) {
    const temaLocal = resolverTemaEmpresa(tela);
    if (temaLocal) return temaLocal;
    const params = new URLSearchParams({ tela, empresaId: deps.empresaId() });
    return deps.api.get<TemaAplicacao>(`/api/tema?${params.toString()}`);
  }

  function aplicarTemaNaConfiguracaoLocal(tela: string, temaSalvo: TemaAplicacao) {
    const empresa = deps.empresaAtiva();
    if (!empresa?.configuracoesAparencia) return;
    empresa.configuracoesAparencia = montarConfiguracaoAparencia(empresa.configuracoesAparencia, tela, temaSalvo);
  }

  async function carregarTemaTela(tela: string) {
    try {
      const temaCarregado = await buscarTema(tela);
      r.temaAtual.value = temaCarregado;
      r.tema.value = temaCarregado;
      r.temaTelaAtual.value = chaveTema(tela);
      deps.aplicarTema(r.temaAtual.value, r.temaResumoCaixa.value);
    } catch {
      r.temaAtual.value = deps.temaPadrao();
      r.tema.value = r.temaAtual.value;
      deps.aplicarTema(r.temaAtual.value, r.temaResumoCaixa.value);
    }
  }

  async function carregarTemaResumoCaixa() {
    try {
      r.temaResumoCaixa.value = await buscarTema(deps.telaResumoCaixa);
      r.temaResumoCaixaAtual.value = chaveTema(deps.telaResumoCaixa);
    } catch {
      r.temaResumoCaixa.value = deps.temaPadrao();
    } finally {
      deps.aplicarTema(r.temaAtual.value, r.temaResumoCaixa.value);
    }
  }

  async function abrirTema(tela = deps.telaAtiva()) {
    r.temaTelaEdicao.value = tela;
    try {
      r.tema.value = await buscarTema(tela);
      if (tela === deps.telaResumoCaixa) {
        r.temaResumoCaixa.value = r.tema.value;
      } else if (tela === deps.telaAtiva()) {
        r.temaAtual.value = r.tema.value;
      }
      deps.aplicarTema(r.temaAtual.value, r.temaResumoCaixa.value);
    } catch {
      r.tema.value = tela === deps.telaResumoCaixa ? r.temaResumoCaixa.value : r.temaAtual.value;
    }
    r.modalTemaAberto.value = true;
  }

  async function salvarTema() {
    r.temaSalvando.value = true;
    try {
      const temaSalvo = { ...r.tema.value };
      await deps.api.put<void>("/api/tema", {
        empresaId: deps.empresaId(),
        tela: r.temaTelaEdicao.value,
        ...temaSalvo
      });
      aplicarTemaNaConfiguracaoLocal(r.temaTelaEdicao.value, temaSalvo);
      if (r.temaTelaEdicao.value === deps.telaResumoCaixa) {
        r.temaResumoCaixa.value = temaSalvo;
        r.temaResumoCaixaAtual.value = chaveTema(deps.telaResumoCaixa);
      } else if (r.temaTelaEdicao.value === deps.telaAtiva()) {
        r.temaAtual.value = temaSalvo;
        r.temaTelaAtual.value = chaveTema(r.temaTelaEdicao.value);
      }
      deps.aplicarTema(r.temaAtual.value, r.temaResumoCaixa.value);
      r.modalTemaAberto.value = false;
      deps.notificar("Aparencia salva com sucesso.");
    } catch (error) {
      deps.notificar(deps.mensagemErro(error), "error");
    } finally {
      r.temaSalvando.value = false;
    }
  }

  return { buscarTema, resolverTemaEmpresa, carregarTemaTela, carregarTemaResumoCaixa, abrirTema, salvarTema };
}
