import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { bloqueioCadastroUsuario, cadastroPayload } from "@padaria/shared";
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
function usuarioDaApi(
  over: { empresaIds?: string[]; role?: string; colaboradorId?: string; whatsapp?: string } = {}
): Opcao {
  return {
    usuarioId: "u1",
    empresaId: EMPRESA_A,
    empresaIds: over.empresaIds ?? [EMPRESA_A, EMPRESA_B],
    nome: "Usuario A+B",
    email: "ab@padaria.local",
    whatsapp: over.whatsapp ?? "11988887777",
    colaboradorId: over.colaboradorId ?? "col-1",
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
  // O caso central do achado 1. O `GET /api/usuarios` recorta `empresaIds` ao escopo da TELA
  // (`recortarUsuariosPorEmpresas`), e isso e contrato de isolamento travado por
  // metadados-cross-tenant.test.ts: para um usuario A+B visto na empresa A, a API responde `["A"]`.
  // A tela NUNCA conhece a lista completa.
  //
  // Por isso o contrato e por AUSENCIA: editar so o nome nao envia `empresaIds`, e o servidor preserva
  // os vinculos gravados. A alternativa — reenviar o que a tela enxerga — apagaria a empresa B.
  it("omite empresaIds quando o operador nao mexeu nos chips", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi());
    const { linha, form } = abrirEdicao();

    // A grade nao projeta `empresaIds` de proposito, e o formulario nasce INTOCADO.
    expect(linha.empresaIds).toBeUndefined();
    expect(form.empresaIdsTocado).toBe(false);

    form.nome = "Nome novo";
    expect(cadastroPayload("usuarios", form, EMPRESA_A)).not.toHaveProperty("empresaIds");
  });

  // A outra metade do contrato: opt-in explicito + chips marcados = substituicao.
  it("envia empresaIds quando o operador pede substituicao e marca empresas", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi());
    const { form } = abrirEdicao();

    // E o que a tela faz: primeiro a caixa "Substituir as empresas deste usuario" (que so entao
    // habilita os chips), depois as marcacoes.
    form.empresaIdsTocado = true;
    form.empresaIds = [EMPRESA_A, EMPRESA_B];

    expect(cadastroPayload("usuarios", form, EMPRESA_A)).toMatchObject({ empresaIds: [EMPRESA_A, EMPRESA_B] });
    expect(bloqueioCadastroUsuario("usuarios", form, true)).toBeNull();
  });

  // Marcar e desmarcar volta a tela ao estado inicial, mas nao volta o opt-in. Sem trava, o payload
  // cairia no fallback `[empresaAtiva]` e apagaria os demais vinculos.
  it("bloqueia o salvamento quando pede substituicao e nao marca nenhuma empresa", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi());
    const { form } = abrirEdicao();

    form.empresaIdsTocado = true;
    form.empresaIds = [];

    expect(bloqueioCadastroUsuario("usuarios", form, true)).toContain("Marque ao menos uma empresa");
  });

  // O colaborador tambem some da linha quando vive em outra empresa (`recortarUsuariosPorEmpresas`
  // devolve ""). Mandar string vazia fazia o Zod responder 400 e travava a edicao inteira.
  it("omite colaboradorId quando a linha nao traz o colaborador", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi({ colaboradorId: "" }));
    const { form } = abrirEdicao();

    expect(form.colaboradorId).toBe("");
    expect(cadastroPayload("usuarios", form, EMPRESA_A)).not.toHaveProperty("colaboradorId");
  });

  // Criacao nao tem o que preservar: nasce tocado e sempre envia.
  it("envia empresaIds na criacao de usuario novo", () => {
    const form = formCadastroVazio();
    expect(form.empresaIdsTocado).toBe(true);
    expect(cadastroPayload("usuarios", form, EMPRESA_A)).toMatchObject({ empresaIds: [EMPRESA_A] });
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

  // O WhatsApp do usuario (migration 0060) existe para avisar o responsavel; perde-lo em silencio
  // significa alerta que nunca sai. O payload manda `form.whatsapp || null`, entao form vazio APAGA:
  // a unica protecao e a linha da grade chegar preenchida.
  it("preserva o whatsapp ao editar apenas o nome", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi());
    const { linha, form } = abrirEdicao();

    expect(linha.whatsapp).toBe("11988887777");
    // O formulario mostra mascarado; o servidor normaliza para digitos (`apenasDigitos`).
    expect(form.whatsapp).toBe("(11) 98888-7777");

    form.nome = "Nome novo";
    expect(cadastroPayload("usuarios", form, EMPRESA_A)).toMatchObject({ whatsapp: "(11) 98888-7777" });
  });

  // Usuario sem telefone continua podendo ser salvo sem telefone — o campo e opcional.
  it("mantem whatsapp nulo quando o usuario nao tem telefone", () => {
    const { abrirEdicao } = montarFio(usuarioDaApi({ whatsapp: "" }));
    const { form } = abrirEdicao();

    expect(form.whatsapp).toBe("");
    expect(cadastroPayload("usuarios", form, EMPRESA_A)).toMatchObject({ whatsapp: null });
  });

  // Valor NOVO de proposito: `upsertOpcao` mescla o item sobre a linha anterior, entao reenviar o
  // mesmo numero passaria ainda que o cache nunca gravasse o campo.
  it("leva o whatsapp recem-salvo para a segunda abertura", () => {
    const { abrirEdicao, atualizarCadastroLocal } = montarFio(usuarioDaApi());

    const primeira = abrirEdicao();
    primeira.form.whatsapp = "(11) 97777-6666";
    expect(atualizarCadastroLocal("usuarios", primeira.form, "u1")).toBe(true);

    expect(abrirEdicao().form.whatsapp).toBe("(11) 97777-6666");
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
