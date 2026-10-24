import { rm } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import { ROTAS_EXPORTACAO_QUESTOR } from "@padaria/shared/conplus";
import type * as ModuloArquivos from "../../../api/src/conplus/questor-arquivos.js";
import type * as ModuloExportacoes from "../../../api/src/conplus/questor-exportacoes.repository.js";
import { caminhoAbsolutoDocumento } from "../../../api/src/lancamentos/foto-documento.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * Falhas no meio da geração: o storage recusa gravar, ou o banco falha ao registrar a auditoria.
 * Nos dois casos a resposta é erro e NENHUMA auditoria aponta para arquivo inexistente.
 */
const falhas = vi.hoisted(() => ({ disco: false, banco: false }));

vi.mock("../../../api/src/conplus/questor-arquivos.js", async (original) => {
  const modulo = await original<typeof ModuloArquivos>();
  return {
    ...modulo,
    gravarArquivoExportacaoQuestor: async (caminho: string, conteudo: string) => {
      if (falhas.disco) throw new Error("ENOSPC simulado: disco cheio");
      return modulo.gravarArquivoExportacaoQuestor(caminho, conteudo);
    }
  };
});

vi.mock("../../../api/src/conplus/questor-exportacoes.repository.js", async (original) => {
  const modulo = await original<typeof ModuloExportacoes>();
  return {
    ...modulo,
    registrarExportacaoQuestorRepository: async (
      ...args: Parameters<typeof modulo.registrarExportacaoQuestorRepository>
    ) => {
      if (falhas.banco) throw new Error("conexão perdida simulada");
      return modulo.registrarExportacaoQuestorRepository(...args);
    }
  };
});

describe("exportações Questor — falhas durante a geração", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  const processo = "11111111-1111-4111-8111-11111111e801";
  const turno = "11111111-1111-4111-8111-11111111e802";

  const gerarTecnico = () =>
    contexto.app.inject({
      method: "POST",
      url: ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico,
      headers: { cookie: cookieDp },
      payload: { processoIds: [processo], confirmacaoArquivoTecnico: true }
    });
  const auditorias = async () =>
    (await consultarUm<{ n: number }>("select count(*)::int n from questor_exportacoes where empresa_id = $1", [
      idsTeste.empresaA
    ]))!.n;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    const dp = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [usuariosTeste.caixa.email]);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [dp!.id, JSON.stringify(regrasPermissoes(permissoesPorCargo["DP"] as Permissao[]))]
    );
    cookieDp = await cookieSessao(contexto.app, "caixa");
    const usuarioId = (await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios limit 1"))!
      .usuario_id;
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno Falhas', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
      [turno, idsTeste.empresaA]
    );
    await executarSql(
      `insert into admissoes_processos (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       values ($1, $2, 'admissao_direta', null, 'Pessoa Ficticia Falhas', '98765432100', $3, $4, $5, $5) on conflict do nothing`,
      [processo, idsTeste.empresaA, idsTeste.funcaoOperacionalA, turno, usuarioId]
    );
    await executarSql(
      `insert into admissoes_processos_ficha (empresa_id, processo_id, situacao, versao, sem_dependentes, enviado_em, revisado_em, revisado_por,
          aviso_aceito_em, aviso_privacidade_versao)
       values ($1, $2, 'aprovada', 2, true, now(), now(), $3, now(), 'v1') on conflict do nothing`,
      [idsTeste.empresaA, processo, usuarioId]
    );
  }, 180_000);

  beforeEach(() => {
    falhas.disco = false;
    falhas.banco = false;
  });

  afterAll(async () => {
    await executarSql("delete from questor_auditoria where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from questor_exportacoes_admissoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from questor_exportacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from admissoes_processos where id = $1", [processo]);
    await executarSql("delete from turnos where id = $1", [turno]);
    await rm(caminhoAbsolutoDocumento(`questor-exportacoes/${idsTeste.empresaA}`), { recursive: true, force: true });
    await contexto.fechar();
  });

  it("storage falha: 500, nenhuma auditoria gravada", async () => {
    falhas.disco = true;
    const resposta = await gerarTecnico();
    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain("ENOSPC");
    expect(await auditorias()).toBe(0);
  });

  it("banco falha ao registrar: 500, nenhuma auditoria; a próxima tentativa funciona e reaproveita o arquivo", async () => {
    falhas.banco = true;
    expect((await gerarTecnico()).statusCode).toBe(500);
    expect(await auditorias()).toBe(0);
    falhas.banco = false;
    const recuperada = await gerarTecnico();
    expect(recuperada.statusCode, recuperada.body).toBe(200);
    expect(await auditorias()).toBe(1);
  });
});
