import type { DadosExternos } from "@padaria/shared/api";
import { describe, expect, it } from "vitest";
import { chavesEstadoWorkspace, limparEstadoWorkspace, PREFIXO_ESTADO_WORKSPACE } from "./estado-workspace";

// P0-SESSAO-E-PERMISSOES: `sessao` e `workspaceCarregado` sao `useState` e sobrevivem ao logout.
// O `onMounted` do AppWorkspace ve `workspaceCarregado` verdadeiro e RETORNA sem recarregar, entao
// o perfil do usuario anterior continua carregado. Enquanto isto nao for verdade, nenhum teste de
// permissao vale: o sistema estaria avaliando o usuario errado.
//
// O payload do Nuxt guarda `useState("x")` como `payload.state["$sx"]` — dai o prefixo `$s`.
function payloadDoUsuario(nome: string): Record<string, DadosExternos> {
  return {
    [`$s${PREFIXO_ESTADO_WORKSPACE}sessao`]: { perfil: { usuarioId: nome, permissoes: [`${nome}_pode_tudo`] } },
    [`$s${PREFIXO_ESTADO_WORKSPACE}carregado`]: true,
    [`$s${PREFIXO_ESTADO_WORKSPACE}empresaSelecionadaId`]: `empresa-de-${nome}`,
    [`$s${PREFIXO_ESTADO_WORKSPACE}caixaStatus`]: { caixaAberto: { id: `caixa-de-${nome}` } },
    [`$s${PREFIXO_ESTADO_WORKSPACE}tema`]: { primaria: "#6515dd" },
    // Estado de OUTRO dominio: nao pode ser levado junto.
    "$soutro.dominio.preferencia": "manter"
  };
}

describe("estado do workspace entre sessoes", () => {
  it("limpa TODAS as chaves padaria.workspace.* e preserva as de outros dominios", () => {
    const estado = payloadDoUsuario("usuarioA");
    const removidas = limparEstadoWorkspace(estado);

    expect(removidas).toBe(5);
    expect(chavesEstadoWorkspace(estado)).toEqual([]);
    expect(estado["$soutro.dominio.preferencia"]).toBe("manter");
  });

  it("login A -> logout -> login B SEM recarregar a pagina expoe o perfil de B", () => {
    // A entra e o workspace carrega.
    const estado = payloadDoUsuario("usuarioA");
    expect(estado[`$s${PREFIXO_ESTADO_WORKSPACE}carregado`]).toBe(true);

    // A sai: e aqui que o vazamento acontecia — nada era limpo.
    limparEstadoWorkspace(estado);

    // Sem recarregar a pagina, o AppWorkspace remonta e consulta o mesmo payload. Como
    // `carregado` e `sessao` sumiram, ele NAO pode mais pular o carregamento.
    expect(estado[`$s${PREFIXO_ESTADO_WORKSPACE}carregado`]).toBeUndefined();
    expect(estado[`$s${PREFIXO_ESTADO_WORKSPACE}sessao`]).toBeUndefined();

    // B entra e o workspace recarrega do servidor com o perfil DELE.
    Object.assign(estado, payloadDoUsuario("usuarioB"));
    const sessao = estado[`$s${PREFIXO_ESTADO_WORKSPACE}sessao`] as {
      perfil: { usuarioId: string; permissoes: string[] };
    };
    expect(sessao.perfil.usuarioId).toBe("usuarioB");
    expect(sessao.perfil.permissoes).toEqual(["usuarioB_pode_tudo"]);
    expect(estado[`$s${PREFIXO_ESTADO_WORKSPACE}empresaSelecionadaId`]).toBe("empresa-de-usuarioB");
  });

  it("cobre por PREFIXO, entao chave de workspace criada depois ja nasce limpa no logout", () => {
    const estado: Record<string, DadosExternos> = {
      [`$s${PREFIXO_ESTADO_WORKSPACE}chaveQueAindaNaoExiste`]: "valor do usuario anterior"
    };
    expect(limparEstadoWorkspace(estado)).toBe(1);
    expect(chavesEstadoWorkspace(estado)).toEqual([]);
  });
});
