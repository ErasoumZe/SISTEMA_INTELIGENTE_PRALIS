import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { schema } from "@padaria/db/schema";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { env } from "../env.js";
import { banco } from "../banco/conexao.js";

const producao = env.NODE_ENV === "production";

export const auth = betterAuth({
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
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.AUTH_BASE_URL,
  trustedOrigins: [env.WEB_ORIGIN],
  advanced: {
    database: {
      generateId: () => gerarUuidV7()
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: producao,
    minPasswordLength: producao ? 10 : 8,
    sendResetPassword: async ({ user }) => {
      if (producao) {
        throw new Error("Envio de redefinicao de senha nao configurado");
      }
      console.info({ email: user.email }, "password reset requested");
    }
  }
});
