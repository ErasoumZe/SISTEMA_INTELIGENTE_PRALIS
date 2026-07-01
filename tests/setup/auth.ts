import pg from "pg";
import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { usuariosTeste, type PerfilTeste } from "./contexto.js";

export async function cookieSessao(app: FastifyInstance, perfil: PerfilTeste) {
  const usuario = usuariosTeste[perfil];
  const resposta = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: {
      email: usuario.email,
      password: usuario.senha
    }
  });
  expect(resposta.statusCode).toBe(200);
  const cookies = resposta.headers["set-cookie"];
  const lista = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  expect(lista.length).toBeGreaterThan(0);
  return lista.map((cookie) => cookie.split(";")[0]).join("; ");
}

export function cookieInvalido() {
  return "better-auth.session_token=token-invalido";
}

export function cookieMalformado() {
  return "better-auth.session_token=%%nao-decodificavel%%.assinatura-invalida";
}

export async function expirarSessoesDoPerfil(perfil: PerfilTeste) {
  const usuario = usuariosTeste[perfil];
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    await pool.query(
      `update session
       set "expiresAt" = now() - interval '1 hour'
       where "userId" = (select id from "user" where lower(email) = lower($1) limit 1)`,
      [usuario.email]
    );
  } finally {
    await pool.end();
  }
}
