import type { Ref } from "vue";
import type { Permissao } from "@padaria/shared";
import type { CadastroForm, Opcoes } from "~/types/padaria";
import { formCadastroVazio, mensagemErro } from "~/utils/domain";

type ApiGet = <T>(rota: string) => Promise<T>;

type DependenciasAcessosUsuario = {
  empresaId: Readonly<Ref<string>>;
  opcoes: Ref<Opcoes>;
  cadastroTela: Ref<string>;
  cadastroEditandoId: Ref<string>;
  formCadastro: Ref<CadastroForm>;
  modalCadastroAberto: Ref<boolean>;
  apiGet: ApiGet;
  notificar: (texto: string, cor?: string) => void;
};

type ResumoEfetivo = {
  usuarioId: string;
  nome: string;
  email: string;
  role: string;
  permissoesHerdadas: Permissao[];
  permissoesEfetivas: Permissao[];
};

type DadosEditor = Pick<
  Opcoes,
  "permissoes" | "cargos" | "cargosPermissoes" | "setores" | "setoresPermissoes" | "usuarios" | "usuariosPermissoes"
>;

// Porta unica do acesso individual: a linha de Usuarios abre o editor com as regras gravadas e o
// retrato efetivo calculado pelo servidor. AppWorkspace so orquestra; detalhes de rede e montagem
// do formulario ficam isolados e testaveis aqui.
export function criarAcoesAcessosUsuario(deps: DependenciasAcessosUsuario) {
  async function abrirAcessosUsuario(linha: Record<string, string | undefined>) {
    const usuarioId = linha.usuarioId ?? linha.id;
    if (!usuarioId) return false;
    try {
      const query = deps.empresaId.value ? `?empresaId=${encodeURIComponent(deps.empresaId.value)}` : "";
      const [dados, resumoEfetivo] = await Promise.all([
        deps.apiGet<DadosEditor>(`/api/permissoes${query}`),
        deps.apiGet<ResumoEfetivo>(`/api/permissoes/usuarios/${encodeURIComponent(usuarioId)}/efetivas`)
      ]);
      dados.usuarios = dados.usuarios.map((usuario) =>
        (usuario.usuarioId ?? usuario.id) === usuarioId ? { ...usuario, ...resumoEfetivo } : usuario
      );
      deps.opcoes.value = { ...deps.opcoes.value, ...dados };
      const regras = dados.usuariosPermissoes.find((item) => item.usuarioId === usuarioId)?.regras ?? {};
      deps.cadastroTela.value = "permissoes";
      deps.cadastroEditandoId.value = `usuario:${usuarioId}`;
      deps.formCadastro.value = {
        ...formCadastroVazio(),
        tipoPermissao: "usuario",
        usuarioId,
        regras: { ...regras }
      };
      deps.modalCadastroAberto.value = true;
      return true;
    } catch (error) {
      deps.notificar(mensagemErro(error), "error");
      return false;
    }
  }

  async function iniciarConfiguracaoDoUsuarioCriado(usuarioId: string | undefined, role: string) {
    // O administrador total nao precisa de excecoes: ele ja recebe o catalogo completo pelo role.
    // O passo guiado existe somente no cadastro de usuario comum e reutiliza o MESMO editor da
    // manutencao futura, sem criar outra rota, payload ou forma de conceder acesso.
    if (!usuarioId || role !== "usuario_comum") return null;
    deps.notificar("Usuário criado. Agora configure os acessos.");
    return abrirAcessosUsuario({ id: usuarioId });
  }

  return { abrirAcessosUsuario, iniciarConfiguracaoDoUsuarioCriado };
}
