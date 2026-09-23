import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { schema } from "@padaria/db/schema";
import { gerarUuidV7 } from "@padaria/shared/ids";
import { env, origensWebPermitidas } from "../env.js";
import { banco } from "../banco/conexao.js";
import { enviarEmail, montarHtmlEmail } from "./email.js";

const producao = env.NODE_ENV === "production";

// Politica de senha do ambiente, exportada porque a criacao de usuario por admin precisa recusar a
// senha curta ANTES de chamar o Better Auth, com mensagem verdadeira. O schema compartilhado aceita
// 6 caracteres (ele nao conhece o ambiente); deixar a divergencia passar era metade do B-01: o
// signUpEmail estourava PASSWORD_TOO_SHORT e o servico reportava "Email ja cadastrado".
export const senhaMinimaAutenticacao = producao ? 10 : 8;

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
  trustedOrigins: origensWebPermitidas,
  advanced: {
    database: {
      generateId: () => gerarUuidV7()
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: producao,
    minPasswordLength: senhaMinimaAutenticacao,
    sendResetPassword: async ({ user, url, token }) => {
      await enviarEmail({
        para: user.email,
        assunto: "Redefinir sua senha",
        html: montarHtmlEmail(
          "Redefinir senha",
          "Recebemos um pedido para redefinir a senha da sua conta. O link expira em breve.",
          "Redefinir senha",
          url
        ),
        url,
        token
      });
    }
  },
  // Verificacao de e-mail: o callback fica pronto para os dois caminhos. O auto-cadastro (proxima
  // tarefa) dispara a verificacao no caminho publico; usuario criado por admin ja nasce verificado.
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      await enviarEmail({
        para: user.email,
        assunto: "Confirme seu e-mail",
        html: montarHtmlEmail(
          "Confirmar e-mail",
          "Confirme seu endereco de e-mail para ativar o acesso a sua conta.",
          "Confirmar e-mail",
          url
        ),
        url,
        token
      });
    }
  }
});
