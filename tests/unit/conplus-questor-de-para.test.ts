import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parentescosSugeridos } from "../../shared/src/admissoes/dependentes.js";
import {
  LAYOUT_ADMISSAO_QUESTOR,
  TABELAS_DE_PARA_QUESTOR,
  converterRotuloQuestor,
  cpfSemMascaraQuestor,
  formatarCepQuestor,
  formatarCnpjQuestor,
  formatarCpfQuestor,
  formatarDataQuestor,
  formatarPisQuestor
} from "../../shared/src/conplus/index.js";

/**
 * As opções que o formulário do candidato oferece hoje. Lidas do próprio arquivo, em vez de
 * copiadas, para que uma opção nova no formulário quebre este teste até ganhar código ou pendência.
 */
function opcoesDoFormulario(): Record<string, string[]> {
  const fonte = readFileSync(fileURLToPath(new URL("../../web-vue/pages/admissao.vue", import.meta.url)), "utf8");
  const bloco = /const OPCOES_ENUM = \{([\s\S]*?)\} as const;/u.exec(fonte)?.[1];
  if (!bloco) throw new Error("OPCOES_ENUM não encontrado em admissao.vue");
  return Object.fromEntries(
    [...bloco.matchAll(/(\w+): \[([^\]]*)\]/gu)].map(([, chave, lista]) => [
      chave!,
      [...lista!.matchAll(/"([^"]+)"/gu)].map((item) => item[1]!)
    ])
  );
}

const CAMPO_DO_FORMULARIO = {
  sexo: "SEXO",
  racaCor: "RACACOR",
  estadoCivil: "ESTADOCIVIL",
  nacionalidade: "NACIONALIDADE"
} as const;

describe("de-para Pralís → códigos documentados do Questor", () => {
  it.each(Object.entries(TABELAS_DE_PARA_QUESTOR))("%s: todo código está no domínio oficial do campo", (_, tabela) => {
    const registro = tabela.campo === "PARENTESCO" ? "D" : "B";
    const dominio = LAYOUT_ADMISSAO_QUESTOR[registro].find((campo) => campo.campo === tabela.campo)?.dominio;
    expect(dominio, tabela.campo).toBeTruthy();
    for (const codigo of Object.values(tabela.codigos)) expect(dominio).toContain(codigo);
  });

  it("toda opção do formulário atual tem código ou pendência declarada — nunca cai no genérico", () => {
    const opcoes = opcoesDoFormulario();
    expect(Object.keys(opcoes).sort()).toEqual(Object.keys(CAMPO_DO_FORMULARIO).sort());
    const resultado: Record<string, string> = {};
    for (const [chave, campo] of Object.entries(CAMPO_DO_FORMULARIO)) {
      for (const opcao of opcoes[chave]!) {
        const convertido = converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR[campo], opcao);
        expect(convertido.ok || !convertido.motivo.includes("não tem código documentado"), opcao).toBe(true);
        resultado[`${campo}:${opcao}`] = convertido.ok ? convertido.codigo : "PENDENTE";
      }
    }
    expect(resultado).toEqual({
      "SEXO:Masculino": "1",
      "SEXO:Feminino": "2",
      "RACACOR:Branca": "2",
      "RACACOR:Preta": "4",
      "RACACOR:Parda": "8",
      "RACACOR:Amarela": "6",
      "RACACOR:Indígena": "1",
      "RACACOR:Não declarado": "PENDENTE",
      "ESTADOCIVIL:Solteiro(a)": "1",
      "ESTADOCIVIL:Casado(a)": "2",
      "ESTADOCIVIL:Divorciado(a)": "3",
      "ESTADOCIVIL:Separado(a) judicialmente": "3",
      "ESTADOCIVIL:Viúvo(a)": "4",
      "ESTADOCIVIL:União estável": "PENDENTE",
      "NACIONALIDADE:Brasileira": "10",
      "NACIONALIDADE:Brasileira naturalizada": "20",
      "NACIONALIDADE:Estrangeira": "PENDENTE"
    });
  });

  it("sugestões de parentesco do Pralís: equivalentes viram código, as condicionais ficam pendentes", () => {
    const resultado = Object.fromEntries(
      parentescosSugeridos.map((rotulo) => {
        const convertido = converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR.PARENTESCO, rotulo);
        return [rotulo, convertido.ok ? convertido.codigo : "PENDENTE"];
      })
    );
    expect(resultado).toEqual({
      "Filho(a)": "01",
      "Enteado(a)": "11",
      Cônjuge: "02",
      "Companheiro(a)": "PENDENTE",
      "Tutelado(a)": "PENDENTE",
      Pai: "03",
      Mãe: "03",
      Outro: "14"
    });
  });

  it("ignora caixa, acento e espaços, mas não aceita rótulo desconhecido", () => {
    expect(converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR.SEXO, "  FEMININO ")).toEqual({ ok: true, codigo: "2" });
    expect(converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR.GRAUINSTR, "educacao superior completa")).toEqual({
      ok: true,
      codigo: "9"
    });
    expect(converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR.SEXO, "Outro").ok).toBe(false);
  });
});

describe("formatos exigidos pela documentação", () => {
  it("aplica as máscaras de CPF, CNPJ, PIS e CEP só com a quantidade certa de dígitos", () => {
    expect(formatarCpfQuestor("12345678909")).toBe("123.456.789-09");
    expect(formatarCpfQuestor("123.456.789-09")).toBe("123.456.789-09");
    expect(formatarCpfQuestor("1234567890")).toBeNull();
    expect(cpfSemMascaraQuestor("123.456.789-09")).toBe("12345678909");
    expect(formatarCnpjQuestor("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpjQuestor("123")).toBeNull();
    expect(formatarPisQuestor("12345678901")).toBe("123.45678.90.1");
    expect(formatarCepQuestor("36037467")).toBe("36.037-467");
    expect(formatarCepQuestor("3603746")).toBeNull();
  });

  it("converte data do banco para DD/MM/AAAA e recusa data impossível", () => {
    expect(formatarDataQuestor("2025-03-27")).toBe("27/03/2025");
    expect(formatarDataQuestor("2025-02-31")).toBeNull();
    expect(formatarDataQuestor("27/03/2025")).toBeNull();
  });
});
