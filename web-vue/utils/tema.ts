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

// Identidade visual por categoria: cor "de fabrica" por tela operacional, usada no menu
// (icone) e como default do tema da tela. Fonte unica dos hex — nao duplicar em outro lugar.
export const corCategoriaPorTela: Record<string, string> = {
  entradas: "#ca8a04", // vendas/entradas = amarelo
  relatorio_vendas: "#ca8a04",
  transferencias: "#ea580c", // laranja
  mercadorias: "#16a34a", // verde
  retiradas: "#2563eb" // lucros/retiradas = azul
};

// Default de categoria como tema PARCIAL (so a cor primaria): fundo/cartao/aviso/etc
// continuam vindo do padrao da empresa.
export const temaPadraoPorTela: Record<string, Partial<TemaAplicacao>> = Object.fromEntries(
  Object.entries(corCategoriaPorTela).map(([tela, cor]) => [tela, { corPrimaria: cor }])
);

// Cores "de fabrica" antigas (roxo/teal) gravadas no banco de empresas nunca personalizadas.
const primariaFabricaAntiga = "#6d28d9";
const secundariaFabricaAntiga = "#0891b2";
const identidadePralis = { corPrimaria: "#c0521d", corSecundaria: "#b8480f" };

// Padrao efetivo com a identidade Pralis: troca APENAS os campos ainda de fabrica pelo
// laranja (campo a campo). Empresa que personalizou o padrao mantem as cores escolhidas.
export function padraoComIdentidade(padrao: TemaAplicacao): TemaAplicacao {
  return {
    ...padrao,
    corPrimaria: padrao.corPrimaria === primariaFabricaAntiga ? identidadePralis.corPrimaria : padrao.corPrimaria,
    corSecundaria:
      padrao.corSecundaria === secundariaFabricaAntiga ? identidadePralis.corSecundaria : padrao.corSecundaria
  };
}

// Base da tela ANTES do especifico: padrao (com identidade) + default de categoria.
// Usada na resolucao E no diff do salvamento — os dois precisam do mesmo referencial.
export function baseTemaDaTela(padrao: TemaAplicacao, tela: string): TemaAplicacao {
  return { ...padraoComIdentidade(padrao), ...(temaPadraoPorTela[tela] ?? {}) };
}

// Tema efetivo de uma tela, em camadas: padrao da empresa (com identidade) -> default de
// categoria (parcial) -> especifico da pagina. A personalizacao salva sempre vence.
export function resolverTemaDeConfiguracao(
  configuracao: ConfiguracaoAparenciaEmpresa | null | undefined,
  tela: string
): TemaAplicacao | null {
  if (!configuracao) return null;
  if (tela === "padrao") return padraoComIdentidade(configuracao.padrao);
  const especifico = configuracao.especifico.find((item) => item.pagina === tela);
  return { ...baseTemaDaTela(configuracao.padrao, tela), ...(especifico?.propriedades ?? {}) };
}

// Cor do icone da tela no menu: a corPrimaria resolvida quando DIFERE do padrao da empresa
// (tela categorizada ou personalizada); undefined = icone neutro. Sem configuracao carregada,
// cai na cor fixa da categoria (mesmo default estatico do domain.ts).
export function corMenuTela(
  configuracao: ConfiguracaoAparenciaEmpresa | null | undefined,
  tela: string
): string | undefined {
  const temaTela = resolverTemaDeConfiguracao(configuracao, tela);
  if (!configuracao || !temaTela) return corCategoriaPorTela[tela];
  const padrao = padraoComIdentidade(configuracao.padrao);
  return temaTela.corPrimaria !== padrao.corPrimaria ? temaTela.corPrimaria : undefined;
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
    // Diff contra a BASE da tela (padrao com identidade + categoria), o mesmo referencial da
    // resolucao: salvar sem mudar nada nao grava especifico, e "voltar ao padrao" funciona.
    const propriedades = diferencasTema(temaSalvo, baseTemaDaTela(configuracao.padrao, tela));
    if (Object.keys(propriedades).length > 0) configuracao.especifico.push({ pagina: tela, propriedades });
  }
  return configuracao;
}
