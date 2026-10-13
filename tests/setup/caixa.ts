import { randomUUID } from "node:crypto";
import { expect, onTestFinished } from "vitest";
import type { FastifyInstance } from "fastify";
import { cookieSessao } from "./auth.js";
import { idsTeste } from "./contexto.js";
import { consultarUm, executarSql, json } from "./integracao.js";

const arquivoPngMinimo = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");

function multipartAnexoFechamento(tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare") {
  const boundary = `----padaria-caixa-${randomUUID()}`;
  const inicio = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="tipo"\r\n\r\n${tipo}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${tipo}.png"\r\n` +
      "Content-Type: image/png\r\n\r\n"
  );
  const fim = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { boundary, corpo: Buffer.concat([inicio, arquivoPngMinimo, fim]) };
}

// Alguns arquivos exercitam um ciclo completo com o admin como OPERADOR. O seed, por outro lado,
// tambem mantem um caixa aberto do admin para os testes de status/historico. Esses dois cenarios nao
// podem coexistir sob a R-186; o arquivo que nao testa o caixa seed deve libera-lo explicitamente.
export async function encerrarCaixaSeedAdminParaTeste() {
  await executarSql(
    `update fechamentos_caixa
     set status = 'fechado',
         data_hora_fechamento = coalesce(data_hora_fechamento, now()),
         fechado_em = coalesce(fechado_em, now()),
         fechado_por = coalesce(fechado_por, usuario_caixa_id)
     where id = $1 and status = 'aberto'`,
    [idsTeste.caixaAberto]
  );
}

export function registrarEncerramentoCaixaParaTeste(caixaId: string) {
  if (caixaId === idsTeste.caixaAberto || caixaId === idsTeste.caixaAbertoEntradas) {
    throw new Error("Caixa seed compartilhado nao pode ser registrado como fixture descartavel");
  }
  onTestFinished(async () => {
    // Isolamento da fixture, nao caminho de negocio: alguns testes terminam deliberadamente com
    // lock/pendencia e nao conseguiriam usar a rota de fechamento. O proximo `it` nao pode herdar
    // um caixa aberto que existe apenas para o caso anterior (R-186).
    await executarSql(
      `update fechamentos_caixa
       set status = 'fechado',
           data_hora_fechamento = coalesce(data_hora_fechamento, now()),
           fechado_em = coalesce(fechado_em, now()),
           fechado_por = coalesce(fechado_por, usuario_caixa_id)
       where id = $1 and status <> 'fechado'`,
      [caixaId]
    );
  });
}

