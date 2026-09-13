// Carga tolerante a falha das listas de OPCOES de formulario. Uma falha de permissao (403) numa
// lista secundaria — ex.: um cargo que opera caixa mas nao tem cadastro de produtos — NAO deve
// derrubar a tela inteira: carregamos cada lista isoladamente, mantemos o restante e avisamos de
// forma discreta o que faltou. Falha silenciosa e proibida (bug 1/2 do QA de 15/07).

// Executa `carregar`; em caso de erro registra o rotulo em `faltas` e devolve `vazio`, para a tela
// renderizar mesmo assim. O chamador usa `faltas` para avisar o usuario.
export async function carregarOpcaoOpcional<T>(
  faltas: string[],
  rotulo: string,
  carregar: () => Promise<T>,
  vazio: T
): Promise<T> {
  try {
    return await carregar();
  } catch {
    faltas.push(rotulo);
    return vazio;
  }
}

type PaginaDeOpcoes<T> = {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
};

// Select de formulario nao e listagem paginada: precisa conhecer TODAS as opcoes validas. Percorre
// as paginas da API para que a opcao 11+ nao desapareca silenciosamente do dominio do formulario.
export async function carregarTodasPaginas<T>(
  carregar: (page: number, pageSize: number) => Promise<PaginaDeOpcoes<T>>,
  pageSize = 100
): Promise<T[]> {
  const primeira = await carregar(1, pageSize);
  const itens = [...primeira.itens];
  const totalPaginas = Math.max(1, Math.ceil(primeira.total / Math.max(1, primeira.pageSize)));

  for (let page = 2; page <= totalPaginas; page += 1) {
    const pagina = await carregar(page, pageSize);
    itens.push(...pagina.itens);
  }

  return itens;
}

// Mensagem discreta (deduplicada) com as listas que nao carregaram. "" quando nada faltou.
export function avisoOpcoesIndisponiveis(faltas: string[]): string {
  const listas = Array.from(new Set(faltas));
  if (!listas.length) return "";
  return `Algumas listas não carregaram por falta de permissão (${listas.join(", ")}). A tela continua utilizável.`;
}
