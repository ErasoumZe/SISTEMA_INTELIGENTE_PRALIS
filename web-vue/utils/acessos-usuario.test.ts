import { describe, expect, it, vi } from "vitest";
import { criarAcoesAcessosUsuario, deveIniciarConfiguracaoUsuario } from "~/utils/acessos-usuario";

describe("acessos individuais", () => {
  it("inicia a configuração guiada somente para usuário novo", () => {
    expect(deveIniciarConfiguracaoUsuario("usuarios", "")).toBe(true);
    expect(deveIniciarConfiguracaoUsuario("usuarios", "usuario-existente")).toBe(false);
    expect(deveIniciarConfiguracaoUsuario("contas", "")).toBe(false);
  });

  it("abre a única tela de permissões para a pessoa escolhida", async () => {
    const navegar = vi.fn(async () => undefined);
    const { abrirAcessosUsuario } = criarAcoesAcessosUsuario({ notificar: vi.fn(), navegar });

    await expect(abrirAcessosUsuario({ id: "user/textual" })).resolves.toBe(true);
    expect(navegar).toHaveBeenCalledWith({ path: "/permissoes", query: { usuario: "user/textual" } });
  });

  it("encadeia usuário comum recém-criado na mesma tela", async () => {
    const navegar = vi.fn(async () => undefined);
    const notificar = vi.fn();
    const { iniciarConfiguracaoDoUsuarioCriado } = criarAcoesAcessosUsuario({ notificar, navegar });

    await expect(iniciarConfiguracaoDoUsuarioCriado("usuario-novo", "usuario_comum")).resolves.toBe(true);
    expect(notificar).toHaveBeenCalledWith("Usuário criado. Agora configure os acessos.");
    expect(navegar).toHaveBeenCalledWith({ path: "/permissoes", query: { usuario: "usuario-novo" } });
  });

  it("não abre configuração automática para administrador total", async () => {
    const navegar = vi.fn(async () => undefined);
    const notificar = vi.fn();
    const { iniciarConfiguracaoDoUsuarioCriado } = criarAcoesAcessosUsuario({ notificar, navegar });

    await expect(iniciarConfiguracaoDoUsuarioCriado("admin-novo", "usuario_admin")).resolves.toBeNull();
    expect(navegar).not.toHaveBeenCalled();
    expect(notificar).not.toHaveBeenCalled();
  });
});
