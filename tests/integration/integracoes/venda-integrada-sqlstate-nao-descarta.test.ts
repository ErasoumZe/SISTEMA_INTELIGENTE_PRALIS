// #41 · NENHUM SQLSTATE INESPERADO PODE VIRAR DESCARTE DE VENDA.
//
// O DEFEITO QUE ESTE ARQUIVO PRENDE: o `catch` da ingestao mapeava uma LISTA de codigos do Postgres
// para 503 e mandava todo o resto para 422. E 4xx faz o agente CREARE DESCARTAR a venda (R-013) —
// perda definitiva. Bastava aparecer um SQLSTATE fora da lista para a venda sumir em silencio.
//
// O caso que expos isso foi o `22003` (`numeric_value_out_of_range`): o contrato do payload aceita
// qualquer numero >= 0 (`z.coerce.number().min(0)`, sem teto), mas `vendas.valor_original` e
// `numeric(14,2)`. Um valor grande demais PASSA na validacao e estoura na gravacao.
//
// Corrigir so o `22003` seria tratar o sintoma. Por isso este arquivo prova a REGRA, com DOIS
// SQLSTATE diferentes e nenhum deles na lista de conhecidos:
//
//   22003  numeric_value_out_of_range   — valor acima do numeric(14,2)
//   23503  foreign_key_violation        — vinculo de colaborador apontando para um id inexistente
//
// O segundo e alcancavel de verdade porque `integracoes_vinculos.registro_sistema_id` NAO tem FK
// (db/src/schema/app.schema.ts) e `resolverColaborador` devolve o id do vinculo sem conferir se ele
// existe — mas `vendas.colaborador_id` TEM FK. Nao e cenario inventado: e o que acontece se alguem
// apagar um colaborador que ja estava vinculado.
//
// Tambem prende o P2 da auditoria: a mensagem de validacao monetaria NAO pode devolver o valor
// recebido no corpo HTTP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

const PDV_EXTERNO = "PDV-41-SQLSTATE";
const DATA_VENDA = "2026-06-30T15:00:00.000Z";

// numeric(14,2) aceita ate 999.999.999.999,99. Este valor passa no zod (>= 0, sem teto) e estoura
// na gravacao — e o `22003`.
const VALOR_ESTOURA_NUMERIC = 10_000_000_000_000;
const VENDA_22003 = "R41-SQLSTATE-22003";
const VENDA_23503 = "R41-SQLSTATE-23503";
const VENDA_VALIDACAO = "R41-SQLSTATE-VALIDACAO";
const VENDA_FALHA_INTERNA = "R41-FALHA-INTERNA";
const PDV_EXTERNO_INEDITO = "PDV-41-INEDITO-FALHA-INTERNA";

// Sentinela: um numero improvavel de aparecer por acaso no corpo de uma resposta.
const VALOR_SENTINELA = -987654321.55;
const COLABORADOR_INEXISTENTE = "99999999-9999-4999-8999-999999999999";
const VENDEDOR_FANTASMA = "VND-R41-FANTASMA";

type Resposta = { statusCode: number; body: string; json: () => unknown };

function payloadVenda(
  idVenda: string,
  extras: { valor?: number; valorUnitarioItem?: number; vendedor?: { identificador: string; nome: string } } = {}
) {
  const valor = extras.valor ?? 12;
  return {
    DadosIntegracao: { origem: "vitest-r41-sqlstate" },
    Venda: {
      idVenda,
      idCaixa: PDV_EXTERNO,
      nomeCaixa: "PDV 41 sqlstate",
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      ...(extras.vendedor ? { vendedor: extras.vendedor } : {}),
      dataHoraVenda: DATA_VENDA,
      valorOriginal: valor,
      desconto: 0,
      acrescimo: 0,
      valorTotal: valor,
      statusVenda: "aprovado",
      numeroNotaFiscal: null
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PROD-R41-SQLSTATE",
        descricaoProduto: "Item R41 sqlstate",
        dataHoraItem: DATA_VENDA,
        quantidade: 1,
        valorUnitario: extras.valorUnitarioItem ?? valor,
        total: valor,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor }]
  };
}

