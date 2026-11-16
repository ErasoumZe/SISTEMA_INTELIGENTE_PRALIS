import type { ItemMenu } from "~/types/padaria";
import { gruposVisiveis } from "~/utils/videos-ajuda";

export type AtalhoNavegacaoMobile = {
  id: string;
  titulo: string;
  icone: string;
  rota?: string;
  acao?: "saidas" | "transferencias";
};

const atalhosPrioritarios: Array<{ id: string; rota: string }> = [{ id: "caixa", rota: "/caixa" }];

const atalhoPainel: AtalhoNavegacaoMobile = {
  id: "painel",
  titulo: "Início",
  icone: "mdi-home-variant-outline",
  rota: "/"
};

/* TREINAMENTO fica NO MEIO da barra (Marco, R-242): Inicio, Caixa, Treinamento, Saidas,
   Transferencias. So aparece para quem tem algum grupo de video liberado, pela mesma lista do menu;
   sem grupo, o botao levaria a uma pagina vazia. */
const atalhoTreinamento: AtalhoNavegacaoMobile = {
  id: "treinamento",
  titulo: "Treinamento",
  icone: "mdi-school-outline",
  rota: "/treinamento"
};

/**
 * A barra inferior preserva as rotas de consulta e reutiliza os dois atos do + Novo.
 * Ela recebe apenas os atos ja autorizados pelo workspace e nunca cria permissao ou estado proprio.
 */
export function atalhosDaNavegacaoMobile(
  telas: ItemMenu[],
  telasDesabilitadas: readonly string[] = [],
  acoesPermitidas: readonly string[] = []
): AtalhoNavegacaoMobile[] {
  const bloqueadas = new Set(telasDesabilitadas);
  const porId = new Map(telas.map((tela) => [tela.id, tela]));

  return [
    atalhoPainel,
    ...atalhosPrioritarios.flatMap(({ id, rota }) => {
      const tela = porId.get(id);
      if (!tela || bloqueadas.has(id)) return [];
      return [{ id: tela.id, titulo: tela.titulo, icone: tela.icone, rota }];
    }),
    ...(gruposVisiveis(telas).length ? [atalhoTreinamento] : []),
    ...(acoesPermitidas.includes("saidas")
      ? [{ id: "saidas", titulo: "Saídas", icone: "mdi-arrow-up-right", acao: "saidas" as const }]
      : []),
    ...(acoesPermitidas.includes("transferencias")
      ? [
          {
            id: "transferencias",
            titulo: "Transferências",
            icone: "mdi-swap-horizontal",
            acao: "transferencias" as const
          }
        ]
      : [])
  ];
}
