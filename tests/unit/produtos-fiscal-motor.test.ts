import { describe, expect, it } from "vitest";
import {
  ABA_ECF,
  aplicarResultadoFiscal,
  candidatosDeCodigo,
  classificarFiscal,
  classificarPorGrupo,
  fonteEcfDaLoja,
  lerFonteEcf,
  lerMargensPorGrupo,
  mesmoFiscalManual,
  montarTabelasFiscais,
  ncmFiscal,
  normalizarGrupoFiscal,
  percentualDaPlanilha,
  semCargaFiscal,
  type SiaDePara,
  type TabelasFiscais
} from "@padaria/shared/produtos";

// Porte dos casos de `tax-rule.service.test.ts` do app oficial (origin/main 1ba6774): mesmas entradas,
// mesmos resultados. Se algum destes mudar, o ERP deixou de ser igual ao app da loja.

type Faixa = string[][];
function tabelas(opcoes: {
  grupos?: Faixa;
  produtos?: Faixa;
  reforma?: Faixa;
  cst?: Faixa;
  margens?: Faixa;
  ecf?: Faixa | null;
  sia?: Record<string, SiaDePara[]>;
}): TabelasFiscais {
  const base = montarTabelasFiscais({
    grupos: opcoes.grupos ?? [["MER PADARIA", "1", "TRIBUTADO INTEGRAL", "11,28%", "3,69%", "Regra geral"]],
    produtos: opcoes.produtos ?? [],
    reforma: opcoes.reforma ?? [],
    cst: opcoes.cst ?? [["1", "TRIBUTADO INTEGRAL", "11,28%"]],
    margens: lerMargensPorGrupo(opcoes.margens ?? [])
  });
  return {
    ...base,
    ecf: new Map([[ABA_ECF, lerFonteEcf(opcoes.ecf === undefined ? [] : opcoes.ecf)]]),
    sia: new Map(
      Object.entries(opcoes.sia ?? {}).map(([loja, linhas]) => [loja, new Map(linhas.map((l) => [l.chaveBarras, l]))])
    )
  };
}

const LINHA_ECF = (nome: string, troca: Record<number, string> = {}) => {
  const linha = [
    "012658",
    nome,
    nome,
    "COD INTERNO",
    "5333",
    "18000",
    "0000",
    "1",
    "00000000",
    "00000000",
    "18,00%",
    "03",
    "19059090",
    "PRODUTOS DA CASA",
    "",
    "",
    ""
  ];
  for (const [i, v] of Object.entries(troca)) linha[Number(i)] = v;
  return linha;
};

describe("motor fiscal — normalizacoes e tabelas", () => {
  it("normaliza caracteres invisiveis e percentuais brasileiros", () => {
    expect(normalizarGrupoFiscal(" MER ⁠BEBIDAS  -  ÁGUAS ")).toBe("MER BEBIDAS - ÁGUAS");
    expect(percentualDaPlanilha("11,28%")).toBe(11.28);
    expect(ncmFiscal("4051000")).toBe("04051000");
  });

  it("le, limpa e encontra a regra pelo nome normalizado", () => {
    const t = tabelas({
      grupos: [["MER ⁠FAB. PRÓPRIA - ⁠PANIFICAÇÃO", "6", "ALÍQUOTA ZERO", "7,40%", "0,00%", "Cesta básica"]]
    });
    expect(t.grupos).toEqual([
      {
        grupo: "MER FAB. PRÓPRIA - PANIFICAÇÃO",
        cstPisCofins: "6",
        tributacaoSimples: "ALÍQUOTA ZERO",
        aliquotaSimples: 7.4,
        icmsRe: 0,
        baseFiscal: "Cesta básica",
        margemPadrao: null
      }
    ]);
  });

  it("margem do grupo vem da aba de grupos, so para grupo com regra, e com limite de sanidade", () => {
    const t = tabelas({
      grupos: [["MER ⁠CIGARROS - ⁠TRADICIONAIS", "5", "ST PIS/COFINS", "7,40%", "0,00%", "Cigarros"]],
      margens: [
        ["MER CIGARROS - TRADICIONAIS", "0,2"],
        ["GRUPO SEM REGRA", "0,3"],
        ["MER CIGARROS - TRADICIONAIS", "600"]
      ]
    });
    // a terceira linha (600 = 60000%) e descartada; a do grupo sem regra fiscal nao entra
    expect(t.grupos[0]?.margemPadrao).toBe(0.2);
  });

  it("classifica EAN de balanca pelo PLU e completa NCM e reforma tributaria", () => {
    expect(candidatosDeCodigo("2128050024901")).toEqual(["2128050024901", "12805"]);
    const t = tabelas({
      grupos: [["MER FAB. PRÓPRIA - CONFEITARIA", "1", "TRIBUTADO INTEGRAL", "11,28%", "3,69%", "Regra geral"]],
      produtos: [["12805", "19059090", "1", "3,69%", "BOLO PRALIS LIMAO"]],
      reforma: [["19059090", "Produtos de padaria", "000", "000001", "0,10%", "0,90%"]]
    });
    expect(classificarPorGrupo(t, "MER FAB. PRÓPRIA - CONFEITARIA", "2128050024901")).toMatchObject({
      origem: "plu_balanca",
      codigoFiscal: "12805",
      ncm: "19059090",
      cstPisCofins: "1",
      cstReforma: "000",
      cClassTrib: "000001",
      aliquotaIbs: 0.1,
      aliquotaCbs: 0.9
    });
  });
});

