import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { banco } from "../../../api/src/banco/conexao.js";
import { auth } from "../../../api/src/auth/config.js";
import { garantirAdminInicial, SENHA_MINIMA_ADMIN_INICIAL } from "../../../db/src/bootstrap-admin.js";
import { aplicarSeedIntegracao } from "../../setup/seed.js";
import { idsTeste } from "../../setup/contexto.js";

const EMAIL = "bootstrap-admin.integracao@padaria.local";
const NOME = "Admin Bootstrap Integracao";
const SENHA_INICIAL = "Bootstrap#2026!inicial";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });

async function limparIdentidade() {
  const usuario = await pool.query<{ id: string }>('select id from "user" where email = $1 limit 1', [EMAIL]);
  const usuarioId = usuario.rows[0]?.id;
  if (!usuarioId) return;

  await pool.query("delete from colaboradores where usuario_id = $1", [usuarioId]);
  await pool.query("delete from usuarios_empresas where usuario_id = $1", [usuarioId]);
  await pool.query("delete from perfis_usuarios where usuario_id = $1", [usuarioId]);
  await pool.query('delete from "user" where id = $1', [usuarioId]);
}

async function criarPeloBetterAuth(dados: { nome: string; email: string; senha: string }) {
  await auth.api.signUpEmail({ body: { name: dados.nome, email: dados.email, password: dados.senha } });
}

type EstadoAdmin = {
  email_verificado: boolean;
  password: string;
  role: string;
  nome: string;
  empresas: string;
  colaboradores: string;
};

async function lerEstadoAdmin(usuarioId: string) {
  const resultado = await pool.query<EstadoAdmin>(
    `select u."emailVerified" as email_verificado,
            a.password,
            p.role,
            p.nome,
            (select count(*)::text from usuarios_empresas ue where ue.usuario_id = u.id) as empresas,
            (select count(*)::text from colaboradores c where c.usuario_id = u.id) as colaboradores
       from "user" u
       join account a on a."userId" = u.id and a."providerId" = 'credential'
       join perfis_usuarios p on p.usuario_id = u.id
      where u.id = $1`,
    [usuarioId]
  );
  return resultado.rows[0] ?? null;
}

async function contarComponentesDaIdentidade() {
  const resultado = await pool.query<{
    usuarios: string;
    contas: string;
    perfis: string;
    empresas: string;
    colaboradores: string;
  }>(
    `select
       (select count(*)::text from "user" u where u.email = $1) as usuarios,
       (select count(*)::text from account a join "user" u on u.id = a."userId" where u.email = $1) as contas,
       (select count(*)::text from perfis_usuarios p where p.email = $1) as perfis,
       (select count(*)::text from usuarios_empresas ue join perfis_usuarios p on p.usuario_id = ue.usuario_id where p.email = $1) as empresas,
       (select count(*)::text from colaboradores c join perfis_usuarios p on p.usuario_id = c.usuario_id where p.email = $1) as colaboradores`,
    [EMAIL]
  );
  return resultado.rows[0];
}

async function criarAdminInicial() {
  return garantirAdminInicial({
    banco,
    empresaId: idsTeste.empresaA,
    adminEmail: EMAIL,
    adminNome: NOME,
    adminSenha: SENHA_INICIAL,
    criarUsuarioAutenticacao: criarPeloBetterAuth
  });
}

