import { describe, expect, it } from "vitest";
import { formOperacaoVazio } from "./domain";
import {
  DIAS_RECORRENCIA,
  estadoRecorrenciaVazio,
  formOperacaoDeDetalhe,
  grupoItemEscolhido,
  itemDespesaVazio,
  itemMercadoriaVazio,
  montarPayloadOperacao,
  montarRecorrencia,
  opcaoGrupoItem,
  validarOperacaoParaEnvio,
  type OperacaoDetalhe
} from "./operacoes";

const detalheBase: OperacaoDetalhe = {
  id: "op-1",
  dataReferencia: "2026-07-03",
  descricao: "Lancamento",
  valorOriginal: 20,
  valorAcrescimo: 0,
  valorDesconto: 0,
  computar: true
};

describe("formOperacaoDeDetalhe", () => {
  // R-127: o campo da tela e a Observacao. Registro gravado antes da regra so tem `descricao` — sem
  // o fallback ele reabriria com o campo VAZIO e salvar apagaria o texto do movimento.
  it("reabre o texto do movimento pela observacao, com fallback na descricao", () => {
    const comObservacao = formOperacaoDeDetalhe("despesa", {
      ...detalheBase,
      descricao: "texto velho",
      observacao: "Farinha e fermento"
    });
    expect(comObservacao.form.observacao).toBe("Farinha e fermento");

    const soDescricao = formOperacaoDeDetalhe("despesa", {
      ...detalheBase,
      descricao: "Compra de farinha",
      observacao: null
    });
    expect(soDescricao.form.observacao).toBe("Compra de farinha");
  });

  it("reabre credor tipado, documento fiscal e as duas fotos do S2", () => {
    const preenchido = formOperacaoDeDetalhe("retirada", {
      ...detalheBase,
      socioGestorId: "11111111-1111-4111-8111-111111111111",
      credorTipo: "socio_gestor",
      dataDocumentoFiscal: "2026-07-30",
      numeroDocumentoFiscal: "NF-123",
      fotoDocumentoUrl: "retiradas/1/documento.png",
      fotoNotaUrl: "retiradas/1/nota.png",
      jurosTipo: "percentual",
      jurosValorInformado: 5
    });
    expect(preenchido.form).toMatchObject({
      socioGestorId: "11111111-1111-4111-8111-111111111111",
      credorTipo: "socio_gestor",
      dataDocumentoFiscal: "2026-07-30",
      numeroDocumentoFiscal: "NF-123",
      fotoDocumentoUrl: "retiradas/1/documento.png",
      fotoNotaUrl: "retiradas/1/nota.png",
      jurosTipo: "percentual",
      jurosValorInformado: "5"
    });
  });
  it("mapeia venda com itens e pagamentos para strings do formulario", () => {
    const preenchido = formOperacaoDeDetalhe("venda", {
      ...detalheBase,
      valorOriginal: 12.5,
      itensVenda: [{ produtoId: "p1", descricaoProduto: "Pao", quantidade: 2, valorUnitario: 6.25, valorTotal: 12.5 }],
      tiposPagamento: [{ formaPagamentoId: "f1", numeroVendas: 1, totalPago: 12.5 }]
    });
    expect(preenchido.form.valorOriginal).toBe("12.5");
    expect(preenchido.itensVenda).toEqual([
      { descricaoProduto: "Pao", quantidade: "2", valorUnitario: "6.25", valorTotal: "12.5", produtoId: "p1" }
    ]);
    expect(preenchido.tiposPagamento).toEqual([{ formaPagamentoId: "f1", totalPago: "12.5", numeroVendas: "1" }]);
    expect(preenchido.discriminandoDespesa).toBe(false);
  });

  it("liga discriminandoDespesa quando a despesa tem itens", () => {
    const preenchido = formOperacaoDeDetalhe("despesa", {
      ...detalheBase,
      itensDespesa: [{ grupoDespesaId: "g1", descricao: "Item", valor: 5 }]
    });
    expect(preenchido.discriminandoDespesa).toBe(true);
    // grupoPatrimonioId entra vazio: o detalhe nao trouxe, e o form usa "" para "nenhum".
    expect(preenchido.itensDespesa?.[0]).toMatchObject({
      descricao: "Item",
      valor: "5",
      grupoDespesaId: "g1",
      grupoPatrimonioId: ""
    });
    expect(preenchido.itensVenda).toBeUndefined();
  });

  it("traz de volta o grupo de patrimonio do item (§5 item 6)", () => {
    const preenchido = formOperacaoDeDetalhe("despesa", {
      ...detalheBase,
      itensDespesa: [{ grupoDespesaId: null, grupoPatrimonioId: "pat-1", descricao: "Correia", valor: 5 }]
    });
    expect(preenchido.itensDespesa?.[0]).toMatchObject({
      descricao: "Correia",
      valor: "5",
      grupoDespesaId: "",
      grupoPatrimonioId: "pat-1"
    });
  });

  it("so inclui dataVencimento quando o detalhe traz", () => {
    expect(formOperacaoDeDetalhe("retirada", detalheBase).form).not.toHaveProperty("dataVencimento");
    expect(
      formOperacaoDeDetalhe("retirada", { ...detalheBase, dataVencimento: "2026-07-10" }).form.dataVencimento
    ).toBe("2026-07-10");
  });

  it("normaliza nulos do detalhe para strings vazias", () => {
    const preenchido = formOperacaoDeDetalhe("despesa", { ...detalheBase, contaOrigemId: null, fornecedorId: null });
    expect(preenchido.form.contaOrigemId).toBe("");
    expect(preenchido.form.fornecedorId).toBe("");
  });
});

