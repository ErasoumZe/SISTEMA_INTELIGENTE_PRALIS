// Logica PURA de aparencia por empresa/tela, extraida do AppWorkspace. O diff/merge do
// tema especifico por pagina e fiddly (fonte de bug); isolar aqui deixa testavel.
import type { ConfiguracaoAparenciaEmpresa, TemaAplicacao } from "@padaria/shared";

const camposTema = [
  "corPrimaria",
  "corSecundaria",
  "corFundo",
  "corCartao",
  "corSucesso",
  "corAviso",
  "corErro"
] as const satisfies ReadonlyArray<keyof TemaAplicacao>;

// So os campos em que temaSalvo difere do padrao (o que precisa ser gravado como especifico).
export function diferencasTema(temaSalvo: TemaAplicacao, padrao: TemaAplicacao): Partial<TemaAplicacao> {
  return Object.fromEntries(
    camposTema.filter((campo) => temaSalvo[campo] !== padrao[campo]).map((campo) => [campo, temaSalvo[campo]])
  );
}

// Tema efetivo de uma tela: padrao + o especifico daquela pagina (se houver).
export function resolverTemaDeConfiguracao(
  configuracao: ConfiguracaoAparenciaEmpresa | null | undefined,
  tela: string
): TemaAplicacao | null {
  if (!configuracao) return null;
  if (tela === "padrao") return { ...configuracao.padrao };
  const especifico = configuracao.especifico.find((item) => item.pagina === tela);
  return { ...configuracao.padrao, ...(especifico?.propriedades ?? {}) };
}

// Nova configuracao de aparencia apos salvar o tema de uma tela. Editar o "padrao" recalcula os
// especificos como diffs sobre o novo padrao (some quem ficou igual); editar uma tela grava/
// remove o especifico dela conforme diferir do padrao.
export function montarConfiguracaoAparencia(
  atual: ConfiguracaoAparenciaEmpresa,
  tela: string,
  temaSalvo: TemaAplicacao
): ConfiguracaoAparenciaEmpresa {
  const configuracao: ConfiguracaoAparenciaEmpresa =
    tela === "padrao"
      ? {
          padrao: temaSalvo,
          especifico: atual.especifico
            .map((item) => ({
              pagina: item.pagina,
              propriedades: diferencasTema({ ...temaSalvo, ...item.propriedades }, temaSalvo)
            }))
            .filter((item) => Object.keys(item.propriedades).length > 0)
        }
      : {
          padrao: atual.padrao,
          especifico: atual.especifico.filter((item) => item.pagina !== tela)
        };

  if (tela !== "padrao") {
    const propriedades = diferencasTema(temaSalvo, configuracao.padrao);
    if (Object.keys(propriedades).length > 0) configuracao.especifico.push({ pagina: tela, propriedades });
  }
  return configuracao;
}
