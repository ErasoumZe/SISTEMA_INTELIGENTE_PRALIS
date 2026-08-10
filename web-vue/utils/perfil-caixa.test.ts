// CX-M06 — uma definicao so de operador/retaguarda, compartilhada com o servidor.
//
// Estes casos existem porque a tela e a API discordavam nos DOIS sentidos, e nenhum teste amarrava
// as duas pontas. Os perfis abaixo sao os reais do projeto: Caixa, Financeiro, Tesouraria, Gerencia
// e um cargo customizado.
import { describe, expect, it } from "vitest";
import type { PerfilUsuario } from "@padaria/shared";
import {
  contaTravadaDeCaixa,
  ehOperadorDeCaixa,
  nomeDaContaDoLancamento,
  notaDaContaDoLancamento
} from "~/utils/perfil-caixa";

const CONTA_PDV = "conta-do-pdv";

function perfil(
  cargo: string,
  permissoes: PerfilUsuario["permissoes"],
  role: PerfilUsuario["role"] = "usuario_comum"
): PerfilUsuario {
  return {
    usuarioId: "u",
    colaboradorId: "c",
    cargoIds: ["cargo"],
    cargos: [{ id: "cargo", nome: cargo }],
    role,
    nome: cargo,
    email: `${cargo}@teste.local`,
    permissoes
  };
}

const caixaAberto = { pdvContaId: CONTA_PDV };

describe("ehOperadorDeCaixa", () => {
  it("Deve_Reconhecer_Quando_CargoCaixaOperaOCaixa", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar", "despesas_criar"]))).toBe(true);
  });

  // Financeiro, Tesouraria e Gerencia sao retaguarda no SERVIDOR (`podeLancarSemCaixa`), mesmo
  // tendo `caixa_operar`. Antes a tela travava o campo para eles e a API aceitava qualquer conta.
  it.each(["Financeiro", "Tesouraria", "Gerencia de loja", "Gerente", "Diretor Geral"])(
    "Deve_TratarComoRetaguarda_Quando_CargoE_%s",
    (cargo) => {
      expect(ehOperadorDeCaixa(perfil(cargo, ["caixa_operar"]))).toBe(false);
    }
  );

  it("Deve_TratarComoRetaguarda_Quando_RoleEAdmin", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar"], "usuario_admin"))).toBe(false);
  });

  // Cargo customizado que NAO casa os prefixos de retaguarda e operador — mesmo sem `caixa_operar`.
  // Este caso afirmava o contrario e congelava a divergencia: o servidor nao consulta `caixa_operar`,
  // entao a tela liberava o seletor e a API exigia a conta do PDV.
  it("Deve_SerOperador_Quando_CargoCustomizadoNaoEDeRetaguarda", () => {
    expect(ehOperadorDeCaixa(perfil("Conferente de loja", ["despesas_criar", "retiradas_criar"]))).toBe(true);
  });

  // ...mas sem caixa aberto nao ha conta a travar, entao na pratica ele segue escolhendo livre.
  it("Deve_DevolverVazio_Quando_CargoCustomizadoNaoTemCaixaAberto", () => {
    expect(contaTravadaDeCaixa(perfil("Conferente de loja", ["despesas_criar"]), null)).toBe("");
  });

  // O caso que a regra antiga errava: cargo operacional COM `caixas_gerenciar` continua operador
  // para o servidor, que exige a conta do PDV. A tela liberava a lista inteira e o 400 vinha depois.
  it("Deve_ContinuarSendoOperador_Quando_CargoCaixaTambemGerenciaCaixas", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["caixa_operar", "caixas_gerenciar"]))).toBe(true);
  });

  // `caixa_operar` NAO entra na decisao — o servidor nao a consulta.
  it("Deve_SerOperador_Quando_CargoCaixaNaoTemCaixaOperar", () => {
    expect(ehOperadorDeCaixa(perfil("Caixa", ["despesas_criar"]))).toBe(true);
  });

  it("Deve_NaoSerOperador_Quando_NaoHaPerfil", () => {
    expect(ehOperadorDeCaixa(null)).toBe(false);
    expect(ehOperadorDeCaixa(undefined)).toBe(false);
  });
});

describe("contaTravadaDeCaixa", () => {
  it("Deve_DevolverAContaDoPdv_Quando_EOperador", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), caixaAberto)).toBe(CONTA_PDV);
  });

  it("Deve_DevolverVazio_Quando_ERetaguarda", () => {
    expect(contaTravadaDeCaixa(perfil("Financeiro", ["caixa_operar"]), caixaAberto)).toBe("");
  });

  it("Deve_DevolverVazio_Quando_OperadorNaoTemCaixaAberto", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), null)).toBe("");
  });

  it("Deve_DevolverVazio_Quando_OPdvNaoTemConta", () => {
    expect(contaTravadaDeCaixa(perfil("Caixa", ["caixa_operar"]), { pdvContaId: null })).toBe("");
  });
});

