// A REGRA do relogio e da saudacao da topbar. Fica aqui, fora do componente, para ser testavel sem
// runtime Nuxt — mesmo espirito do `menu.ts` e do `dashboard.ts`.
//
// O FUSO NAO SE INVENTA. `FUSO_NEGOCIO` ja existe em `shared/src/datas/index.ts:3` e o comentario
// de la explica por que: a padaria opera em Sao Paulo, e a data CONTABIL e o dia como o operador o
// vive, nao o dia em UTC. Os formatadores do `utils/formatacao.ts` usam `toLocaleString` sem fuso,
// ou seja, o fuso do NAVEGADOR — o que basta para exibir um timestamp ao lado do dado, mas nao
// para um relogio que diz "agora" no negocio. Por isso aqui o fuso e explicito.
// PELA RAIZ, e nao por `@padaria/shared/datas`: o `nuxt.config` apelida `@padaria/shared` para o
// ARQUIVO `shared/src/index.ts`, e o alias do Vite casa por prefixo — o subcaminho viraria
// `.../index.ts/datas` e o modulo daria 404 NO NAVEGADOR. O `scripts/verificar-arquitetura.mjs:66`
// so libera subcaminho em `import type`, que some na compilacao; este e import de VALOR.
import { FUSO_NEGOCIO } from "@padaria/shared";

export type FaixaDoDia = "bom-dia" | "boa-tarde" | "boa-noite";

/**
 * As faixas, decididas em 28/08/2026 e registradas para nao virarem discussao depois:
 *
 *   05:00 - 11:59   bom dia
 *   12:00 - 17:59   boa tarde
 *   18:00 - 04:59   boa noite
 *
 * A faixa da noite ATRAVESSA a meia-noite, e e por isso que ela e o `else`: quem entra as 2h da
 * manha para o fechamento ve "Boa noite", nao "Bom dia". Numa padaria isso nao e detalhe — o turno
 * da madrugada existe.
 */
export function faixaDoDia(hora: number): FaixaDoDia {
  if (hora >= 5 && hora < 12) return "bom-dia";
  if (hora >= 12 && hora < 18) return "boa-tarde";
  return "boa-noite";
}

const TEXTO: Record<FaixaDoDia, string> = {
  "bom-dia": "Bom dia",
  "boa-tarde": "Boa tarde",
  "boa-noite": "Boa noite"
};

export function textoDaSaudacao(hora: number): string {
  return TEXTO[faixaDoDia(hora)];
}

/**
 * A hora NO FUSO DO NEGOCIO, nao no do navegador.
 *
 * Usa `Intl` em vez de `getHours()` de proposito: `getHours()` devolve a hora da maquina de quem
 * abriu a tela. Um gerente acessando de outro fuso veria "Boa noite" enquanto a padaria vive a
 * tarde — e a saudacao passaria a falar do relogio dele, nao do negocio.
 */
const formatadorHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_NEGOCIO,
  hour: "2-digit",
  hour12: false
});

export function horaDoNegocio(instante: Date): number {
  return Number(formatadorHora.format(instante));
}

/**
 * O relogio: hora e data, no fuso do negocio.
 *
 * SEM SEGUNDOS, e isso decide o intervalo do componente: um relogio que mostra `HH:mm` nao precisa
 * de `setInterval` de um segundo. Sessenta vezes menos trabalho por minuto, e nada muda na tela.
 */
const formatadorRelogio = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_NEGOCIO,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_NEGOCIO,
  weekday: "long",
  day: "2-digit",
  month: "long"
});

export type Relogio = { hora: string; data: string; saudacao: string };

export function lerRelogio(instante: Date): Relogio {
  return {
    hora: formatadorRelogio.format(instante),
    data: formatadorData.format(instante),
    saudacao: textoDaSaudacao(horaDoNegocio(instante))
  };
}
