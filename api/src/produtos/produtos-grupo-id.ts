import { gruposOficiaisDaFaixa, lerGrupoIds } from "@padaria/shared/produtos";
import { env } from "../env.js";
import { GoogleSheetsService } from "../google/google-sheets.service.js";
import { a1, type LeitorDeFaixas } from "./produtos-fiscal.service.js";

/**
 * IDs oficiais dos grupos no PDV (aba de IDs de grupo, faixa AC5:AD) — o `GrupoIdPlanilha` do paralelo
 * (F7, doc 56). So leitura, cache de 5 minutos. Quem grava produto le ANTES da trava do cadastro, como
 * as regras fiscais: o Google nunca segura a trava. Falha de leitura vira `null` (indisponivel) e nao e
 * guardada em cache, para a proxima gravacao tentar de novo.
 */
const CACHE_MS = 5 * 60 * 1000;
const FAIXA = "AC5:AD";
let cache: { expiraEm: number; linhas: string[][] } | null = null;
let leitorInjetado: LeitorDeFaixas | null = null;

/** So para testes: troca a planilha por um leitor falso e limpa o cache. */
export function definirLeitorDeGrupoIdsParaTeste(leitor: LeitorDeFaixas | null): void {
  leitorInjetado = leitor;
  cache = null;
}

/** A faixa crua (nome, ID); `null` quando a planilha nao esta configurada ou nao respondeu. */
async function faixaDeGrupos(): Promise<string[][] | null> {
  if (cache && cache.expiraEm > Date.now()) return cache.linhas;
  const leitor =
    leitorInjetado ??
    (env.GOOGLE_PRODUTOS_SPREADSHEET_ID
      ? new GoogleSheetsService({ spreadsheetId: env.GOOGLE_PRODUTOS_SPREADSHEET_ID })
      : null);
  if (!leitor) return null;
  try {
    const [faixa] = await leitor.lerFaixasEmLote([a1(env.GOOGLE_PRODUTOS_GRUPO_IDS_TAB, FAIXA)]);
    cache = { expiraEm: Date.now() + CACHE_MS, linhas: faixa ?? [] };
    return cache.linhas;
  } catch {
    return null;
  }
}

export async function idsDeGrupoOficiais(): Promise<Map<string, string | null> | null> {
  const linhas = await faixaDeGrupos();
  return linhas ? lerGrupoIds(linhas) : null;
}

/** Os grupos oficiais (nome limpo e ID), para criar os grupos da loja (fase B1); `null` sem fonte valida. */
export async function gruposOficiais(): Promise<Array<{ nome: string; id: string }> | null> {
  const linhas = await faixaDeGrupos();
  const grupos = linhas ? gruposOficiaisDaFaixa(linhas) : null;
  return grupos?.length ? grupos : null;
}
