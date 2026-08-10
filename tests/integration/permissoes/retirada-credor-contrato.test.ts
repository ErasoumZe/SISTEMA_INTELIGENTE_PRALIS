import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json, snapshotDoLancamento, universoDeLancamentos } from "../../setup/integracao.js";

// CX-M06 — o contrato de `credorTipo` da retirada.
//
// Ate aqui o schema ACEITAVA `credorTipo` e o repositorio o DESCARTAVA, derivando o tipo pelos ids.
// Seis combinacoes contraditorias respondiam 2xx e gravavam outra coisa: o cliente pedia
// `colaborador`, o servidor gravava `fornecedor`, e o GET de detalhe devolvia `fornecedor` —
// mascarando a divergencia. Nao havia teste nenhum sobre isso, em nenhuma direcao.
//
// A prova de "nao gravou" aqui e o SNAPSHOT INTEGRAL (linha + derivadas), e nao a contagem por
// `descricao`: `descricao` e coluna legado em remocao, e no dia em que ela parar de ser escrita toda
// assercao baseada nela vira vacuamente verde.
describe("CX-M06 - contrato de credorTipo da retirada", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let socioGestorId = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    // O seed nao tem socio/gestor; ele e um dos dois credores da retirada nova (R-128).
    const socio = await contexto.app.inject({
      method: "POST",
      url: "/api/socios-gestores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Socio CX-M06", ativo: true }
    });
    expect(socio.statusCode, socio.body).toBe(201);
    socioGestorId = json<{ data: { id: string } }>(socio).data.id;
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function post(payload: object) {
    return contexto.app.inject({ method: "POST", url: "/api/retiradas", headers: { cookie: cookieAdmin }, payload });
  }
  function put(id: string, payload: object) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/retiradas/${id}`,
      headers: { cookie: cookieAdmin },
      payload
    });
  }

  const corpo = (descricao: string, extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao,
    valorOriginal: 10,
    contaOrigemId: idsTeste.contaBanco,
    grupoRetiradaId: idsTeste.grupoRetiradaSangria,
    ...extras
  });

  async function criarRetiradaDeFornecedor(descricao: string) {
    const criada = await post(corpo(descricao, { fornecedorId: idsTeste.fornecedor }));
    expect(criada.statusCode, criada.body).toBe(201);
    return json<{ data: { id: string } }>(criada).data.id;
  }

  // ===== POST — entrada contraditoria e 400, e nao 2xx nem 500 ================================

  // O credor e montado DENTRO do teste: `it.each` avalia o array quando o `describe` roda, antes do
  // `beforeAll` que cria o socio/gestor.
  it.each([
    ["fornecedor + tipo colaborador", "fornecedor", "colaborador"],
    ["fornecedor + tipo socio_gestor", "fornecedor", "socio_gestor"],
    ["socio + tipo fornecedor", "socio", "fornecedor"],
    ["socio + tipo colaborador", "socio", "colaborador"]
  ] as const)("Deve_RecusarSemGravar_Quando_PostTemCredorTipoContraditorio (%s)", async (_nome, credor, tipo) => {
    const universoAntes = await universoDeLancamentos();
    const id = credor === "fornecedor" ? { fornecedorId: idsTeste.fornecedor } : { socioGestorId };

    const resposta = await post(corpo("CX-M06 contrato post", { ...id, credorTipo: tipo }));

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("Credor incoerente");
    // Nada foi criado em lugar nenhum — nem linha, nem item, nem debito.
    expect(await universoDeLancamentos()).toEqual(universoAntes);
  });

  it.each([
    ["fornecedor", "fornecedor"],
    ["socio_gestor", "socio"]
  ] as const)("Deve_Criar_Quando_CredorTipoConcordaComOId (%s)", async (tipo, credor) => {
    const id = credor === "fornecedor" ? { fornecedorId: idsTeste.fornecedor } : { socioGestorId };
    const resposta = await post(corpo(`CX-M06 contrato coerente ${tipo}`, { ...id, credorTipo: tipo }));
    expect(resposta.statusCode, resposta.body).toBe(201);
  });

  it("Deve_Criar_Quando_CredorTipoEOmitido", async () => {
    const resposta = await post(corpo("CX-M06 contrato sem tipo", { fornecedorId: idsTeste.fornecedor }));
    expect(resposta.statusCode, resposta.body).toBe(201);
  });

  // ===== PUT — a mesma regra, e sem tocar no registro =========================================

  it.each([
    ["fornecedor + tipo colaborador", "fornecedor", "colaborador"],
    ["socio + tipo fornecedor", "socio", "fornecedor"]
  ] as const)("Deve_RecusarSemAlterar_Quando_PutTemCredorTipoContraditorio (%s)", async (_nome, credor, tipo) => {
    const id = await criarRetiradaDeFornecedor("CX-M06 contrato put");
    const antes = await snapshotDoLancamento("retirada", id);
    const credorId = credor === "fornecedor" ? { fornecedorId: idsTeste.fornecedor } : { socioGestorId };

    const editada = await put(id, corpo("CX-M06 contrato put alterada", { ...credorId, credorTipo: tipo }));

    assertProblem(editada, 400, "VALIDATION_ERROR");
    expect(editada.body).toContain("Credor incoerente");
    // Snapshot INTEGRAL: pega `atualizado_em` (a trigger dispara ate em UPDATE no-op) e a reescrita
    // de `debitos_colaboradores`, que uma assercao de 1-2 colunas deixaria passar.
    expect(await snapshotDoLancamento("retirada", id)).toEqual(antes);
  });

  // O legado reabre com `colaboradorId` + `credorTipo: "colaborador"` — coerente — e tem de salvar.
  it("Deve_PermitirSalvar_Quando_LegadoReabreComTipoCoerente", async () => {
    const id = await criarRetiradaDeFornecedor("CX-M06 contrato legado");
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const editada = await put(
      id,
      corpo("CX-M06 contrato legado corrigido", {
        valorOriginal: 33,
        colaboradorId: idsTeste.colaboradorCaixa,
        credorTipo: "colaborador"
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);
  });

  // ...mas o legado NAO e porta para declarar um tipo que nao bate com o credor gravado.
  it("Deve_RecusarSemAlterar_Quando_LegadoReabreComTipoContraditorio", async () => {
    const id = await criarRetiradaDeFornecedor("CX-M06 contrato legado incoerente");
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );
    const antes = await snapshotDoLancamento("retirada", id);

    const editada = await put(
      id,
      corpo("CX-M06 contrato legado incoerente alterada", {
        colaboradorId: idsTeste.colaboradorCaixa,
        credorTipo: "fornecedor"
      })
    );

    assertProblem(editada, 400, "VALIDATION_ERROR");
    expect(await snapshotDoLancamento("retirada", id)).toEqual(antes);
  });
});
