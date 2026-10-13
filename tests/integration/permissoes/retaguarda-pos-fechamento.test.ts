import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaNegocio } from "@padaria/shared/datas";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, prepararPayloadFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json, snapshotDoLancamento, universoDeLancamentos } from "../../setup/integracao.js";

// DECISAO A-4, ressalva do Jose (11/08/2026) — "caixas fechados e os sete totais congelados nunca
// sao alterados". O recalculo do `caixa_id` na edicao vale APENAS enquanto o caixa alcancavel e um
// caixa ABERTO do proprio ator; depois do fechamento, a edicao pela retaguarda e recusada e nada e
// escrito. A regra ja existia (`validarEdicaoDeSaidaDaRetaguarda` recusa `caixa_id` de caixa que nao
// e o aberto do ator), mas nenhum teste a atingia pelo caminho completo: lancamento REAL no caixa do
// proprio ator -> fechamento REAL pela rota -> tentativa de edicao pela retaguarda. Este arquivo
// fecha essa lacuna. E arquivo proprio de proposito: `retaguarda-sem-caixa.test.ts` ja esta no teto
// de tamanho e prova os outros dois estados da mesma regra (caixa aberto e sem caixa).
//
// O fechamento aqui e pela ROTA (`POST /api/caixa/:id/fechar`), nunca por UPDATE de status: e o
// fechamento real que congela os sete totais e grava `fechado_por`/`data_hora_fechamento` — um
// UPDATE nao produziria o estado que a regra protege, e o teste passaria provando outra coisa.
describe("CX-M06 A-4 - caixa fechado pela rota real fica intocavel para a edicao da retaguarda", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieGerente = "";
  let cookieMultiempresa = "";
  let caixaFechado = "";
  let lacreFechamento = "";
  let contaDoPdv = "";
  // POSTERIOR ao caixa aberto do seed (2026-06-30): o desempate de `buscarCaixaAbertoUsuario` e por
  // `criado_em desc`, mas manter tambem a data de abertura mais recente tira o cenario da dependencia
  // de um detalhe de ordenacao do repositorio.
  const dataReferencia = "2026-07-15";
  const pagoEm = diaNegocio(new Date());

  // Um id por entidade, gravado no setup e editado nos testes.
  const lancamentos: Record<string, string> = {};

  const rotas = [
    [
      "despesa",
      "/api/despesas",
      { grupoDespesaId: idsTeste.grupoDespesaOperacional, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor, temNotaFiscal: false }
    ],
    [
      "retirada",
      "/api/retiradas",
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const;

  // Os SETE totais congelados pelo fechamento (P0-CAIXA doc, `atualizarFechamentoCaixaRepository`),
  // mais o que prova que o fechamento foi real. Congelados aqui, comparados apos cada recusa.
  const colunasDoFechamento =
    "status, saldo, total_entradas, total_transferencias, total_transferencias_entrada, " +
    "total_transferencias_saida, total_despesas, total_retiradas, total_mercadorias, " +
    "fechado_por, data_hora_fechamento";
  const fechamento = () =>
    consultarUm<Record<string, unknown>>(`select ${colunasDoFechamento} from fechamentos_caixa where id = $1`, [
      caixaFechado
    ]);
  let fechamentoCongelado: Record<string, unknown> | null = null;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieMultiempresa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "multiempresa")
    ]);

    // O gerente e retaguarda pelo NOME do cargo, mas o cargo Gerencia do seed nao carrega as
    // permissoes das tres saidas. Sem a concessao, o PUT dele morreria no 403 de PERMISSAO antes de
    // alcancar a regra de caixa fechado — e este arquivo inteiro viraria falso-verde. Mesmo
    // mecanismo (ACRESCENTA na camada de usuario, nunca substitui) de `retaguarda-sem-caixa.test.ts`.
    const gerente = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.gerente.email]
    );
    if (!gerente) throw new Error("Usuario gerente nao encontrado");
    const regrasAtuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [gerente.usuario_id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: gerente.usuario_id,
        regras: {
          ...(regrasAtuais?.regras ?? {}),
          despesas_visualizar: true,
          despesas_editar: true,
          mercadorias_visualizar: true,
          mercadorias_editar: true,
          retiradas_visualizar: true,
          retiradas_editar: true
        }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);
    cookieGerente = await cookieSessao(contexto.app, "gerente");

    // Caixa proprio de um segundo operador: o admin conserva o caixa seed aberto para o contraste
    // de retaguarda abaixo, enquanto este ciclo temporario e aberto e fechado pela rota real.
    const criar = async (url: string, payload: object, cookie = cookieAdmin) => {
      const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
      expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
      return json<{ data: { id: string } }>(resposta).data.id;
    };

    contaDoPdv = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta PDV pos-fechamento" });
    const pdvId = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV pos-fechamento",
      contaId: contaDoPdv,
      ativo: true
    });
    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieMultiempresa,
      emailOperador: usuariosTeste.multiempresa.email,
      nome: "Caixa pos-fechamento",
      dataHoraAbertura: `${dataReferencia}T08:00`,
      contaId: contaDoPdv,
      pdvId,
      // O ciclo nasce no beforeAll e fecha pela rota neste mesmo hook; onTestFinished só existe dentro de it.
      registrarLimpeza: false
    });
    caixaFechado = abertura.caixaId;
    lacreFechamento = abertura.lacreFechamento;

    // Uma VENDA de 85 equilibra as tres saidas (40+15+30) para o caixa fechar com saldo zero — sem
    // quebra e sem retorno, que nao sao o assunto deste arquivo.
    await criar(
      "/api/vendas",
      {
        empresaId: idsTeste.empresaA,
        dataReferencia,
        dataPagamento: pagoEm,
        descricao: "Venda pos-fechamento",
        valorOriginal: 85,
        contaOrigemId: contaDoPdv,
        pdvId,
        colaboradorId: idsTeste.colaboradorMultiempresa,
        itensVenda: [
          { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: 85, valorTotal: 85 }
        ],
        tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: 85 }]
      },
      cookieMultiempresa
    );

    // As TRES saidas pela conta do PDV — o `caixa_id` tem de nascer preenchido (e o que o fechamento
    // vai congelar nos totais).
    const valores: Record<string, number> = { despesa: 40, mercadoria: 15, retirada: 30 };
    for (const [nome, rota, extras] of rotas) {
      const id = await criar(
        rota,
        {
          empresaId: idsTeste.empresaA,
          dataReferencia,
          dataVencimento: dataReferencia,
          dataPagamento: pagoEm,
          descricao: `CX-M06 pos-fechamento ${nome}`,
          valorOriginal: valores[nome],
          contaOrigemId: contaDoPdv,
          ...extras
        },
        cookieMultiempresa
      );
      lancamentos[nome] = id;
      expect(
        await consultarUm<{ caixa_id: string | null }>(`select caixa_id from ${nome}s where id = $1`, [id]),
        `${nome} deveria nascer vinculada ao caixa do ator`
      ).toEqual({ caixa_id: caixaFechado });
    }

    // FECHAMENTO PELA ROTA REAL. 204, dentro da mesma transacao que congela os totais.
    const fechamentoFisico = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieMultiempresa,
      caixaId: caixaFechado,
      caixaResponsavelNome: "Caixa pos-fechamento"
    });
    const fechar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaFechado}/fechar`,
      headers: { cookie: cookieMultiempresa },
      payload: {
        ...fechamentoFisico,
        lacreFechamento,
        observacao: "Fechamento do cenario pos-fechamento"
      }
    });
    expect(fechar.statusCode, fechar.body).toBe(204);

    fechamentoCongelado = await fechamento();
  }, 180_000);

  afterAll(async () => contexto.fechar());

  // PRE-CONDICAO 1: o fechamento foi real. `fechado_por` e `data_hora_fechamento` so existem pelo
  // servico; um UPDATE de status nao os produziria. Os sete totais congelados batem com o que foi
  // lancado — e sao exatamente estes valores que as recusas abaixo nao podem deixar mudar.
  it("Deve_TerCongeladoOsSeteTotaisPelaRotaReal_Quando_OCaixaFechou", async () => {
    expect(fechamentoCongelado).toMatchObject({
      status: "fechado",
      saldo: "0.00",
      total_entradas: "85.00",
      total_transferencias: "0.00",
      // Fundo de abertura e retorno final são físicos e auditáveis; não alteram as saídas do cenário.
      total_transferencias_entrada: "100.00",
      total_transferencias_saida: "100.00",
      total_despesas: "40.00",
      total_retiradas: "30.00",
      total_mercadorias: "15.00"
    });
    expect(fechamentoCongelado?.["fechado_por"], "fechado_por prova o fechamento pelo servico").not.toBeNull();
    expect(fechamentoCongelado?.["data_hora_fechamento"]).not.toBeNull();
  });

  // PRE-CONDICAO 2: os DOIS estados de retaguarda que vao atacar o caixa fechado. O gerente esta SEM
  // caixa aberto (`caixa?.id` vira undefined) e o admin esta COM caixa aberto (o do seed, diferente
  // do fechado): a recusa de `validarEdicaoDeSaidaDaRetaguarda` e uma expressao so, mas os dois
  // estados de dado passam por ela — e os atores entram na retaguarda por mecanismos diferentes
  // (role e prefixo de cargo), o que mata mutacoes que um ator sozinho deixaria passar.
  it("Deve_CobrirRetaguardaSemESemCaixaProprio_Quando_OsAtoresAtacamOCaixaFechado", async () => {
    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieGerente }
    });
    expect(status.statusCode, status.body).toBe(200);
    expect(json<{ data: { caixaAberto: unknown } }>(status).data.caixaAberto).toBeNull();

    // O caixa aberto do admin depois do fechamento volta a ser o do seed — aberto e DIFERENTE do
    // fechado. E o que faz a recusa dele sair do ramo "caixa alheio ou fechado", nao de "sem caixa".
    expect(
      await consultarUm<{ id: string }>(
        `select f.id from fechamentos_caixa f
           join perfis_usuarios pu on pu.usuario_id = f.usuario_caixa_id
          where f.status = 'aberto' and lower(pu.email) = lower($1)
          order by f.criado_em desc limit 1`,
        [usuariosTeste.admin.email]
      )
    ).toEqual({ id: idsTeste.caixaAberto });
    expect(idsTeste.caixaAberto).not.toBe(caixaFechado);
  });

  // O NUCLEO: conta, valor e demais campos editados de uma vez, pelos dois estados de retaguarda.
  // 403 pela regra de caixa (nao de permissao — a mensagem prende isso), snapshot integral igual
  // (raiz + derivadas, via `snapshotDoLancamento`), `caixa_id` intacto, sete totais intactos, e o
  // universo de lancamentos sem contagem nem marca-d'agua novas (pega ate "inseriu e deletou").
  it.each(rotas)(
    "Deve_Recusar403SemNenhumaEscrita_Quando_ARetaguardaEditaLancamentoDeCaixaFechado (%s)",
    async (nome, rota, extras) => {
      const id = lancamentos[nome];
      if (!id) throw new Error(`setup nao criou ${nome}`);
      const antes = await snapshotDoLancamento(nome, id);
      expect(
        (antes as { raiz: Record<string, unknown> }).raiz["caixa_id"],
        "pre-condicao: o lancamento pertence ao caixa fechado"
      ).toBe(caixaFechado);
      const universoAntes = await universoDeLancamentos();

      const edicao = {
        empresaId: idsTeste.empresaA,
        dataReferencia,
        dataVencimento: "2026-07-16",
        descricao: `CX-M06 pos-fechamento ${nome} INVADIDA`,
        valorOriginal: 99,
        contaOrigemId: idsTeste.contaBanco,
        ...extras
      };

      for (const [ator, cookie] of [
        ["gerente sem caixa", cookieGerente],
        ["admin com outro caixa aberto", cookieAdmin]
      ] as const) {
        const recusada = await contexto.app.inject({
          method: "PUT",
          url: `${rota}/${id}`,
          headers: { cookie },
          payload: edicao
        });
        assertProblem(recusada, 403);
        // Prende na MENSAGEM da regra de caixa: um 403 de permissao (INSUFFICIENT_PERMISSION)
        // passaria aqui sem isto, e o teste estaria falhando antes de atingir a regra. Regex porque
        // a serializacao do problem-details acentua o "não" que o dominio grava sem acento.
        expect(recusada.body, `${ator} deveria cair na regra de caixa, nao em permissao`).toMatch(
          /Lancamento n[aã]o pertence ao seu caixa aberto/
        );
      }

      // Snapshot integral: raiz (incluindo `caixa_id`, `conta_origem_id`, `valor_original` e
      // `atualizado_em` — o trigger de UPDATE denunciaria ate no-op) + tabelas derivadas, cuja
      // reescrita por DELETE+INSERT trocaria os ids mesmo com valores iguais.
      expect(await snapshotDoLancamento(nome, id)).toEqual(antes);
      // Os sete totais congelados nao se mexeram.
      expect(await fechamento()).toEqual(fechamentoCongelado);
      // E o universo de lancamentos nao ganhou nem perdeu linha em lugar nenhum.
      expect(await universoDeLancamentos()).toEqual(universoAntes);
    }
  );
});
