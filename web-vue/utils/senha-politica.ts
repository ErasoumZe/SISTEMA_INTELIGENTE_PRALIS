// Politica de senha da TELA de redefinicao.
//
// O backend usa `senhaMinimaAutenticacao` (api/src/auth/config.ts), que vale 10 em producao e 8 em
// desenvolvimento. A tela nao conhece o ambiente do servidor, entao adota o valor mais RESTRITIVO:
// exigir 10 aqui nunca deixa passar uma senha que producao vai recusar.
//
// O formulario exigia 8 e o servidor de producao exigia 10 — o usuario digitava uma senha valida
// segundo a tela, enviava, e recebia de volta um erro que ele nao tinha como prever.
export const SENHA_MINIMA_CARACTERES = 10;

export function senhaAtendeMinimo(senha: string): boolean {
  return senha.length >= SENHA_MINIMA_CARACTERES;
}

export const MENSAGEM_SENHA_CURTA = `A senha precisa ter pelo menos ${SENHA_MINIMA_CARACTERES} caracteres.`;