describe("montarPayloadOperacao", () => {
  const base = {
    empresaId: "e1",
    itensVenda: [],
    tiposPagamento: [],
    itensDespesa: [],
    itensMercadoria: [],
    discriminandoDespesa: false,
    discriminandoMercadoria: false,
    produtos: [] as Array<{ id: string; descricao?: string | null; nome?: string | null }>
  };

  it("converte valores monetarios em centavos e normaliza vazios para null", () => {
    const form = {
      ...formOperacaoVazio(),
      valorOriginal: "10,50",
      valorAcrescimo: "",
      valorDesconto: ""
    };
    const payload = montarPayloadOperacao("retirada", { ...base, form });
    expect(payload.empresaId).toBe("e1");
    expect(payload.valorOriginal).toBe(10.5);
    expect(payload.valorAcrescimo).toBe(0);
    expect(payload.dataPagamento).toBeNull();
  });

  it("envia a composicao fisica ao preparar o malote para o caixa", () => {
    const payload = montarPayloadOperacao("transferencia", {
      ...base,
      form: {
        ...formOperacaoVazio(),
        valorOriginal: "200",
        valorEspecieDeclarado: "150",
        valorMoedasDeclarado: "50"
      }
    });
    expect(payload).toMatchObject({
      valorOriginal: 200,
      valorEspecieDeclarado: 150,
      valorMoedasDeclarado: 50,
      lacresRetorno: []
    });
  });

  it("envia os lacres menores junto do malote", () => {
    const payload = montarPayloadOperacao("transferencia", {
      ...base,
      form: { ...formOperacaoVazio(), lacresRetorno: [" SANG-01 ", "SANG-02"] }
    });
    expect(payload).toMatchObject({ lacresRetorno: ["SANG-01", "SANG-02"] });
  });

  it("nao envia composicao vazia para transferencias que nao sao malote", () => {
    const payload = montarPayloadOperacao("transferencia", { ...base, form: formOperacaoVazio() });
    expect(payload).not.toHaveProperty("valorEspecieDeclarado");
    expect(payload).not.toHaveProperty("valorMoedasDeclarado");
  });

  it("todo ID opcional em branco vira null, nao '' (o bug 'colaboradorId: Invalid UUID')", () => {
    // Form vazio: todos os IDs sao "" por padrao. O schema zod rejeita "" em campos uuid.
    const payload = montarPayloadOperacao("despesa", { ...base, form: { ...formOperacaoVazio() } });
    expect(payload.colaboradorId).toBeNull();
    expect(payload.contaOrigemId).toBeNull();
    expect(payload.contaDestinoId).toBeNull();
    expect(payload.fornecedorId).toBeNull();
    expect(payload.grupoDespesaId).toBeNull();
    expect(payload.grupoMercadoriaId).toBeNull();
    expect(payload.grupoRetiradaId).toBeNull();
    // IDs preenchidos passam intactos.
    const preenchido = montarPayloadOperacao("despesa", {
      ...base,
      form: { ...formOperacaoVazio(), contaOrigemId: "c1", grupoDespesaId: "g1" }
    });
    expect(preenchido.contaOrigemId).toBe("c1");
    expect(preenchido.grupoDespesaId).toBe("g1");
  });

  it("monta itens de venda com fallback de descricao pelo produto e centavos", () => {
    const form = { ...formOperacaoVazio(), valorOriginal: "12" };
    const payload = montarPayloadOperacao("venda", {
      ...base,
      form,
      itensVenda: [{ descricaoProduto: "", quantidade: "1", valorUnitario: "12", valorTotal: "12", produtoId: "p1" }],
      tiposPagamento: [{ formaPagamentoId: "f1", totalPago: "12", numeroVendas: "1" }],
      produtos: [{ id: "p1", descricao: "Pao Frances", nome: null }]
    });
    expect(payload.itensVenda).toEqual([
      { produtoId: "p1", descricaoProduto: "Pao Frances", quantidade: 1, valorUnitario: 12, valorTotal: 12 }
    ]);
    expect(payload.tiposPagamento).toEqual([{ formaPagamentoId: "f1", numeroVendas: 1, totalPago: 12 }]);
  });

  it("so inclui itens de despesa quando discriminando", () => {
    const form = { ...formOperacaoVazio(), valorOriginal: "5" };
    const itensDespesa = [
      {
        ...itemDespesaVazio(),
        descricao: "Item",
        valor: "5",
        grupoDespesaId: "g1",
        patrimonioItemId: "pat-1"
      }
    ];
    expect(montarPayloadOperacao("despesa", { ...base, form, itensDespesa }).itensDespesa).toEqual([]);
    expect(
      montarPayloadOperacao("despesa", { ...base, form, itensDespesa, discriminandoDespesa: true }).itensDespesa
    ).toEqual([
      expect.objectContaining({
        descricao: "Item",
        valor: 5,
        grupoDespesaId: "g1",
        grupoPatrimonioId: null,
        patrimonioItemId: "pat-1",
        colaboradorId: null
      })
    ]);
  });

  // O ID em branco do ITEM tem de virar null, igual aos do cabecalho: o zod usa uuid() e responde
  // 400 "Invalid UUID" para "". Como Grupo e opcional (e a primeira opcao do select e vazia), este
  // era o caminho PADRAO de quem discrimina sem classificar — e ele quebrava.
  it("converte para null os IDs em branco do item (nao manda string vazia)", () => {
    const form = { ...formOperacaoVazio(), valorOriginal: "5" };
    const itensDespesa = [{ ...itemDespesaVazio(), descricao: "Sem grupo", valor: "5" }];
    expect(
      montarPayloadOperacao("despesa", { ...base, form, itensDespesa, discriminandoDespesa: true }).itensDespesa
    ).toEqual([
      expect.objectContaining({ descricao: "Sem grupo", valor: 5, grupoDespesaId: null, grupoPatrimonioId: null })
    ]);

    const itensMercadoria = [{ ...itemMercadoriaVazio(), descricao: "Livre", quantidade: "1", valorTotal: "5" }];
    const [itemMercadoria] = montarPayloadOperacao("mercadoria", {
      ...base,
      form,
      itensMercadoria,
      discriminandoMercadoria: true
    }).itensMercadoria;
    expect(itemMercadoria).toMatchObject({
      produtoId: null,
      grupoMercadoriaId: null,
      grupoPatrimonioId: null,
      unidadeMedidaId: null
    });
  });

  it("envia os tres niveis de desconto da discriminacao", () => {
    const form = {
      ...formOperacaoVazio(),
      valorOriginal: "13.50",
      descontoGeralTipo: "percentual" as const,
      descontoGeralValor: "10"
    };
    const itensMercadoria = [
      {
        ...itemMercadoriaVazio(),
        descricao: "Item",
        quantidade: "2",
        valorUnitario: "10",
        descontoTipo: "valor",
        descontoValor: "1",
        descontoTotalTipo: "valor",
        descontoTotalValor: "3",
        valorTotal: "15"
      }
    ];
    const payload = montarPayloadOperacao("mercadoria", {
      ...base,
      form,
      itensMercadoria,
      discriminandoMercadoria: true
    });
    expect(payload).toMatchObject({ descontoGeralTipo: "percentual", descontoGeralValor: 10 });
    expect(payload.itensMercadoria[0]).toMatchObject({
      descontoTipo: "valor",
      descontoValor: 1,
      descontoTotalTipo: "valor",
      descontoTotalValor: 3,
      valorTotal: 15
    });
  });

  // §5 item 6: o Grupo do item tem duas origens e elas sao EXCLUSIVAS. Escolher patrimonio limpa o
  // grupo proprio (e vice-versa), entao a tela nao consegue montar o item que o CHECK recusaria.
  it("escolher grupo de patrimonio zera o grupo proprio, e vice-versa", () => {
    expect(grupoItemEscolhido("pat:abc")).toEqual({ grupoProprioId: "", grupoPatrimonioId: "abc" });
    expect(grupoItemEscolhido("g1")).toEqual({ grupoProprioId: "g1", grupoPatrimonioId: "" });
    expect(grupoItemEscolhido("")).toEqual({ grupoProprioId: "", grupoPatrimonioId: "" });
    // ida e volta: o select mostra de volta a origem que foi gravada
    expect(opcaoGrupoItem("", "abc")).toBe("pat:abc");
    expect(opcaoGrupoItem("g1", "")).toBe("g1");
    expect(opcaoGrupoItem("", "")).toBe("");
  });
});