describe("motor fiscal — classificar: estado e motivo", () => {
  it("completa quando o nome casa no cadastro de ECF", () => {
    const r = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BOLO REDONDO LARANJA")] }), {
      grupo: "MER PADARIA",
      nome: "Bolo Redondo Laranja"
    });
    expect(r.estado).toBe("completo");
    expect(r.classificacao?.ecf).toMatchObject({
      reducaoIcms: 53.33,
      aliquotaCheia: 18,
      aliquotaEcf: "18,00%",
      aliquotaEcfId: "03"
    });
  });

  it("grupo fora das regras vira pendencia e nao ha classificacao", () => {
    const r = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BOLO REDONDO LARANJA")] }), {
      grupo: "SORVETES",
      nome: "BOLO REDONDO LARANJA"
    });
    expect(r.estado).toBe("pendente_grupo_invalido");
    expect(r.motivo).toContain("SORVETES");
    expect(r.classificacao).toBeNull();
  });

  it("sem grupo tambem e pendencia de grupo; tabela fora do ar e fonte indisponivel", () => {
    expect(classificarFiscal(tabelas({}), { grupo: null, nome: "X" }).estado).toBe("pendente_grupo_invalido");
    expect(classificarFiscal(null, { grupo: "MER PADARIA", nome: "X" }).estado).toBe("fonte_indisponivel");
  });

  it("nome repetido na fonte nao escolhe linha", () => {
    const r = classificarFiscal(
      tabelas({ ecf: [LINHA_ECF("COXINHA CAMARAO"), LINHA_ECF("COXINHA CAMARAO", { 10: "SUBST TRIB", 11: "10" })] }),
      { grupo: "MER PADARIA", nome: "COXINHA CAMARAO" }
    );
    expect(r.estado).toBe("pendente_ambiguo");
    expect(r.motivo).toContain("sortear");
  });

  it("produto sem registro e parcial; fonte fora do ar nao e o mesmo", () => {
    const parcial = classificarFiscal(tabelas({ ecf: [LINHA_ECF("OUTRA COISA")] }), {
      grupo: "MER PADARIA",
      nome: "AGUA CRYSTAL S/GAS 300ML DELIVERY"
    });
    expect(parcial.estado).toBe("parcial");
    expect(parcial.motivo).toContain("não existe no cadastro de ECF");
    expect(parcial.classificacao).not.toBeNull();

    const fora = classificarFiscal(tabelas({ ecf: null }), { grupo: "MER PADARIA", nome: "BOLO REDONDO LARANJA" });
    expect(fora.estado).toBe("fonte_indisponivel");
    expect(fora.classificacao).not.toBeNull();
  });

  it("CST do grupo contra CST da fonte vira conflito; CST 99 nao conta", () => {
    const conflito = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BEBIDA LACTEA PIRAKIDS 200ML", { 7: "4" })] }), {
      grupo: "MER PADARIA",
      nome: "BEBIDA LACTEA PIRAKIDS 200ML"
    });
    expect(conflito.estado).toBe("pendente_conflito");
    expect(conflito.conflitos).toEqual([{ campo: "cstPisCofins", doGrupo: "1", doEcf: "4" }]);

    const generico = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BOLO REDONDO LARANJA", { 7: "99" })] }), {
      grupo: "MER PADARIA",
      nome: "BOLO REDONDO LARANJA"
    });
    expect(generico.estado).toBe("completo");
  });

  it("sem nome aplica a regra do grupo e diz que nao consultou o ECF", () => {
    const r = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BOLO REDONDO LARANJA")] }), {
      grupo: "MER PADARIA",
      nome: null
    });
    expect(r.estado).toBe("parcial");
    expect(r.motivo).toContain("Sem nome");
  });
});

