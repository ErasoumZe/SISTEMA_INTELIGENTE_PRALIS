import { describe, expect, it } from "vitest";
import {
  arredondar,
  calcularPrecoVenda,
  calcularPrecoVendaComPromocao,
  montarComoSeCompra,
  montarDescricao,
  resolverMargemGrupo,
  validarPromocoesDoProduto
} from "@padaria/shared/produtos";

describe("produtos/regras — preco de venda", () => {
  it("usa custo unitario x (1 + margem)", () => {
    // 84,90 / 30 = 2,83 ; x1,70 = 4,811 -> 4,81
    expect(
      calcularPrecoVenda({ auto: true, custo: 84.9, quantidadeCaixa: 30, margem: 0.7, margemGrupo: 0, precoManual: 0 })
    ).toBe(4.81);
  });

  it("margem 0 mantem o custo unitario", () => {
    expect(
      calcularPrecoVenda({ auto: true, custo: 10, quantidadeCaixa: 10, margem: 0, margemGrupo: 0, precoManual: 0 })
    ).toBe(1);
  });

  it("margem 30% sobre custo unitario", () => {
    expect(
      calcularPrecoVenda({ auto: true, custo: 100, quantidadeCaixa: 2, margem: 0.3, margemGrupo: 0, precoManual: 0 })
    ).toBe(65);
  });

  it("margem pontual prevalece sobre a do grupo", () => {
    expect(
      calcularPrecoVenda({ auto: true, custo: 10, quantidadeCaixa: 1, margem: 0.5, margemGrupo: 0.1, precoManual: 0 })
    ).toBe(15);
  });

  it("usa a margem do grupo quando a pontual e null", () => {
    expect(
      calcularPrecoVenda({ auto: true, custo: 10, quantidadeCaixa: 1, margem: null, margemGrupo: 0.1, precoManual: 0 })
    ).toBe(11);
  });

  it("auto=false devolve o preco manual", () => {
    expect(
      calcularPrecoVenda({ auto: false, custo: 999, quantidadeCaixa: 1, margem: 0.5, margemGrupo: 0, precoManual: 7.5 })
    ).toBe(7.5);
  });

  it("produto incompleto devolve 0", () => {
    expect(
      calcularPrecoVenda({
        auto: true,
        custo: 10,
        quantidadeCaixa: 1,
        margem: 0.5,
        margemGrupo: 0,
        precoManual: 0,
        temProduto: false
      })
    ).toBe(0);
  });
});

describe("produtos/regras — promocao", () => {
  const precoVenda = 100;
  const seg14h = new Date(2026, 5, 29, 14, 0, 0); // 29/06/2026 14:00

  it("aplica desconto dentro da janela de horario", () => {
    const preco = calcularPrecoVendaComPromocao({
      precoVenda,
      agora: seg14h,
      promocoes: [{ tipo: "desconto", descontoFracao: 0.2, horaInicio: "12:00", horaFim: "15:00" }]
    });
    expect(preco).toBe(80);
  });

  it("nao aplica fora da janela de horario", () => {
    const seg18h = new Date(2026, 5, 29, 18, 0, 0);
    const preco = calcularPrecoVendaComPromocao({
      precoVenda,
      agora: seg18h,
      promocoes: [{ tipo: "desconto", descontoFracao: 0.2, horaInicio: "12:00", horaFim: "15:00" }]
    });
    expect(preco).toBe(100);
  });

  it("promocao de valor fixo substitui o preco", () => {
    const preco = calcularPrecoVendaComPromocao({
      precoVenda,
      agora: seg14h,
      promocoes: [{ tipo: "valor", valor: 75 }]
    });
    expect(preco).toBe(75);
  });

  it("respeita o dia da semana marcado", () => {
    // dias = [seg..dom]; marca apenas terca -> nao aplica numa segunda
    const preco = calcularPrecoVendaComPromocao({
      precoVenda,
      agora: seg14h,
      promocoes: [{ tipo: "desconto", descontoFracao: 0.5, dias: [false, true, false, false, false, false, false] }]
    });
    expect(preco).toBe(100);
  });
});

describe("produtos/regras — texto e lookups", () => {
  it("montarDescricao: NOME + QTD + MEDIDA", () => {
    expect(montarDescricao("Farinha de Trigo", 25, "KG")).toBe("FARINHA DE TRIGO 25 KG");
  });

  it("montarComoSeCompra: formato oficial com DE e quantidade exata", () => {
    expect(
      montarComoSeCompra({
        embalagem: "SACO",
        cDe: "DE",
        quantidadeCaixa: 25,
        medidaCompra: "KG",
        descricao: "FARINHA DE TRIGO 25 KG",
        aproximado: false
      })
    ).toBe("FARINHA DE TRIGO 25 KG - SACO DE FARINHA DE TRIGO 25 KG 25KG");
  });

  it("montarComoSeCompra: formato oficial aproximado com C/", () => {
    expect(
      montarComoSeCompra({
        embalagem: "CX",
        cDe: "C/",
        quantidadeCaixa: 12,
        medidaCompra: "UN",
        descricao: "QUEIJO MINAS FRESCAL KG",
        aproximado: true
      })
    ).toBe("QUEIJO MINAS FRESCAL KG - CAIXA COM QUEIJO MINAS FRESCAL KG APROXIMADAMENTE 12UN");
  });

  it("montarComoSeCompra: sigla fora do dicionario vira ela mesma", () => {
    expect(
      montarComoSeCompra({
        embalagem: "BALDE",
        cDe: "DE",
        quantidadeCaixa: 5,
        medidaCompra: "LT",
        descricao: "OLEO 5 LT",
        aproximado: false
      })
    ).toBe("OLEO 5 LT - BALDE DE OLEO 5 LT 5LT");
  });

  it("montarComoSeCompra: sem embalagem nao inventa texto", () => {
    expect(
      montarComoSeCompra({
        embalagem: null,
        cDe: "DE",
        quantidadeCaixa: 25,
        medidaCompra: "KG",
        descricao: "FARINHA DE TRIGO 25 KG",
        aproximado: false
      })
    ).toBe("");
  });

  it("resolverMargemGrupo: acha pelo nome, ou 0", () => {
    const grupos = [
      { nome: "Padaria", margem: 0.7 },
      { nome: "Bebidas", margem: 0.3 }
    ];
    expect(resolverMargemGrupo("Bebidas", grupos)).toBe(0.3);
    expect(resolverMargemGrupo("Inexistente", grupos)).toBe(0);
  });

  it("arredondar: 2 casas por padrao", () => {
    expect(arredondar(4.811)).toBe(4.81);
    expect(arredondar(2.835)).toBe(2.84);
  });
});

