import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  arquivoDoVideo,
  capaDoVideo,
  duracaoTotal,
  filtrarVideos,
  GRUPOS_VIDEOS,
  gruposVisiveis,
  passoAnterior,
  proximoPasso
} from "./videos-ajuda";

const PASTA = dirname(fileURLToPath(import.meta.url));
const publico = (caminho: string) => join(PASTA, "..", "public", caminho);

describe("videos de ajuda", () => {
  it("soma a duracao do grupo para a pagina Treinamento", () => {
    const grupo = (segundos: number[]) => ({ videos: segundos.map((duracao) => ({ duracao })) as never });
    expect(duracaoTotal(grupo([20, 25]))).toBe("45 s");
    expect(duracaoTotal(grupo([60, 60]))).toBe("2 min");
    expect(duracaoTotal(grupo([51, 9, 17]))).toBe("1 min 17 s");
  });

  it("o grupo do Caixa so aparece para quem tem a tela Caixa no menu", () => {
    expect(gruposVisiveis([{ id: "caixa" }]).map((g) => g.id)).toEqual(["caixa"]);
    expect(gruposVisiveis([{ id: "transferencias" }, { id: "despesas" }])).toEqual([]);
    expect(gruposVisiveis([])).toEqual([]);
  });

  it("busca sem acento e por palavras soltas, inclusive no texto da legenda", () => {
    const achados = (termo: string) => filtrarVideos(GRUPOS_VIDEOS, termo).flatMap((g) => g.videos.map((v) => v.id));
    expect(achados("nao confere")).toEqual(["o-malote-nao-bateu"]);
    expect(achados("malote bateu")).toContain("o-malote-nao-bateu");
    expect(achados("MAQUININHA")).toContain("como-escolher-a-maquininha");
    expect(achados("voltar e revisar")).toContain("errei-antes-de-abrir");
    expect(achados("palavra que nao existe")).toEqual([]);
    expect(achados("   ")).toHaveLength(GRUPOS_VIDEOS[0]!.videos.length);
  });

  it("todo video do catalogo tem o arquivo e a capa em public/videos", () => {
    for (const grupo of GRUPOS_VIDEOS) {
      for (const video of grupo.videos) {
        expect(existsSync(publico(arquivoDoVideo(grupo.id, video.id))), video.id).toBe(true);
        expect(existsSync(publico(capaDoVideo(grupo.id, video.id))), video.id).toBe(true);
      }
    }
  });

  it("cada passo da legenda tem o segundo em que comeca, em ordem e dentro do video", () => {
    for (const video of GRUPOS_VIDEOS.flatMap((g) => g.videos)) {
      expect(video.inicios, video.id).toHaveLength(video.passos.length);
      expect(video.inicios[0], video.id).toBe(0);
      expect(
        [...video.inicios].sort((a, b) => a - b),
        video.id
      ).toEqual(video.inicios);
      expect(video.inicios.at(-1)!, video.id).toBeLessThan(video.duracao);
    }
  });

  it("setas andam pelos passos do video, como stories", () => {
    const inicios = [0, 4, 9, 15];
    expect(proximoPasso(inicios, 0)).toBe(4);
    expect(proximoPasso(inicios, 5.2)).toBe(9);
    expect(proximoPasso(inicios, 3.98)).toBe(9); // a folga evita parar no passo em que ja esta chegando
    expect(proximoPasso(inicios, 15.5)).toBeNull(); // ultimo passo: quem chama vai para o proximo video
    expect(passoAnterior(inicios, 11)).toBe(9); // ja passou 1 s: recomeca o passo atual
    expect(passoAnterior(inicios, 9.4)).toBe(4); // acabou de entrar: volta para o anterior
    expect(passoAnterior(inicios, 0.3)).toBe(0); // no primeiro, recomeca o primeiro
  });

  it("ids nao se repetem (o id vira o nome do arquivo)", () => {
    const ids = GRUPOS_VIDEOS.flatMap((g) => g.videos.map((v) => v.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
