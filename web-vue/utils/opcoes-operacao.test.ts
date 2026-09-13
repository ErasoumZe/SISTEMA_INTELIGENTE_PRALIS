// CX-M06 B-1 — as listas que cada modal de operacao pede ao abrir, e a carga tolerante delas.
//
// Importa o mapa E a orquestracao de PRODUCAO. Reimplementar qualquer um dos dois no harness ja
// produziu falso-verde nesta entrega: a primeira versao deste arquivo remontava o `Promise.all` aqui,
// e trocar `carregarOpcaoOpcional` por `tarefas[chave]()` na producao matava a tolerancia a 403
// inteira com a suite verde.
import { describe, expect, it } from "vitest";
import type { Opcao } from "~/types/padaria";
import { avisoOpcoesIndisponiveis } from "~/utils/opcoes-formulario";
import {
  carregarOpcoesDaOperacao,
  opcoesPorEntidade,
  rotuloOpcao,
  type ChaveOpcaoOperacao
} from "~/utils/opcoes-operacao";

// Tarefas completas e inertes; cada caso sobrescreve o que precisa. O `Record` cheio e exigencia do
// tipo de producao — a mesma que impede uma chave nova de entrar no mapa sem tarefa.
function tarefasQue(
  registro: string[],
  falham: readonly ChaveOpcaoOperacao[] = [],
  efeitos: Partial<Record<ChaveOpcaoOperacao, () => void>> = {}
): Record<ChaveOpcaoOperacao, () => Promise<void>> {
  const chaves = Object.keys(rotuloOpcao) as ChaveOpcaoOperacao[];
  return Object.fromEntries(
    chaves.map((chave) => [
      chave,
      async () => {
        if (falham.includes(chave)) throw new Error("403");
        registro.push(chave);
        efeitos[chave]?.();
      }
    ])
  ) as Record<ChaveOpcaoOperacao, () => Promise<void>>;
}

