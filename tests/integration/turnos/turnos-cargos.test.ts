import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Permissao } from "@padaria/shared";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * ADM-003 V1B — o DP passou a CRIAR turno, e continua sem editar e sem excluir.
 *
 * O turno e campo obrigatorio da admissao direta: sem poder cadastrar o que falta, o DP travava no
 * meio do atendimento esperando a Gerencia. Editar e excluir ficaram de fora porque mudam turno de
 * quem ja esta admitido — o retrato no processo protege o passado, mas o catalogo e de todos.
 *
 * `turnos.test.ts`, ao lado, roda tudo com `admin`, que passa por herdar o catalogo inteiro do role
 * `usuario_admin` e por isso nao prova cargo nenhum. Este arquivo veste a matriz REAL da referencia
 * de producao: e o unico lugar onde "o DP nao edita" deixa de ser intencao e vira teste.
 */
describe("turnos: o que cada CARGO real pode fazer", () => {
  let contexto: ContextoApiTeste;
  let cookieDpReal: string;
  let cookieGerenciaReal: string;
  let cookieAdmin: string;

  /** A matriz REAL do cargo. Cargo ausente levanta erro: lista vazia viraria outro teste. */
  function matriz(cargo: string): Permissao[] {
    const lista = permissoesPorCargo[cargo];
    if (!lista) throw new Error(`cargo ausente na referencia: ${cargo}`);
    return lista;
  }

  /**
   * Veste um usuario de teste com as permissoes reais de um cargo.
   *
   * Escreve na camada de USUARIO, que e a ultima resolvida — por isso vence o cargo do seed de
   * teste. Precisa ser `usuario_comum`: `usuario_admin` recebe acesso total antes de olhar camada
   * alguma, e o teste provaria nada.
   */
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

  /** Cria um turno pelo admin, para servir de alvo das tentativas de editar e excluir. */
  async function turnoExistente(nome: string) {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/turnos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome, horaInicio: "06:00", horaFim: "14:00" }
    });
    expect(criar.statusCode, criar.body).toBe(201);
    return json<{ data: { id: string } }>(criar).data.id;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await vestirCargo("caixa", "DP");
    await vestirCargo("gerente", "Gerencia");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarECriar_Quando_CARGO_Dp", async () => {
    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/turnos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDpReal }
    });
    expect(listar.statusCode, listar.body).toBe(200);

    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/turnos",
      headers: { cookie: cookieDpReal },
      payload: { empresaId: idsTeste.empresaA, nome: "Turno do DP", horaInicio: "07:00", horaFim: "15:00" }
    });
    expect(criar.statusCode, criar.body).toBe(201);
  });

  it("Deve_Recusar403_Quando_CARGO_DpEditaOuExcluiTurno", async () => {
    // O alvo EXISTE e e da MESMA empresa: sem isso, um 404 de id inexistente passaria por 403 e o
    // teste nao provaria autorizacao nenhuma.
    const turnoId = await turnoExistente("Turno alvo do DP");

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/turnos/${turnoId}`,
      headers: { cookie: cookieDpReal },
      payload: { empresaId: idsTeste.empresaA, nome: "Renomeado", horaInicio: "06:00", horaFim: "14:00" }
    });
    expect(editar.statusCode, editar.body).toBe(403);
    expect(editar.json().details?.permissao).toBe("cadastro_turnos_editar");

    const excluir = await contexto.app.inject({
      method: "DELETE",
      url: `/api/turnos/${turnoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDpReal }
    });
    expect(excluir.statusCode, excluir.body).toBe(403);
    expect(excluir.json().details?.permissao).toBe("cadastro_turnos_excluir");

    // E a contraprova: o turno continua la, intacto.
    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/turnos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieDpReal }
    });
    const itens = json<{ data: Array<{ id: string; nome: string }> }>(listar).data;
    expect(itens.find((turno) => turno.id === turnoId)?.nome).toBe("Turno alvo do DP");
  });

  it("Deve_ManterOCicloCompleto_Quando_CARGO_Gerencia", async () => {
    // A Gerencia nao perdeu nada: ela continua dona do catalogo, com as quatro acoes.
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/turnos",
      headers: { cookie: cookieGerenciaReal },
      payload: { empresaId: idsTeste.empresaA, nome: "Turno da Gerencia", horaInicio: "14:00", horaFim: "22:00" }
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const turnoId = json<{ data: { id: string } }>(criar).data.id;

    const editar = await contexto.app.inject({
      method: "PUT",
      url: `/api/turnos/${turnoId}`,
      headers: { cookie: cookieGerenciaReal },
      payload: { empresaId: idsTeste.empresaA, nome: "Tarde", horaInicio: "14:00", horaFim: "22:00" }
    });
    // 204: o PUT responde `semConteudo`, como o DELETE. Nao ha corpo a devolver.
    expect(editar.statusCode, editar.body).toBe(204);

    const excluir = await contexto.app.inject({
      method: "DELETE",
      url: `/api/turnos/${turnoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieGerenciaReal }
    });
    expect(excluir.statusCode, excluir.body).toBe(204);
  });

  it("Deve_ConcederAoDpApenasVerECriar_Quando_LidoDaReferencia", () => {
    // A matriz e a fonte: se alguem "ajudar" o DP com editar ou excluir, isto cai antes de virar
    // comportamento. Prova o conjunto exato, nao apenas a presenca.
    const dp = matriz("DP");
    expect(dp).toContain("cadastro_turnos_visualizar");
    expect(dp).toContain("cadastro_turnos_criar");
    expect(dp).not.toContain("cadastro_turnos_editar");
    expect(dp).not.toContain("cadastro_turnos_excluir");

    const gerencia = matriz("Gerencia");
    for (const acao of ["visualizar", "criar", "editar", "excluir"] as const) {
      expect(gerencia, acao).toContain(`cadastro_turnos_${acao}`);
    }
  });
});
