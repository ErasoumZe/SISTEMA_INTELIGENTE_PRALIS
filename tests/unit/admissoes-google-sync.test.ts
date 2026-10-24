import { describe, expect, it, vi } from "vitest";
import { GoogleSyncService, type GoogleSyncStore } from "../../api/src/admissoes/google-sync.service.js";

const input = {
  empresaId: "empresa-ficticia-1",
  processoId: "processo-ficticio-1",
  driveRootFolderId: "pasta-raiz-ficticia"
};

function criarStore(overrides: Partial<GoogleSyncStore> = {}) {
  const sincronizacao = {
    id: "sync-ficticia-1",
    processoId: input.processoId,
    empresaId: input.empresaId,
    tentativa: 1,
    status: "processando"
  } as never;
  const dependente = { id: "controle-dependente-1" } as never;
  const arquivo = { id: "controle-arquivo-1" } as never;
  return {
    obterOuCriarSincronizacao: vi.fn().mockResolvedValue(sincronizacao),
    reivindicarSincronizacao: vi.fn().mockResolvedValue(sincronizacao),
    concluirSincronizacao: vi.fn().mockResolvedValue(sincronizacao),
    falharSincronizacao: vi.fn().mockResolvedValue(sincronizacao),
    atualizarPastaColaborador: vi.fn().mockResolvedValue(sincronizacao),
    obterOuCriarDependente: vi.fn().mockResolvedValue(dependente),
    obterOuCriarArquivo: vi.fn().mockResolvedValue(arquivo),
    atualizarArquivo: vi.fn().mockResolvedValue(arquivo),
    atualizarDependente: vi.fn().mockResolvedValue(dependente),
    concluirDependente: vi.fn().mockResolvedValue(dependente),
    falharDependente: vi.fn().mockResolvedValue(dependente),
    falharArquivo: vi.fn().mockResolvedValue(arquivo),
    atualizarLinhaColaborador: vi.fn().mockResolvedValue(sincronizacao),
    ...overrides
  } satisfies GoogleSyncStore;
}

describe("controle de sincronizacao Google da admissao", () => {
  it("recupera o mesmo controle para chamadas repetidas do processo", async () => {
    const store = criarStore();
    const service = new GoogleSyncService(store);

    const primeiro = await service.obterOuCriar(input);
    const segundo = await service.obterOuCriar(input);

    expect(primeiro?.id).toBe(segundo?.id);
    expect(store.obterOuCriarSincronizacao).toHaveBeenCalledTimes(2);
  });

  it("não inicia duas tentativas concorrentes quando a segunda não consegue a lease", async () => {
    const store = criarStore({
      reivindicarSincronizacao: vi
        .fn()
        .mockResolvedValueOnce({ id: "sync-ficticia-1", tentativa: 1 })
        .mockResolvedValueOnce(null)
    });
    const service = new GoogleSyncService(store);
    const trabalho = vi.fn().mockResolvedValue("ok");

    const primeira = await service.executarTentativa(input, trabalho);
    const segunda = await service.executarTentativa(input, trabalho);

    expect(primeira.status).toBe("concluida");
    expect(segunda).toEqual({ status: "em_andamento", sincronizacaoId: "sync-ficticia-1" });
    expect(trabalho).toHaveBeenCalledTimes(1);
  });

  it("mantém controles idempotentes para dependentes e anexos", async () => {
    const store = criarStore();
    const service = new GoogleSyncService(store);
    const contexto = await service.executarTentativa(input, async (ctx) => {
      const dependenteInput = {
        sincronizacaoId: "sync-ficticia-1",
        empresaId: input.empresaId,
        processoId: input.processoId,
        dependenteId: "dependente-ficticio-1"
      };
      const arquivoInput = {
        sincronizacaoId: "sync-ficticia-1",
        empresaId: input.empresaId,
        processoId: input.processoId,
        origem: "dependente" as const,
        dependenteId: dependenteInput.dependenteId,
        dependenteAnexoId: "anexo-ficticio-1",
        tipoDocumento: "cpf"
      };
      const dependenteA = await ctx.salvarDependente(dependenteInput);
      const dependenteB = await ctx.salvarDependente(dependenteInput);
      const arquivoA = await ctx.salvarArquivo(arquivoInput);
      const arquivoB = await ctx.salvarArquivo(arquivoInput);
      return { dependenteA, dependenteB, arquivoA, arquivoB };
    });

    expect(contexto.status).toBe("concluida");
    expect(store.obterOuCriarDependente).toHaveBeenCalledTimes(2);
    expect(store.obterOuCriarArquivo).toHaveBeenCalledTimes(2);
  });

  it("registra falha parcial e permite uma nova tentativa sem apagar a pasta criada", async () => {
    const store = criarStore();
    const service = new GoogleSyncService(store);
    const pastaId = "pasta-colaborador-ficticia";

    await expect(
      service.executarTentativa(input, async (ctx) => {
        await ctx.salvarPastaColaborador(pastaId);
        throw new Error("erro interno não exposto");
      })
    ).rejects.toMatchObject({ code: "GOOGLE_SYNC_FAILED" });

    expect(store.atualizarPastaColaborador).toHaveBeenCalledWith(
      "sync-ficticia-1",
      input.empresaId,
      expect.any(String),
      pastaId
    );
    expect(store.falharSincronizacao).toHaveBeenCalledWith(
      "sync-ficticia-1",
      input.empresaId,
      expect.any(String),
      expect.objectContaining({ codigo: "GOOGLE_SYNC_FAILED", mensagem: "A sincronizacao de admissao falhou." })
    );
  });

  it("persiste o resultado de arquivo e os identificadores de linha/metadado", async () => {
    const store = criarStore();
    const service = new GoogleSyncService(store);

    await service.executarTentativa(input, async (ctx) => {
      await ctx.salvarResultadoArquivo("controle-arquivo-1", {
        pastaId: "pasta-ficticia",
        arquivoId: "arquivo-ficticio",
        link: "https://drive.google.com/file/d/arquivo-ficticio/view"
      });
      await ctx.salvarResultadoDependente("controle-dependente-1", {
        pastaId: "pasta-dependente-ficticia",
        linha: 42,
        metadataId: "metadata-ficticio"
      });
      await ctx.salvarLinhaColaborador(41, "metadata-colaborador-ficticio");
    });

    expect(store.atualizarArquivo).toHaveBeenCalledTimes(1);
    expect(store.atualizarDependente).toHaveBeenCalledWith("controle-dependente-1", {
      pastaId: "pasta-dependente-ficticia",
      linha: 42,
      metadataId: "metadata-ficticio"
    });
    expect(store.atualizarLinhaColaborador).toHaveBeenCalledWith("sync-ficticia-1", {
      linha: 41,
      metadataId: "metadata-colaborador-ficticio"
    });
  });
});
