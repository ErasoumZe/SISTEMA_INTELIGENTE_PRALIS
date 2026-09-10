import { ref } from "vue";
import { describe, expect, it } from "vitest";
import { useCadastroView } from "~/composables/useCadastroView";
import { formCadastroVazio, opcoesVazias } from "~/utils/domain";
import { chaveColuna, valorLinha } from "~/utils/tabela-cadastro";
import type { Opcao, PermissoesPaginadas } from "~/types/padaria";

// #172 · A tela de Contas recebia `saldoAtual` da API (D8/R-004), montava a linha com a chave
// `saldoAtual` e a tabela procurava `saldo_atual` — a chave que ela DERIVA do rotulo "Saldo atual".
// Nenhum dos dois lados errava sozinho: a divergencia so aparece com os dois no mesmo teste, que e
// por isso que a derivacao virou `utils/tabela-cadastro`.
function vista(contas: Opcao[]) {
  const opcoes = { ...opcoesVazias(), contas };
  return useCadastroView({
    opcoes,
    opcoesEmpresa: opcoes,
    empresas: [],
    permissoesPagina: { itens: [], total: 0, page: 1, pageSize: 10 } satisfies PermissoesPaginadas,
    formCadastro: ref(formCadastroVazio())
  });
}

// `toLocaleString("pt-BR")` separa "R$" do numero com ESPACO NAO SEPARAVEL. Comparar com o espaco
// comum do teclado faz o teste falhar mostrando duas strings identicas na tela — normalizar aqui
// mantem a assercao legivel sem afrouxar nada.
const ESPACO_MOEDA = String.fromCharCode(160);

function celula(linha: Record<string, string | undefined>, coluna: string) {
  return valorLinha(linha, coluna).replaceAll(ESPACO_MOEDA, " ");
}

const CONTA_COFRE: Opcao = {
  id: "c-1",
  nome: "COFRE PRINCIPAL",
  saldoInicial: 10000,
  saldoAtual: 9500,
  usuariosIds: ["u-1"]
};

describe("useCadastroView · tela de Contas (#172)", () => {
  it("cada coluna declarada tem valor na linha — nenhuma cai no travessao", () => {
    const { colunasCadastro, dadosCadastro } = vista([CONTA_COFRE]);
    const linha = dadosCadastro("contas")[0];
    expect(linha).toBeDefined();

    const semValor = colunasCadastro("contas").filter((coluna) => celula(linha!, coluna) === "-");
    expect(semValor).toEqual([]);
  });

  it("Saldo atual mostra o saldo derivado que a API entregou, e nao o fundo", () => {
    const { dadosCadastro } = vista([CONTA_COFRE]);
    const linha = dadosCadastro("contas")[0]!;

    expect(celula(linha, "Saldo atual")).toBe("R$ 9.500,00");
    expect(celula(linha, "Fundo")).toBe("R$ 10.000,00");
  });

  // R-004: o saldo e derivado dos movimentos. Saida maior que o fundo entrega NEGATIVO, e o
  // negativo precisa aparecer — `|| "-"` engoliria um zero, nunca um "-R$ 120,00".
  it("saldo negativo e zerado continuam sendo numero na tela", () => {
    const { dadosCadastro } = vista([
      { ...CONTA_COFRE, saldoAtual: -120 },
      { ...CONTA_COFRE, id: "c-2", nome: "CAIXA 01", saldoInicial: 0, saldoAtual: 0 }
    ]);
    const [negativa, zerada] = dadosCadastro("contas");

    expect(celula(negativa!, "Saldo atual")).toContain("120,00");
    expect(celula(zerada!, "Saldo atual")).toBe("R$ 0,00");
    expect(celula(zerada!, "Fundo")).toBe("R$ 0,00");
  });

  // Conta vinda do GET /api/contas comum (lista de opcao de formulario) nao traz saldo nenhum.
  it("conta sem saldo na resposta cai em zero, nao em campo vazio", () => {
    const { dadosCadastro } = vista([{ id: "c-3", nome: "CONTA NOVA" }]);
    expect(celula(dadosCadastro("contas")[0]!, "Saldo atual")).toBe("R$ 0,00");
  });

  it("a chave gravada na linha e exatamente a que a tabela deriva do rotulo", () => {
    const { dadosCadastro } = vista([CONTA_COFRE]);
    expect(Object.keys(dadosCadastro("contas")[0]!)).toContain(chaveColuna("Saldo atual"));
  });
});