describe("motor fiscal — a fonte de ECF e da loja", () => {
  const ecf = [LINHA_ECF("BOLO REDONDO LARANJA")];

  it("TNP e BASE recebem a aba; LI e HORA ficam pendentes da propria fonte", () => {
    expect(
      classificarFiscal(tabelas({ ecf }), { grupo: "MER PADARIA", nome: "BOLO REDONDO LARANJA", loja: "TNP" }).estado
    ).toBe("completo");
    const li = classificarFiscal(tabelas({ ecf }), { grupo: "MER PADARIA", nome: "BOLO REDONDO LARANJA", loja: "LI" });
    expect(li.estado).toBe("pendente_fonte_da_loja");
    expect(li.classificacao?.ecf).toBeNull();
    expect(li.classificacao?.cstPisCofins).toBe("1");
    expect(
      classificarFiscal(tabelas({ ecf }), { grupo: "MER PADARIA", nome: "BOLO REDONDO LARANJA", loja: "HORA" }).estado
    ).toBe("pendente_fonte_da_loja");
    expect(classificarFiscal(tabelas({ ecf }), { grupo: "MER PADARIA", nome: "BOLO REDONDO LARANJA" }).estado).toBe(
      "completo"
    );
    expect(fonteEcfDaLoja("li")).toBeNull();
    expect(fonteEcfDaLoja(null)).toBe(ABA_ECF);
  });

  it("LI recebe o ECF do proprio SIA quando o de-para da loja foi importado", () => {
    const sia: SiaDePara = {
      chaveBarras: "789123",
      aliqSaidaEcf: "3",
      reducao: "53.33",
      aliquotaInterna: "18",
      codGrupo: "PRODUTOS DA CASA",
      ncm: "19059090"
    };
    const r = classificarFiscal(tabelas({ ecf, sia: { LI: [sia] } }), {
      grupo: "MER PADARIA",
      nome: "BOLO REDONDO LARANJA",
      codigoBarras: "00000000789123",
      loja: "LI"
    });
    expect(r.estado).toBe("completo");
    expect(r.classificacao?.ecf).toMatchObject({
      aliquotaEcf: "18,00%",
      aliquotaEcfId: "03",
      reducaoIcms: 53.33,
      aliquotaCheia: 18,
      ncm: "19059090",
      categoria: "PRODUTOS DA CASA"
    });
  });
});

describe("motor fiscal — aplicacao no produto", () => {
  it("sobrescreve o derivado, copia o ECF e grava estado/motivo", () => {
    const r = classificarFiscal(tabelas({ ecf: [LINHA_ECF("BOLO REDONDO LARANJA")] }), {
      grupo: "MER PADARIA",
      nome: "BOLO REDONDO LARANJA"
    });
    const { fiscal, grupoOficial } = aplicarResultadoFiscal({ ncm: "11111111", tributacaoSimples: "VELHA" }, r);
    expect(grupoOficial).toBe("MER PADARIA");
    expect(fiscal).toMatchObject({
      ncm: "11111111",
      cstPisCofins: "1",
      tributacaoSimples: "TRIBUTADO INTEGRAL",
      aliquotaEcf: "18,00%",
      aliquotaEcfId: "03",
      categoriaFiscal: "PRODUTOS DA CASA",
      origemFiscal: "grupo",
      estado: "completo"
    });
  });

  it("sem classificacao mantem o fiscal e so marca a pendencia", () => {
    const r = classificarFiscal(tabelas({}), { grupo: "SORVETES" });
    expect(aplicarResultadoFiscal({ ncm: "19059090" }, r).fiscal).toEqual({
      ncm: "19059090",
      estado: "pendente_grupo_invalido",
      motivo: r.motivo
    });
  });

  it("comparacao do fiscal manual trata null, vazio e zero como iguais; carga vazia e detectada", () => {
    expect(mesmoFiscalManual({ ncm: "1", icms: 0 }, { ncm: "1", icms: null })).toBe(true);
    expect(mesmoFiscalManual({ ncm: "1" }, { ncm: "2" })).toBe(false);
    expect(semCargaFiscal({ ncm: "19059090", cstPisCofins: "1" })).toBe(true);
    expect(semCargaFiscal({ aliquotaCheia: 18 })).toBe(false);
  });
});
