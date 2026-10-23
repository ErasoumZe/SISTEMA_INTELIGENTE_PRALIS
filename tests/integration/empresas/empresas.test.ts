import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("empresas integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarEmpresasPermitidas_Quando_UsuarioTemPermissao", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/empresas",
      headers: { cookie: cookieAdmin }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("Padaria Integracao A");
  });

  it("Deve_AtualizarEmpresaPermitida_Quando_PayloadValido", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/empresas/${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin },
      payload: { nome: "Padaria Integracao A Editada", cnpj: "00.000.000/0001-91" }
    });

    expect(resposta.statusCode).toBe(204);
    const empresa = await consultarUm<{ nome: string; cnpj: string }>("select nome, cnpj from empresas where id = $1", [
      idsTeste.empresaA
    ]);
    expect(empresa).toMatchObject({ nome: "Padaria Integracao A Editada", cnpj: "00000000000191" });
  });

  it("Deve_VincularCriadorEManterEmpresaVisivel_Quando_CriarEmpresa", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { cookie: cookieAdmin },
      payload: { nome: "Padaria Integracao Nova", cnpj: "00.000.000/0003-53" }
    });
    expect(criar.statusCode).toBe(201);
    const empresaId = json<{ data: { id: string } }>(criar).data.id;

    try {
      const vinculo = await consultarUm<{ empresa_id: string }>(
        `select ue.empresa_id
           from usuarios_empresas ue
           join perfis_usuarios pu on pu.usuario_id = ue.usuario_id
          where pu.email = 'admin.integracao@padaria.local' and ue.empresa_id = $1`,
        [empresaId]
      );
      expect(vinculo?.empresa_id).toBe(empresaId);

      const listar = await contexto.app.inject({
        method: "GET",
        url: "/api/empresas",
        headers: { cookie: cookieAdmin }
      });
      assertOk(listar);
      expect(JSON.stringify(listar.json())).toContain("Padaria Integracao Nova");
    } finally {
      await executarSql("delete from empresas where id = $1", [empresaId]);
    }
  });

  // A tela de cadastro monta o formulario de EDICAO a partir da linha da grade, e a grade e
  // alimentada preferencialmente pela lista de empresas da SESSAO (`/api/me`), caindo para
  // `/api/empresas` so quando a sessao nao traz nenhuma. Se qualquer uma das duas deixar de projetar
  // a configuracao operacional, o formulario reabre no default e o salvar seguinte apaga o valor
  // gravado — que foi exatamente o defeito corrigido na fundacao de Compras.
  it("projeta a configuracao operacional da empresa na sessao e na listagem", async () => {
    await executarSql("update empresas set fuso_horario = $2, compras_prazo_resposta_horas = $3 where id = $1", [
      idsTeste.empresaA,
      "America/Belem",
      48
    ]);
    try {
      const sessao = await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie: cookieAdmin } });
      assertOk(sessao);
      const empresaDaSessao = json<{
        data: { empresas: Array<{ id: string; fusoHorario?: string; comprasPrazoRespostaHoras?: number | null }> };
      }>(sessao).data.empresas.find((empresa) => empresa.id === idsTeste.empresaA);
      expect(empresaDaSessao?.fusoHorario).toBe("America/Belem");
      expect(empresaDaSessao?.comprasPrazoRespostaHoras).toBe(48);

      const listar = await contexto.app.inject({
        method: "GET",
        url: "/api/empresas",
        headers: { cookie: cookieAdmin }
      });
      assertOk(listar);
      const empresaDaLista = json<{
        data: Array<{ id: string; fusoHorario?: string; comprasPrazoRespostaHoras?: number | null }>;
      }>(listar).data.find((empresa) => empresa.id === idsTeste.empresaA);
      expect(empresaDaLista?.fusoHorario).toBe("America/Belem");
      expect(empresaDaLista?.comprasPrazoRespostaHoras).toBe(48);
    } finally {
      await executarSql("update empresas set fuso_horario = $2, compras_prazo_resposta_horas = null where id = $1", [
        idsTeste.empresaA,
        "America/Sao_Paulo"
      ]);
    }
  });
});