describe("bootstrap do primeiro administrador", () => {
  beforeAll(async () => {
    await aplicarSeedIntegracao();
  });

  beforeEach(async () => {
    await limparIdentidade();
  });

  afterAll(async () => {
    await limparIdentidade();
    await pool.end();
  });

  it("primeira instalacao com ADMIN_SENHA valida cria o admin completo", async () => {
    expect(SENHA_MINIMA_ADMIN_INICIAL).toBe(10);

    const primeira = await criarAdminInicial();
    expect(primeira.estado).toBe("criado");

    const estado = await lerEstadoAdmin(primeira.usuarioId);
    expect(estado).toMatchObject({
      email_verificado: true,
      role: "usuario_admin",
      nome: NOME,
      empresas: "1",
      colaboradores: "1"
    });
    expect(estado?.password).toBeTruthy();
    expect(estado?.password).not.toBe(SENHA_INICIAL);
    expect(await contarComponentesDaIdentidade()).toEqual({
      usuarios: "1",
      contas: "1",
      perfis: "1",
      empresas: "1",
      colaboradores: "1"
    });
  });

  it("primeira instalacao sem ADMIN_SENHA falha explicitamente e sem estado parcial", async () => {
    await expect(
      garantirAdminInicial({
        banco,
        empresaId: idsTeste.empresaA,
        adminEmail: EMAIL,
        adminNome: NOME,
        criarUsuarioAutenticacao: criarPeloBetterAuth
      })
    ).rejects.toThrow("ADMIN_SENHA");

    expect(await contarComponentesDaIdentidade()).toEqual({
      usuarios: "0",
      contas: "0",
      perfis: "0",
      empresas: "0",
      colaboradores: "0"
    });
  });

  it("redeploy com ADMIN_SENHA diferente preserva senha, role, verificacao, perfil e vinculos", async () => {
    const primeira = await criarAdminInicial();
    const usuarioId = primeira.usuarioId;

    await pool.query('update "user" set "emailVerified" = false where id = $1', [usuarioId]);
    await pool.query(`update account set password = 'hash-operacional-preservado' where "userId" = $1`, [usuarioId]);
    await pool.query(
      `update perfis_usuarios set role = 'usuario_comum', nome = 'Nome operacional preservado' where usuario_id = $1`,
      [usuarioId]
    );
    await pool.query("delete from colaboradores where usuario_id = $1", [usuarioId]);
    await pool.query("delete from usuarios_empresas where usuario_id = $1", [usuarioId]);

    const segunda = await garantirAdminInicial({
      banco,
      empresaId: idsTeste.empresaA,
      adminEmail: EMAIL,
      adminNome: "Nome que o redeploy nao pode impor",
      adminSenha: "Senha#2026!que-nao-pode-sobrescrever",
      criarUsuarioAutenticacao: async () => {
        throw new Error("reexecucao nao pode tentar cadastrar novamente");
      }
    });

    expect(segunda).toEqual({ estado: "preservado", usuarioId });
    expect(await lerEstadoAdmin(usuarioId)).toEqual({
      email_verificado: false,
      password: "hash-operacional-preservado",
      role: "usuario_comum",
      nome: "Nome operacional preservado",
      empresas: "0",
      colaboradores: "0"
    });
  });

  it("redeploy com ADMIN_SENHA vazia funciona quando o admin ja existe", async () => {
    const primeira = await criarAdminInicial();
    const antes = await lerEstadoAdmin(primeira.usuarioId);

    const redeploy = await garantirAdminInicial({
      banco,
      empresaId: idsTeste.empresaA,
      adminEmail: EMAIL,
      adminNome: "Nome ignorado no redeploy",
      adminSenha: "",
      criarUsuarioAutenticacao: async () => {
        throw new Error("reexecucao nao pode tentar cadastrar novamente");
      }
    });

    expect(redeploy).toEqual({ estado: "preservado", usuarioId: primeira.usuarioId });
    expect(await lerEstadoAdmin(primeira.usuarioId)).toEqual(antes);
  });

  it("duas inicializacoes concorrentes nao duplicam nem sobrescrevem o administrador", async () => {
    const resultados = await Promise.all([
      garantirAdminInicial({
        banco,
        empresaId: idsTeste.empresaA,
        adminEmail: EMAIL,
        adminNome: "Admin Concorrente A",
        adminSenha: "Concorrencia#2026!A",
        criarUsuarioAutenticacao: criarPeloBetterAuth
      }),
      garantirAdminInicial({
        banco,
        empresaId: idsTeste.empresaA,
        adminEmail: EMAIL,
        adminNome: "Admin Concorrente B",
        adminSenha: "Concorrencia#2026!B",
        criarUsuarioAutenticacao: criarPeloBetterAuth
      })
    ]);

    expect(resultados.map((resultado) => resultado.estado).sort()).toEqual(["criado", "preservado"]);
    expect(new Set(resultados.map((resultado) => resultado.usuarioId)).size).toBe(1);
    expect(await contarComponentesDaIdentidade()).toEqual({
      usuarios: "1",
      contas: "1",
      perfis: "1",
      empresas: "1",
      colaboradores: "1"
    });
  });
});