describe("opcoesPorEntidade", () => {
  // ACEITE 8: pelo "+ NOVO -> Despesa" o chip Colaborador abria um select vazio, porque a lista nem
  // era pedida por este caminho (pela tela Despesas funcionava). B-1 fechou os dois lados: o gate da
  // rota e a lista nao solicitada.
  it("Deve_PedirColaboradores_Quando_AOperacaoEDespesa", () => {
    expect(opcoesPorEntidade.despesa).toContain("colaboradores");
  });

  // ACEITE 9. Ressalva honesta: `fornecedores` na retirada ja existia antes desta entrega — este caso
  // e guarda de regressao, nao prova de B-1. O que a B-1 acrescentou de verdade sao os dois abaixo.
  it("Deve_PedirFornecedores_Quando_AOperacaoERetirada", () => {
    expect(opcoesPorEntidade.retirada).toContain("fornecedores");
  });

  // O credor legado da retirada (colaborador) so reabre com NOME se a lista vier junto. Sem este
  // caso, remover `colaboradores` da retirada passaria verde e o historico voltaria a "sumir na cara
  // do usuario" — o defeito que a R-128 pegou.
  it("Deve_PedirColaboradores_Quando_ARetiradaPodeReabrirCredorLegado", () => {
    expect(opcoesPorEntidade.retirada).toContain("colaboradores");
  });

  // A discriminacao da despesa (R-135) tira o ITEM de patrimonio e de colaboradores, e o GRUPO do
  // item vem de `gruposPatrimonio`. Pelo "+ NOVO" nenhum dos tres era carregado: discriminar era
  // impossivel. Faltando so `gruposPatrimonio`, e pior — o item grava `grupoPatrimonioId` e a coluna
  // Grupo renderiza vazia, porque o `<optgroup>` depende da lista de grupos.
  it("Deve_PedirAsTresOrigensDaDiscriminacao_Quando_ADespesaVaiSerDiscriminada", () => {
    expect(opcoesPorEntidade.despesa).toEqual(
      expect.arrayContaining(["patrimonioItens", "gruposPatrimonio", "colaboradores"])
    );
  });

  // `patrimonioItens` sem `gruposPatrimonio` e a combinacao proibida — vale para qualquer entidade.
  it.each(Object.keys(opcoesPorEntidade) as (keyof typeof opcoesPorEntidade)[])(
    "Deve_PedirOsGruposJuntoComOsItensDePatrimonio_Quando_AOperacaoE_%s",
    (entidade) => {
      if (!opcoesPorEntidade[entidade].includes("patrimonioItens")) return;
      expect(opcoesPorEntidade[entidade]).toContain("gruposPatrimonio");
    }
  );

  // Toda operacao que grava numa conta precisa da lista de contas — inclusive a transferencia, que e
  // so contas. Um mapa sem `contas` abre o modal com o campo obrigatorio vazio.
  it.each(Object.keys(opcoesPorEntidade) as (keyof typeof opcoesPorEntidade)[])(
    "Deve_PedirContas_Quando_AOperacaoE_%s",
    (entidade) => {
      expect(opcoesPorEntidade[entidade]).toContain("contas");
    }
  );

  it("Deve_PedirPdvs_Quando_ATransferenciaPodePrepararRetorno", () => {
    expect(opcoesPorEntidade.transferencia).toContain("pdvs");
  });

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

describe("carregarOpcoesDaOperacao", () => {
  // Pede exatamente o que o mapa manda — nem a mais (requisicao inutil ao abrir o modal) nem a menos.
  it("Deve_PedirExatamenteAsListasDoMapa_Quando_ADespesaAbre", async () => {
    const pedidas: string[] = [];
    expect(await carregarOpcoesDaOperacao("despesa", tarefasQue(pedidas))).toEqual([]);
    expect(pedidas.sort()).toEqual([...opcoesPorEntidade.despesa].sort());
  });

  // ACEITE 10: uma falha numa opcao SECUNDARIA nao apaga o que ja carregou nem trava o modal.
  it("Deve_PreservarOQueJaCarregou_Quando_UmaOpcaoSecundariaFalha", async () => {
    // O `alvo` e o `opcoes.value` do AppWorkspace reduzido ao que importa aqui: listas de `Opcao`.
    const alvo: Record<string, Opcao[]> = { colaboradores: [{ id: "ja-carregado", nome: "Ja carregado" }] };
    const pedidas: string[] = [];

    const faltas = await carregarOpcoesDaOperacao(
      "despesa",
      tarefasQue(pedidas, ["colaboradores"], {
        contas: () => {
          alvo["contas"] = [{ id: "conta-1", nome: "Conta 1" }];
        },
        grupos: () => {
          alvo["gruposDespesas"] = [{ id: "grupo-1", nome: "Grupo 1" }];
        }
      })
    );

    // As demais carregaram, apesar do 403 no meio...
    expect(alvo["contas"]).toEqual([{ id: "conta-1", nome: "Conta 1" }]);
    expect(alvo["gruposDespesas"]).toEqual([{ id: "grupo-1", nome: "Grupo 1" }]);
    expect(pedidas).toContain("fornecedores");
    // ...a que falhou NAO apagou o que ja estava la...
    expect(alvo["colaboradores"]).toEqual([{ id: "ja-carregado", nome: "Ja carregado" }]);
    // ...e a falha e DITA, nao engolida (falha silenciosa e proibida).
    expect(faltas).toEqual(["Colaboradores"]);
    expect(avisoOpcoesIndisponiveis(faltas)).toContain("Colaboradores");
  });

  // Duas falhas nao viram uma: o aviso tem de nomear as duas listas.
  it("Deve_NomearTodasAsQueFaltaram_Quando_MaisDeUmaFalha", async () => {
    const faltas = await carregarOpcoesDaOperacao("retirada", tarefasQue([], ["fornecedores", "sociosGestores"]));
    expect(faltas.sort()).toEqual(["Fornecedores", "Sócios e Gestores"]);
  });

  // O outro lado: nada faltou, nenhum aviso. Sem este caso, um aviso disparado sempre passaria verde.
  it("Deve_NaoAvisar_Quando_TodasAsOpcoesCarregam", async () => {
    expect(avisoOpcoesIndisponiveis(await carregarOpcoesDaOperacao("transferencia", tarefasQue([])))).toBe("");
  });

  // Uma falha nao pode REJEITAR a promessa: quem chama abre o modal em seguida, e uma rejeicao aqui
  // deixaria a pessoa sem modal nenhum.
  it("Deve_ResolverSemLancar_Quando_TodasAsOpcoesFalham", async () => {
    const todas = opcoesPorEntidade.despesa;
    await expect(carregarOpcoesDaOperacao("despesa", tarefasQue([], todas))).resolves.toHaveLength(todas.length);
  });
});
