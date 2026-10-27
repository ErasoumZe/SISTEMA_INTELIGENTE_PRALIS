import { describe, expect, it } from "vitest";
import type { LacreRelatorio } from "@padaria/shared/transferencias";
import {
  composicaoDoMalote,
  descreverLacre,
  resumirSangrias,
  rotuloMovimento,
  situacaoDaLinha,
  textoSangrias
} from "./transferencias-relatorio";

function bolsa(situacao: LacreRelatorio["situacao"], numero: string | null = "B-1"): LacreRelatorio {
  return { tipo: "sangria", numero, situacao, usadoEmTransferenciaId: null };
}

describe("relatorio de transferencias - apresentacao", () => {
  it("a situacao do malote vence o status; sem malote vale o status da conferencia", () => {
    expect(situacaoDaLinha({ status: "pendente", situacaoMalote: "disponivel" }).rotulo).toBe("Disponível");
    expect(situacaoDaLinha({ status: "recebido", situacaoMalote: "usado" }).rotulo).toBe("Usado");
    expect(situacaoDaLinha({ status: "pendente", situacaoMalote: null }).rotulo).toBe("Pendente");
    expect(situacaoDaLinha({ status: "recebido" }).rotulo).toBe("Recebido");
  });

  it("so a divergencia e marcada como alerta", () => {
    expect(situacaoDaLinha({ status: "divergente", situacaoMalote: null }).alerta).toBe(true);
    expect(situacaoDaLinha({ status: "pendente", situacaoMalote: "divergente" }).alerta).toBe(true);
    for (const status of ["pendente", "recebido", "agendada", "cancelada"]) {
      expect(situacaoDaLinha({ status, situacaoMalote: null }).alerta).toBe(false);
    }
  });

  it("status desconhecido aparece como veio, sem inventar sentido nem virar alerta", () => {
    const situacao = situacaoDaLinha({ status: "novo_status", situacaoMalote: null });
    expect(situacao).toMatchObject({ rotulo: "novo_status", alerta: false, chave: "desconhecido" });
  });

  it("malote usado ou disponivel se chama Malote; as demais usam o nome do movimento", () => {
    expect(rotuloMovimento({ tipoMovimento: "suprimento", situacaoMalote: "disponivel" })).toBe("Malote");
    expect(rotuloMovimento({ tipoMovimento: "abertura", situacaoMalote: "usado" })).toBe("Malote");
    expect(rotuloMovimento({ tipoMovimento: "retorno", situacaoMalote: null })).toBe("Retorno / sangria");
    expect(rotuloMovimento({ tipoMovimento: "sangria", situacaoMalote: null })).toBe("Sangria");
    expect(rotuloMovimento({ tipoMovimento: "suprimento", situacaoMalote: null })).toBe("Transferência");
    expect(rotuloMovimento({ situacaoMalote: null })).toBe("Transferência");
  });

  it("resume as bolsas de sangria por estado e escreve no singular e no plural", () => {
    const lacres = [
      bolsa("conferida"),
      bolsa("usada_aguardando_conferencia"),
      bolsa("disponivel"),
      bolsa("disponivel")
    ];
    expect(resumirSangrias(lacres)).toEqual({ total: 4, disponiveis: 2, aguardando: 1, conferidas: 1 });
    expect(textoSangrias(resumirSangrias(lacres))).toBe("4 bolsas · 1 conferida · 1 aguardando · 2 disponíveis");
    expect(textoSangrias(resumirSangrias([bolsa("disponivel")]))).toBe("1 bolsa · 1 disponível");
    expect(textoSangrias(resumirSangrias([]))).toBe("Sem bolsas");
  });

  it("numero oculto vira texto para o leitor de tela, nunca em branco", () => {
    expect(
      descreverLacre({ tipo: "fechamento", numero: null, situacao: "reservado", usadoEmTransferenciaId: null })
    ).toBe("Fechamento, número oculto para o seu perfil, reservado");
    expect(descreverLacre({ tipo: "abertura", numero: "A-1", situacao: "usado", usadoEmTransferenciaId: null })).toBe(
      "Abertura, A-1, usado"
    );
  });

  it("composicao so existe quando dinheiro E moedas foram informados; nunca vira zero", () => {
    expect(composicaoDoMalote({ valorEspecieDeclarado: 80, valorMoedasDeclarado: 20 })).toEqual({
      especie: 80,
      moedas: 20
    });
    expect(composicaoDoMalote({ valorEspecieDeclarado: 80, valorMoedasDeclarado: null })).toBeNull();
    expect(composicaoDoMalote({})).toBeNull();
    expect(composicaoDoMalote({ valorEspecieDeclarado: 0, valorMoedasDeclarado: 0 })).toEqual({
      especie: 0,
      moedas: 0
    });
  });
});
