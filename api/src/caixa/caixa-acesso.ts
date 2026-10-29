import { temPermissao, type PerfilUsuario } from "@padaria/shared/autenticacao";

// Quem opera um caixa: o dono, o operador registrado nele ou quem gerencia caixas. Modulo proprio para o
// `caixa.service` e os modulos ao lado (ex.: recebimento sem lacre) usarem a MESMA regra sem import circular.
export function podeOperarCaixa(
  perfil: PerfilUsuario,
  caixa: { usuarioId: string | null; usuarioCaixaId: string | null }
) {
  return (
    temPermissao(perfil.permissoes, "caixas_gerenciar") ||
    caixa.usuarioId === perfil.usuarioId ||
    caixa.usuarioCaixaId === perfil.usuarioId
  );
}
