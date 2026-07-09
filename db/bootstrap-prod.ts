// Bootstrap de PRODUCAO (idempotente, sem dados fake). Diferente do seed de desenvolvimento
// (seed.ts), que injeta vendas/caixa/despesas ficticios e senhas fracas, este script cria apenas
// o minimo para o sistema ser utilizavel no primeiro deploy:
//   1) catalogo de permissoes (para a tela de Permissoes),
//   2) a primeira empresa,
//   3) o primeiro usuario admin (role usuario_admin) com perfil + vinculo a empresa.
// As credenciais do admin vem de variaveis de ambiente (segredos do Coolify), nunca do codigo.
// Seguro para rodar em todo deploy: usa upsert/onConflict e nao apaga nada existente.
import "dotenv/config";
import pg from "pg";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { permissoes } from "@padaria/shared";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { schema } from "./src/schema/schema.js";
import {
  empresas,
  perfisUsuarios,
  permissoesTabela,
  usuarioAutenticacao,
  usuariosEmpresas
} from "./src/schema/index.js";

// Le uma env obrigatoria por valor literal (sem process.env[dinamico], que dispara regra de seguranca).
function exigir(nome: string, valor: string | undefined): string {
  const limpo = valor?.trim();
  if (!limpo) throw new Error(`[bootstrap] Variavel de ambiente obrigatoria ausente: ${nome}`);
  return limpo;
}

const databaseUrl = exigir("DATABASE_URL", process.env["DATABASE_URL"]);
const authSecret = exigir("BETTER_AUTH_SECRET", process.env["BETTER_AUTH_SECRET"]);
const authBaseUrl = exigir("AUTH_BASE_URL", process.env["AUTH_BASE_URL"]);
const webOrigin = exigir("WEB_ORIGIN", process.env["WEB_ORIGIN"]);
const adminEmail = exigir("ADMIN_EMAIL", process.env["ADMIN_EMAIL"]).toLowerCase();
const adminSenha = exigir("ADMIN_SENHA", process.env["ADMIN_SENHA"]);
const adminNome = process.env["ADMIN_NOME"]?.trim() || "Administrador";
const empresaNome = process.env["EMPRESA_NOME"]?.trim() || "Padaria Principal";

if (adminSenha.length < 6) throw new Error("[bootstrap] ADMIN_SENHA precisa ter no minimo 6 caracteres");

const pool = new pg.Pool({ connectionString: databaseUrl });
const banco = drizzle(pool, { schema });
const auth = betterAuth({
  database: drizzleAdapter(banco, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.usuarioAutenticacao,
      session: schema.sessaoAutenticacao,
      account: schema.contaAutenticacao,
      verification: schema.verificacaoAutenticacao
    }
  }),
  secret: authSecret,
  baseURL: authBaseUrl,
  trustedOrigins: [webOrigin],
  advanced: { database: { generateId: () => gerarUuidV7() } },
  emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 6 }
});

console.info("[bootstrap] Iniciando bootstrap de producao (idempotente)");

// 1) Catalogo de permissoes — necessario para a tela de Permissoes listar o que existe.
for (const permissao of permissoes) {
  const nome = permissao.replaceAll("_", " ");
  await banco
    .insert(permissoesTabela)
    .values({ codigo: permissao, nome, descricao: `Permissao para ${nome}` })
    .onConflictDoUpdate({ target: permissoesTabela.codigo, set: { nome, descricao: `Permissao para ${nome}` } });
}
console.info(`[bootstrap] OK catalogo de permissoes (${permissoes.length})`);

// 2) Primeira empresa — reaproveita a mais antiga se ja houver (evita duplicar em re-execucoes/renome).
const [empresaExistente] = await banco.select({ id: empresas.id }).from(empresas).orderBy(empresas.criadoEm).limit(1);
const empresaId =
  empresaExistente?.id ??
  (await banco.insert(empresas).values({ nome: empresaNome }).returning({ id: empresas.id }))[0]?.id;
if (!empresaId) throw new Error("[bootstrap] Falha ao garantir a empresa");
console.info(`[bootstrap] OK empresa (${empresaId})`);

// 3) Primeiro admin — cria o usuario de auth (better-auth) se faltar e garante perfil + vinculo.
async function usuarioPorEmail(email: string) {
  const [usuario] = await banco
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(eq(usuarioAutenticacao.email, email))
    .limit(1);
  return usuario ?? null;
}

let usuario = await usuarioPorEmail(adminEmail);
if (!usuario) {
  await auth.api.signUpEmail({ body: { name: adminNome, email: adminEmail, password: adminSenha } });
  usuario = await usuarioPorEmail(adminEmail);
}
if (!usuario?.id) throw new Error(`[bootstrap] Falha ao criar/obter o usuario admin: ${adminEmail}`);

await banco
  .insert(perfisUsuarios)
  .values({ usuarioId: usuario.id, empresaId, nome: adminNome, email: adminEmail, role: "usuario_admin" })
  .onConflictDoUpdate({
    target: perfisUsuarios.usuarioId,
    set: { empresaId, nome: adminNome, email: adminEmail, role: "usuario_admin", atualizadoEm: new Date() }
  });
await banco.insert(usuariosEmpresas).values({ usuarioId: usuario.id, empresaId }).onConflictDoNothing();
console.info(`[bootstrap] OK admin ${adminEmail} (usuario_admin) vinculado a empresa`);

await pool.end();
console.info("[bootstrap] OK bootstrap concluido");