describe("validarOperacaoParaEnvio", () => {
  const ok = {
    descricao: "Compra de farinha",
    grupoDespesaId: "g1",
    grupoMercadoriaId: "gm1",
    contaOrigemId: "c1",
    contaDestinoId: "c2",
    fornecedorId: "f1",
    colaboradorId: "col1",
    qtdItensDespesa: 0,
    qtdItensMercadoria: 0
  };

  // R-127: o texto do movimento e a OBSERVACAO no lancamento; so a venda ficou com `descricao`.
  it("exige o texto do movimento: observacao no lancamento, descricao na venda", () => {
    expect(validarOperacaoParaEnvio("despesa", { ...ok, descricao: "", observacao: "   " })).toMatch(/observacao/i);
    expect(validarOperacaoParaEnvio("despesa", { ...ok, descricao: "", observacao: "Farinha" })).toBeNull();
    // Lancamento antigo reaberto: chega so com `descricao` e continua valido.
    expect(validarOperacaoParaEnvio("despesa", { ...ok, observacao: "" })).toBeNull();
    expect(validarOperacaoParaEnvio("venda", { ...ok, descricao: "", observacao: "" })).toMatch(/descricao/i);
  });

  // Grupo e itens sao OPCIONAIS desde 04/08/2026 (o campo Grupo saiu do modal). Este teste guarda a
  // decisao: se alguem "consertar" a validacao de volta, ele fica vermelho.
  it("despesa: salva sem grupo e sem itens — os dois sao opcionais", () => {
    expect(validarOperacaoParaEnvio("despesa", { ...ok, grupoDespesaId: "", qtdItensDespesa: 0 })).toBeNull();
    expect(validarOperacaoParaEnvio("despesa", ok)).toBeNull();
  });

  it("mercadoria: exige so o fornecedor — grupo e itens sao opcionais", () => {
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, fornecedorId: "" })).toMatch(/fornecedor/i);
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, grupoMercadoriaId: "", qtdItensMercadoria: 0 })).toBeNull();
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, grupoMercadoriaId: "", qtdItensMercadoria: 1 })).toBeNull();
    expect(validarOperacaoParaEnvio("mercadoria", ok)).toBeNull();
  });

  // R-128: o credor da retirada e fornecedor OU socio/gestor. Colaborador saiu do leque novo, mas
  // continua valendo aqui porque o historico tem retirada gravada assim e ela precisa poder salvar.
  it("retirada: exige um credor — fornecedor, socio/gestor ou (historico) colaborador", () => {
    expect(validarOperacaoParaEnvio("retirada", { ...ok, fornecedorId: "", colaboradorId: "" })).toMatch(/credor/i);
    expect(validarOperacaoParaEnvio("retirada", { ...ok, colaboradorId: "" })).toBeNull();
    expect(
      validarOperacaoParaEnvio("retirada", {
        ...ok,
        fornecedorId: "",
        colaboradorId: "",
        socioGestorId: "11111111-1111-4111-8111-111111111111"
      })
    ).toBeNull();
    expect(validarOperacaoParaEnvio("retirada", { ...ok, fornecedorId: "" })).toBeNull();
  });

  it("transferencia: exige conta origem, conta destino e que sejam diferentes", () => {
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaOrigemId: "" })).toMatch(/conta de origem/i);
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaDestinoId: "" })).toMatch(/conta de destino/i);
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaDestinoId: "c1" })).toMatch(/diferente/i);
    expect(validarOperacaoParaEnvio("transferencia", ok)).toBeNull();
  });

  it("aceita IDs nulos (campos opcionais em branco) sem quebrar", () => {
    expect(validarOperacaoParaEnvio("venda", { ...ok, grupoDespesaId: null, contaOrigemId: null })).toBeNull();
  });
});

