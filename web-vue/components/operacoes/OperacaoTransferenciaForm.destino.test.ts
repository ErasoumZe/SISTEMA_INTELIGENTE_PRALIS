import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Bug de 13/11/2026 (Marco): o aviso "Nenhum PDV com caixa aberto agora" entrou entre o select do
// destino (`v-if="!multiploDestino"`) e as caixinhas (`v-else`). O `v-else` passou a casar com o aviso,
// e as caixinhas de "Multiplo Destino" apareciam sempre, junto do select. O formulario inteiro depende
// de todo o contexto do workspace; aqui se prende a estrutura que decide o que aparece.
const fonte = readFileSync(resolve(__dirname, "OperacaoTransferenciaForm.vue"), "utf8");

describe("destino da transferencia", () => {
  it("as caixinhas de destino so existem com Multiplo Destino marcado", () => {
    const select = fonte.indexOf('<select v-if="!multiploDestino" v-model="form.contaDestinoId"');
    const fimSelect = fonte.indexOf("</select>", select);
    const caixinhas = fonte.indexOf('class="tr-destinos"');
    expect(select).toBeGreaterThan(-1);
    const entre = fonte.slice(fimSelect + "</select>".length, caixinhas);
    // Entre o select e as caixinhas so pode haver comentario e o proprio `<div v-else`.
    const semComentarios = entre.replace(/<!--[\s\S]*?-->/gu, "").trim();
    expect(semComentarios).toBe("<div v-else");
  });

  it("o aviso de PDV sem caixa aberto nao aparece no modo de varios destinos", () => {
    expect(fonte).toContain('v-if="!multiploDestino && semLacre && !carregandoDestinosSemLacre');
  });
});
