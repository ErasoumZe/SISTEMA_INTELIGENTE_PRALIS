import { z } from "zod";

// Primeiro validador de CPF do monorepo. Ate a ADM-001 o sistema so tinha `apenasDigitos`
// (api/src/utils.ts) — nenhum lugar conferia digito verificador, e `colaboradores.cpf` nasceu sem
// UNIQUE. Este modulo e a referencia para quando `colaboradores`/`usuarios` adotarem a mesma regra;
// por isso mora em `shared` e nao dentro do servico.
//
// Regra do ADM-001 (decisao de Marco): CPF obrigatorio, somente digitos, com digito verificador.

/** Reduz qualquer formatacao (`123.456.789-09`, com espacos, com traco) aos 11 digitos. */
export function normalizarCpf(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/gu, "");
}

// Modulo 11 classico da Receita: pesos decrescentes a partir de `ate + 1`, resto 10 vira 0.
function digitoVerificadorCpf(digitos: string, ate: number): number {
  let soma = 0;
  for (let indice = 0; indice < ate; indice += 1) {
    soma += Number(digitos[indice]) * (ate + 1 - indice);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/**
 * `true` somente para 11 digitos com os dois verificadores corretos.
 *
 * A recusa de sequencia repetida (`00000000000` ate `99999999999`) e explicita e NAO e redundante:
 * todas as onze passam na conta do modulo 11. Sem esta linha, `111.111.111-11` seria aceito como
 * CPF valido — e e justamente o valor que alguem digita para "preencher rapido".
 */
export function cpfValido(valor: string | null | undefined): boolean {
  const digitos = normalizarCpf(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/u.test(digitos)) return false;
  return (
    digitoVerificadorCpf(digitos, 9) === Number(digitos[9]) &&
    digitoVerificadorCpf(digitos, 10) === Number(digitos[10])
  );
}

/**
 * Mascara de exibicao da LISTA: nenhum digito do CPF aparece (decisao de Marco, correcao 2).
 * O valor real so sai no detalhe, por acao explicita, e essa revelacao vira evento de auditoria.
 */
export function cpfTotalmenteMascarado(): string {
  return "•••.•••.•••-••";
}

/**
 * O CPF como contrato: valida digito verificador e normaliza para 11 digitos.
 *
 * Mora AQUI, e nao no `index.ts`, por uma razao concreta: `processos.ts` precisa dele, e importar do
 * `index` criaria ciclo (`index` reexporta `processos`). Sob a condicao `development`, que resolve o
 * `.ts` direto, esse ciclo deixava o schema `undefined` na hora de montar o payload — e a rota
 * respondia 400 "expected a Zod schema" sem nenhuma pista de onde vinha.
 *
 * Refine ANTES do transform: `cpfValido` ja normaliza por dentro, entao a ordem nao muda o resultado
 * — mas mantem a entrada como string simples e a mensagem de erro presa ao campo.
 */
export const cpfTesteSchema = z
  .string()
  .refine((valor) => cpfValido(valor), { message: "CPF invalido" })
  .transform(normalizarCpf);
