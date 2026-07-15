// Bootstrap de PRODUCAO (idempotente, sem dados fake). Diferente do seed de desenvolvimento
// (seed.ts), que injeta vendas/caixa/despesas ficticios e senhas fracas, este script cria apenas
// o minimo para o sistema ser utilizavel no primeiro deploy:
//   1) catalogo de permissoes (para a tela de Permissoes),
//   2) as permissoes padrao dos cargos conhecidos que ja existem,
//   3) a primeira empresa,
//   4) o primeiro usuario admin (role usuario_admin) com perfil + vinculo a empresa.
// As credenciais do admin vem de variaveis de ambiente (segredos do Coolify), nunca do codigo.
// Seguro para rodar em todo deploy: usa upsert/onConflict e nao apaga nada existente.
import "dotenv/config";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { permissoes } from "@padaria/shared";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { schema } from "./src/schema/schema.js";
import {
  cargos,
  colaboradores,
  contaAutenticacao,
  empresas,
  permissoesCargos,
  perfisUsuarios,
  permissoesTabela,
  usuarioAutenticacao,
  usuariosEmpresas
} from "./src/schema/index.js";
import { permissoesPorCargo, regrasPermissoes } from "./src/referencia-permissoes.js";

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

// O seed local sempre aplica as regras dos cargos, mas o seed de referencia de producao depende
// de SEED_REFERENCIA=1 e pode nunca ter sido executado. Mesclamos os defaults em todo deploy:
// regras ja configuradas no banco prevalecem, inclusive `false` explicito, preservando ajustes.
const cargosExistentes = await banco.select({ id: cargos.id, nome: cargos.nome }).from(cargos);
const permissoesExistentes = await banco
  .select({ cargoId: permissoesCargos.cargoId, regras: permissoesCargos.regras })
  .from(permissoesCargos);
const regrasPorCargo = new Map(permissoesExistentes.map((linha) => [linha.cargoId, linha.regras]));
let cargosSincronizados = 0;

// Casa o cargo do banco com a referencia por nome NORMALIZADO (trim + minusculas + sem acentos),
// para que "Gerencia"/"gerencia " tambem recebam os defaults de "Gerencia".
const normalizarNomeCargo = (nome: string) =>
  nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
const padraoPorNomeNormalizado = new Map(
  Object.entries(permissoesPorCargo).map(([nome, lista]) => [normalizarNomeCargo(nome), lista])
);

for (const cargo of cargosExistentes) {
  const listaPadrao = padraoPorNomeNormalizado.get(normalizarNomeCargo(cargo.nome));
  if (!listaPadrao) continue;
  const regras = { ...regrasPermissoes(listaPadrao), ...(regrasPorCargo.get(cargo.id) ?? {}) };
  await banco
    .insert(permissoesCargos)
    .values({ cargoId: cargo.id, regras })
    .onConflictDoUpdate({ target: permissoesCargos.cargoId, set: { regras } });
  cargosSincronizados += 1;
}
console.info(`[bootstrap] OK permissoes padrao (${cargosSincronizados} cargos sincronizados)`);

// 3) Primeira empresa — reaproveita a mais antiga se ja houver (evita duplicar em re-execucoes/renome).
const [empresaExistente] = await banco.select({ id: empresas.id }).from(empresas).orderBy(empresas.criadoEm).limit(1);
const empresaId =
  empresaExistente?.id ??
  (await banco.insert(empresas).values({ nome: empresaNome }).returning({ id: empresas.id }))[0]?.id;
if (!empresaId) throw new Error("[bootstrap] Falha ao garantir a empresa");
console.info(`[bootstrap] OK empresa (${empresaId})`);

// 4) Primeiro admin — cria o usuario de auth (better-auth) se faltar e garante perfil + vinculo.
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

// Producao exige e-mail verificado (requireEmailVerification em api/src/auth/config.ts). O admin do
// bootstrap e confiavel (criado no servidor), entao marcamos como verificado para permitir o login.
await banco
  .update(usuarioAutenticacao)
  .set({ emailVerified: true, updatedAt: new Date() })
  .where(eq(usuarioAutenticacao.id, usuario.id));

// Garante (idempotente) que a senha do admin = ADMIN_SENHA em TODA execucao: reescreve o hash na
// conta 'credential' usando o proprio hasher do better-auth. Assim ADMIN_SENHA e a fonte da verdade
// e um simples redeploy sempre reseta a senha do admin (resolve senha divergente de deploys antigos).
const contextoAuth = await auth.$context;
const senhaHash = await contextoAuth.password.hash(adminSenha);
await banco
  .update(contaAutenticacao)
  .set({ password: senhaHash, updatedAt: new Date() })
  .where(and(eq(contaAutenticacao.userId, usuario.id), eq(contaAutenticacao.providerId, "credential")));

await banco
  .insert(perfisUsuarios)
  .values({ usuarioId: usuario.id, empresaId, nome: adminNome, email: adminEmail, role: "usuario_admin" })
  .onConflictDoUpdate({
    target: perfisUsuarios.usuarioId,
    set: { empresaId, nome: adminNome, email: adminEmail, role: "usuario_admin", atualizadoEm: new Date() }
  });
await banco.insert(usuariosEmpresas).values({ usuarioId: usuario.id, empresaId }).onConflictDoNothing();

// O app exige um colaborador vinculado ao usuario para montar o perfil (obterPerfilPorUsuarioId
// retorna null sem colaborador). Cria um colaborador minimo para o admin, de forma idempotente.
const [colaboradorExistente] = await banco
  .select({ id: colaboradores.id })
  .from(colaboradores)
  .where(eq(colaboradores.usuarioId, usuario.id))
  .limit(1);
if (!colaboradorExistente) {
  await banco.insert(colaboradores).values({ empresaId, nome: adminNome, usuarioId: usuario.id });
}
console.info(`[bootstrap] OK admin ${adminEmail} (usuario_admin, email verificado, senha = ADMIN_SENHA, colaborador)`);

await pool.end();
console.info("[bootstrap] OK bootstrap concluido");
