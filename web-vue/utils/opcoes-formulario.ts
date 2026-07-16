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

// Mensagem discreta (deduplicada) com as listas que nao carregaram. "" quando nada faltou.
export function avisoOpcoesIndisponiveis(faltas: string[]): string {
  const listas = Array.from(new Set(faltas));
  if (!listas.length) return "";
  return `Algumas listas nao carregaram por falta de permissao (${listas.join(", ")}). A tela continua utilizavel.`;
}
