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
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { permissoes } from "@padaria/shared";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { garantirAdminInicial, SENHA_MINIMA_ADMIN_INICIAL } from "./src/bootstrap-admin.js";
import { schema } from "./src/schema/schema.js";
import { cargos, empresas, permissoesCargos, permissoesTabela } from "./src/schema/index.js";
import { permissoesPadraoDoCargo, regrasPermissoes } from "./src/referencia-permissoes.js";

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
// So o provisionamento inicial usa esta variavel. Para uma identidade existente, ela nao e fonte
// da verdade e pode ter sido removida do ambiente depois da instalacao.
const adminSenha = process.env["ADMIN_SENHA"];
const adminNome = process.env["ADMIN_NOME"]?.trim() || "Administrador";
const empresaNome = process.env["EMPRESA_NOME"]?.trim() || "Padaria Principal";

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
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: SENHA_MINIMA_ADMIN_INICIAL
  }
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
// para que variacoes com acento ou espaco (ex.: "gerencia ") tambem recebam os defaults do cargo.
for (const cargo of cargosExistentes) {
  const listaPadrao = permissoesPadraoDoCargo(cargo.nome);
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

// 4) Primeiro admin — provisiona tudo somente se a identidade ainda nao existir. Uma conta
// existente pertence a operacao: redeploy nao redefine senha, verificacao, role nem vinculos.
const resultadoAdmin = await garantirAdminInicial({
  banco,
  empresaId,
  adminEmail,
  adminNome,
  adminSenha,
  criarUsuarioAutenticacao: async ({ nome, email, senha }) => {
    await auth.api.signUpEmail({ body: { name: nome, email, password: senha } });
  }
});
console.info(
  resultadoAdmin.estado === "criado"
    ? `[bootstrap] OK admin inicial criado: ${adminEmail} (usuario_admin, e-mail verificado)`
    : `[bootstrap] OK admin existente preservado: ${adminEmail} (credencial, role e vinculos inalterados)`
);

await pool.end();
console.info("[bootstrap] OK bootstrap concluido");
