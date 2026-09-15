import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// A ordem da listagem de transferencias era escrita a mao como SQL cru (`desc nulls last`), o unico
// uso de tagged template em `api/src`. Ele derrubava `npm run check` no 3o dos 9 passos desde o
// commit 1f2dbe4 e, com isso, escondia os SEIS checks seguintes.
//
// A troca pelo predicado `is null` como primeira chave devolve o mesmo plano sem SQL cru, mas e uma
// equivalencia que NAO e obvia de ler: em Postgres o padrao de `desc` e NULLS FIRST, entao quem
// simplesmente apagasse o `nulls last` inverteria a tela inteira — a transferencia pendente subiria
// para o topo e a recebida mais recente desceria. Este teste prende exatamente essa equivalencia.
describe("transferencias - ordem da listagem", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  async function criarTransferencia(lacre: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        dataReferencia: "2026-07-10",
        descricao: `Ordem da listagem ${lacre}`,
        valorOriginal: 5,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: lacre,
        tempoConfirmacao: "1dia"
      }
    });
    expect(resposta.statusCode, `${lacre} -> ${resposta.body}`).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  it("coloca a recebida mais recente primeiro e a pendente por ultimo", async () => {
    // Criadas em sequencia: sem o carimbo de recebimento, o desempate seria `criado_em desc` e a
    // ordem natural seria C, B, A — o inverso do que a regra de recebimento manda. Isso garante que
    // um acerto acidental nao passe por teste verde.
    const antiga = await criarTransferencia("ORDEM-A");
    const recente = await criarTransferencia("ORDEM-B");
    const pendente = await criarTransferencia("ORDEM-C");

    // `transferencias_recebimento_check` exige que status, data_recebimento e confirmado_por sejam
    // coerentes entre si: nao da para carimbar so a data. Marcar as tres colunas juntas deixa o
    // cenario igual ao que a conferencia real produz.
    const confirmador = await consultarUm<{ usuarioId: string }>(
      'select usuario_id as "usuarioId" from perfis_usuarios limit 1'
    );
    if (!confirmador) throw new Error("Nenhum perfil de usuario disponivel para confirmar");

    async function marcarRecebida(transferenciaId: string, recebidaEm: string) {
      await executarSql(
        `update transferencias
            set status = 'recebido', data_recebimento = $2, confirmado_por = $3
          where id = $1`,
        [transferenciaId, recebidaEm, confirmador!.usuarioId]
      );
    }

    await marcarRecebida(antiga, "2026-07-01T10:00:00.000Z");
    await marcarRecebida(recente, "2026-07-03T10:00:00.000Z");

    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?empresaId=${empresaId}&lacre=ORDEM-&pageSize=100`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(lista);

    const ids = json<{ data: { id: string }[] }>(lista).data.map((item) => item.id);
    expect(ids).toEqual([recente, antiga, pendente]);
  });
});
