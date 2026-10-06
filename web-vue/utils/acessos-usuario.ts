type DependenciasAcessosUsuario = {
  notificar: (texto: string, cor?: string) => void;
  navegar: (rota: { path: string; query: Record<string, string> }) => Promise<void>;
};

// O atalho da lista de Usuários leva para a única tela de permissões. Não abre
// um segundo editor nem reutiliza o modal de cadastros gerais.
export function deveIniciarConfiguracaoUsuario(tela: string, idEditando: string) {
  return tela === "usuarios" && !idEditando;
}

export function criarAcoesAcessosUsuario(deps: DependenciasAcessosUsuario) {
  async function abrirAcessosUsuario(linha: Record<string, string | undefined>) {
    const usuarioId = linha.usuarioId ?? linha.id;
    if (!usuarioId) return false;

    try {
      await deps.navegar({ path: "/permissoes", query: { usuario: usuarioId } });
      return true;
    } catch {
      deps.notificar("Não foi possível abrir as permissões desta pessoa.", "error");
      return false;
    }
  }

  async function iniciarConfiguracaoDoUsuarioCriado(usuarioId: string | undefined, role: string) {
    if (!usuarioId || role !== "usuario_comum") return null;
    deps.notificar("Usuário criado. Agora configure os acessos.");
    return abrirAcessosUsuario({ id: usuarioId });
  }

  return { abrirAcessosUsuario, iniciarConfiguracaoDoUsuarioCriado };
}