// Fixture de caixa PROPRIO por caso, extraida do padrao que ja vivia copiado em quatro arquivos
// (caixa-edicao-concorrente, retaguarda-sem-caixa, retaguarda-pos-fechamento, caixa-venda-integrada).
//
// Por que a fixture propria e OBRIGATORIA nos testes de corrida:
//  - `idsTeste.caixaAberto` e patrimonio de varios testes; fechar um caixa compartilhado dentro de
//    um caso quebra todos os arquivos que dependem dele;
//  - `fechamentos_caixa_pdv_aberto_unico_idx` proibe segundo caixa aberto no mesmo PDV, entao cada
//    caso cria conta + PDV proprios (o `pdvLivre` e reservado aos testes que ABREM caixa nele);
//  - R-186 proibe segundo caixa aberto do mesmo operador. A fixture registra uma limpeza restrita
//    ao ID que criou para o caso seguinte nao herdar estado operacional artificial.
export async function abrirCaixaDoOperador(
  app: FastifyInstance,
  entrada: {
    cookieAdmin: string;
    // Quando o caso exercita a abertura, o malote precisa ter sido enviado por outro perfil:
    // quem enviou nao pode confirmar a propria transferencia abrindo o caixa.
    cookieRemetente?: string;
    cookieOperador: string;
    emailOperador: string;
    nome: string;
    dataHoraAbertura?: string;
    empresaId?: string;
    // Integrações que testam um vínculo externo precisam criar o PDV antes da abertura.
    // Os dois IDs são sempre informados juntos para não montar uma conta/PDV incoerente.
    contaId?: string;
    pdvId?: string;
    valorAbertura?: number;
    lacresRetorno?: string[];
    lacreRetorno?: string;
    lacreFechamento?: string;
    // Alguns cenarios verificam o vinculo de uma maquininha previamente cadastrada.
    maquininhaId?: string;
    // Suites que compartilham um unico caixa no beforeAll deixam o container
    // descartar o estado ao final; onTestFinished so e valido dentro de um it.
    registrarLimpeza?: boolean;
  }
): Promise<{
  caixaId: string;
  contaId: string;
  pdvId: string;
  usuarioId: string;
  lacreRetorno: string;
  lacreFechamento: string;
}> {
  const empresaId = entrada.empresaId ?? idsTeste.empresaA;
  if (Boolean(entrada.contaId) !== Boolean(entrada.pdvId)) {
    throw new Error("Fixture de abertura exige contaId e pdvId juntos");
  }
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
    entrada.emailOperador
  ]);
  if (!usuario) throw new Error(`Usuario ${entrada.emailOperador} nao encontrado`);

  // R-165: a conta do PDV nasce com fundo porque os casos que usam esta fixture LANCAM SAIDAS por
  // ela (despesa, retirada, mercadoria, transferencia). O fundo nao interfere no que eles provam —
  // eles medem a corrida contra o FECHAMENTO, e o saldo do caixa (ADR-001) e apurado por
  // entradas - saidas do fechamento, sem olhar o fundo da conta.
  let contaId = entrada.contaId;
  let pdvId = entrada.pdvId;
  if (!contaId || !pdvId) {
    const conta = await app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: entrada.cookieAdmin },
      payload: { empresaId, nome: `Conta ${entrada.nome}`, saldoInicial: 100_000, usuariosIds: [usuario.id] }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: entrada.cookieAdmin },
      payload: { empresaId, nome: `PDV ${entrada.nome}`, contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    pdvId = json<{ data: { id: string } }>(pdv).data.id;
  }

  // A abertura da referencia 5174 sempre registra a maquininha vinculada e consome um malote
  // pendente identificado por lacre. A fixture precisa montar esse estado pelo mesmo contrato
  // publico: sem isso, todos os testes que dependem de um caixa proprio falham antes de provar
  // a regra que vieram testar.
  let maquininhaId = entrada.maquininhaId;
  if (!maquininhaId) {
    const maquininha = await app.inject({
      method: "POST",
      url: "/api/maquininhas",
      headers: { cookie: entrada.cookieAdmin },
      payload: {
        empresaId,
        numeroSerie: `TESTE-ABERTURA-${pdvId}`,
        apelido: `Maquininha ${entrada.nome}`,
        ativo: true
      }
    });
    expect(maquininha.statusCode, maquininha.body).toBe(201);
    maquininhaId = json<{ data: { id: string } }>(maquininha).data.id;
  }

  const lacreAbertura = `TESTE-ABERTURA-${pdvId}`;
  const lacresRetorno = entrada.lacresRetorno ?? [entrada.lacreRetorno ?? `TESTE-RETORNO-${pdvId}`];
  const lacreRetorno = lacresRetorno[0]!;
  const lacreFechamento = entrada.lacreFechamento ?? `TESTE-FECHAMENTO-${pdvId}`;
  const valorAbertura = entrada.valorAbertura ?? 100;
  // A Tesouraria e a origem normal do malote. Nunca use o administrador como atalho quando ele
  // tambem e o operador deste caso: a regra de producao corretamente impede que quem enviou
  // confirme o proprio recebimento. Casos que precisam provar outro remetente continuam podendo
  // declara-lo explicitamente.
  const cookieRemetente = entrada.cookieRemetente ?? (await cookieSessao(app, "tesouraria"));
  const transferencia = await app.inject({
    method: "POST",
    url: "/api/transferencias",
    headers: { cookie: cookieRemetente },
    payload: {
      empresaId,
      dataReferencia: "2026-07-31",
      descricao: `Fundo de abertura ${entrada.nome}`,
      valorOriginal: valorAbertura,
      valorEspecieDeclarado: valorAbertura,
      valorMoedasDeclarado: 0,
      // Bolsas/lacres de retorno so podem acompanhar o malote Cofre -> Caixa.
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: lacreAbertura,
      lacresRetorno,
      lacreFechamentoPlanejado: lacreFechamento
    }
  });
  expect(transferencia.statusCode, transferencia.body).toBe(201);

  const abertura = await app.inject({
    method: "POST",
    url: "/api/caixa/abrir",
    headers: { cookie: entrada.cookieOperador },
    payload: {
      empresaId,
      pdvId,
      usuarioCaixaId: usuario.id,
      dataHoraAbertura: entrada.dataHoraAbertura ?? "2026-07-31T08:00",
      maquininhaId,
      lacreAbertura,
      caixaResponsavelNome: entrada.nome,
      supervisorResponsavelNome: "Supervisor de teste"
    }
  });
  expect(abertura.statusCode, abertura.body).toBe(201);
  const caixaId = json<{ data: { id: string } }>(abertura).data.id;
  if (entrada.registrarLimpeza !== false) registrarEncerramentoCaixaParaTeste(caixaId);

  return { caixaId, contaId, pdvId, usuarioId: usuario.id, lacreRetorno, lacreFechamento };
}

