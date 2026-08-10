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
