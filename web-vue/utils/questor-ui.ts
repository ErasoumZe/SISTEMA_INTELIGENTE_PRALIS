type ErroQuestor = { status?: number; codigo?: string };

export function mensagemErroQuestor(erro: object | null | undefined): string {
  if (erro && typeof erro === "object" && "status" in erro) {
    const apiErro = erro as ErroQuestor;
    if (apiErro.status === 403) return "Sem permissão para configurar o Questor.";
    if (apiErro.status === 404 || apiErro.status === 503 || apiErro.codigo === "QUESTOR_MIGRATION_PENDENTE") {
      return "A API Questor ainda não está disponível neste ambiente. Rotas e migrations continuam pendentes.";
    }
    if (apiErro.status === 409) return "Outra pessoa alterou estes dados. Recarregue a tela antes de salvar novamente.";
    return "Não foi possível concluir a operação Questor. Verifique a API e tente novamente.";
  }
  return "Não foi possível concluir a operação Questor.";
}
