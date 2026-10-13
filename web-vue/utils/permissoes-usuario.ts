import { descricaoPermissao, permissoes, type Permissao } from "@padaria/shared";
import { permissaoPertenceASecao, secoesPermissoes } from "~/utils/domain";

export type RegraDiretaUsuario = Record<Permissao, boolean>;

export type ItemPermissaoUsuario = {
  codigo: Permissao;
  rotulo: string;
  descricao: string;
  permitido: boolean;
};

export type SecaoPermissaoUsuario = {
  titulo: string;
  itens: ItemPermissaoUsuario[];
};

const nomesAcoes: Array<[string, string]> = [
  ["somente_caixa_aberto", "Exigir caixa aberto"],
  ["visualizar_dpago", "Ver lançamentos pagos"],
  ["editar_dpago", "Editar lançamento pago"],
  ["excluir_dpago", "Excluir lançamento pago"],
  ["visualizar", "Visualizar"],
  ["criar", "Criar"],
  ["editar", "Editar"],
  ["excluir", "Excluir"],
  ["discriminar", "Discriminar"],
  ["aprovar", "Aprovar"],
  ["cancelar", "Cancelar"],
  ["conferir", "Conferir"],
  ["gerenciar", "Gerenciar"],
  ["mostrar", "Mostrar no menu"],
  ["desabilitado", "Exibir desabilitado"],
  ["operar", "Operar"],
  ["pagar", "Pagar"],
  ["efetuar", "Efetuar"],
  ["importar", "Importar"],
  ["exportar", "Exportar"],
  ["restaurar", "Restaurar"]
];

function tituloRecurso(codigo: string) {
  return codigo
    .replace(/^menu_/u, "")
    .replace(/^cadastro_/u, "")
    .replaceAll("_", " ")
    .replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

export function rotuloPermissao(codigo: Permissao, nomes: ReadonlyMap<string, string> = new Map()): string {
  const doCatalogo = nomes.get(codigo)?.trim();
  if (doCatalogo && !/^permissao para\b/ui.test(doCatalogo)) return doCatalogo;

  const acao = nomesAcoes.find(([sufixo]) => codigo.endsWith(`_${sufixo}`));
  const recurso = codigo
    .replace(/^menu_/u, "")
    .replace(acao ? new RegExp(`_${acao[0]}$`, "u") : /$/u, "");
  return acao ? `${tituloRecurso(recurso)} — ${acao[1]}` : tituloRecurso(recurso);
}

/** Mapa completo: o editor novo nunca deixa o terceiro estado "herdar" escondido no payload. */
export function regrasDiretasCompletas(permitidas: readonly Permissao[]): RegraDiretaUsuario {
  const permitidasSet = new Set(permitidas);
  return Object.fromEntries(permissoes.map((codigo) => [codigo, permitidasSet.has(codigo)])) as RegraDiretaUsuario;
}

export function secoesDoUsuario(
  regras: Readonly<RegraDiretaUsuario>,
  nomes: ReadonlyMap<string, string> = new Map(),
  busca = ""
): SecaoPermissaoUsuario[] {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return secoesPermissoes
    .map((secao) => ({
      titulo: secao.titulo,
      itens: permissoes
        .filter((codigo) => permissaoPertenceASecao(codigo, secao))
        .map((codigo) => ({
          codigo,
          rotulo: rotuloPermissao(codigo, nomes),
          descricao: descricaoPermissao(codigo),
          permitido: regras[codigo]
        }))
        .filter((item) =>
          !termo || `${item.rotulo} ${item.descricao} ${item.codigo}`.toLocaleLowerCase("pt-BR").includes(termo)
        )
    }))
    .filter((secao) => secao.itens.length > 0);
}
