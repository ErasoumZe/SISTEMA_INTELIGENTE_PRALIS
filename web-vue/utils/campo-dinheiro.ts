// Conversao de texto <-> numero do campo de dinheiro. Vive fora do .vue para poder ser testada sem
// montar componente: e aqui que mora a diferenca entre o que a pessoa DIGITA (pt-BR, virgula) e o
// que vai no payload (decimal com ponto, que o `z.coerce.number()` do contrato espera).

/**
 * Le tanto "1.234,56" (digitado por gente) quanto "1234.56" (o formato do payload).
 * Devolve `null` para vazio ou lixo — vazio precisa continuar vazio, e nao virar 0.
 */
export function numeroDoCampo(bruto: string | number | null | undefined): number | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim();
  if (!texto) return null;
  // Com virgula presente, o ponto so pode ser separador de milhar. Sem virgula, o ponto e decimal.
  const normalizado = texto.includes(",") ? texto.replaceAll(".", "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Formata em pt-BR com no MINIMO duas casas — e isso que faz `50` virar `50,00`.
 * `casas` e o teto de decimais preservados, nao um fixo: colunas de `scale 4` (valor unitario,
 * desconto, juros) passam 4 aqui para a tela nao arredondar o que a pessoa digitou.
 */
export function formatarCampoDinheiro(valor: number, casas = 2): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: casas });
}

/**
 * Mantem so digitos e UM separador decimal. Sem isto o campo aceitaria "1,2,3" e o payload sairia
 * como NaN, com o erro aparecendo la no servidor em vez de aqui.
 *
 * Com virgula presente, os pontos sao separador de MILHAR e caem fora — e o que salva quem cola
 * "R$ 1.234,56" de uma planilha. Sem virgula nenhuma, o ponto e o decimal: o teclado numerico de
 * varios aparelhos manda ponto, e recusar isso deixaria a pessoa sem como digitar centavos.
 */
export function limparDigitacaoDinheiro(bruto: string): string {
  const limpo = bruto.replace(/[^\d.,]/gu, "");
  if (limpo.includes(",")) {
    const semMilhar = limpo.replaceAll(".", "");
    const primeiraVirgula = semMilhar.indexOf(",");
    return semMilhar.slice(0, primeiraVirgula + 1) + semMilhar.slice(primeiraVirgula + 1).replaceAll(",", "");
  }
  const primeiroPonto = limpo.indexOf(".");
  if (primeiroPonto < 0) return limpo;
  return limpo.slice(0, primeiroPonto + 1) + limpo.slice(primeiroPonto + 1).replaceAll(".", "");
}
