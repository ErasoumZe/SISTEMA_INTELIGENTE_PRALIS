import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { colaboradores, perfisUsuarios, usuarioAutenticacao, usuariosEmpresas } from "./schema/index.js";
import type { Schema } from "./schema/schema.js";

export const SENHA_MINIMA_ADMIN_INICIAL = 10;

type CriarUsuarioAutenticacao = (dados: { nome: string; email: string; senha: string }) => Promise<void>;

type GarantirAdminInicialEntrada = {
  banco: NodePgDatabase<Schema>;
  empresaId: string;
  adminEmail: string;
  adminNome: string;
  adminSenha?: string | undefined;
  criarUsuarioAutenticacao: CriarUsuarioAutenticacao;
};

export type ResultadoBootstrapAdmin =
  | { estado: "criado"; usuarioId: string }
  | { estado: "preservado"; usuarioId: string };

async function usuarioPorEmail(banco: NodePgDatabase<Schema>, email: string) {
  const [usuario] = await banco
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(eq(usuarioAutenticacao.email, email))
    .limit(1);
  return usuario ?? null;
}

/**
 * Cria a identidade administrativa somente na primeira instalacao.
 *
 * Se o e-mail ja existe, retorna antes de qualquer escrita. Em particular, nao usa ADMIN_SENHA,
 * nao revalida e-mail, nao restaura role e nao acrescenta vinculos. Redeploy nao e operacao de
 * credencial nem de autorizacao.
 */
export async function garantirAdminInicial(entrada: GarantirAdminInicialEntrada): Promise<ResultadoBootstrapAdmin> {
  const existente = await usuarioPorEmail(entrada.banco, entrada.adminEmail);
  if (existente) return { estado: "preservado", usuarioId: existente.id };

  const senha = entrada.adminSenha?.trim();
  if (!senha) {
    throw new Error("[bootstrap] Variavel de ambiente obrigatoria ausente na primeira instalacao: ADMIN_SENHA");
  }
  if (senha.length < SENHA_MINIMA_ADMIN_INICIAL) {
    throw new Error(
      `[bootstrap] ADMIN_SENHA precisa ter no minimo ${SENHA_MINIMA_ADMIN_INICIAL} caracteres na primeira instalacao`
    );
  }

  try {
    await entrada.criarUsuarioAutenticacao({ nome: entrada.adminNome, email: entrada.adminEmail, senha });
  } catch (erro) {
    // Duas inicializacoes podem observar a ausencia ao mesmo tempo. A UNIQUE de user.email e a
    // autoridade: a perdedora rele o vencedor e sai sem tocar senha, role ou vinculos. Se nenhuma
    // identidade apareceu, nao era conflito concorrente e o erro original precisa subir.
    const vencedor = await usuarioPorEmail(entrada.banco, entrada.adminEmail);
    if (vencedor) return { estado: "preservado", usuarioId: vencedor.id };
    throw erro;
  }

  const criado = await usuarioPorEmail(entrada.banco, entrada.adminEmail);
  if (!criado) throw new Error(`[bootstrap] Falha ao criar o usuario admin: ${entrada.adminEmail}`);

  // Esta escrita vale somente para a identidade que acabou de nascer. Uma conta existente nunca
  // tem seu estado de verificacao alterado por deploy.
  await entrada.banco
    .update(usuarioAutenticacao)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(usuarioAutenticacao.id, criado.id));

  await entrada.banco
    .insert(perfisUsuarios)
    .values({
      usuarioId: criado.id,
      empresaId: entrada.empresaId,
      nome: entrada.adminNome,
      email: entrada.adminEmail,
      role: "usuario_admin"
    })
    .onConflictDoNothing();
  await entrada.banco
    .insert(usuariosEmpresas)
    .values({ usuarioId: criado.id, empresaId: entrada.empresaId })
    .onConflictDoNothing();
  await entrada.banco
    .insert(colaboradores)
    .values({ empresaId: entrada.empresaId, nome: entrada.adminNome, usuarioId: criado.id })
    .onConflictDoNothing();

  return { estado: "criado", usuarioId: criado.id };
}
