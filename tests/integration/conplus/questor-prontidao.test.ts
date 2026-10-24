import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import { prontidaoQuestorDtoSchema } from "@padaria/shared/conplus";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * Prévia de prontidão Questor pela rota HTTP real: sessão, default-deny, permissão do DP e escopo
 * por empresa, exatamente como registrada em `api/src/app.ts`. Dados todos fictícios.
 */
describe("prévia de prontidão Questor — rota", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  let cookieGerencia: string;
  let cookieSemPermissao: string;

  const processoA = "11111111-1111-4111-8111-111111119f01";
  const processoB = "11111111-1111-4111-8111-111111119f02";
  const turnoA = "11111111-1111-4111-8111-111111119f03";
  const turnoB = "11111111-1111-4111-8111-111111119f04";
  const funcaoB = "11111111-1111-4111-8111-111111119f05";
  const url = (id: string) => `/api/admissoes/processos/${id}/questor/prontidao`;

  async function vestir(email: string, cargo: "DP" | "Gerencia") {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [email]);
    if (!alvo) throw new Error(`usuário ${email} ausente`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoesPorCargo[cargo] as Permissao[]))]
    );
  }

  async function semearProcesso(id: string, empresaId: string, turnoId: string, funcaoId: string, cpf: string) {
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno Prontidao', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
      [turnoId, empresaId]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa Ficticia Prontidao', $3, $4, $5, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [id, empresaId, cpf, funcaoId, turnoId]
    );
  }

  /** Marca d'água de escrita: nada disto pode mudar depois de consultar a prévia. */
  async function estadoGravado() {
    return consultarTodos<{ tabela: string; n: number; ultima: string | null }>(
      `select 'processo' tabela, count(*)::int n, max(atualizado_em)::text ultima from admissoes_processos where id = $1
       union all select 'internos', count(*)::int, max(atualizado_em)::text from admissoes_processos_internos where processo_id = $1
       union all select 'ficha', count(*)::int, max(atualizado_em)::text from admissoes_processos_ficha where processo_id = $1
       union all select 'dependentes', count(*)::int, max(atualizado_em)::text from admissoes_processos_dependentes where processo_id = $1
       union all select 'historico', count(*)::int, max(ocorrido_em)::text from admissoes_processos_historico where processo_id = $1`,
      [processoA]
    );
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();

    await vestir(usuariosTeste.caixa.email, "DP");
    await vestir(usuariosTeste.gerente.email, "Gerencia");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieGerencia = await cookieSessao(contexto.app, "gerente");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");

    await semearProcesso(processoA, idsTeste.empresaA, turnoA, idsTeste.funcaoOperacionalA, "98765432100");
    await executarSql(
      `insert into admissoes_processos_internos (empresa_id, processo_id, data_admissao, ctps_numero, ctps_serie, ctps_uf, pis_pasep_nit)
       values ($1, $2, '2026-09-27', '1234567', '0001', 'MG', '12345678901') on conflict do nothing`,
      [idsTeste.empresaA, processoA]
    );
    await executarSql(
      `insert into admissoes_processos_ficha
         (empresa_id, processo_id, situacao, versao, nascimento, sexo, estado_civil, raca_cor, nacionalidade,
          nome_mae, cep, logradouro, numero, bairro, municipio, uf, telefone)
       values ($1, $2, 'rascunho', 1, '2000-05-05', 'Feminino', 'União estável', 'Parda', 'Brasileira',
          'Mae Ficticia', '36037467', 'Rua Ficticia', 'S/N', 'Bairro Ficticio', 'Cidade Ficticia', 'MG', '32999990000')
       on conflict do nothing`,
      [idsTeste.empresaA, processoA]
    );
    await executarSql(
      `insert into admissoes_processos_dependentes (empresa_id, processo_id, nome_completo, nascimento, parentesco)
       values ($1, $2, 'Dependente Ficticio', '2020-01-10', 'Filho(a)')`,
      [idsTeste.empresaA, processoA]
    );

    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao Prontidao B') on conflict do nothing`,
      [funcaoB, idsTeste.empresaB]
    );
    await semearProcesso(processoB, idsTeste.empresaB, turnoB, funcaoB, "11144477735");
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from admissoes_processos where id = any($1::uuid[])", [[processoA, processoB]]);
    await executarSql("delete from turnos where id = any($1::uuid[])", [[turnoA, turnoB]]);
    await executarSql("delete from funcoes_operacionais where id = $1", [funcaoB]);
    await contexto.fechar();
  });

  it("DP recebe a prévia: campos prontos, pendências por origem e exportação bloqueada", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: url(processoA), headers: { cookie: cookieDp } });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const dto = prontidaoQuestorDtoSchema.parse(resposta.json().data);
    expect(dto.exportacaoDisponivel).toBe(false);
    expect(dto.aptoParaExportacao).toBe(false);
    expect(dto.resumo.requeridos).toBe(85);
    expect(dto.resumo.bloqueados).toBe(3);
    expect(dto.resumo.porOrigem.externo).toBeGreaterThan(0);
    const b = dto.registros.find((item) => item.registro === "B")!;
    expect(b.campos.find((item) => item.campo === "CEPFUNC")).toMatchObject({ situacao: "pronto" });
    expect(b.campos.find((item) => item.campo === "ESTADOCIVIL")).toMatchObject({
      situacao: "pendente",
      origem: "externo"
    });
    expect(b.campos.find((item) => item.campo === "NUMEROENDER")).toMatchObject({
      situacao: "pendente",
      origem: "externo"
    });
    expect(b.campos.find((item) => item.campo === "CODIGOMUNIC")).toMatchObject({
      situacao: "pendente",
      origem: "externo"
    });
    // Nenhum dado pessoal na resposta.
    for (const valor of ["98765432100", "987.654.321-00", "Pessoa Ficticia", "Mae Ficticia", "12345678901"]) {
      expect(resposta.body).not.toContain(valor);
    }
  });

  it("é somente leitura: nada muda no banco depois da consulta", async () => {
    const antes = await estadoGravado();
    const resposta = await contexto.app.inject({ method: "GET", url: url(processoA), headers: { cookie: cookieDp } });
    expect(resposta.statusCode).toBe(200);
    expect(await estadoGravado()).toEqual(antes);
  });

  it("respeita as permissões: Gerência e perfil sem permissão recebem 403; sem sessão, 401", async () => {
    const gerencia = await contexto.app.inject({
      method: "GET",
      url: url(processoA),
      headers: { cookie: cookieGerencia }
    });
    expect(gerencia.statusCode).toBe(403);
    const semPermissao = await contexto.app.inject({
      method: "GET",
      url: url(processoA),
      headers: { cookie: cookieSemPermissao }
    });
    expect(semPermissao.statusCode).toBe(403);
    const anonimo = await contexto.app.inject({ method: "GET", url: url(processoA) });
    expect(anonimo.statusCode).toBe(401);
  });

  it("processo de outra empresa responde como inexistente", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: url(processoB), headers: { cookie: cookieDp } });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.body).not.toContain("Pessoa Ficticia");
  });

  it("id malformado é recusado sem consultar o banco", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: url("nao-e-uuid"),
      headers: { cookie: cookieDp }
    });
    expect(resposta.statusCode).toBe(400);
  });
});