describe("#41 · SQLSTATE inesperado nao vira descarte", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta R41 sqlstate" });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV R41 sqlstate",
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: PDV_EXTERNO,
        descricaoExterna: "PDV R41 sqlstate",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    // Vinculo de colaborador PENDURADO: `registro_sistema_id` sem FK, apontando para um id que nao
    // existe em `colaboradores`. Inserido direto porque a rota valida a existencia — o objetivo
    // aqui e reproduzir o estado que sobra quando um colaborador ja vinculado e removido.
    await executarSql(
      `insert into integracoes_vinculos
         (empresa_id, tipo, tipo_registro, identificador_externo, descricao_externa, registro_sistema_id, pendente)
       values ($1, 'vendas', 'colaborador', $2, 'Vendedor fantasma', $3, false)`,
      [idsTeste.empresaA, VENDEDOR_FANTASMA, COLABORADOR_INEXISTENTE]
    );
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criar(url: string, payload: object) {
    const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  function enviar(payload: object): Promise<Resposta> {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
  }

  async function vendasDe(identificadorExterno: string) {
    return consultarTodos<{ id: string }>("select id from vendas where identificador_externo = $1", [
      identificadorExterno
    ]);
  }

  /** O corpo nunca pode carregar SQL, parametros, stack nem o valor enviado. */
  function corpoNaoVaza(resposta: Resposta, ...valoresProibidos: string[]) {
    for (const proibido of [
      "Failed query",
      "params:",
      "insert into",
      "select ",
      "numeric",
      "at Object.",
      "\\n    at "
    ]) {
      expect(resposta.body, `o corpo nao pode conter "${proibido}"`).not.toContain(proibido);
    }
    for (const valor of valoresProibidos) {
      expect(resposta.body, `o corpo nao pode refletir o valor "${valor}"`).not.toContain(valor);
    }
  }

  it("22003 (valor acima do numeric) responde 503 retriable, nunca 422", async () => {
    const resposta = await enviar(payloadVenda(VENDA_22003, { valor: VALOR_ESTOURA_NUMERIC }));

    expect(
      resposta.statusCode,
      `SQLSTATE do banco tem de virar 5xx re-tentavel; 422 faria o agente DESCARTAR a venda (R-013). ` +
        `Recebido: ${resposta.body}`
    ).toBe(503);
    expect(resposta.statusCode, "422 aqui e perda definitiva de venda").not.toBe(422);
    expect(json<{ code?: string }>(resposta).code).toBe("INTEGRATION_DATABASE_ERROR");

    corpoNaoVaza(resposta, String(VALOR_ESTOURA_NUMERIC), "22003", "out of range");
  });

  it("22003 nao deixa venda parcial nem duplicada", async () => {
    expect((await vendasDe(VENDA_22003)).length, "a transacao inteira sofreu rollback").toBe(0);

    const filhas = await consultarUm<{ total: string }>(
      `select ((select count(*) from vendas_produtos vp join vendas v on v.id = vp.venda_id
                 where v.identificador_externo = $1)
             + (select count(*) from vendas_pagamentos vp join vendas v on v.id = vp.venda_id
                 where v.identificador_externo = $1))::text as total`,
      [VENDA_22003]
    );
    expect(filhas?.total, "nenhum item ou pagamento orfao").toBe("0");
  });

  it("22003 continua registrado no historico tecnico, com a causa", async () => {
    const historico = await consultarUm<{ status: string; mensagem_erro: string | null }>(
      `select status, mensagem_erro from integracoes_historico
        where identificador_externo = $1 order by criado_em desc limit 1`,
      [VENDA_22003]
    );

    expect(historico?.status, "o evento tem de ficar registrado para diagnostico").toBe("erro");
    expect(
      historico?.mensagem_erro ?? "",
      "o historico e INTERNO: e nele que a causa do driver tem de sobreviver"
    ).toContain("22003");
  });

  it("um SQLSTATE DIFERENTE e nao listado (23503) tambem responde 503, nunca 422", async () => {
    const resposta = await enviar(
      payloadVenda(VENDA_23503, { vendedor: { identificador: VENDEDOR_FANTASMA, nome: "Vendedor fantasma" } })
    );

    expect(
      resposta.statusCode,
      `a regra tem de valer para QUALQUER SQLSTATE, nao so para os da lista. Recebido: ${resposta.body}`
    ).toBe(503);
    expect(resposta.statusCode).not.toBe(422);
    expect(json<{ code?: string }>(resposta).code).toBe("INTEGRATION_DATABASE_ERROR");

    corpoNaoVaza(resposta, COLABORADOR_INEXISTENTE, "23503", "foreign key");
    expect((await vendasDe(VENDA_23503)).length, "nada gravado").toBe(0);
  });

  // FALHA TECNICA INTERNA — sem SQLSTATE, sem validacao, sem dominio. E o ultimo lugar em que a #41
  // ainda descartava venda: o fallback do `catch` devolvia 422, e 4xx faz o agente jogar a venda
  // fora. Um bug NOSSO nao pode custar a venda de ninguem.
  //
  // COMO A FALHA E PRODUZIDA, de forma real e deterministica: um gatilho `BEFORE INSERT` em `pdvs`
  // que devolve NULL. No Postgres isso NAO e erro — a linha simplesmente nao e inserida, e o
  // `INSERT ... RETURNING` volta VAZIO. Do lado da API, `criarPdvComContaRepository` bate na propria
  // guarda `if (!pdv) throw new Error("PDV nao criado")`: um `Error` puro, sem `code`, sem
  // SQLSTATE — exatamente a classe "o banco fez algo que o codigo nao esperava".
  //
  // Nao ha mock: e o codigo de producao falhando pelo caminho dele. O gatilho nasce e morre dentro
  // deste caso, em `try/finally`, para nao vazar para os arquivos seguintes.
  it("falha tecnica interna (sem SQLSTATE) responde 500, nunca 4xx", async () => {
    await executarSql(`create or replace function r41_pdv_engole() returns trigger
                       language plpgsql as $$ begin return null; end $$`);
    await executarSql(`create trigger r41_pdv_engole_trg before insert on pdvs
                       for each row execute function r41_pdv_engole()`);

    let resposta: Resposta;
    try {
      // `idCaixa` inedito => sem vinculo => a ingestao tenta CRIAR o PDV, e cai na guarda interna.
      const payload = payloadVenda(VENDA_FALHA_INTERNA);
      payload.Venda.idCaixa = PDV_EXTERNO_INEDITO;
      payload.Venda.nomeCaixa = "PDV inedito da falha interna";
      resposta = await enviar(payload);
    } finally {
      await executarSql("drop trigger if exists r41_pdv_engole_trg on pdvs");
      await executarSql("drop function if exists r41_pdv_engole()");
    }

    expect(
      resposta.statusCode,
      `falha interna e bug NOSSO: tem de ser 5xx, nunca 4xx — 4xx faz o agente descartar a venda ` +
        `(R-013). Recebido: ${resposta.body}`
    ).toBe(500);
    expect(resposta.statusCode, "422 era o comportamento antigo, e era perda de venda").not.toBe(422);
    expect(resposta.statusCode, "nem 400").not.toBe(400);
    expect(json<{ code?: string }>(resposta).code, "codigo publico sanitizado").toBe("INTERNAL_ERROR");

    // O corpo nao pode carregar a mensagem interna, a stack, SQL, parametros nem o identificador.
    corpoNaoVaza(resposta, "PDV nao criado", VENDA_FALHA_INTERNA, PDV_EXTERNO_INEDITO, "r41_pdv_engole");

    expect((await vendasDe(VENDA_FALHA_INTERNA)).length, "nenhuma venda parcial").toBe(0);
  });

  it("a falha interna continua registrada no historico tecnico", async () => {
    const historico = await consultarUm<{ status: string; mensagem_erro: string | null }>(
      `select status, mensagem_erro from integracoes_historico
        where identificador_externo = $1 order by criado_em desc limit 1`,
      [VENDA_FALHA_INTERNA]
    );

    expect(historico?.status, "o evento tem de ficar registrado para diagnostico").toBe("erro");
    expect(
      historico?.mensagem_erro ?? "",
      "a causa interna sobrevive no historico — que e onde ela pode aparecer"
    ).toContain("PDV nao criado");
  });

  it("o agente classifica 503 como TEMPORARIO — e 422 como permanente", async () => {
    // Contrato do robo, em `integracoes-scripts/src/retry.js`: permanente = 4xx (exceto 429).
    // Reproduzido aqui para deixar explicito POR QUE 503 e a resposta certa: e o unico dos dois que
    // faz o agente re-tentar em vez de descartar a venda.
    const ehPermanente = (status: number) => status >= 400 && status < 500 && status !== 429;

    expect(ehPermanente(503), "503 tem de ser transitorio para o agente").toBe(false);
    expect(ehPermanente(500), "500 tambem — falha interna nossa nao pode descartar venda").toBe(false);
    expect(ehPermanente(422), "422 e permanente — e por isso descarta a venda").toBe(true);
    expect(ehPermanente(400), "400 idem: payload invalido e a unica recusa legitima").toBe(true);
    expect(ehPermanente(429), "429 nao e permanente: o agente aguarda o Retry-After").toBe(false);
  });

  it("erro de VALIDACAO do payload continua 400 — e nao reflete o valor recebido", async () => {
    const resposta = await enviar(payloadVenda(VENDA_VALIDACAO, { valorUnitarioItem: VALOR_SENTINELA }));

    expect(resposta.statusCode, `payload invalido e culpa do emissor e continua 4xx: ${resposta.body}`).toBe(400);
    // A rota de ingestao levanta o proprio erro de validacao, com detalhes por campo — nao e o
    // handler global de Zod.
    expect(json<{ code?: string }>(resposta).code).toBe("INTEGRATION_VALIDATION_ERROR");

    // O caminho do campo continua util para o operador...
    expect(resposta.body, "o caminho do campo tem de continuar aparecendo").toContain("valorUnitario");
    // ...mas o VALOR recebido nao volta no corpo (P2 da auditoria).
    expect(resposta.body, "o valor bruto nao pode ser refletido de volta").not.toContain("987654321");
    expect(resposta.body, "nem sem o sinal").not.toContain(String(Math.abs(VALOR_SENTINELA)));

    expect((await vendasDe(VENDA_VALIDACAO)).length, "payload invalido nao grava venda").toBe(0);
  });
});
