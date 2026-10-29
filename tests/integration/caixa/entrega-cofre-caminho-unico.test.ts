import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, criarRetornoValido, prepararFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// P1 da #101 — o caminho antigo que sobreviveu a Fatia 1.
//
// A guarda de fechamento (R-171/R-187) reconhece o retorno pelo predicado canonico: caixa
// vinculado e tipo `retorno` (ou `sangria` historica). Acontece que
// `POST /api/transferencias` NUNCA escreve `tipo` — a linha nasce `suprimento`, o default do
// schema — e, quando o OPERADOR a lanca, ela nasce `pendente` e vinculada ao caixa dele.
// Resultado: o mesmo dinheiro, saindo da MESMA conta do PDV para a MESMA conta cofre, contava como
// saida do caixa e NAO travava o fechamento. O malote ia para a rua e o turno fechava por cima
// dele — o defeito exato que a Fatia 1 existe para eliminar.
//
// A correcao nao e alargar o predicado da guarda: e fechar a porta. Pela D9/R-179 existe UM caminho
// para executar retorno avulso ao Cofre — `POST /api/caixa/:id/transferencia-cofre`, que exige
// confirmador elegivel, numera a ordem, controla lacre e e idempotente. A R-185 acrescentou um
// escritor apenas de planejamento; a execucao continua dentro do Caixa.
//
// O que este arquivo fixa: a rota generica RECUSA o par exato (origem = conta do PDV do caixa
// aberto, destino = conta cofre da empresa) e nada mais. Transferencia comum continua passando —
// inclusive a que sai da conta do PDV para OUTRA conta, e a que traz dinheiro do cofre PARA o
// caixa. Bloquear alem do par exato prenderia operacao legitima.
//
// Fatia 3 · e fixa tambem a OUTRA porta, que era interna: as rotas de "Programar entrega ao cofre"
// (D4). Elas nao foram escondidas atras de permissao — foram removidas, e os casos RED-5/RED-6
// provam o 404. Um caminho antigo que responde 403 continua existindo; um que responde 404, nao.
describe("caixa - entrega ao cofre tem caminho unico (P1/D9/R-179)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const empresaId = idsTeste.empresaA;
  // Posterior a abertura padrao da fixture (2026-07-31T08:00).
  const DIA = "2026-08-01";

  function inject(method: "GET" | "POST" | "PUT", url: string, cookie: string, payload?: object) {
    const corpo = url.endsWith("/fechar")
      ? {
          lacreFechamento: `FCH-CAMINHO-${url}`,
          caixaResponsavelNome: usuariosTeste.caixa.nome,
          supervisorResponsavelNome: "Supervisor de teste",
          ...payload
        }
      : payload;
    return contexto.app.inject({ method, url, headers: { cookie }, ...(corpo ? { payload: corpo } : {}) });
  }

  // Caixa proprio por caso: `fechamentos_caixa_pdv_aberto_unico_idx` proibe dois abertos no mesmo
  // PDV, e fechar um caixa compartilhado quebraria os outros arquivos.
  async function novoCaixa(nome: string) {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: `${nome} ${sequencia}`,
      valorAbertura: 200
    });
  }

  // Dinheiro de verdade no caixa: sem venda nao ha o que transferir.
  async function venda(valor: number) {
    const resposta = await inject("POST", "/api/vendas", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Venda do turno",
      valorOriginal: valor
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  // Lancada PELO operador: so assim a transferencia nasce vinculada ao caixa dele. Criada pela
  // retaguarda ela sai com `caixa_id` nulo e o bypass nem existiria.
  function transferenciaGenerica(contaOrigemId: string, contaDestinoId: string, valor = 50) {
    sequencia += 1;
    return inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia generica do turno",
      valorOriginal: valor,
      contaOrigemId,
      contaDestinoId,
      nLacreDoc: `P1-GEN-${sequencia}`,
      ...(contaOrigemId === idsTeste.contaCofre
        ? {
            valorEspecieDeclarado: valor,
            valorMoedasDeclarado: 0,
            lacreFechamentoPlanejado: `P1-FECHAMENTO-${sequencia}`
          }
        : {}),
      tempoConfirmacao: "1dia"
    });
  }

  function transferenciasOperacionaisDoCaixa(caixaId: string) {
    return consultarTodos<{ tipo: string; status: string }>(
      "select tipo, status from transferencias where caixa_id = $1 and tipo <> 'abertura' order by criado_em",
      [caixaId]
    );
  }

  // ------------------------------------------------------------------------------------------
  // RED-1 · o bypass. Mesmo dinheiro, mesmas contas, rota errada.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarACriacao_Quando_ARotaGenericaLevaDinheiroDoCaixaAoCofre", async () => {
    const fx = await novoCaixa("P1 bypass");
    await venda(500);

    const resposta = await transferenciaGenerica(fx.contaId, idsTeste.contaCofre, 200);

    assertProblem(resposta, 400);
    // A recusa precisa DIZER o caminho certo. "Nao permitido" sozinho faz o operador tentar de
    // novo pela mesma porta — ou, pior, procurar uma terceira.
    expect(resposta.body).toMatch(/cofre/iu);
    expect(resposta.body).toMatch(/caixa/iu);
    // E nao pode sobrar linha nenhuma: recusa que grava metade e pior do que recusa nenhuma.
    expect(await transferenciasOperacionaisDoCaixa(fx.caixaId)).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-2 · a consequencia que importa: sem a porta, o fechamento nao pode ser burlado.
  // ------------------------------------------------------------------------------------------
  it("Deve_ManterOFechamentoSobAGuarda_Quando_OBypassFalhaEOCaminhoCertoEhUsado", async () => {
    const fx = await novoCaixa("P1 fechamento");
    await venda(500);

    assertProblem(await transferenciaGenerica(fx.contaId, idsTeste.contaCofre, 200), 400);

    // Pelo caminho canonico a mesma entrega acontece — e ai ela TRAVA o fechamento, como a R-171
    // manda. E este o contraste do caso: fechar a porta nao some com a operacao, devolve ela para
    // o fluxo que tem conferencia, lacre e ordem.
    await criarRetornoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId: fx.caixaId, valor: 200 });
    expect(await transferenciasOperacionaisDoCaixa(fx.caixaId)).toEqual([{ tipo: "retorno", status: "pendente" }]);

    // A guarda de retorno pendente e avaliada depois de o operador concluir as etapas obrigatorias
    // do fechamento. Sem esse preparo o 409 de etapas incompletas esconderia a regra que este caso prova.
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId: fx.caixaId });
    assertProblem(await inject("POST", `/api/caixa/${fx.caixaId}/fechar`, cookieCaixa, { observacao: "Turno" }), 400);
  });

  // ------------------------------------------------------------------------------------------
  // RED-3 · o limite da porta: transferencia comum saindo da conta do PDV continua passando.
  // Sem este caso, fechar demais (qualquer saida da conta do PDV) passaria despercebido.
  // ------------------------------------------------------------------------------------------
  it("Deve_PermitirATransferenciaComum_Quando_ODestinoNaoEhOCofre", async () => {
    const fx = await novoCaixa("P1 destino comum");
    await venda(500);

    const destino = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId,
      nome: `Conta destino comum ${sequencia}`
    });
    expect(destino.statusCode, destino.body).toBe(201);

    const resposta = await transferenciaGenerica(fx.contaId, json<{ data: { id: string } }>(destino).data.id, 50);
    expect(resposta.statusCode, resposta.body).toBe(201);
  });

  // ------------------------------------------------------------------------------------------
  // RED-4 · o outro limite: a direcao INVERSA e suprimento, nao entrega. Dinheiro que vem do cofre
  // PARA o caixa nunca foi assunto da R-171 e continua livre.
  // ------------------------------------------------------------------------------------------
  it("Deve_PermitirOSuprimento_Quando_ODinheiroVemDoCofreParaOCaixa", async () => {
    const fx = await novoCaixa("P1 suprimento");

    const resposta = await transferenciaGenerica(idsTeste.contaCofre, fx.contaId, 50);
    expect(resposta.statusCode, resposta.body).toBe(201);
    const criada = await consultarUm<{ conta_destino_id: string }>(
      "select conta_destino_id from transferencias where id = $1",
      [json<{ data: { id: string } }>(resposta).data.id]
    );
    expect(criada?.conta_destino_id).toBe(fx.contaId);
  });

  // ------------------------------------------------------------------------------------------
  // RED-5 · Fatia 3: as quatro rotas de "Programar entrega ao cofre" nao existem mais.
  //
  // Nao basta o painel sumir da tela: enquanto a rota responder, o caminho antigo continua vivo
  // para qualquer cliente que saiba a URL — e a regra-mae do `16_DEFINITION_OF_DONE` fala em
  // REMOVER, nao esconder. 404 e a unica resposta que prova remocao: 403 provaria que a rota
  // continua registrada e so mudou de dono.
  //
  // O ator e o ADMIN de proposito. Ele tem todas as permissoes e e retaguarda, entao passaria em
  // qualquer gate — se ele leva 404, ninguem alcanca a rota.
  // ------------------------------------------------------------------------------------------
  it("Deve_Responder404_Quando_AlguemChamaAsRotasDeProgramarEntregaAoCofre", async () => {
    const fx = await novoCaixa("F3 rotas removidas");
    const solicitacaoId = randomUUID();

    const respostas = await Promise.all([
      inject("GET", `/api/caixa/abertos?empresaId=${empresaId}`, cookieAdmin),
      inject("POST", `/api/caixa/${fx.caixaId}/solicitacoes-cofre`, cookieAdmin, {
        tipo: "sangria",
        valor: 10,
        idempotenciaChave: randomUUID()
      }),
      inject("GET", `/api/caixa/${fx.caixaId}/solicitacoes-cofre`, cookieAdmin),
      inject("POST", `/api/caixa/${fx.caixaId}/solicitacoes-cofre/${solicitacaoId}/executar`, cookieAdmin, {
        lacre: "F3-NAO-EXISTE"
      }),
      inject("POST", `/api/caixa/${fx.caixaId}/solicitacoes-cofre/${solicitacaoId}/cancelar`, cookieAdmin, {
        motivo: "nao deveria existir"
      })
    ]);

    for (const resposta of respostas) {
      expect(resposta.statusCode, resposta.body).toBe(404);
    }
    // E nenhuma delas deixou rastro: rota removida nao grava linha nem meia linha.
    expect(await transferenciasOperacionaisDoCaixa(fx.caixaId)).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-6 · Fatia 3: sem produtor de ordem `agendada`, o fechamento nao pode mais ser travado por
  // ela. A guarda da D12 saiu junto com as rotas — mante-la transformaria qualquer linha legada
  // numa armadilha: turno que nao fecha e nao tem rota para executar nem para cancelar.
  //
  // A linha legada e montada em SQL de proposito. Nao existe mais API que a produza, e este e
  // exatamente o estado que um banco ja em uso pode ter.
  // ------------------------------------------------------------------------------------------
  it("Deve_FecharOTurno_Quando_RestaOrdemAgendadaLegadaDoCaminhoRemovido", async () => {
    const fx = await novoCaixa("F3 legado agendada");
    await venda(200);

    await executarSql(
      `insert into transferencias (
         empresa_id, caixa_id, data_referencia, data_transferencia, descricao, valor_original,
         conta_origem_id, conta_destino_id, tipo, status, solicitacao_cofre_em, criado_por
       )
       values ($1, $2, $3, $3, 'Ordem legada da retaguarda', 100, $4, $5, 'sangria', 'agendada', now(),
               (select id from "user" where lower(email) = lower($6)))`,
      [empresaId, fx.caixaId, DIA, fx.contaId, idsTeste.contaCofre, usuariosTeste.tesouraria.email]
    );

    // PRE-CONDICAO ASSERIDA, e nao presumida: o turno precisa ter sobra de verdade, senao o 204
    // abaixo nao prova nada — um caixa sem venda tambem fecha. A venda e postada sem `pdvId` e o
    // servidor a resolve pelo caixa aberto do operador; se ela tivesse caido em outro caixa, este
    // `expect` reprova aqui em vez de deixar o caso verde por acidente.
    const saldoAntes = await consultarUm<{ saldo: string }>(
      "select coalesce(sum(valor_original), 0)::text as saldo from vendas where caixa_id = $1",
      [fx.caixaId]
    );
    expect(saldoAntes?.saldo).toBe("200.00");

    // `agendada` nunca contou como saida (`transferenciaContaComoSaida`), entao o saldo do turno
    // ignora a linha e o fechamento apura os R$ 200 da venda como sobra a devolver.
    await prepararFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: fx.caixaId,
      contagem: { valorEspecie: 200 }
    });
    const fechar = await inject("POST", `/api/caixa/${fx.caixaId}/fechar`, cookieCaixa, {
      lacreFechamento: fx.lacreFechamento,
      observacao: "Turno com ordem legada"
    });
    expect(fechar.statusCode, fechar.body).toBe(204);

    // O retorno final saiu pelos R$ 200 INTEIROS. Sem esta assercao, incluir `agendada` em
    // `transferenciaContaComoSaida` faria a sobra virar 100 — R$ 100 sumindo do turno — e o caso
    // continuaria verde, porque o fechamento responderia 204 do mesmo jeito.
    const retornoFinal = await consultarUm<{ valor_original: string; status: string }>(
      `select valor_original, status from transferencias
        where caixa_id = $1 and tipo = 'retorno' and solicitacao_cofre_em is null`,
      [fx.caixaId]
    );
    expect(retornoFinal).toMatchObject({ valor_original: "200.00", status: "pendente" });

    // A linha legada continua intacta: remover o caminho nao reescreve o passado.
    const legada = await consultarUm<{ status: string; solicitacao_cofre_em: string | null }>(
      "select status, solicitacao_cofre_em from transferencias where caixa_id = $1 and status = 'agendada'",
      [fx.caixaId]
    );
    expect(legada?.status).toBe("agendada");
    expect(legada?.solicitacao_cofre_em).not.toBeNull();
  });
});
