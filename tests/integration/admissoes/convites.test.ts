import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { avisoPrivacidadeVigente, ehAvisoDeTeste, type Permissao } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * ADM-003 V2 — os P0 do convite ao candidato.
 *
 * O que esta fatia entrega e SO o lado do DP: emitir, ver e revogar. A rota publica onde o candidato
 * usa o token e a V3, e por isso nao ha aqui nenhuma entrada nova na allowlist do default-deny.
 */
describe("admissoes convites integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDpReal: string;
  let cookieGerenciaReal: string;
  let turnoId: string;
  let sequencia = 0;

  function matriz(cargo: string): Permissao[] {
    const lista = permissoesPorCargo[cargo];
    if (!lista) throw new Error(`cargo ausente na referencia: ${cargo}`);
    return lista;
  }

  async function vestirCargo(perfil: PerfilTeste, cargo: string) {
    const alvo = await consultarUm<{ id: string }>(`select u.id from "user" u where u.email = $1`, [
      usuariosTeste[perfil].email
    ]);
    if (!alvo) throw new Error(`usuario de teste ausente: ${perfil}`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
         on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(matriz(cargo)))]
    );
  }

  /** CPF sintetico com digito verificador correto — o contrato valida DV antes da regra sob teste. */
  function proximoCpf() {
    const base = String(51000000 + sequencia++ * 977).padStart(9, "0");
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const d1 = dv(base);
    return `${base}${d1}${dv(base + d1)}`;
  }

  /** Processo direto com ASO APTO — o unico estado em que o convite pode sair. */
  async function processoConvidavel(cookie = cookieAdmin) {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie },
      payload: {
        nomeCompleto: "Pessoa Convidavel",
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-15"
      }
    });
    assertOk(criado, 201);
    const id = criado.json().data.id as string;

    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: 1, situacao: "aso_apto" }
    });
    expect(exame.statusCode, exame.body).toBe(204);
    return id;
  }

  async function emitir(id: string, cookie = cookieAdmin) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie },
      payload: {}
    });
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await vestirCargo("caixa", "DP");
    await vestirCargo("gerente", "Gerencia");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");

    turnoId = "44444444-4444-4444-8444-444444440001";
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Manha Convite', '06:00', '14:00', 'M', array['SEGUNDA','TERCA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("P0-V2 Deve_EmitirTokenUmaVez_E_GuardarSoOHash", async () => {
    const id = await processoConvidavel();
    const resposta = await emitir(id);
    assertOk(resposta, 200);

    const token = resposta.json().data.token as string;
    // 32 bytes em hex. Token curto de 6 digitos serve para 15 minutos ditados por voz, nao para um
    // link de 14 dias exposto na internet.
    expect(token).toMatch(/^[a-f0-9]{64}$/u);

    const linhas = await consultarTodos<{ token_hash: string }>(
      `select token_hash from admissoes_convites where processo_id = $1`,
      [id]
    );
    expect(linhas).toHaveLength(1);
    // O banco NAO guarda o token: guarda o hash, e o hash nao e o token.
    expect(linhas[0]?.token_hash).not.toBe(token);
    expect(linhas[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/u);

    // E nao existe rota que devolva o token depois.
    const painel = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(painel, 200);
    expect(JSON.stringify(painel.json())).not.toContain(token);
  });

  it("P0-V2 Deve_RevogarOAnterior_Quando_Reemitir", async () => {
    // O unique parcial `(processo_id) where revogado_em is null` nao conhece `expira_em`: um convite
    // vencido e nao revogado ocuparia a vaga para sempre. Reemitir tem de revogar na MESMA transacao,
    // senao o DP nao consegue mandar link novo para quem perdeu o prazo.
    const id = await processoConvidavel();
    const primeiro = await emitir(id);
    assertOk(primeiro, 200);
    const segundo = await emitir(id);
    assertOk(segundo, 200);

    expect(segundo.json().data.token).not.toBe(primeiro.json().data.token);

    const linhas = await consultarTodos<{ revogado_em: string | null }>(
      `select revogado_em from admissoes_convites where processo_id = $1 order by criado_em`,
      [id]
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.revogado_em).not.toBeNull();
    expect(linhas[1]?.revogado_em).toBeNull();
  });

  it("P0-V2 Deve_Recusar_Quando_ExameNaoEstaApto", async () => {
    // Guarda de SERVIDOR. O botao desabilitado e conveniencia; quem chama a rota direto nao ve botao.
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Sem Aso",
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-15"
      }
    });
    assertOk(criado, 201);

    const resposta = await emitir(criado.json().data.id);
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(resposta.json().code).toBe("EXAME_NAO_APTO");

    const linhas = await consultarTodos(`select id from admissoes_convites where processo_id = $1`, [
      criado.json().data.id
    ]);
    expect(linhas).toHaveLength(0);
  });

  it("P0-V2 Deve_GravarTrilhaComAtorInterno_Quando_EmitirERevogar", async () => {
    const id = await processoConvidavel();
    assertOk(await emitir(id), 200);

    const revogar = await contexto.app.inject({
      method: "DELETE",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie: cookieAdmin }
    });
    expect(revogar.statusCode, revogar.body).toBe(204);

    const eventos = await consultarTodos<{ acao: string; ator_usuario_id: string | null; convite_id: string | null }>(
      `select acao, ator_usuario_id, convite_id from admissoes_processos_historico
        where processo_id = $1 and acao in ('convite_gerado', 'convite_revogado') order by ocorrido_em`,
      [id]
    );
    expect(eventos.map((evento) => evento.acao)).toEqual(["convite_gerado", "convite_revogado"]);
    // Ato INTERNO: tem ator humano e nao tem convite. O XOR do banco garante que seja um ou outro.
    for (const evento of eventos) {
      expect(evento.ator_usuario_id).not.toBeNull();
      expect(evento.convite_id).toBeNull();
    }
  });

  it("P0-V2 Deve_RecusarSegundoRevogar_Quando_NaoHaVigente", async () => {
    const id = await processoConvidavel();
    assertOk(await emitir(id), 200);

    const primeiro = await contexto.app.inject({
      method: "DELETE",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie: cookieAdmin }
    });
    expect(primeiro.statusCode).toBe(204);

    const segundo = await contexto.app.inject({
      method: "DELETE",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie: cookieAdmin }
    });
    expect(segundo.statusCode, segundo.body).toBe(409);
    expect(segundo.json().code).toBe("CONVITE_AUSENTE");
  });

  it("P0-V2 Deve_SeparalOsCargos_Quando_ConvidarERevogar", async () => {
    // A referencia da `convidar` ao DP e NAO a Gerencia: quem conversa com o candidato e o DP.
    const id = await processoConvidavel();

    const gerencia = await emitir(id, cookieGerenciaReal);
    expect(gerencia.statusCode, gerencia.body).toBe(403);
    expect(gerencia.json().details?.permissao).toBe("admissoes_processos_convidar");

    const dp = await emitir(id, cookieDpReal);
    expect(dp.statusCode, dp.body).toBe(200);

    // A Gerencia continua VENDO o painel — visualizar e outra permissao, e ela a tem.
    const painel = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${id}/convite`,
      headers: { cookie: cookieGerenciaReal }
    });
    assertOk(painel, 200);
  });

  it("P0-V2 Deve_GravarAVersaoDoAvisoVigente_Quando_Emitir", async () => {
    // O convite registra A QUE aviso ele se refere. Sem isso ninguem sabe ao que a pessoa consentiu.
    const id = await processoConvidavel();
    assertOk(await emitir(id), 200);

    const linha = await consultarUm<{ aviso_privacidade_versao: string }>(
      `select aviso_privacidade_versao from admissoes_convites where processo_id = $1 and revogado_em is null`,
      [id]
    );
    expect(linha?.aviso_privacidade_versao).toBe(avisoPrivacidadeVigente);
    // Hoje o vigente e o de TESTE, e ele se reconhece pelo prefixo — nao por coluna nem por memoria.
    expect(ehAvisoDeTeste(linha?.aviso_privacidade_versao ?? "")).toBe(true);
  });

  it("P0-V2 Deve_IsolarPorEmpresa_Quando_ProcessoEhDeOutroTenant", async () => {
    // O alvo EXISTE, e e de outra empresa. Um id inexistente daria 404 tambem e nao provaria nada
    // sobre isolamento — provaria so que 404 acontece.
    const alheio = "55555555-5555-4555-8555-555555550001";
    const funcaoB = "55555555-5555-4555-8555-555555550002";
    const turnoB = "55555555-5555-4555-8555-555555550003";
    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao B Convite')
       on conflict do nothing`,
      [funcaoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno B Convite', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa da Empresa B', $3, $4, $5, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [alheio, idsTeste.empresaB, proximoCpf(), funcaoB, turnoB]
    );

    // 404, nao 403: distinguir entregaria a existencia de processo de outra empresa de graca.
    const resposta = await emitir(alheio);
    expect(resposta.statusCode, resposta.body).toBe(404);
    const linhas = await consultarTodos(`select id from admissoes_convites where processo_id = $1`, [alheio]);
    expect(linhas).toHaveLength(0);
  });
});
