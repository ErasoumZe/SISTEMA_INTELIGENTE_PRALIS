import type { CorRgbMenu } from "@padaria/shared";

export type CorCalculada = [number, number, number];

function canalLinear(valor: number) {
  const normalizado = valor / 255;
  return normalizado <= 0.04045 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4;
}

function luminancia(cor: CorCalculada) {
  return 0.2126 * canalLinear(cor[0]) + 0.7152 * canalLinear(cor[1]) + 0.0722 * canalLinear(cor[2]);
}

export function contrasteRgb(primeira: CorCalculada, segunda: CorCalculada) {
  const clara = Math.max(luminancia(primeira), luminancia(segunda));
  const escura = Math.min(luminancia(primeira), luminancia(segunda));
  return (clara + 0.05) / (escura + 0.05);
}

function misturar(origem: CorCalculada, destino: CorCalculada, pesoDestino: number): CorCalculada {
  return origem.map((canal, indice) => Math.round(canal * (1 - pesoDestino) + destino[indice]! * pesoDestino)) as CorCalculada;
}

export function textoRgbAcessivel(cor: CorRgbMenu, escuro: boolean): CorCalculada {
  const fundo: CorCalculada = escuro ? [20, 25, 33] : [255, 255, 255];
  const origem: CorCalculada = [cor.r, cor.g, cor.b];
  const destino: CorCalculada = escuro ? [255, 255, 255] : [0, 0, 0];
  for (let passo = 0; passo <= 20; passo += 1) {
    const ajustada = misturar(origem, destino, passo / 20);
    if (contrasteRgb(ajustada, fundo) >= 4.5) return ajustada;
  }
  return destino;
}

export function cssRgb(cor: CorCalculada | CorRgbMenu) {
  const [r, g, b] = Array.isArray(cor) ? cor : [cor.r, cor.g, cor.b];
  return `rgb(${r} ${g} ${b})`;
}

/** A faixa usa o RGB exato; a escrita é ajustada automaticamente para leitura. */
export function estiloCorRgbMenu(cor: CorRgbMenu, escuro: boolean) {
  return { faixa: cssRgb(cor), texto: cssRgb(textoRgbAcessivel(cor, escuro)) };
}
