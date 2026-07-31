import { describe, expect, it } from "vitest";
import { acentuarMensagemExibida, erro } from "@padaria/shared/api";

describe("R-100 - português nas mensagens exibidas", () => {
  it("acentua palavras inteiras sem alterar identificadores técnicos", () => {
    expect(acentuarMensagemExibida("Nao foi possivel concluir a operacao do usuario usuario_id")).toBe(
      "Não foi possível concluir a operação do usuário usuario_id"
    );
  });

  it("acentua a mensagem antiga ao cruzar a fronteira HTTP", () => {
    let corpo: unknown;
    const reply = {
      status: () => ({
        send(payload?: unknown) {
          corpo = payload;
          return payload;
        }
      }),
      send(payload?: unknown) {
        corpo = payload;
        return payload;
      }
    };

    erro(reply, 403, "Permissao insuficiente para esta acao", "INSUFFICIENT_PERMISSION");
    expect(corpo).toMatchObject({ title: "Permissão insuficiente para esta ação", code: "INSUFFICIENT_PERMISSION" });
  });
});