// O campo travado tem de dizer a verdade sobre QUAL conta o lancamento usa. Estes ramos nao tinham
// teste nenhum — inclusive o "Conta original do lancamento", que so aparece no cenario que o
// servidor passou a recusar com 403 (PDV reapontado depois do lancamento).
describe("nomeDaContaDoLancamento", () => {
  const contas = [
    { id: CONTA_PDV, nome: "Caixa PDV 01" },
    { id: "conta-banco", nome: "Banco" }
  ];

  it("Deve_DevolverVazio_Quando_NaoHaContaTravada", () => {
    expect(nomeDaContaDoLancamento({ contaTravada: "", contaDoFormulario: CONTA_PDV, contas, pdvNome: "PDV 01" })).toBe(
      ""
    );
  });

  it("Deve_UsarONomeDaConta_Quando_ElaEstaNaLista", () => {
    expect(
      nomeDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: CONTA_PDV, contas, pdvNome: "PDV 01" })
    ).toBe("Caixa PDV 01");
  });

  // Mesmo caso do aviso: em EDICAO, campo vazio significa "gravado sem conta", nao "ainda vou
  // preencher". Exibir o nome do PDV ali seria afirmar uma conta que o registro nao tem.
  it("Deve_DizerQueNaoHaContaGravada_Quando_ORegistroAbertoNaoTemConta", () => {
    expect(
      nomeDaContaDoLancamento({
        contaTravada: CONTA_PDV,
        contaDoFormulario: "",
        contas,
        pdvNome: "PDV 01",
        editando: true
      })
    ).toBe("Lançamento sem conta gravada");
  });

  // A trava nasce do CAIXA, nao do vinculo: a conta do PDV pode nao estar em `contas_usuarios`.
  it("Deve_CairNoNomeDoPdv_Quando_AContaDoCaixaNaoEstaNaLista", () => {
    expect(
      nomeDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: "", contas: [], pdvNome: "PDV 01" })
    ).toBe("PDV 01");
  });

  // O ramo que nao era alcancado por nenhum teste: registro antigo cuja conta gravada nao e a do PDV
  // atual e nem esta na lista. Chamar isso de "conta do caixa aberto" seria mentir.
  it("Deve_DizerQueEAContaOriginal_Quando_OFormularioTemOutraContaForaDaLista", () => {
    expect(
      nomeDaContaDoLancamento({
        contaTravada: CONTA_PDV,
        contaDoFormulario: "conta-de-outro-pdv",
        contas: [],
        pdvNome: "PDV 01"
      })
    ).toBe("Conta original do lançamento");
  });
});

describe("notaDaContaDoLancamento", () => {
  it("Deve_DizerSaidaDoCaixaAberto_Quando_AContaExibidaEADoCaixa", () => {
    expect(notaDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: CONTA_PDV })).toBe(
      "Saída do caixa aberto"
    );
  });

  it("Deve_DizerSaidaDoCaixaAberto_Quando_OFormularioAindaNaoTemConta", () => {
    expect(notaDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: "" })).toBe("Saída do caixa aberto");
  });

  // Vazio quer dizer coisas OPOSTAS nos dois modos, e o servidor so conhece um deles: ele compara a
  // conta GRAVADA com a do PDV, e nulo nunca casa. Registro antigo salvo sem conta (o PUT nao
  // normalizava a conta antes desta entrega) reabre condenado ao 403 — a tela precisa dizer isso.
  it("Deve_AvisarQueACorrecaoEDaTesouraria_Quando_ORegistroFoiGravadoSemConta", () => {
    expect(notaDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: "", editando: true })).toContain(
      "Tesouraria"
    );
  });

  // A legenda nao pode afirmar "saida do caixa aberto" sobre a conta gravada de outro PDV — e o
  // aviso que antecipa o 403 do servidor, em vez de deixar a pessoa editar tudo e descobrir no fim.
  it("Deve_AvisarQueACorrecaoEDaTesouraria_Quando_AContaGravadaNaoEADoCaixa", () => {
    expect(notaDaContaDoLancamento({ contaTravada: CONTA_PDV, contaDoFormulario: "conta-de-outro-pdv" })).toContain(
      "Tesouraria"
    );
  });

  it("Deve_DevolverVazio_Quando_NaoHaContaTravada", () => {
    expect(notaDaContaDoLancamento({ contaTravada: "", contaDoFormulario: CONTA_PDV })).toBe("");
  });
});
