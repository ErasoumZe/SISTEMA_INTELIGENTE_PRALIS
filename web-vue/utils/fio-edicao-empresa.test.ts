import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { cadastroPayload } from "@padaria/shared";
import type { CadastroForm, Opcao, Opcoes } from "~/types/padaria";
import { useCadastroView } from "~/composables/useCadastroView";
import { formCadastroDeLinha, formCadastroVazio, opcoesVazias } from "./domain";
import { criarAtualizadorCadastroLocal, type DepsCadastroLocal } from "./cadastro-local";

// O FIO REAL da edicao de empresa, ponta a ponta, sem montar Vue — mesmo desenho de
// `fio-edicao-usuario.test.ts`:
//
//   GET /api/empresas -> dadosCadastro("empresas") -> linha -> formCadastroDeLinha
//     -> cadastroPayload -> corpo do PUT -> atualizarCadastroLocal -> proxima abertura
//
// Existe porque a migration 0060 acrescentou `fuso_horario` e `compras_prazo_resposta_horas` a
// empresa e a tela passou a expor os dois, mas a grade projetava apenas id/nome/cnpj. O formulario
// reabria vazio, `cadastroPayload` mandava `fusoHorario: ""` / `comprasPrazoRespostaHoras: null` e a
// edicao seguinte — ainda que fosse so corrigir o nome — apagava a configuracao recem-gravada. E a
// forma exata do "campo que aparece e nao salva" que o AGENTS.md proibe.
//
// Todas as funcoes abaixo sao as de producao. Nenhuma linha da grade e escrita a mao.

const EMPRESA_A = "empresa-a";

// A forma que o servidor devolve de verdade (`listarEmpresasRepository`,
// api/src/empresas/empresas.repository.ts): prazo chega como numero, nao como texto de formulario.
function empresaDaApi(over: { fusoHorario?: string; comprasPrazoRespostaHoras?: number | null } = {}): Opcao {
  return {
    id: EMPRESA_A,
    nome: "Padaria TNP",
    cnpj: "12345678000190",
    matriculaPrefixo: "TNP",
    fusoHorario: over.fusoHorario ?? "America/Belem",
    // `?? 48` nao serve: prazo nulo e um estado legitimo e seria convertido no default silenciosamente.
    comprasPrazoRespostaHoras: "comprasPrazoRespostaHoras" in over ? over.comprasPrazoRespostaHoras : 48
  };
}

function montarFio(empresa: Opcao) {
  const opcoes: Opcoes = opcoesVazias();
  const empresas: Opcao[] = [empresa];
  opcoes.empresas.push(empresa);

  const formCadastro = ref<CadastroForm>(formCadastroVazio());
  const vista = useCadastroView({
    opcoes: () => opcoes,
    opcoesEmpresa: () => opcoes,
    empresas: () => empresas,
    permissoesPagina: () => ({ itens: [], page: 1, pageSize: 10, total: 0 }),
    formCadastro
  });

  const deps: DepsCadastroLocal = {
    empresaId: () => EMPRESA_A,
    opcoes: () => opcoes,
    empresas: () => empresas,
    onPermissoesSalvas: vi.fn()
  };
  const { atualizarCadastroLocal } = criarAtualizadorCadastroLocal(deps);

  // Abre a edicao como o AppWorkspace abre: pega a linha que a grade mostra e monta o form.
  function abrirEdicao() {
    const linha = vista.dadosCadastro("empresas")[0];
    if (!linha) throw new Error("a grade nao devolveu a linha da empresa");
    return { linha, form: formCadastroDeLinha(linha, vista.regrasDaLinha(linha)) };
  }

  return { opcoes, empresas, vista, abrirEdicao, atualizarCadastroLocal };
}

describe("fio real da edicao de empresa", () => {
  // O caso central: abrir a edicao para mexer SO no nome nao pode derrubar a configuracao de
  // Compras. O prazo alimenta o vencimento da rodada de cotacao e o fuso e o relogio do negocio.
  it("preserva fuso e prazo de cotacao ao editar apenas o nome", () => {
    const { abrirEdicao } = montarFio(empresaDaApi());
    const { linha, form } = abrirEdicao();

    expect(linha.fusoHorario).toBe("America/Belem");
    expect(linha.comprasPrazoRespostaHoras).toBe("48");
    expect(form.fusoHorario).toBe("America/Belem");
    expect(form.comprasPrazoRespostaHoras).toBe("48");

    form.nome = "Padaria TNP Centro";
    expect(cadastroPayload("empresas", form, EMPRESA_A)).toMatchObject({
      nome: "Padaria TNP Centro",
      matriculaPrefixo: "TNP",
      fusoHorario: "America/Belem",
      comprasPrazoRespostaHoras: 48
    });
  });

  // Prazo em branco e um estado legitimo: significa "usa o padrao do sistema". Ele precisa
  // continuar virando null, e nao 0, para nao inventar um vencimento imediato.
  it("mantem prazo nulo quando a empresa nao configurou", () => {
    const { abrirEdicao } = montarFio(empresaDaApi({ comprasPrazoRespostaHoras: null }));
    const { form } = abrirEdicao();

    expect(form.comprasPrazoRespostaHoras).toBe("");
    expect(cadastroPayload("empresas", form, EMPRESA_A)).toMatchObject({ comprasPrazoRespostaHoras: null });
  });

  // Segunda abertura SEM reload: a grade e alimentada pelo cache local depois de salvar. Se o cache
  // perder os campos, o terceiro salvar apaga o que o segundo gravou.
  // Os DOIS campos mudam de valor de proposito. `upsertOpcao` MESCLA o item sobre a linha anterior
  // (`cadastro-local.ts`), entao um teste que reenviasse o mesmo valor passaria mesmo se o cache
  // nunca gravasse o campo — o valor antigo sobreviveria ao merge e ninguem notaria.
  it("leva o valor RECEM-SALVO para a segunda abertura, sem recarregar a pagina", () => {
    const { abrirEdicao, atualizarCadastroLocal } = montarFio(empresaDaApi());

    const primeira = abrirEdicao();
    primeira.form.fusoHorario = "America/Manaus";
    primeira.form.comprasPrazoRespostaHoras = "24";
    // O AppWorkspace so recarrega da API quando isto devolve false.
    expect(atualizarCadastroLocal("empresas", primeira.form, EMPRESA_A)).toBe(true);

    const segunda = abrirEdicao();
    expect(segunda.form.fusoHorario).toBe("America/Manaus");
    expect(segunda.form.comprasPrazoRespostaHoras).toBe("24");
    expect(cadastroPayload("empresas", segunda.form, EMPRESA_A)).toMatchObject({
      fusoHorario: "America/Manaus",
      comprasPrazoRespostaHoras: 24
    });
  });
});
