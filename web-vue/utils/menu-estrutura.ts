import { normalizarEstruturaMenuEmpresa, type EstruturaMenuEmpresa, type IdMenuConfiguravel } from "@padaria/shared";
import { SECOES_MENU } from "~/utils/menu";

export type SecaoMenu = EstruturaMenuEmpresa["secoes"][number];
export type EstruturaMenu = EstruturaMenuEmpresa;

/** Sem configuração salva, o sistema preserva exatamente a organização atual. */
export function estruturaPadrao(): EstruturaMenu {
  return {
    versao: 1,
    idsOcultos: [],
    secoes: SECOES_MENU.map((secao, indice) => ({
      id: `padrao-${indice + 1}`,
      titulo: secao.titulo,
      ids: secao.ids as IdMenuConfiguravel[],
      cor: secao.cor ?? "neutro"
    }))
  };
}

/**
 * A estrutura organiza apenas itens conhecidos. Permissões continuam sendo a barreira que decide
 * o que uma pessoa vê; uma tela removida da estrutura reaparece em "Geral", nunca some.
 */
export function normalizarEstrutura(bruto: EstruturaMenu | null | undefined): EstruturaMenu | null {
  if (!bruto || bruto.versao !== 1 || !Array.isArray(bruto.secoes)) return null;
  const estrutura = normalizarEstruturaMenuEmpresa(bruto);
  return estrutura.secoes.length ? estrutura : null;
}

const ID_CENTRAL_DP: IdMenuConfiguravel = "departamento_pessoal";
const IDS_EXISTENTES_DP = new Set<IdMenuConfiguravel>([
  "admissoes_processos",
  "admissoes_testes",
  "colaboradores",
  "funcoes_operacionais",
  "areas_setores",
  "turnos"
]);
const IDS_CONPLUS_DP: IdMenuConfiguravel[] = [
  "conplus_folha_05",
  "conplus_adiantamento_20",
  "conplus_rescisoes",
  "conplus_ferias"
];

/**
 * Uma estrutura salva nao e regravada quando uma tela nova entra no produto. Sem esta compatibilidade,
 * a Central acabaria em "Geral" para quem ja personalizou o menu antes dela existir. A insercao so
 * acrescenta o novo atalho na secao que ja concentra telas do DP; nao move nem altera escolhas salvas.
 */
function incluirCentralDpEmEstruturaLegada(estrutura: EstruturaMenu): EstruturaMenu {
  if (estrutura.idsOcultos.includes(ID_CENTRAL_DP)) return estrutura;
  const indice = estrutura.secoes.findIndex(
    (secao) => secao.titulo === "Departamento pessoal" || secao.ids.some((id) => IDS_EXISTENTES_DP.has(id))
  );
  if (indice < 0) return estrutura;
  const secaoDp = estrutura.secoes[indice];
  if (!secaoDp) return estrutura;
  const centralAusente = !secaoDp.ids.includes(ID_CENTRAL_DP);
  const idsNovos = IDS_CONPLUS_DP.filter((id) => !estrutura.idsOcultos.includes(id) && !secaoDp.ids.includes(id));
  if (!centralAusente && !idsNovos.length) return estrutura;
  return {
    ...estrutura,
    secoes: estrutura.secoes.map((secao, atual) =>
      atual === indice
        ? { ...secao, ids: [...(centralAusente ? [ID_CENTRAL_DP] : []), ...secao.ids, ...idsNovos] }
        : secao
    )
  };
}

export function estruturaEfetiva(salva: EstruturaMenu | null | undefined): EstruturaMenu {
  const estrutura = normalizarEstrutura(salva) ?? estruturaPadrao();
  return incluirCentralDpEmEstruturaLegada(estrutura);
}
