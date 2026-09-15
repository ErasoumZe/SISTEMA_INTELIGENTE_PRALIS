import { describe, expect, it } from "vitest";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { dataPagamentoNoPassado } from "@padaria/shared/datas";
import {
  exigirDataPagamentoDeDespesaOuMercadoria,
  exigirDataPagamentoNaoRetroativa,
  resolverObservacaoDoLancamento
} from "../../api/src/lancamentos/texto-movimento.js";

// R-127 — o texto do movimento e a OBSERVACAO. `descricao` continua sendo ACEITA no payload porque
// chamada antiga (e registro reaberto) ainda manda o campo, mas o que o servidor grava e sempre
// observacao. Sem isto, tela e banco falariam de campos diferentes sobre a mesma frase.
describe("resolverObservacaoDoLancamento (R-127)", () => {
  it("grava a observacao quando ela vem preenchida", () => {
    expect(resolverObservacaoDoLancamento({ observacao: "Farinha", descricao: "outro" }).observacao).toBe("Farinha");
  });

  it("cai na descricao quando a chamada e antiga (so descricao)", () => {
    expect(resolverObservacaoDoLancamento({ descricao: "Compra de farinha" }).observacao).toBe("Compra de farinha");
  });

  it("trata observacao em branco como ausente — espaco nao e texto", () => {
    expect(resolverObservacaoDoLancamento({ observacao: "   ", descricao: "Compra" }).observacao).toBe("Compra");
  });

  it("recusa o lancamento sem texto nenhum", () => {
    expect(() => resolverObservacaoDoLancamento({ observacao: "", descricao: "  " })).toThrow(/[Oo]bserva/);
    expect(() => resolverObservacaoDoLancamento({})).toThrow(/[Oo]bserva/);
  });

  it("preserva o resto do payload — o helper resolve UM campo, nao filtra o lancamento", () => {
    const saida = resolverObservacaoDoLancamento({ observacao: "Farinha", valorOriginal: 10, empresaId: "e1" });
    expect(saida).toMatchObject({ valorOriginal: 10, empresaId: "e1", observacao: "Farinha" });
  });
});

// R-129 — data de pagamento nao pode ser anterior a HOJE no fuso do negocio. A regra e do servidor;
// o `min` do input e conveniencia. Editar um lancamento antigo SEM tocar na data continua valendo:
// senao a regra nova trancaria a correcao de qualquer registro do passado.
describe("exigirDataPagamentoNaoRetroativa (R-129)", () => {
  const ontem = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  })();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const amanha = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  })();

  it("aceita hoje e o futuro", () => {
    expect(() => exigirDataPagamentoNaoRetroativa(hoje)).not.toThrow();
    expect(() => exigirDataPagamentoNaoRetroativa(amanha)).not.toThrow();
  });

  it("recusa ontem na criacao", () => {
    expect(() => exigirDataPagamentoNaoRetroativa(ontem)).toThrow(/anterior a hoje/i);
  });

  it("nao exige nada quando o lancamento nao esta pago (sem data)", () => {
    expect(() => exigirDataPagamentoNaoRetroativa(null)).not.toThrow();
    expect(() => exigirDataPagamentoNaoRetroativa("")).not.toThrow();
    expect(() => exigirDataPagamentoNaoRetroativa(undefined)).not.toThrow();
  });

  it("deixa editar um lancamento antigo desde que a data de pagamento NAO mude", () => {
    expect(() => exigirDataPagamentoNaoRetroativa(ontem, ontem)).not.toThrow();
  });

  it("mas barra a troca de uma data retroativa por OUTRA retroativa", () => {
    const anteontem = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    })();
    expect(() => exigirDataPagamentoNaoRetroativa(anteontem, ontem)).toThrow(/anterior a hoje/i);
  });

  it("ignora a hora que vier junto da data (timestamp do cliente)", () => {
    expect(() => exigirDataPagamentoNaoRetroativa(`${hoje}T23:59:00.000Z`)).not.toThrow();
  });
});

// R-203 — A nova exceção é deliberadamente estreita: somente o Administrador Geral pode
// retroagir. O Caixa registra a quitação no dia contábil corrente; a retaguarda conserva a
// programação futura que já existia, mas também não retroage.
describe("exigirDataPagamentoDeDespesaOuMercadoria (R-203)", () => {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ontem = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  })();
  const amanha = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  })();
  const perfil = (role: PerfilUsuario["role"], cargo: string): PerfilUsuario => ({
    usuarioId: "usuario",
    colaboradorId: "colaborador",
    cargoIds: ["cargo"],
    cargos: [{ id: "cargo", nome: cargo }],
    role,
    nome: "Usuário",
    email: "usuario@teste.local",
    permissoes: []
  });

  it("permite retroagir somente ao Administrador Geral", () => {
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(ontem, perfil("usuario_admin", "Caixa"))).not.toThrow();
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(ontem, perfil("usuario_comum", "Financeiro"))).toThrow(
      /anterior a hoje/i
    );
  });

  it("prende o operador de Caixa ao dia atual, inclusive contra cliente HTTP", () => {
    const caixa = perfil("usuario_comum", "Caixa");
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(hoje, caixa)).not.toThrow();
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(amanha, caixa)).toThrow(/só pode registrar pagamento/i);
  });

  it("não prende a retaguarda ao dia, mas preserva uma data histórica que não foi alterada", () => {
    const financeiro = perfil("usuario_comum", "Financeiro");
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(amanha, financeiro)).not.toThrow();
    expect(() => exigirDataPagamentoDeDespesaOuMercadoria(ontem, financeiro, ontem)).not.toThrow();
  });
});

// A comparacao usa diaNegocio (America/Sao_Paulo). Com toISOString() o servidor viraria o dia as
// 21:00 BRT e passaria a recusar como "passado" um pagamento marcado para HOJE — BUG B de novo.
describe("dataPagamentoNoPassado usa o fuso do negocio (R-129)", () => {
  it("as 22:00 BRT, o dia de hoje ainda e hoje", () => {
    // 16/07 22:00 BRT = 17/07 01:00 UTC. Em UTC o dia ja virou; no negocio, nao.
    const instante = new Date("2026-07-17T01:00:00.000Z");
    expect(dataPagamentoNoPassado("2026-07-16", instante)).toBe(false);
    expect(dataPagamentoNoPassado("2026-07-15", instante)).toBe(true);
  });

  it("sem data, nao ha passado", () => {
    expect(dataPagamentoNoPassado(null)).toBe(false);
    expect(dataPagamentoNoPassado("")).toBe(false);
  });
});
