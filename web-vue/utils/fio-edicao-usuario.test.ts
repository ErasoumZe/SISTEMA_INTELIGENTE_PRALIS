import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { cadastroPayload } from "@padaria/shared";
import type { CadastroForm, Opcao, Opcoes } from "~/types/padaria";
import { useCadastroView } from "~/composables/useCadastroView";
import { formCadastroDeLinha, formCadastroVazio, opcoesVazias } from "./domain";
import { criarAtualizadorCadastroLocal, type DepsCadastroLocal } from "./cadastro-local";

// O FIO REAL da edicao de usuario, ponta a ponta, sem montar Vue:
//
//   opcoes (resposta da API) -> dadosCadastro("usuarios") -> linha -> formCadastroDeLinha
//     -> cadastroPayload -> corpo do PUT -> atualizarCadastroLocal -> proxima abertura
//
// Existe porque os testes anteriores montavam a `linha` na mao — provavam que o SPLIT de
// `empresaIds` funciona, nunca que alguem PRODUZ a string que ele divide. Era exatamente ai que a
// empresa sumia: `dadosCadastro` nao projetava `empresaIds`, e o payload trocava tudo pela empresa
// ativa (`shared/src/cadastros/index.ts`: `form.empresaIds.length ? ... : [empresaId]`).
//
// Todas as funcoes abaixo sao as de producao. Nenhuma linha e escrita a mao.

const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";

// A forma que o servidor devolve de verdade (UsuarioLinha, api/src/usuarios/usuarios.repository.ts):
// `usuarioId` e nao `id`, e `empresaIds` com as DUAS empresas.
// Sem spread de `Partial<Opcao>`: com `exactOptionalPropertyTypes` o spread reintroduz `undefined`
// em cada campo opcional e o objeto deixa de ser um `Opcao`.
//
// A conversao no fim e deliberada e faz parte do que este teste reproduz: `Opcao` declara `id`
// OBRIGATORIO, mas o contrato de fio de usuarios (`UsuarioLinha`, api/src/usuarios/usuarios.repository.ts)
// nao tem `id` — so `usuarioId`. O tipo mente, e e essa mentira que fazia `upsertOpcao` (que casa por
// `id`) nunca encontrar a linha do usuario e inserir uma duplicata sem papel. Montar o objeto "certo
// pelo tipo" esconderia justamente o defeito.
function usuarioDaApi(over: { empresaIds?: string[]; role?: string } = {}): Opcao {
  return {
    usuarioId: "u1",
    empresaId: EMPRESA_A,
    empresaIds: over.empresaIds ?? [EMPRESA_A, EMPRESA_B],
    nome: "Usuario A+B",
    email: "ab@padaria.local",
    colaboradorId: "col-1",
    setorId: "setor-1",
    cargos: ["Gerente"],
    role: over.role ?? "usuario_admin"
  } as Opcao;
}

function montarFio(usuario: Opcao) {
  const opcoes: Opcoes = opcoesVazias();
  opcoes.usuarios.push(usuario);
  opcoes.colaboradores.push({ id: "col-1", nome: "Colaborador 1", setorId: "setor-1", cargos: ["Gerente"] });

  const formCadastro = ref<CadastroForm>(formCadastroVazio());
  const vista = useCadastroView({
    opcoes: () => opcoes,
    opcoesEmpresa: () => opcoes,
    empresas: () => [],
    permissoesPagina: () => ({ itens: [], page: 1, pageSize: 10, total: 0 }),
    formCadastro
  });

  const deps: DepsCadastroLocal = {
    empresaId: () => EMPRESA_A,
    opcoes: () => opcoes,
    empresas: () => [],
    onPermissoesSalvas: vi.fn()
  };
  const { atualizarCadastroLocal } = criarAtualizadorCadastroLocal(deps);

  // Abre a tela de edicao como o AppWorkspace abre: pega a linha que a grade mostra e monta o form.
  function abrirEdicao() {
    const linha = vista.dadosCadastro("usuarios")[0];
    if (!linha) throw new Error("a grade nao devolveu a linha do usuario");
    return { linha, form: formCadastroDeLinha(linha, vista.regrasDaLinha(linha)) };
  }

  return { opcoes, vista, abrirEdicao, atualizarCadastroLocal };
}

describe("fio real da edicao de usuario", () => {
  // ATENCAO — a perda de empresa (achado 1) NAO esta corrigida, e este arquivo nao finge que esta.
  //
  // O `GET /api/usuarios` recorta `empresaIds` ao escopo da TELA (`recortarUsuariosPorEmpresas`, em
  // api/src/usuarios/usuarios.service.ts), e isso e contrato de isolamento travado por
  // tests/integration/usuarios/metadados-cross-tenant.test.ts. Para um usuario A+B visto na empresa A,
  // a API responde `empresaIds: ["A"]` — a lista completa nunca chega a esta tela.
  //
  // Portanto o formulario nao tem como "continuar enviando A+B" sem uma decisao de contrato que nao e
  // minha (ver o relatorio). O teste abaixo documenta o estado REAL, para ninguem confundir a
  // ausencia de correcao com correcao.
  it("documenta que a linha da grade nao traz as empresas do usuario", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi());
    const { linha, form } = abrirEdicao();

    // A grade nao projeta `empresaIds` de proposito: projetar o valor RECORTADO faria o salvar
    // reenviar so a empresa ativa, com a tela mostrando "empresa A marcada" e nenhum sinal da perda.
    expect(linha.empresaIds).toBeUndefined();
    expect(form.empresaIds).toEqual([]);
  });

  // Segunda abertura SEM reload: e o cache local que alimenta a grade. Se ele perder o papel, a tela
  // bloqueia a edicao seguinte — que era o achado 2.
  it("mantem o papel na segunda abertura, sem recarregar a pagina", () => {
    const { abrirEdicao, atualizarCadastroLocal, opcoes } = montarFio(usuarioDaApi());

    const primeira = abrirEdicao();
    primeira.form.nome = "Nome novo";
    // O AppWorkspace so recarrega da API quando isto devolve false.
    expect(atualizarCadastroLocal("usuarios", primeira.form, "u1")).toBe(true);
    // E nao pode duplicar a linha: o upsert casa por `usuarioId`, nao por `id`.
    expect(opcoes.usuarios).toHaveLength(1);

    const segunda = abrirEdicao();
    expect(segunda.form.role).toBe("usuario_admin");
    expect(cadastroPayload("usuarios", segunda.form, EMPRESA_A)).toMatchObject({ role: "usuario_admin" });
  });

  // O papel legado tambem tem de sobreviver ao fio: ele concede retaguarda (podeLancarSemCaixa) e
  // liberar trava de transferencia, entao perde-lo em silencio muda o acesso da pessoa.
  it("preserva o papel legado admin na ida e na volta", () => {
    const { abrirEdicao, atualizarCadastroLocal } = montarFio(usuarioDaApi({ role: "admin" }));

    const primeira = abrirEdicao();
    expect(primeira.form.role).toBe("admin");
    atualizarCadastroLocal("usuarios", primeira.form, "u1");

    expect(abrirEdicao().form.role).toBe("admin");
  });
});
