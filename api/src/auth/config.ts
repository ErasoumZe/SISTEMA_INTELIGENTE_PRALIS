import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { schema } from "@padaria/db/schema";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { env } from "../env.js";
import { banco } from "../banco/conexao.js";

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
    requireEmailVerification: false,
    minPasswordLength: 6,
    sendResetPassword: async ({ user, url }) => {
      console.info({ email: user.email, url }, "password reset link generated");
    }
  }
});