/**
 * Leva um caixa aberto ate a ultima etapa antes da contagem/fechamento, usando as mesmas rotas
 * publicas da operacao: inicia o fechamento, anexa a folha e os dois comprovantes, gera CREARE e
 * salva a leitura completa da maquininha. Nao fecha o caixa nem escolhe a contagem fisica.
 */
export async function prepararFechamentoValido(
  app: FastifyInstance,
  entrada: { cookieOperador: string; caixaId: string }
) {
  const inicio = await app.inject({
    method: "POST",
    url: `/api/caixa/${entrada.caixaId}/iniciar-fechamento`,
    headers: { cookie: entrada.cookieOperador },
    payload: {}
  });
  expect(inicio.statusCode, inicio.body).toBe(200);

  async function anexar(tipo: "folha_fechamento" | "comprovante_cartao" | "relatorio_vendas_creare") {
    const { boundary, corpo } = multipartAnexoFechamento(tipo);
    const resposta = await app.inject({
      method: "POST",
      url: `/api/caixa/${entrada.caixaId}/anexos`,
      headers: { cookie: entrada.cookieOperador, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  const folhaId = await anexar("folha_fechamento");
  const anexoMaquininhaId = await anexar("comprovante_cartao");
  const anexoCreareId = await anexar("relatorio_vendas_creare");
  const relatorioVendas = await app.inject({
    method: "POST",
    url: `/api/caixa/${entrada.caixaId}/relatorio-vendas`,
    headers: { cookie: entrada.cookieOperador },
    payload: {
      anexoId: anexoCreareId,
      leituraCreare: {
        documentoLegivel: true,
        totalBruto: 0,
        dinheiro: 0,
        credito: 0,
        debito: 0,
        pix: 0,
        voucher: 0,
        despesasExcetoSangria: 0,
        resultadoFinal: 0
      }
    }
  });
  expect(relatorioVendas.statusCode, relatorioVendas.body).toBe(200);

  const leitura = {
    documentoLegivel: true,
    numeroMaquininha: null,
    dataEmissao: null,
    acumulador: 0,
    credito: 0,
    debito: 0,
    pix: 0,
    voucher: 0,
    detalhes: { credito: [], debito: [], pix: [], voucher: [] },
    camposDuvidosos: [],
    observacoes: []
  };
  const relatorioMaquininha = await app.inject({
    method: "PUT",
    url: `/api/caixa/${entrada.caixaId}/relatorio-maquininha`,
    headers: { cookie: entrada.cookieOperador },
    payload: { anexoId: anexoMaquininhaId, leituraAcumulada: leitura }
  });
  expect(relatorioMaquininha.statusCode, relatorioMaquininha.body).toBe(200);
  return { folhaId, anexoMaquininhaId, anexoCreareId };
}

/**
 * Prepara o dossie obrigatorio e devolve a contagem que representa o fisico mostrado pelo proprio
 * Caixa antes do corte. E a unica fixture para suites que precisam disparar o fechamento dentro
 * de uma corrida: nao inventa lacre, nao manda `NaN` e nao esconde uma divergencia real.
 */
export async function prepararPayloadFechamentoValido(
  app: FastifyInstance,
  entrada: {
    cookieOperador: string;
    caixaId: string;
    empresaId?: string;
    caixaResponsavelNome?: string;
    supervisorResponsavelNome?: string;
    observacao?: string;
  }
) {
  const empresaId = entrada.empresaId ?? idsTeste.empresaA;
  const status = await app.inject({
    method: "GET",
    url: `/api/caixa/status?empresaId=${empresaId}`,
    headers: { cookie: entrada.cookieOperador }
  });
  expect(status.statusCode, status.body).toBe(200);
  const dadosStatus = json<{
    data: { caixaAberto: { id: string } | null; resumo: { saldo: number } | null; lacreFechamentoReservado: string | null };
  }>(status).data;
  if (dadosStatus.caixaAberto?.id !== entrada.caixaId) {
    throw new Error(`Fixture de fechamento esperava o caixa ${entrada.caixaId} aberto para o operador`);
  }
  if (!dadosStatus.lacreFechamentoReservado) {
    throw new Error("Fixture de fechamento sem lacre reservado pelo malote de abertura");
  }
  const saldo = dadosStatus.resumo?.saldo;
  if (typeof saldo !== "number" || !Number.isFinite(saldo) || saldo < 0) {
    throw new Error("Fixture de fechamento recebeu saldo fisico invalido; o cenario deve corrigir a saida antes de fechar");
  }

  await prepararFechamentoValido(app, entrada);
  return {
    lacreFechamento: dadosStatus.lacreFechamentoReservado,
    caixaResponsavelNome: entrada.caixaResponsavelNome ?? "Operador de teste",
    supervisorResponsavelNome: entrada.supervisorResponsavelNome ?? "Supervisor de teste",
    valorEspecieFechamento: saldo,
    valorMoedasFechamento: 0,
    observacao: entrada.observacao ?? "Fechamento fisico da fixture"
  };
}

/** Cria um retorno/sangria com a bolsa retornavel recebida na abertura do mesmo caixa. */
export async function criarRetornoValido(
  app: FastifyInstance,
  entrada: { cookieOperador: string; caixaId: string; valor: number; responsavelNome?: string }
) {
  const lacres = await app.inject({
    method: "GET",
    url: `/api/caixa/${entrada.caixaId}/lacres-retorno`,
    headers: { cookie: entrada.cookieOperador }
  });
  expect(lacres.statusCode, lacres.body).toBe(200);
  const lacre = json<{ data: Array<{ id: string; numero: string }> }>(lacres).data[0];
  if (!lacre) throw new Error("Fixture sem lacre de retorno disponivel");

  const resposta = await app.inject({
    method: "POST",
    url: `/api/caixa/${entrada.caixaId}/transferencia-cofre`,
    headers: { cookie: entrada.cookieOperador },
    payload: {
      valor: entrada.valor,
      valorEspecie: entrada.valor,
      valorMoedas: 0,
      lacreId: lacre.id,
      responsavelNome: entrada.responsavelNome ?? "Operador de teste",
      observacao: "Retorno de teste",
      idempotenciaChave: randomUUID()
    }
  });
  expect(resposta.statusCode, resposta.body).toBe(200);
  return { lacre, resposta: json<{ data: { id?: string } }>(resposta).data };
}

/**
 * Prova de "nao escreveu" especifica do caixa: os sete totais congelados + a contagem de filhos por
 * `caixa_id`. Um unico SELECT, com os numericos em texto para a comparacao ser estavel.
 */
export async function universoDoCaixa(caixaId: string) {
  return consultarUm<Record<string, string | number | null>>(
    `select
       f.status,
       f.saldo::text                         as saldo,
       f.total_entradas::text                as total_entradas,
       f.total_transferencias::text          as total_transferencias,
       f.total_transferencias_entrada::text  as total_transferencias_entrada,
       f.total_transferencias_saida::text    as total_transferencias_saida,
       f.total_despesas::text                as total_despesas,
       f.total_retiradas::text               as total_retiradas,
       f.total_mercadorias::text             as total_mercadorias,
       (select count(*)::int from vendas v         where v.caixa_id = f.id) as vendas,
       (select count(*)::int from despesas d       where d.caixa_id = f.id) as despesas,
       (select count(*)::int from mercadorias m    where m.caixa_id = f.id) as mercadorias,
       (select count(*)::int from retiradas r      where r.caixa_id = f.id) as retiradas,
       (select count(*)::int from transferencias t where t.caixa_id = f.id) as transferencias,
       (select count(*)::int from alteracoes_pos_fechamento_caixa a where a.fechamento_caixa_id = f.id) as trilha_pos_fechamento,
       (select count(*)::int from quebras_caixa q  where q.fechamento_caixa_id = f.id) as quebras
     from fechamentos_caixa f
     where f.id = $1`,
    [caixaId]
  );
}
