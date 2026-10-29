import type { AuthSession } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";

/**
 * Empresa ATIVA das telas de produto — a que o seletor do shell mostra. Mora na MESMA chave que o
 * `AppWorkspace` usa (`padaria.workspace.empresaSelecionadaId`): a loja escolhida na listagem continua
 * escolhida no "Importar da base", e a copia vai para ela (antes ia sempre para a empresa do perfil,
 * ignorando o seletor). O prefixo do workspace faz o logout limpar junto.
 */
export function useEmpresaAtivaDosProdutos() {
  const empresaId = useState("padaria.workspace.empresaSelecionadaId", () => "");

  /** Fica com a escolhida se ela ainda e permitida; senao, a do perfil; senao, a primeira. */
  function iniciar(sessao: AuthSession, empresas: readonly Opcao[]) {
    const permitida = empresas.some((empresa) => empresa.id === empresaId.value);
    if (permitida) return;
    empresaId.value = sessao.perfil?.empresaId ?? sessao.perfil?.empresaIds?.[0] ?? empresas[0]?.id ?? "";
  }

  function trocar(id: string) {
    empresaId.value = id;
  }

  return { empresaId, iniciar, trocar };
}
