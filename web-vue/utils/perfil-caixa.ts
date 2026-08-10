// Quem e OPERADOR de caixa e quem e RETAGUARDA — uma definicao so, a mesma do servidor.
//
// A tela decidia por permissao (`caixa_operar && !caixas_gerenciar`) e o servidor por
// `podeLancarSemCaixa`. Duas verdades que divergiam nos DOIS sentidos:
//  - cargo "Gerencia" COM `caixa_operar` e SEM `caixas_gerenciar`: a tela travava o campo Conta e o
//    servidor tratava como retaguarda, aceitando qualquer conta;
//  - cargo "Caixa" COM `caixas_gerenciar`: a tela liberava a lista inteira e o servidor devolvia 400
//    sem que a tela avisasse.
//
// `podeLancarSemCaixa` ja mora em `shared` exatamente para isto — o comentario dela diz que copiar a
// lista de cargos no front criaria duas verdades. Era o que estava acontecendo.
import { podeLancarSemCaixa, temPermissao, type PerfilUsuario } from "@padaria/shared";

/** Operador operacional: opera caixa E nao e retaguarda. Nao ha lista de cargos duplicada aqui. */
export function ehOperadorDeCaixa(perfil: PerfilUsuario | null | undefined): boolean {
  if (!perfil) return false;
  return temPermissao(perfil.permissoes, "caixa_operar") && !podeLancarSemCaixa(perfil);
}

/**
 * R-121: a conta do PDV do caixa aberto, quando quem lanca e o operador. `""` para a retaguarda,
 * que escolhe a conta livremente.
 */
export function contaTravadaDeCaixa(
  perfil: PerfilUsuario | null | undefined,
  caixaAberto: { pdvContaId?: string | null } | null | undefined
): string {
  return ehOperadorDeCaixa(perfil) ? (caixaAberto?.pdvContaId ?? "") : "";
}

/**
 * Nome que o campo travado EXIBE. Tem de ser o da conta que o lancamento vai usar de verdade — que
 * e a do formulario, e nao a do PDV de agora.
 *
 * O campo mostrava sempre a conta do PDV atual. Num registro ABERTO para edicao cuja conta gravada e
 * outra (PDV reapontado depois do lancamento), a tela dizia "sai da conta B" enquanto o registro e o
 * payload carregavam a conta A — e so o 403 do servidor, no salvar, revelava a mentira.
 *
 * A reserva pelo nome do PDV so vale quando a conta exibida E a do caixa: para a conta gravada de um
 * registro antigo, chamar de "conta do caixa aberto" seria repetir a mesma mentira.
 */
export function nomeDaContaDoLancamento(entrada: {
  contaTravada: string;
  contaDoFormulario: string;
  contas: readonly { id: string; nome?: string | undefined }[];
  pdvNome?: string | null;
}): string {
  if (!entrada.contaTravada) return "";
  const exibida = entrada.contaDoFormulario || entrada.contaTravada;
  const conta = entrada.contas.find((item) => item.id === exibida);
  if (conta?.nome) return conta.nome;
  if (exibida === entrada.contaTravada) return entrada.pdvNome || "Conta do caixa aberto";
  return "Conta original do lançamento";
}
