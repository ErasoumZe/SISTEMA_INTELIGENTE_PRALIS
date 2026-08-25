// T-8 da #41 · ISOLAMENTO ENTRE EMPRESAS.
//
// A chave unica da R-175 comeca por `empresa_id`:
//   unique (empresa_id, identificador_externo) where integracao_chave_id is not null
//                                                and identificador_externo is not null
//
// Logo o MESMO `idVenda` em duas empresas sao duas vendas LEGITIMAS, nao uma duplicata. Isso
// importa de verdade: o identificador vem do PDV, e nada garante que duas padarias da rede nao
// emitam o mesmo numero de venda no mesmo dia.
//
// Nenhum dos tres arquivos RED cobria isto — o buraco foi achado na auditoria read-only registrada
// em PRE-GREEN-ISSUE-41-IDEMPOTENCIA.md. Este arquivo e a mutacao "buscar a venda sem filtrar
// empresa_id" morrendo: sem o filtro, a ingestao da empresa B encontraria a venda da empresa A e
// responderia "atualizado" em vez de criar a dela.
//
// Usa o usuario `multiempresa` (usuario_admin, vinculado as duas empresas no seed) porque o `admin`
// so tem a empresa A.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

const DATA_VENDA = "2026-06-30T14:00:00.000Z";
// O MESMO identificador nas duas empresas — e esse o ponto do arquivo.
const VENDA = "R41-ISOLAMENTO-MESMO-ID";

type Resposta = { statusCode: number; body: string; json: () => unknown };

interface Empresa {
  id: string;
  pdvExterno: string;
  chaveId: string;
  codigo: string;
}

