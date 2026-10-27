import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TransferenciaDto } from "@padaria/shared/transferencias";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, criarRetornoValido, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Relatorio de Transferencias da Tesouraria: uma linha por transferencia, com os TRES lacres do malote
// (abertura, bolsas de sangria, fechamento), a situacao (disponivel x usado) e o caixa que o usou.
// Tudo e DERIVADO na leitura: estes testes provam o que a tela vai mostrar, sem escrita nova.
describe("transferencias - relatorio de malotes", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  let cookieCaixa: string;
  const empresaId = idsTeste.empresaA;
  const sufixo = Date.now().toString(36).toUpperCase();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieTesouraria, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "caixa")
    ]);
    // O perfil Caixa de teste nao ve a tela de Transferencias (o 403 e o comportamento real).
    // Para provar a MASCARA dos lacres, ele ganha a permissao de ver a tela E a trava "somente caixa
    // aberto" que o cargo Caixa de producao carrega: preso ao proprio caixa, sem conferir nem cadastrar lacre.
    const operador = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!operador) throw new Error("Usuario Caixa de teste nao encontrado");
    const regrasAtuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [operador.id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: operador.id,
        regras: {
          ...(regrasAtuais?.regras ?? {}),
          transferencias_visualizar: true,
          menu_transferencias_somente_caixa_aberto: true,
          transferencias_conferir: false,
          cadastro_lacres_visualizar: false
        }
      }
    });
    expect([200, 201], concessao.body).toContain(concessao.statusCode);
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  type Pagina = { data: TransferenciaDto[]; meta: { pagination: { total: number; totalPages: number; page: number } } };

  async function listar(cookie: string, consulta: Record<string, string | number>) {
    const parametros = new URLSearchParams({
      empresaId,
      ...Object.fromEntries(Object.entries(consulta).map(([k, v]) => [k, String(v)]))
    });
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?${parametros.toString()}`,
      headers: { cookie }
    });
    assertOk(resposta);
    return json<Pagina>(resposta);
  }

  async function criarContaEPdv(nome: string) {
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: `Conta ${nome}` }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId, nome: `PDV ${nome}`, contaId, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    return { contaId, pdvId: json<{ data: { id: string } }>(pdv).data.id, pdvNome: `PDV ${nome}` };
  }

  async function lancarMalote(
    contaId: string,
    lacres: { abertura: string; bolsas: string[]; fechamento: string },
    valores = { especie: 80, moedas: 20 }
  ) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieTesouraria },
      payload: {
        empresaId,
        dataReferencia: "2026-10-27",
        descricao: `Malote ${lacres.abertura}`,
        valorOriginal: valores.especie + valores.moedas,
        valorEspecieDeclarado: valores.especie,
        valorMoedasDeclarado: valores.moedas,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: contaId,
        nLacreDoc: lacres.abertura,
        lacresRetorno: lacres.bolsas,
        lacreFechamentoPlanejado: lacres.fechamento
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  it("malote lancado e ainda nao usado: disponivel, com os tres lacres, composicao e PDV previsto", async () => {
    const { contaId, pdvNome } = await criarContaEPdv(`REL-A-${sufixo}`);
    const lacres = {
      abertura: `ABR-A-${sufixo}`,
      bolsas: [`BOL-A2-${sufixo}`, `BOL-A1-${sufixo}`],
      fechamento: `FCH-A-${sufixo}`
    };
    const id = await lancarMalote(contaId, lacres);

    const { data } = await listar(cookieTesouraria, { lacre: `ABR-A-${sufixo}` });
    const linha = data.find((item) => item.id === id);
    expect(linha).toBeDefined();
    expect(linha?.tipoMovimento).toBe("suprimento");
    expect(linha?.situacaoMalote).toBe("disponivel");
    expect(linha?.pdvsDestino).toEqual([pdvNome]);
    expect(linha?.caixa).toBeNull();
    expect(linha?.valorOriginal).toBeDefined();
    expect(linha?.valorEspecieDeclarado).toBe(80);
    expect(linha?.valorMoedasDeclarado).toBe(20);
    expect(linha?.nLacreDoc).toBe(lacres.abertura);
    expect(linha?.lacres.map((item) => [item.tipo, item.numero, item.situacao])).toEqual([
      ["abertura", lacres.abertura, "disponivel"],
      ["fechamento", lacres.fechamento, "reservado"],
      ["sangria", `BOL-A1-${sufixo}`, "disponivel"],
      ["sangria", `BOL-A2-${sufixo}`, "disponivel"]
    ]);
  });

  it("filtro por PDV acha o malote DISPONIVEL (sem caixa) e nao acha o de outro PDV", async () => {
    const a = await criarContaEPdv(`REL-B1-${sufixo}`);
    const b = await criarContaEPdv(`REL-B2-${sufixo}`);
    const idA = await lancarMalote(a.contaId, {
      abertura: `ABR-B1-${sufixo}`,
      bolsas: [],
      fechamento: `FCH-B1-${sufixo}`
    });
    const idB = await lancarMalote(b.contaId, {
      abertura: `ABR-B2-${sufixo}`,
      bolsas: [],
      fechamento: `FCH-B2-${sufixo}`
    });

    const doA = (await listar(cookieTesouraria, { pdvId: a.pdvId })).data.map((item) => item.id);
    expect(doA).toContain(idA);
    expect(doA).not.toContain(idB);
  });

  it("filtro por lacre procura abertura, bolsa e fechamento; '%' e '_' sao literais", async () => {
    const { contaId } = await criarContaEPdv(`REL-C-${sufixo}`);
    const id = await lancarMalote(contaId, {
      abertura: `ABR-C-${sufixo}`,
      bolsas: [`BOL-C-${sufixo}`],
      fechamento: `FCH-C-${sufixo}`
    });

    for (const lacre of [`ABR-C-${sufixo}`, `BOL-C-${sufixo}`, `FCH-C-${sufixo}`]) {
      const ids = (await listar(cookieTesouraria, { lacre })).data.map((item) => item.id);
      expect(ids, lacre).toContain(id);
    }
    // Antes, '%' casava qualquer lacre. Agora e o caractere literal e nao existe lacre com ele.
    expect((await listar(cookieTesouraria, { lacre: "%" })).meta.pagination.total).toBe(0);
    expect((await listar(cookieTesouraria, { lacre: "_" })).meta.pagination.total).toBe(0);
  });

  it("malote USADO: mostra caixa, PDV, turno e os nomes digitados; bolsa e fechamento seguem intactos", async () => {
    const nome = `Operador Rel D ${sufixo}`;
    const aberto = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome,
      valorAbertura: 100,
      lacresRetorno: [`BOL-D-${sufixo}`],
      lacreFechamento: `FCH-D-${sufixo}`
    });

    const { data } = await listar(cookieTesouraria, { pdvId: aberto.pdvId });
    const linha = data.find((item) => item.tipoMovimento === "abertura");
    expect(linha).toBeDefined();
    expect(linha?.situacaoMalote).toBe("usado");
    expect(linha?.caixa).toMatchObject({
      id: aberto.caixaId,
      status: "aberto",
      operadorNome: nome,
      supervisorNome: "Supervisor de teste"
    });
    expect(linha?.caixa?.pdvNome).toContain("PDV");
    expect(linha?.caixa?.turnoNome).toBeTruthy();
    expect(linha?.caixa?.abertoEm).toBeTruthy();
    expect(linha?.dataRecebimento).toBeTruthy();
    expect(linha?.lacres.find((item) => item.tipo === "abertura")?.situacao).toBe("usado");
    expect(linha?.lacres.find((item) => item.tipo === "fechamento")).toMatchObject({
      numero: `FCH-D-${sufixo}`,
      situacao: "reservado"
    });
    expect(linha?.lacres.find((item) => item.tipo === "sangria")).toMatchObject({
      numero: `BOL-D-${sufixo}`,
      situacao: "disponivel"
    });
  });

  it("bolsa usada numa sangria: 'aguardando conferencia' no malote e lacre proprio na linha da sangria", async () => {
    const aberto = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: `Operador Rel E ${sufixo}`,
      valorAbertura: 100,
      lacresRetorno: [`BOL-E-${sufixo}`],
      lacreFechamento: `FCH-E-${sufixo}`
    });
    await criarRetornoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: aberto.caixaId, valor: 10 });

    const { data } = await listar(cookieTesouraria, { pdvId: aberto.pdvId, pageSize: 50 });
    const malote = data.find((item) => item.tipoMovimento === "abertura");
    const sangria = data.find((item) => item.tipoMovimento === "retorno" || item.tipoMovimento === "sangria");
    expect(sangria).toBeDefined();
    expect(sangria?.situacaoMalote).toBeNull();
    expect(sangria?.caixa?.id).toBe(aberto.caixaId);

    const bolsa = malote?.lacres.find((item) => item.tipo === "sangria");
    expect(bolsa).toMatchObject({
      numero: `BOL-E-${sufixo}`,
      situacao: "usada_aguardando_conferencia",
      usadoEmTransferenciaId: sangria?.id
    });
    expect(sangria?.lacres).toEqual([
      {
        tipo: "sangria",
        numero: `BOL-E-${sufixo}`,
        situacao: "usada_aguardando_conferencia",
        usadoEmTransferenciaId: sangria?.id
      }
    ]);
  });

  it("operador preso ao proprio caixa nao le o numero dos lacres ainda fechados; a Tesouraria le", async () => {
    const aberto = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: `Operador Rel F ${sufixo}`,
      valorAbertura: 100,
      lacresRetorno: [`BOL-F-${sufixo}`],
      lacreFechamento: `FCH-F-${sufixo}`
    });

    const doOperador = await listar(cookieCaixa, {});
    const linha = doOperador.data.find((item) => item.tipoMovimento === "abertura");
    expect(linha?.caixa?.id).toBe(aberto.caixaId);
    // So as linhas do PROPRIO caixa; nenhum malote disponivel de outro PDV.
    expect(doOperador.data.every((item) => item.caixa?.id === aberto.caixaId)).toBe(true);
    expect(linha?.lacres.find((item) => item.tipo === "abertura")?.numero).toBe(linha?.nLacreDoc);
    expect(linha?.lacres.find((item) => item.tipo === "fechamento")).toMatchObject({
      numero: null,
      situacao: "reservado"
    });
    expect(linha?.lacres.find((item) => item.tipo === "sangria")).toMatchObject({
      numero: null,
      situacao: "disponivel"
    });

    const daTesouraria = (await listar(cookieTesouraria, { pdvId: aberto.pdvId })).data.find(
      (item) => item.tipoMovimento === "abertura"
    );
    expect(daTesouraria?.lacres.find((item) => item.tipo === "fechamento")?.numero).toBe(`FCH-F-${sufixo}`);

    // O filtro por lacre nao pode ser usado para DESCOBRIR o numero escondido: quem nao ve o numero
    // nao acha a linha pelo selo de fechamento nem pela bolsa ainda lacrados; a Tesouraria acha.
    expect((await listar(cookieCaixa, { lacre: `FCH-F-${sufixo}` })).data).toHaveLength(0);
    expect((await listar(cookieCaixa, { lacre: `BOL-F-${sufixo}` })).data).toHaveLength(0);
    expect((await listar(cookieTesouraria, { lacre: `FCH-F-${sufixo}` })).data.length).toBeGreaterThan(0);
  });

  it("o lacre principal do malote so e usado pela ABERTURA: a conferencia comum nao o da como recebido", async () => {
    const { contaId } = await criarContaEPdv(`REL-H-${sufixo}`);
    const malote = await lancarMalote(contaId, {
      abertura: `ABR-H-${sufixo}`,
      bolsas: [`BOL-H-${sufixo}`],
      fechamento: `FCH-H-${sufixo}`
    });
    // Alguem LIGADO a conta do PDV e com permissao de conferir (a Tesouraria de teste) tentando "receber" o malote.
    const tesouraria = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.tesouraria.email
    ]);
    await executarSql("insert into contas_usuarios (empresa_id, conta_id, usuario_id) values ($1, $2, $3)", [
      empresaId,
      contaId,
      tesouraria?.id
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/transferencias/${malote}/confirmar`,
      headers: { cookie: cookieTesouraria },
      payload: { contaDestinoId: contaId, nLacreDoc: `ABR-H-${sufixo}` }
    });
    expect(resposta.statusCode, resposta.body).toBe(409);
    expect(resposta.body).toContain("abertura do Caixa");

    // Nada mudou: segue pendente, sem caixa e com o lacre principal intacto (disponivel para abrir caixa).
    const linha = (await listar(cookieTesouraria, { lacre: `ABR-H-${sufixo}` })).data.find(
      (item) => item.id === malote
    );
    expect(linha).toMatchObject({ status: "pendente", situacaoMalote: "disponivel", caixa: null });
    expect(linha?.lacres.find((item) => item.tipo === "abertura")?.situacao).toBe("disponivel");
  });

  it("paginacao e feita no banco: total correto, pagina 2 e ordem do mais recente para o mais antigo", async () => {
    const { contaId } = await criarContaEPdv(`REL-G-${sufixo}`);
    const criados: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      criados.push(
        await lancarMalote(
          contaId,
          { abertura: `PAG-${i}-${sufixo}`, bolsas: [], fechamento: `PAG-F${i}-${sufixo}` },
          { especie: 10 + i, moedas: 0 }
        )
      );
      await new Promise((resolver) => setTimeout(resolver, 15));
    }

    const pagina1 = await listar(cookieTesouraria, { lacre: `PAG-`, pageSize: 2, page: 1 });
    const pagina2 = await listar(cookieTesouraria, { lacre: `PAG-`, pageSize: 2, page: 2 });
    const pagina3 = await listar(cookieTesouraria, { lacre: `PAG-`, pageSize: 2, page: 3 });
    expect(pagina1.meta.pagination.total).toBe(5);
    expect(pagina1.meta.pagination.totalPages).toBe(3);
    const ordem = [...pagina1.data, ...pagina2.data, ...pagina3.data].map((item) => item.id);
    expect(ordem).toEqual([...criados].reverse());
    expect(pagina3.data).toHaveLength(1);
  });

  it("transferencia comum entre contas continua na lista, sem situacao de malote e sem lacres de relatorio", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId,
        dataReferencia: "2026-10-27",
        descricao: `Comum ${sufixo}`,
        valorOriginal: 7,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: idsTeste.contaBanco,
        nLacreDoc: `COM-${sufixo}`,
        tempoConfirmacao: "1dia"
      }
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const id = json<{ data: { id: string } }>(resposta).data.id;

    const linha = (await listar(cookieTesouraria, { lacre: `COM-${sufixo}` })).data.find((item) => item.id === id);
    expect(linha?.situacaoMalote).toBeNull();
    expect(linha?.lacres).toEqual([]);
    expect(linha?.pdvsDestino).toEqual([]);
    expect(linha?.nLacreDoc).toBe(`COM-${sufixo}`);
    // Campos que ja existiam continuam presentes e com o mesmo sentido.
    expect(linha).toMatchObject({ status: "pendente", ehCaixaParaCofre: false, ehPlanejamentoRetorno: false });
  });

  it("outra empresa nao enxerga lacres nem transferencias da empresa A", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/transferencias?empresaId=${idsTeste.empresaB}&lacre=ABR-A-${sufixo}`,
      headers: { cookie: cookieAdmin }
    });
    if (resposta.statusCode === 200) {
      expect(json<Pagina>(resposta).meta.pagination.total).toBe(0);
    } else {
      expect([403, 404]).toContain(resposta.statusCode);
    }
    // E o dado de A nao vaza por quem nao tem a empresa: consulta direta confirma a existencia em A.
    const existe = await consultarUm<{ id: string }>("select id from lacres where numero = $1", [`ABR-A-${sufixo}`]);
    expect(existe).not.toBeNull();
  });
});
