// CX-M06 B-1 — as listas que cada modal de operacao pede ao abrir.
//
// Importa o mapa de PRODUCAO. Reimplementar a estrutura aqui ja produziu tres mutacoes verdes nesta
// entrega, incluindo uma que fazia o campo renderizar vazio.
import { describe, expect, it } from "vitest";
import type { Opcao } from "~/types/padaria";
import { avisoOpcoesIndisponiveis, carregarOpcaoOpcional } from "~/utils/opcoes-formulario";
import { opcoesPorEntidade, rotuloOpcao, type ChaveOpcaoOperacao } from "~/utils/opcoes-operacao";

describe("opcoesPorEntidade", () => {
  // ACEITE 8: pelo "+ NOVO -> Despesa" o chip Colaborador abria um select vazio, porque a lista nem
  // era pedida por este caminho (pela tela Despesas funcionava). B-1 fechou os dois lados: o gate da
  // rota e a lista nao solicitada.
  it("Deve_PedirColaboradores_Quando_AOperacaoEDespesa", () => {
    expect(opcoesPorEntidade.despesa).toContain("colaboradores");
  });

  // ACEITE 9: a R-128 fez do fornecedor o credor PADRAO da retirada — o chip que ja vem ativo.
  it("Deve_PedirFornecedores_Quando_AOperacaoERetirada", () => {
    expect(opcoesPorEntidade.retirada).toContain("fornecedores");
  });

  // O credor legado da retirada (colaborador) so reabre com NOME se a lista vier junto. Sem este
  // caso, remover `colaboradores` da retirada passaria verde e o historico voltaria a "sumir na cara
  // do usuario" — o defeito que a R-128 pegou.
  it("Deve_PedirColaboradores_Quando_ARetiradaPodeReabrirCredorLegado", () => {
    expect(opcoesPorEntidade.retirada).toContain("colaboradores");
  });

  // A discriminacao da despesa (R-135) tira o item de patrimonio e de colaboradores, e a descricao
  // livre saiu. Pelo "+ NOVO" nenhum dos dois era carregado: discriminar era impossivel.
  it("Deve_PedirAsDuasOrigensDoItem_Quando_ADespesaVaiSerDiscriminada", () => {
    expect(opcoesPorEntidade.despesa).toEqual(expect.arrayContaining(["patrimonioItens", "colaboradores"]));
  });

  // Toda operacao que grava numa conta precisa da lista de contas — inclusive a transferencia, que e
  // so contas. Um mapa sem `contas` abre o modal com o campo obrigatorio vazio.
  it.each(Object.keys(opcoesPorEntidade) as (keyof typeof opcoesPorEntidade)[])(
    "Deve_PedirContas_Quando_AOperacaoE_%s",
    (entidade) => {
      expect(opcoesPorEntidade[entidade]).toContain("contas");
    }
  );

  // Nenhuma lista pedida duas vezes: duplicata vira duas requisicoes a mesma rota ao abrir o modal.
  it.each(Object.keys(opcoesPorEntidade) as (keyof typeof opcoesPorEntidade)[])(
    "Deve_NaoRepetirChave_Quando_AOperacaoE_%s",
    (entidade) => {
      const chaves = opcoesPorEntidade[entidade];
      expect(new Set(chaves).size).toBe(chaves.length);
    }
  );

  // Toda chave usada tem rotulo — e o rotulo e o que o usuario le quando a lista falha. Sem isto o
  // aviso sairia com `undefined` no meio.
  it("Deve_TerRotulo_Quando_AChaveEUsadaPorAlgumaOperacao", () => {
    for (const chaves of Object.values(opcoesPorEntidade)) {
      for (const chave of chaves) {
        expect(rotuloOpcao[chave]).toBeTruthy();
      }
    }
  });
});

// ACEITE 10: uma falha numa opcao SECUNDARIA nao apaga o que ja carregou nem abre caminho indevido.
// A carga real e `Promise.all` de `carregarOpcaoOpcional` com `vazio = undefined`, entao a tarefa que
// falha nao chega a atribuir e o alvo continua com o valor anterior. Este teste roda o mesmo arranjo.
describe("carga tolerante das opcoes do modal", () => {
  it("Deve_PreservarOQueJaCarregou_Quando_UmaOpcaoSecundariaFalha", async () => {
    // O `alvo` e o `opcoes.value` do AppWorkspace reduzido ao que importa aqui: listas de `Opcao`.
    const alvo: Record<string, Opcao[]> = { colaboradores: [{ id: "ja-carregado", nome: "Ja carregado" }] };
    const faltas: string[] = [];

    const tarefas: Partial<Record<ChaveOpcaoOperacao, () => Promise<void>>> = {
      contas: async () => {
        alvo["contas"] = [{ id: "conta-1" }];
      },
      colaboradores: async () => {
        throw new Error("403");
      },
      grupos: async () => {
        alvo["gruposDespesas"] = [{ id: "grupo-1" }];
      }
    };

    await Promise.all(
      (["contas", "colaboradores", "grupos"] as const).map((chave) =>
        carregarOpcaoOpcional(faltas, rotuloOpcao[chave], tarefas[chave]!, undefined)
      )
    );

    // As demais carregaram...
    expect(alvo["contas"]).toEqual([{ id: "conta-1" }]);
    expect(alvo["gruposDespesas"]).toEqual([{ id: "grupo-1" }]);
    // ...a que falhou NAO apagou o que ja estava la...
    expect(alvo["colaboradores"]).toEqual([{ id: "ja-carregado", nome: "Ja carregado" }]);
    // ...e a falha e dita, nao engolida (falha silenciosa e proibida).
    expect(avisoOpcoesIndisponiveis(faltas)).toContain("Colaboradores");
  });

  // O outro lado: nada faltou, nenhum aviso. Sem este caso, um aviso disparado sempre passaria verde.
  it("Deve_NaoAvisar_Quando_TodasAsOpcoesCarregam", async () => {
    const faltas: string[] = [];
    await Promise.all(
      (["contas", "fornecedores"] as const).map((chave) =>
        carregarOpcaoOpcional(faltas, rotuloOpcao[chave], async () => undefined, undefined)
      )
    );
    expect(avisoOpcoesIndisponiveis(faltas)).toBe("");
  });
});
