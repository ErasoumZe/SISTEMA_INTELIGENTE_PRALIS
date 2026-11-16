import { describe, expect, it } from "vitest";
import { textoDoConvite, textoDoPedidoConfirmado } from "../../api/src/whatsapp/texto-whatsapp.js";

// 16/11/2026: o WhatsApp baniu o numero da padaria. Mensagens identicas em serie parecem envio automatico: cada
// mensagem sorteia saudacao, frase e fechamento, sempre com o mesmo conteudo.
const convite = {
  fornecedorNome: "SPAL",
  empresaNome: "Padaria Principal",
  totalItens: 8,
  prazo: "18/11/2026, 10:46",
  link: "https://sistema.exemplo.com.br/rodada#t=abc123"
};

/** Sorteio fixo: todas as partes escolhem a mesma posicao relativa (0 = primeira, 0.99 = ultima). */
const fixo = (valor: number) => () => valor;

describe("texto variado do WhatsApp", () => {
  it("toda versao do convite leva fornecedor, empresa, itens, prazo e o link inteiro", () => {
    const versoes = new Set<string>();
    for (const valor of [0, 0.26, 0.51, 0.76, 0.99]) {
      const texto = textoDoConvite(convite, fixo(valor));
      versoes.add(texto);
      for (const parte of ["SPAL", "Padaria Principal", "8 item(ns)", "18/11/2026, 10:46", convite.link])
        expect(texto, `${valor}: ${parte}`).toContain(parte);
      expect(texto.split("\n\n")).toHaveLength(3);
    }
    expect(versoes.size).toBe(4);
  });

  it("a primeira versao e a mensagem de antes", () => {
    expect(textoDoConvite(convite, fixo(0))).toBe(
      [
        "Olá, SPAL!",
        "A Padaria Principal tem uma cotação de 8 item(ns) para você.",
        `Responda até 18/11/2026, 10:46: ${convite.link}`
      ].join("\n\n")
    );
  });

  it("cada parte e sorteada por conta propria", () => {
    const valores = [0, 0.5, 0.99];
    const texto = textoDoConvite(convite, () => valores.shift()!);
    expect(texto).toBe(
      [
        "Olá, SPAL!",
        "Tem cotação nova da Padaria Principal para você: 8 item(ns).",
        `Pode responder até 18/11/2026, 10:46, por aqui: ${convite.link}`
      ].join("\n\n")
    );
  });

  it("o pedido confirmado varia e sempre leva o resumo dos itens", () => {
    const resumo = "12 DEL VALLE UVA 290ML UN; 12 DEL VALLE MANGA 290ML UN";
    const versoes = new Set<string>();
    for (const valor of [0, 0.26, 0.51, 0.76]) {
      const texto = textoDoPedidoConfirmado(
        { fornecedorNome: "SPAL", empresaNome: "Padaria Principal", resumo },
        fixo(valor)
      );
      versoes.add(texto);
      expect(texto).toContain("SPAL");
      expect(texto).toContain("Padaria Principal");
      expect(texto).toContain("Pode separar e entregar");
      expect(texto.endsWith(resumo)).toBe(true);
    }
    expect(versoes.size).toBe(4);
  });

  it("sorteio fora da faixa nao quebra (usa a ultima versao)", () => {
    expect(() => textoDoConvite(convite, fixo(1))).not.toThrow();
    expect(textoDoConvite(convite, fixo(1))).toContain(convite.link);
  });
});
