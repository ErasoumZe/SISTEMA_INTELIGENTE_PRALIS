import type { AuthSession, TemaAplicacao } from "@padaria/shared";
import { apiUrl } from "$lib/config";

export async function apiGet<T>(rota: string): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, { credentials: "include" });
  if (!resposta.ok) throw new Error(await resposta.text());
  return resposta.json();
}

export async function apiPost<T>(rota: string, body: unknown): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!resposta.ok) throw new Error(await resposta.text());
  return resposta.json();
}

export async function apiPut<T>(rota: string, body: unknown): Promise<T> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!resposta.ok) throw new Error(await resposta.text());
  return resposta.json();
}

export async function carregarSessao(): Promise<AuthSession | null> {
  const resposta = await fetch(`${apiUrl}/api/me`, { credentials: "include" });
  if (resposta.status === 401) return null;
  if (!resposta.ok) throw new Error(await resposta.text());
  return resposta.json();
}

export function aplicarTema(tema: TemaAplicacao) {
  const root = document.documentElement;
  root.style.setProperty("--primary", tema.corPrimaria);
  root.style.setProperty("--secondary", tema.corSecundaria);
  root.style.setProperty("--background", tema.corFundo);
  root.style.setProperty("--card", tema.corCartao);
  root.style.setProperty("--success", tema.corSucesso);
  root.style.setProperty("--warning", tema.corAviso);
  root.style.setProperty("--destructive", tema.corErro);
  root.style.setProperty("--ring", tema.corPrimaria);
}