describe("produtos/regras — promocao: validacao e desempate (P-04)", () => {
  const segundaAs11 = new Date(2026, 7, 10, 11, 0);

  it("a ORDEM do banco nunca decide o preco: vence o menor", () => {
    const dezPorCento = {
      tipo: "desconto" as const,
      descontoFracao: 0.1,
      dias: [true, true, true, true, true, true, true]
    };
    const trintaPorCento = {
      tipo: "desconto" as const,
      descontoFracao: 0.3,
      dias: [true, true, true, true, true, true, true]
    };
    const umaOrdem = calcularPrecoVendaComPromocao({
      precoVenda: 100,
      agora: segundaAs11,
      promocoes: [dezPorCento, trintaPorCento]
    });
    const outraOrdem = calcularPrecoVendaComPromocao({
      precoVenda: 100,
      agora: segundaAs11,
      promocoes: [trintaPorCento, dezPorCento]
    });
    expect(umaOrdem).toBe(70);
    expect(outraOrdem).toBe(70);
  });

  it("promocao com validade VENCIDA nao aplica", () => {
    expect(
      calcularPrecoVendaComPromocao({
        precoVenda: 100,
        agora: segundaAs11,
        promocoes: [{ tipo: "desconto", descontoFracao: 0.5, validaAte: "2026-08-09" }]
      })
    ).toBe(100);
  });

  it("promocao valida ATE hoje ainda aplica", () => {
    expect(
      calcularPrecoVendaComPromocao({
        precoVenda: 100,
        agora: segundaAs11,
        promocoes: [{ tipo: "desconto", descontoFracao: 0.5, validaAte: "2026-08-10" }]
      })
    ).toBe(50);
  });

  it("recusa promocao sem o valor exigido pelo tipo", () => {
    expect(validarPromocoesDoProduto([{ tipo: "valor", valor: null }])[0]).toContain("informe o valor");
    expect(validarPromocoesDoProduto([{ tipo: "desconto", descontoFracao: null }])[0]).toContain("percentual");
  });

  it("recusa desconto fora de 0% a 100%", () => {
    expect(validarPromocoesDoProduto([{ tipo: "desconto", descontoFracao: 1.5 }])[0]).toContain("entre 0% e 100%");
    expect(validarPromocoesDoProduto([{ tipo: "desconto", descontoFracao: 0 }])[0]).toContain("entre 0% e 100%");
    expect(validarPromocoesDoProduto([{ tipo: "desconto", descontoFracao: 1 }])).toEqual([]);
  });

  it("recusa fim anterior ao inicio e manda dividir a promocao que vira o dia", () => {
    const erros = validarPromocoesDoProduto([
      { tipo: "desconto", descontoFracao: 0.1, horaInicio: "22:00", horaFim: "02:00" }
    ]);
    expect(erros[0]).toContain("dividida em duas");
  });

  it("recusa duas promocoes que se sobrepoem no mesmo dia", () => {
    const erros = validarPromocoesDoProduto([
      {
        tipo: "desconto",
        descontoFracao: 0.1,
        horaInicio: "10:00",
        horaFim: "12:00",
        dias: [true, false, false, false, false, false, false]
      },
      { tipo: "valor", valor: 5, dias: [true, false, false, false, false, false, false] }
    ]);
    expect(erros.some((erro) => erro.includes("se sobrepõem"))).toBe(true);
  });

  it("aceita duas promocoes em dias diferentes", () => {
    expect(
      validarPromocoesDoProduto([
        { tipo: "desconto", descontoFracao: 0.1, dias: [true, false, false, false, false, false, false] },
        { tipo: "desconto", descontoFracao: 0.2, dias: [false, true, false, false, false, false, false] }
      ])
    ).toEqual([]);
  });

  it("aceita duas promocoes no mesmo dia em janelas que nao se cruzam", () => {
    expect(
      validarPromocoesDoProduto([
        {
          tipo: "desconto",
          descontoFracao: 0.1,
          horaInicio: "08:00",
          horaFim: "10:00",
          dias: [true, false, false, false, false, false, false]
        },
        {
          tipo: "desconto",
          descontoFracao: 0.2,
          horaInicio: "14:00",
          horaFim: "16:00",
          dias: [true, false, false, false, false, false, false]
        }
      ])
    ).toEqual([]);
  });
});
