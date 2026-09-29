import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql } from "../../setup/integracao.js";

describe("perfil cadastral e onboarding do colaborador", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const turnoId = "11111111-1111-4111-8111-111111111852";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno onboarding', '06:00', '14:00', 'M', array['SEGUNDA','TERCA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("cria onboarding na efetivacao e salva as abas privadas no mesmo perfil", async () => {
    const processo = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Colaborador Onboarding",
        cpf: "04100000006",
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-29"
      }
    });
    assertOk(processo, 201);
    const processoId = processo.json().data.id as string;
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(detalhe);
    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: detalhe.json().data.internos.versao, situacao: "aso_apto" }
    });
    expect(exame.statusCode).toBe(204);
    const efetivacao = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/efetivar`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(efetivacao);
    const colaboradorId = efetivacao.json().data.colaboradorId as string;

    const inicial = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorId}/perfil`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(inicial);
    expect(inicial.json().data.onboarding).toMatchObject({ etapa: "em_cadastro", versao: 1 });
    expect(inicial.json().data.dadosPessoais).toBeNull();

    const salvar = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${colaboradorId}/perfil`,
      headers: { cookie: cookieAdmin },
      payload: {
        dadosPessoais: { nomeSocial: "Pessoa Onboarding", nascimento: "1990-02-10", rgUf: "mg" },
        enderecoContato: { cep: "30130-010", municipio: "Belo Horizonte", uf: "mg", telefone: "31999999999" },
        dadosBancarios: { banco: "Banco teste", agencia: "1234", conta: "56789", contaTipo: "corrente" }
      }
    });
    expect(salvar.statusCode).toBe(204);

    const perfil = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${colaboradorId}/perfil`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(perfil);
    expect(perfil.json().data).toMatchObject({
      dadosPessoais: { nomeSocial: "Pessoa Onboarding", nascimento: "1990-02-10", rgUf: "MG" },
      enderecoContato: { cep: "30130010", municipio: "Belo Horizonte", uf: "MG", telefone: "31999999999" },
      dadosBancarios: { banco: "Banco teste", agencia: "1234", conta: "56789", contaTipo: "corrente" },
      onboarding: { etapa: "em_cadastro" }
    });
  });
});
