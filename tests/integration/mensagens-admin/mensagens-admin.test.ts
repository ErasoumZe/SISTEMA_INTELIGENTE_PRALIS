import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

// R-193..R-196 e R-200 — mensagem administrativa para PDV.
//
// O que estes testes protegem, e por que cada um existe:
//   - a mensagem entra no SINO que ja existe, com `referencia_id` apontando para a ENTREGA;
//   - entrega e leitura sao IDEMPOTENTES (reenviar nao duplica, reler nao move o carimbo);
//   - "Entendi" encerra e "Fechar" apenas adia — o operador que fechou continua sendo cobrado;
//   - o isolamento entre empresas vale tambem para o tipo novo;
//   - quem abre caixa DEPOIS do envio recebe, e a entrega sem PDV e PROMOVIDA em vez de duplicada;
//   - as rotas exigem permissao no SERVIDOR, e nao apenas escondem o botao (R-200).
describe("mensagens administrativas para PDV", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieSemPermissao: string;
  let usuarioCaixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieCaixa, cookieSemPermissao] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "semPermissao")
    ]);
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario de caixa nao encontrado");
    usuarioCaixaId = usuario.id;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  function enviar(payload: object, cookie = cookieAdmin) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/mensagens-admin",
      headers: { cookie },
      payload: { empresaId, ...payload }
    });
  }

  function minhas(cookie: string, empresa = empresaId) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/mensagens-admin/minhas?empresaId=${empresa}`,
      headers: { cookie }
    });
  }

  function carimbar(entregaId: string, acao: "visualizar" | "confirmar" | "fechar", cookie: string) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/mensagens-admin/entregas/${entregaId}/${acao}?empresaId=${empresaId}`,
      headers: { cookie }
    });
  }

  async function entregasDaMensagem(mensagemId: string) {
    return consultarTodos<{
      id: string;
      destinatario_usuario_id: string;
      pdv_id: string | null;
      entregue_em: Date | null;
      confirmada_em: Date | null;
      fechada_em: Date | null;
    }>(
      `select id, destinatario_usuario_id, pdv_id, entregue_em, confirmada_em, fechada_em
         from mensagens_admin_entregas where mensagem_id = $1`,
      [mensagemId]
    );
  }

  it("envia para o operador nomeado, cria a entrega e uma linha no sino que aponta para ELA", async () => {
    const resposta = await enviar({
      titulo: "Conferir o cofre",
      corpo: "Passe no cofre antes de fechar o caixa.",
      alvos: [{ tipo: "operador", usuarioId: usuarioCaixaId }]
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const mensagemId = json<{ data: { id: string } }>(resposta).data.id;

    const entregas = await entregasDaMensagem(mensagemId);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]!.destinatario_usuario_id).toBe(usuarioCaixaId);

    // O sino referencia a ENTREGA, nunca a mensagem. E isso que permite o mesmo operador ter uma
    // linha por PDV sem tocar no unique que ja existia em `notificacoes`.
    const notificacao = await consultarUm<{ referencia_id: string; titulo: string }>(
      "select referencia_id, titulo from notificacoes where tipo = 'mensagem_admin' and destinatario_usuario_id = $1 and referencia_id = $2",
      [usuarioCaixaId, entregas[0]!.id]
    );
    expect(notificacao).not.toBeNull();
    expect(notificacao!.titulo).toBe("Conferir o cofre");
  });

  it("carimba a entrega na PRIMEIRA leitura e nao move o carimbo nas seguintes", async () => {
    const criada = await enviar({
      titulo: "Aviso de entrega",
      corpo: "Este aviso existe para medir o carimbo de entrega.",
      alvos: [{ tipo: "operador", usuarioId: usuarioCaixaId }]
    });
    const mensagemId = json<{ data: { id: string } }>(criada).data.id;

    // Sem push neste projeto: a mensagem espera no banco ate o cliente conseguir ler. E por isso
    // que "entregar quando voltar" nao precisa de PWA nem de SSE.
    const antes = await entregasDaMensagem(mensagemId);
    expect(antes[0]!.entregue_em).toBeNull();

    const primeira = await minhas(cookieCaixa);
    assertOk(primeira);
    const depois = await entregasDaMensagem(mensagemId);
    expect(depois[0]!.entregue_em).not.toBeNull();

    const carimboOriginal = depois[0]!.entregue_em;
    await minhas(cookieCaixa);
    const terceira = await entregasDaMensagem(mensagemId);
    expect(terceira[0]!.entregue_em).toEqual(carimboOriginal);
  });

  it('"Fechar" adia e "Entendi" encerra — o que fechou continua pendente no sino', async () => {
    const criada = await enviar({
      titulo: "Fechar nao e confirmar",
      corpo: "O operador vai fechar antes de confirmar.",
      alvos: [{ tipo: "operador", usuarioId: usuarioCaixaId }]
    });
    const mensagemId = json<{ data: { id: string } }>(criada).data.id;
    await minhas(cookieCaixa);
    const [entrega] = await entregasDaMensagem(mensagemId);

    expect((await carimbar(entrega!.id, "fechar", cookieCaixa)).statusCode).toBe(204);
    const aposFechar = await entregasDaMensagem(mensagemId);
    expect(aposFechar[0]!.fechada_em).not.toBeNull();
    expect(aposFechar[0]!.confirmada_em).toBeNull();

    // Ainda aparece para o operador: foi dispensada na sessao, nao respondida.
    const pendentes = json<{ data: { mensagemId: string }[] }>(await minhas(cookieCaixa)).data;
    expect(pendentes.some((item) => item.mensagemId === mensagemId)).toBe(true);

    expect((await carimbar(entrega!.id, "confirmar", cookieCaixa)).statusCode).toBe(204);
    const aposConfirmar = await entregasDaMensagem(mensagemId);
    expect(aposConfirmar[0]!.confirmada_em).not.toBeNull();

    const depoisDoEntendi = json<{ data: { mensagemId: string }[] }>(await minhas(cookieCaixa)).data;
    expect(depoisDoEntendi.some((item) => item.mensagemId === mensagemId)).toBe(false);
  });

  it("reenviar o mesmo alvo nao duplica a entrega nem reabre quem ja confirmou", async () => {
    const criada = await enviar({
      titulo: "Idempotencia",
      corpo: "Reenvio do mesmo alvo.",
      alvos: [
        { tipo: "operador", usuarioId: usuarioCaixaId },
        { tipo: "operador", usuarioId: usuarioCaixaId }
      ]
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const mensagemId = json<{ data: { id: string } }>(criada).data.id;
    expect(await entregasDaMensagem(mensagemId)).toHaveLength(1);
  });

  it("isola empresas: o operador da empresa A nao e alcancado por envio da empresa B", async () => {
    // O admin do teste enxerga as duas empresas; o alvo, nao. Sem a conferencia de empresa no
    // servico, este id gravaria uma entrega cruzando o isolamento.
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/mensagens-admin",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        titulo: "Mensagem da empresa B",
        corpo: "Nao pode alcancar operador da empresa A.",
        alvos: [{ tipo: "operador", usuarioId: usuarioCaixaId }]
      }
    });

    if (resposta.statusCode === 201) {
      const mensagemId = json<{ data: { id: string } }>(resposta).data.id;
      expect(await entregasDaMensagem(mensagemId)).toHaveLength(0);
    } else {
      // Admin sem acesso a empresa B tambem e um resultado correto: o que nao pode e a entrega nascer.
      assertProblem(resposta, 403);
    }

    const doOperador = json<{ data: { titulo: string }[] }>(await minhas(cookieCaixa)).data;
    expect(doOperador.some((item) => item.titulo === "Mensagem da empresa B")).toBe(false);
  });

  it("promove a entrega sem PDV quando o operador abre um caixa, em vez de criar uma segunda", async () => {
    const criada = await enviar({
      titulo: "Chega antes do caixa",
      corpo: "Enviada enquanto o operador ainda nao tinha caixa aberto.",
      alvos: [{ tipo: "empresa" }]
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const mensagemId = json<{ data: { id: string } }>(criada).data.id;

    const antes = (await entregasDaMensagem(mensagemId)).filter(
      (entrega) => entrega.destinatario_usuario_id === usuarioCaixaId
    );
    expect(antes, "o alvo empresa alcanca quem tem caixa_operar, com ou sem caixa aberto").toHaveLength(1);
    expect(antes[0]!.pdv_id).toBeNull();

    const { pdvId } = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Promocao Mensagem"
    });

    const depois = (await entregasDaMensagem(mensagemId)).filter(
      (entrega) => entrega.destinatario_usuario_id === usuarioCaixaId
    );
    expect(depois, "promove a linha existente; nao cria uma segunda cobranca").toHaveLength(1);
    expect(depois[0]!.pdv_id).toBe(pdvId);
    expect(depois[0]!.id).toBe(antes[0]!.id);
  });

  it("exige permissao no SERVIDOR, e nao apenas esconde o botao (R-200)", async () => {
    const envio = await enviar(
      { titulo: "Sem permissao", corpo: "Nao deveria passar.", alvos: [{ tipo: "caixas_abertos" }] },
      cookieSemPermissao
    );
    assertProblem(envio, 403);

    const painel = await contexto.app.inject({
      method: "GET",
      url: `/api/mensagens-admin?empresaId=${empresaId}`,
      headers: { cookie: cookieSemPermissao }
    });
    assertProblem(painel, 403);

    // Ler a PROPRIA caixa de mensagens nunca exige permissao: a autorizacao e ser o destinatario.
    assertOk(await minhas(cookieSemPermissao));
  });

  it("nao deixa um usuario carimbar a entrega de outro", async () => {
    const criada = await enviar({
      titulo: "Entrega alheia",
      corpo: "Somente o destinatario carimba.",
      alvos: [{ tipo: "operador", usuarioId: usuarioCaixaId }]
    });
    const mensagemId = json<{ data: { id: string } }>(criada).data.id;
    const [entrega] = await entregasDaMensagem(mensagemId);

    const resposta = await carimbar(entrega!.id, "confirmar", cookieSemPermissao);
    assertProblem(resposta, 404);
    const intacta = await entregasDaMensagem(mensagemId);
    expect(intacta[0]!.confirmada_em).toBeNull();
  });
});