function payloadVenda(idVenda: string, pdvExterno: string, valor: number) {
  return {
    DadosIntegracao: { origem: "vitest-r41-isolamento" },
    Venda: {
      idVenda,
      idCaixa: pdvExterno,
      nomeCaixa: `PDV ${pdvExterno}`,
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      dataHoraVenda: DATA_VENDA,
      valorOriginal: valor,
      desconto: 0,
      acrescimo: 0,
      valorTotal: valor,
      statusVenda: "aprovado",
      numeroNotaFiscal: null
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-${pdvExterno}-ITEM-1`,
        idProduto: `PROD-${pdvExterno}`,
        descricaoProduto: `Pao (${pdvExterno})`,
        dataHoraItem: DATA_VENDA,
        quantidade: 1,
        valorUnitario: valor,
        total: valor,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor }]
  };
}

describe("#41 · isolamento entre empresas (T-8)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  let empresaA: Empresa;
  let empresaB: Empresa;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");

    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.multiempresa.email
    ]);
    if (!usuario) throw new Error("Usuario multiempresa nao encontrado");

    empresaA = await prepararEmpresa(idsTeste.empresaA, "A", usuario.id);
    empresaB = await prepararEmpresa(idsTeste.empresaB, "B", usuario.id);
    expect(empresaA.chaveId).not.toBe(empresaB.chaveId);
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criar(url: string, payload: object) {
    const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  /** Conta + PDV + vinculo + caixa aberto + chave de integracao propria da empresa. */
  async function prepararEmpresa(empresaId: string, sufixo: string, usuarioId: string): Promise<Empresa> {
    const pdvExterno = `PDV-41-ISOLAMENTO-${sufixo}`;

    const conta = await criar("/api/contas", { empresaId, nome: `Conta R41 isolamento ${sufixo}` });
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await criar("/api/pdvs", {
      empresaId,
      nome: `PDV R41 isolamento ${sufixo}`,
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie },
      payload: {
        empresaId,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: pdvExterno,
        descricaoExterna: `PDV isolamento ${sufixo}`,
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    await criar("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: usuarioId,
      dataHoraAbertura: "2026-06-29T08:00",
      observacao: `Caixa R41 isolamento ${sufixo}`
    });

    const chave = await criar("/api/integracoes/chaves", { empresaId, tipo: "vendas" });
    const chaveId = json<{ data: { id: string } }>(chave).data.id;
    const linha = await consultarUm<{ codigo: string }>("select codigo from integracoes_chaves where id = $1", [
      chaveId
    ]);
    if (!linha) throw new Error("Chave criada nao encontrada");

    return { id: empresaId, pdvExterno, chaveId, codigo: linha.codigo };
  }

  function enviar(empresa: Empresa, valor: number): Promise<Resposta> {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": empresa.codigo },
      payload: payloadVenda(VENDA, empresa.pdvExterno, valor)
    });
  }

  async function vendasDe(identificadorExterno: string) {
    return consultarTodos<{ id: string; empresa_id: string; valor_original: string }>(
      "select id, empresa_id, valor_original from vendas where identificador_externo = $1 order by empresa_id",
      [identificadorExterno]
    );
  }

  // Valores diferentes de proposito: se uma ingestao sobrescrever a outra, a soma denuncia.
  it("o mesmo idVenda em empresas diferentes gera DUAS vendas legitimas", async () => {
    const respostaA = await enviar(empresaA, 11);
    expect(respostaA.statusCode, respostaA.body).toBe(200);
    expect(json<{ data: { status: string } }>(respostaA).data.status).toBe("criado");

    const respostaB = await enviar(empresaB, 22);
    expect(
      respostaB.statusCode,
      `a empresa B nao pode ser recusada por um identificador que e da empresa A: ${respostaB.body}`
    ).toBe(200);
    expect(
      json<{ data: { status: string } }>(respostaB).data.status,
      "para a empresa B esta venda e INEDITA — tem de ser 'criado', nunca 'atualizado'"
    ).toBe("criado");

    const linhas = await vendasDe(VENDA);
    expect(linhas.length, `esperadas DUAS vendas (uma por empresa) para ${VENDA}; encontradas ${linhas.length}`).toBe(
      2
    );
    expect(new Set(linhas.map((linha) => linha.empresa_id))).toEqual(new Set([idsTeste.empresaA, idsTeste.empresaB]));

    const porEmpresa = new Map(linhas.map((linha) => [linha.empresa_id, Number(linha.valor_original)]));
    expect(porEmpresa.get(idsTeste.empresaA), "a venda da empresa A nao pode ter sido sobrescrita").toBe(11);
    expect(porEmpresa.get(idsTeste.empresaB), "a venda da empresa B nao pode ter sido sobrescrita").toBe(22);
  });

  it("reenviar em UMA empresa nao mexe na venda da outra", async () => {
    const reenvio = await enviar(empresaA, 11);
    expect(reenvio.statusCode, reenvio.body).toBe(200);
    expect(json<{ data: { status: string } }>(reenvio).data.status).toBe("sem_novidade");

    const linhas = await vendasDe(VENDA);
    expect(linhas.length, "o reenvio na empresa A nao pode criar nem apagar venda na empresa B").toBe(2);
    const porEmpresa = new Map(linhas.map((linha) => [linha.empresa_id, Number(linha.valor_original)]));
    expect(porEmpresa.get(idsTeste.empresaB)).toBe(22);
  });

  it("cada empresa tem o SEU registro de integracao, apontando para a SUA venda", async () => {
    const linhas = await vendasDe(VENDA);
    const vendaPorEmpresa = new Map(linhas.map((linha) => [linha.empresa_id, linha.id]));

    const registros = await consultarTodos<{ empresa_id: string; registro_sistema_id: string }>(
      `select empresa_id, registro_sistema_id
         from integracoes_registros
        where identificador_externo = $1 and tipo_registro = 'venda'`,
      [VENDA]
    );

    expect(registros.length, "um registro por empresa").toBe(2);
    for (const registro of registros) {
      expect(
        registro.registro_sistema_id,
        `o registro da empresa ${registro.empresa_id} tem de apontar para a venda DELA`
      ).toBe(vendaPorEmpresa.get(registro.empresa_id));
    }
  });
});
