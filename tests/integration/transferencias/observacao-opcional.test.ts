import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// R-230 (Marco, 29/10): na transferencia a observacao e opcional. Em branco, o servidor grava a rota, para a
// lista e a auditoria nunca ficarem sem texto. Com texto, grava o texto digitado.
describe("transferencias - observacao opcional (R-230)", () => {
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

  async function criar(lacre: string, observacao?: string) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-10",
        ...(observacao === undefined ? {} : { observacao }),
        valorOriginal: 5,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: lacre,
        tempoConfirmacao: "1dia"
      }
    });
    expect(resposta.statusCode, `${lacre} -> ${resposta.body}`).toBe(201);
    const id = json<{ data: { id: string } }>(resposta).data.id;
    const linha = await consultarUm<{ observacao: string }>("select observacao from transferencias where id = $1", [
      id
    ]);
    return linha?.observacao;
  }

  it("sem observacao grava a rota da transferencia", async () => {
    const nomes = await consultarUm<{ origem: string; destino: string }>(
      "select (select nome from contas where id = $1) as origem, (select nome from contas where id = $2) as destino",
      [idsTeste.contaCofre, idsTeste.contaBanco]
    );
    expect(await criar("OBS-VAZIA")).toBe(`Transferência ${nomes!.origem} → ${nomes!.destino}`);
    expect(await criar("OBS-ESPACOS", "   ")).toBe(`Transferência ${nomes!.origem} → ${nomes!.destino}`);
  });

  it("com observacao grava o texto digitado", async () => {
    expect(await criar("OBS-TEXTO", "Deposito do dia")).toBe("Deposito do dia");
  });
});
