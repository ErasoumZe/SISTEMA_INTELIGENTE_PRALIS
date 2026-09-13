import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { criarAcoesAcessosUsuario } from "~/utils/acessos-usuario";
import { formCadastroVazio, opcoesVazias } from "~/utils/domain";

describe("acoes de acesso individual", () => {
  it("carrega regras e resumo efetivo antes de abrir o editor", async () => {
    const opcoes = ref(opcoesVazias());
    const cadastroTela = ref("");
    const cadastroEditandoId = ref("");
    const formCadastro = ref(formCadastroVazio());
    const modalCadastroAberto = ref(false);
    const apiGetMock = vi.fn(async (rota: string) => {
      if (rota.includes("/efetivas")) {
        return {
          usuarioId: "user/textual",
          nome: "Tesouraria",
          email: "tesouraria@teste.local",
          role: "usuario_comum",
          permissoesHerdadas: ["transferencias_visualizar"],
          permissoesEfetivas: ["transferencias_visualizar", "transferencias_conferir"]
        };
      }
      return {
        permissoes: [],
        cargos: [],
        cargosPermissoes: [],
        setores: [],
        setoresPermissoes: [],
        usuarios: [{ id: "user/textual", nome: "Tesouraria" }],
        usuariosPermissoes: [{ usuarioId: "user/textual", regras: { transferencias_conferir: true } }]
      };
    });
    const apiGet = async <T>(rota: string): Promise<T> => (await apiGetMock(rota)) as T;

    const { abrirAcessosUsuario } = criarAcoesAcessosUsuario({
      empresaId: ref("empresa-1"),
      opcoes,
      cadastroTela,
      cadastroEditandoId,
      formCadastro,
      modalCadastroAberto,
      apiGet,
      notificar: vi.fn()
    });

    await abrirAcessosUsuario({ id: "user/textual" });

    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(cadastroTela.value).toBe("permissoes");
    expect(cadastroEditandoId.value).toBe("usuario:user/textual");
    expect(formCadastro.value.regras).toEqual({ transferencias_conferir: true });
    expect(opcoes.value.usuarios[0]?.permissoesHerdadas).toEqual(["transferencias_visualizar"]);
    expect(modalCadastroAberto.value).toBe(true);
  });
});