// Recorrencia (D3): o bloco so vira payload quando ha serie de verdade, e os dias da semana so
// acompanham a frequencia semanal.
describe("montarRecorrencia", () => {
  it("nao manda recorrencia quando o bloco esta fechado", () => {
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), numero: "12" })).toBeUndefined();
  });

  it("'repetir 1 vez' e o mesmo que nao repetir — nao manda nada", () => {
    // Importa porque mandar a recorrencia faria o servidor exigir a permissao (403) de quem so
    // queria um lancamento avulso.
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), aberta: true, numero: "1" })).toBeUndefined();
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), aberta: true, numero: "" })).toBeUndefined();
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), aberta: true, numero: "abc" })).toBeUndefined();
  });

  it("monta a serie mensal sem dias da semana", () => {
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), aberta: true, numero: "12" })).toEqual({
      frequencia: "mes",
      repeticoes: 12
    });
  });

  // Marca por ISO, nao por posicao: a ordem de DIAS_RECORRENCIA ja mudou uma vez (domingo entrou
  // na frente) e um array literal de posicoes quebra silenciosamente a cada mudanca dessas.
  function marcar(...isos: number[]) {
    return DIAS_RECORRENCIA.map((dia) => isos.includes(dia.iso));
  }

  it("inclui os dias marcados APENAS na frequencia semanal", () => {
    const dias = marcar(2, 5); // Ter e Sx
    expect(montarRecorrencia({ aberta: true, numero: "10", frequencia: "semana", dias })).toEqual({
      frequencia: "semana",
      repeticoes: 10,
      diasSemana: [2, 5]
    });

    // Os mesmos dias marcados numa serie mensal sao descartados: nao significam nada la.
    expect(montarRecorrencia({ aberta: true, numero: "10", frequencia: "mes", dias })).toEqual({
      frequencia: "mes",
      repeticoes: 10
    });
  });

  // Domingo (ISO 7) e decisao do Jose, nao do desenho do Rodrigo — a padaria abre domingo.
  it("aceita DOMINGO, que nao estava no rascunho", () => {
    expect(DIAS_RECORRENCIA.map((dia) => dia.iso)).toContain(7);
    expect(montarRecorrencia({ aberta: true, numero: "4", frequencia: "semana", dias: marcar(7) })).toEqual({
      frequencia: "semana",
      repeticoes: 4,
      diasSemana: [7]
    });
  });

  it("semanal sem nenhum dia marcado nao manda diasSemana (o servidor usa o dia da data)", () => {
    expect(montarRecorrencia({ ...estadoRecorrenciaVazio(), aberta: true, numero: "5", frequencia: "semana" })).toEqual(
      { frequencia: "semana", repeticoes: 5 }
    );
  });

  it("a recorrencia nao entra no payload de venda nem de transferencia", () => {
    const base = {
      empresaId: "e1",
      itensVenda: [],
      tiposPagamento: [],
      itensDespesa: [],
      itensMercadoria: [],
      discriminandoDespesa: false,
      discriminandoMercadoria: false,
      produtos: [] as Array<{ id: string; descricao?: string | null; nome?: string | null }>
    };
    const form = { ...formOperacaoVazio(), valorOriginal: "10" };
    const recorrencia = { frequencia: "mes" as const, repeticoes: 3 };
    // Venda vem da integracao e transferencia e movimento imediato: o contrato delas nao tem o
    // campo (schema .strict()), entao manda-lo seria 400.
    expect(montarPayloadOperacao("venda", { ...base, form, recorrencia })).not.toHaveProperty("recorrencia");
    expect(montarPayloadOperacao("transferencia", { ...base, form, recorrencia })).not.toHaveProperty("recorrencia");
    expect(montarPayloadOperacao("despesa", { ...base, form, recorrencia })).toMatchObject({ recorrencia });
  });
});
