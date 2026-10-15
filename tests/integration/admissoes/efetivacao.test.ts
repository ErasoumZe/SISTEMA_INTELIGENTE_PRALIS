import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * E7 — a ficha do candidato e uma coleta opcional. Estes casos provam que a efetivação manual
 * continua exigindo processo, ASO, dados de admissão e a permissão exclusiva do DP.
 */
describe("efetivação de colaboradores", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDp: string;
  let cookieGerencia: string;
  const turnoId = "11111111-1111-4111-8111-111111111851";
  let sequenciaCpf = 0;

  function proximoCpf() {
    const base = String(41000000 + sequenciaCpf++ * 137).padStart(9, "0");
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, numero, indice) => total + numero * (numeros.length + 1 - indice), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const primeiro = dv(base);
    return `${base}${primeiro}${dv(base + primeiro)}`;
  }

  async function vestirCargoDp() {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [
      usuariosTeste.caixa.email
    ]);
    if (!alvo) throw new Error("usuário DP ausente");
    const permissoes = permissoesPorCargo["DP"] as Permissao[];
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoes))]
    );
  }

  async function vestirCargoGerencia() {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [
      usuariosTeste.gerente.email
    ]);
    if (!alvo) throw new Error("usuário Gerência ausente");
    const permissoes = permissoesPorCargo["Gerencia"] as Permissao[];
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoes))]
    );
  }

  async function semearTurno() {
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno E7', '06:00', '14:00', 'M', array['SEGUNDA','TERCA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
  }

  async function criarProcessoApto(cpf = proximoCpf(), nomeCompleto = "Pessoa Efetivação") {
    await semearTurno();
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieDp },
      payload: { nomeCompleto, cpf, funcaoId: idsTeste.funcaoOperacionalA, turnoId, dataAdmissao: "2026-09-27" }
    });
    assertOk(criado, 201);
    const id = criado.json().data.id as string;
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    const aso = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieDp },
      payload: { versao: detalhe.json().data.internos.versao, situacao: "aso_apto" }
    });
    expect(aso.statusCode).toBe(204);
    return { id, cpf };
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await vestirCargoDp();
    await vestirCargoGerencia();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieGerencia = await cookieSessao(contexto.app, "gerente");
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("efetiva manualmente sem ficha ou convite e cria uma única matrícula", async () => {
    const processo = await criarProcessoApto();
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieDp }
    });
    assertOk(resposta);
    expect(resposta.json().data).toMatchObject({ repetido: false });
    expect(resposta.json().data.matricula).toMatch(/^TNP-\d{6}$/u);

    const ficha = await consultarUm<{ n: number }>(
      "select count(*)::int as n from admissoes_processos_ficha where processo_id = $1",
      [processo.id]
    );
    expect(ficha?.n).toBe(0);
    const vinculo = await consultarUm<{ matricula: string; status: string; funcao_nome: string }>(
      "select matricula, status, funcao_nome from colaboradores_vinculos where processo_id = $1",
      [processo.id]
    );
    expect(vinculo?.matricula).toBe(resposta.json().data.matricula);
    expect(vinculo?.status).toBe("ativo");
    expect(vinculo?.funcao_nome).toBeTruthy();
  });

  it("é idempotente e não duplica vínculo ou evento", async () => {
    const processo = await criarProcessoApto();
    const primeira = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieDp }
    });
    assertOk(primeira);
    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieDp }
    });
    assertOk(repetida);
    expect(repetida.json().data).toMatchObject({ vinculoId: primeira.json().data.vinculoId, repetido: true });
    const eventos = await consultarUm<{ n: number }>(
      "select count(*)::int as n from colaboradores_eventos where processo_id = $1",
      [processo.id]
    );
    expect(eventos?.n).toBe(1);
  });

  it("serializa dois cliques concorrentes sem duplicar matrícula, vínculo ou evento", async () => {
    const processo = await criarProcessoApto();
    const respostas = await Promise.all(
      [0, 1].map(() =>
        contexto.app.inject({
          method: "POST",
          url: `/api/admissoes/processos/${processo.id}/efetivar`,
          headers: { cookie: cookieDp }
        })
      )
    );
    respostas.forEach((resposta) => assertOk(resposta));
    expect(new Set(respostas.map((resposta) => resposta.json().data.vinculoId)).size).toBe(1);
    expect(respostas.map((resposta) => resposta.json().data.repetido).sort()).toEqual([false, true]);

    const contagem = await consultarUm<{ vinculos: number; eventos: number }>(
      `select
         (select count(*)::int from colaboradores_vinculos where processo_id = $1) as vinculos,
         (select count(*)::int from colaboradores_eventos where processo_id = $1) as eventos`,
      [processo.id]
    );
    expect(contagem).toEqual({ vinculos: 1, eventos: 1 });
  });

  it("recusa Gerência: efetivar é ato próprio do DP", async () => {
    const processo = await criarProcessoApto();
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieGerencia }
    });
    assertProblem(resposta, 403, "INSUFFICIENT_PERMISSION");
  });

  it("responde 404 para processo de outra empresa sem gravar vínculo", async () => {
    const funcaoB = "88888888-8888-4888-8888-888888880002";
    const turnoB = "88888888-8888-4888-8888-888888880003";
    const processoB = "88888888-8888-4888-8888-888888880004";
    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao B Efetivacao')
       on conflict do nothing`,
      [funcaoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno B Efetivacao', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa Empresa B', $3, $4, $5, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [processoB, idsTeste.empresaB, proximoCpf(), funcaoB, turnoB]
    );

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoB}/efetivar`,
      headers: { cookie: cookieDp }
    });
    assertProblem(resposta, 404, "PROCESSO_NAO_ENCONTRADO");
    const vinculos = await consultarUm<{ n: number }>(
      "select count(*)::int as n from colaboradores_vinculos where processo_id = $1",
      [processoB]
    );
    expect(vinculos?.n).toBe(0);
  });

  it("não presume que um cadastro legado sem vínculo está desligado", async () => {
    const cpf = proximoCpf();
    await executarSql("insert into colaboradores (empresa_id, nome, cpf) values ($1, $2, $3)", [
      idsTeste.empresaA,
      "Cadastro legado",
      cpf
    ]);
    const processo = await criarProcessoApto(cpf, "Cadastro legado");
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieAdmin }
    });
    assertProblem(resposta, 409, "COLABORADOR_LEGADO_SEM_VINCULO");
  });

  it("expõe a efetivação e mantém sua data imutável", async () => {
    const processo = await criarProcessoApto();
    const efetivado = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieDp }
    });
    assertOk(efetivado);

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processo.id}`,
      headers: { cookie: cookieDp }
    });
    assertOk(detalhe);
    expect(detalhe.json().data).toMatchObject({ efetivado: true, dataEfetivacao: "2026-09-27" });

    const dataAlterada = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processo.id}/internos`,
      headers: { cookie: cookieDp },
      payload: { versao: detalhe.json().data.internos.versao, dataAdmissao: "2026-10-01" }
    });
    assertProblem(dataAlterada, 409, "DATA_EFETIVACAO_IMUTAVEL");

    const demaisDados = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processo.id}/internos`,
      headers: { cookie: cookieDp },
      payload: { versao: detalhe.json().data.internos.versao, dataAdmissao: "2026-09-27", ctpsNumero: "123456" }
    });
    expect(demaisDados.statusCode).toBe(204);
  });
  it("localiza CPF legado mascarado pela mesma identidade normalizada", async () => {
    const cpf = proximoCpf();
    const cpfMascarado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    await executarSql("insert into colaboradores (empresa_id, nome, cpf) values ($1, $2, $3)", [
      idsTeste.empresaA,
      "Cadastro legado mascarado",
      cpfMascarado
    ]);
    const processo = await criarProcessoApto(cpf, "Cadastro legado mascarado");
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processo.id}/efetivar`,
      headers: { cookie: cookieAdmin }
    });
    assertProblem(resposta, 409, "COLABORADOR_LEGADO_SEM_VINCULO");
  });
});
