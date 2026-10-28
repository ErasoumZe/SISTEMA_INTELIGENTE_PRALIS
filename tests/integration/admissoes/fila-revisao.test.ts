import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { avisoPrivacidadeVigente, type Permissao } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * ADM-003 V6 — a fila de revisao do DP.
 *
 * O que esta suite protege e a LISTAGEM: que ela diga em que pe esta a ficha de cada processo sem
 * mostrar nada da ficha, que o filtro seja do servidor (com total coerente), e que continuar
 * respeitando a fronteira de empresa e a de documento.
 */
const SEQUENCIA_DE_11_DIGITOS = /(?<!\d)\d{11}(?!\d)/u;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
// Tira os identificadores aleatorios do corpo antes de procurar digitos de CPF.
function semUuids(corpo: string) {
  return corpo.replace(UUID, "");
}

describe("admissoes fila de revisao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDpReal: string;
  let cookieGerenciaReal: string;
  let turnoId: string;
  let sequencia = 0;

  const CABECALHO = "x-admissao-convite";

  /** Anexos obrigatorios do candidato sem dependentes (cpf + comprovante_residencia). */
  async function anexarDocumentosObrigatorios(token: string) {
    for (const tipo of ["cpf", "comprovante_residencia"]) {
      const boundary = `----admissao-teste-${randomUUID()}`;
      const corpo = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="tipo"\r\n\r\n${tipo}\r\n` +
            `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${tipo}.jpg"\r\n` +
            "Content-Type: image/jpeg\r\n\r\n"
        ),
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);
      const resposta = await contexto.app.inject({
        method: "POST",
        url: "/api/admissao/anexos",
        headers: { [CABECALHO]: token, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: corpo
      });
      expect(resposta.statusCode, resposta.body).toBe(201);
    }
  }

  function matriz(cargo: string): Permissao[] {
    const lista = permissoesPorCargo[cargo];
    if (!lista) throw new Error(`cargo ausente na referencia: ${cargo}`);
    return lista;
  }

  async function vestirCargo(perfil: PerfilTeste, cargo: string) {
    const alvo = await consultarUm<{ id: string }>(`select u.id from "user" u where u.email = $1`, [
      usuariosTeste[perfil].email
    ]);
    if (!alvo) throw new Error(`usuario de teste ausente: ${perfil}`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
         on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(matriz(cargo)))]
    );
  }

  function proximoCpf() {
    const base = String(72000000 + sequencia++ * 977).padStart(9, "0");
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const d1 = dv(base);
    return `${base}${d1}${dv(base + d1)}`;
  }

  /** Processo direto, com ASO apto. Devolve o id. */
  async function criarProcesso(nome: string) {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: nome,
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-15"
      }
    });
    assertOk(criado, 201);
    const id = criado.json().data.id as string;
    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${id}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: 1, situacao: "aso_apto" }
    });
    expect(exame.statusCode, exame.body).toBe(204);
    return id;
  }

  async function emitirConvite(processoId: string) {
    const convite = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/convite`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    assertOk(convite, 200);
    return convite.json().data.token as string;
  }

  function abrirFicha(token: string) {
    return contexto.app.inject({ method: "GET", url: "/api/admissao/ficha", headers: { [CABECALHO]: token } });
  }

  async function enviarFicha(token: string) {
    const aberta = await abrirFicha(token);
    assertOk(aberta, 200);
    await anexarDocumentosObrigatorios(token);
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: {
        versao: aberta.json().data.versao as number,
        semDependentes: true,
        avisoPrivacidadeVersao: avisoPrivacidadeVigente,
        nascimento: "1995-04-10",
        sexo: "Feminino",
        estadoCivil: "Solteira",
        racaCor: "Parda",
        grauInstrucao: "Ensino medio completo",
        nacionalidade: "Brasileira",
        naturalidade: "Cidade Sintetica/SP",
        nomeMae: "Mae Sintetica",
        cep: "01001000",
        logradouro: "Rua Sintetica",
        numero: "100",
        bairro: "Centro",
        municipio: "Cidade Sintetica",
        uf: "SP",
        telefone: "11999990000",
        rgNumero: "000000000",
        rgOrgao: "SSP",
        rgUf: "SP",
        rgEmissao: "2015-01-20"
      }
    });
    expect(enviar.statusCode, enviar.body).toBe(204);
  }

  /** A versao atual da ficha, do ponto de vista do DP — necessaria para aprovar/devolver. */
  async function versaoDaFicha(processoId: string) {
    const revisao = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/ficha`,
      headers: { cookie: cookieDpReal }
    });
    assertOk(revisao, 200);
    return revisao.json().data.versao as number;
  }

  function listar(consulta: string, cookie = cookieDpReal) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos?${consulta}`,
      headers: { cookie }
    });
  }

  type LinhaLista = { id: string; nomeCompleto: string | null; fichaSituacao: string | null };

  async function linhasDe(resposta: Awaited<ReturnType<typeof listar>>): Promise<LinhaLista[]> {
    assertOk(resposta, 200);
    return resposta.json().data as LinhaLista[];
  }

  // Os quatro processos do cenario, criados uma vez e reaproveitados pelos casos de leitura.
  const alvos: Record<"semFicha" | "rascunho" | "enviada" | "devolvida" | "aprovada", string> = {
    semFicha: "",
    rascunho: "",
    enviada: "",
    devolvida: "",
    aprovada: ""
  };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await vestirCargo("caixa", "DP");
    await vestirCargo("gerente", "Gerencia");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");

    turnoId = "77777777-7777-4777-8777-777777770001";
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Manha Fila', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );

    // Um processo por estado da fila. O caminho e o real: convite, abertura pelo candidato, envio e
    // decisao do DP — nenhum estado e gravado por SQL, senao o teste provaria o `insert`, nao a regra.
    alvos.semFicha = await criarProcesso("FILA Sem Ficha");

    alvos.rascunho = await criarProcesso("FILA Rascunho");
    // Abrir o link cria a ficha vazia: e o que separa "nao abriu" de "abriu e nao enviou".
    assertOk(await abrirFicha(await emitirConvite(alvos.rascunho)), 200);

    alvos.enviada = await criarProcesso("FILA Enviada");
    await enviarFicha(await emitirConvite(alvos.enviada));

    alvos.devolvida = await criarProcesso("FILA Devolvida");
    await enviarFicha(await emitirConvite(alvos.devolvida));
    const devolver = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${alvos.devolvida}/ficha/devolver`,
      headers: { cookie: cookieDpReal },
      payload: { versao: await versaoDaFicha(alvos.devolvida), pendencias: "Confira o RG." }
    });
    expect(devolver.statusCode, devolver.body).toBe(204);

    alvos.aprovada = await criarProcesso("FILA Aprovada");
    await enviarFicha(await emitirConvite(alvos.aprovada));
    const aprovar = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${alvos.aprovada}/ficha/aprovar`,
      headers: { cookie: cookieDpReal },
      payload: { versao: await versaoDaFicha(alvos.aprovada) }
    });
    expect(aprovar.statusCode, aprovar.body).toBe(204);
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("P0-V6 Deve_DizerASituacaoDaFicha_DeCadaProcesso", async () => {
    const linhas = await linhasDe(await listar("page=1&pageSize=50"));
    const por = (id: string) => linhas.find((linha) => linha.id === id);

    // `null` e "o candidato ainda nao abriu o link" — nao e um quinto valor do enum.
    expect(por(alvos.semFicha)?.fichaSituacao).toBeNull();
    expect(por(alvos.rascunho)?.fichaSituacao).toBe("rascunho");
    expect(por(alvos.enviada)?.fichaSituacao).toBe("enviada");
    expect(por(alvos.devolvida)?.fichaSituacao).toBe("devolvida");
    expect(por(alvos.aprovada)?.fichaSituacao).toBe("aprovada");
  });

  it("P0-V6 Deve_A_ListaNaoCarregarNadaDaFicha_AlemDaSituacao", async () => {
    // A fila diz em que pe esta; quem le a ficha e a tela de revisao. Campo da ficha, dependente ou
    // pendencia na listagem seriam um segundo lugar mostrando o mesmo dado — com outra permissao.
    const resposta = await listar("page=1&pageSize=50");
    assertOk(resposta, 200);
    const linhas = await linhasDe(resposta);
    for (const linha of linhas) {
      expect(Object.keys(linha).sort()).toEqual([
        "cpfMascarado",
        "criadoEm",
        "dataAdmissao",
        "exameSituacao",
        "fichaSituacao",
        "funcaoNome",
        "id",
        "nomeCompleto",
        "origem",
        "situacao",
        "status",
        "turnoResumo"
      ]);
    }
    // E o corpo inteiro nao carrega digito de CPF nem texto de pendencia. Os `id` (UUID) saem antes da busca: o
    // ultimo bloco de um UUID tem 12 hexadecimais e, as vezes, 11 deles sao digitos — a regex confundia isso com um
    // CPF e a suite falhava ao acaso (~1 em cada 25 execucoes), sem nenhum dado pessoal vazando.
    expect(semUuids(resposta.body)).not.toMatch(SEQUENCIA_DE_11_DIGITOS);
    expect(resposta.body).not.toContain("Confira o RG.");
    expect(resposta.body).not.toContain("nomeMae");
    expect(resposta.body).not.toContain("dependentes");
  });

  it("P0-V6 Deve_FiltrarNoServidor_E_ContarSoOQueFiltrou", async () => {
    // O total precisa acompanhar o filtro: pagina certa com total errado faz a paginacao mentir, e
    // registro some sem ninguem ver. O join da contagem existe por causa disto.
    const enviadas = await listar("page=1&pageSize=50&ficha=enviada");
    assertOk(enviadas, 200);
    const linhas = await linhasDe(enviadas);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((linha) => linha.fichaSituacao === "enviada")).toBe(true);
    expect(linhas.map((linha) => linha.id)).toContain(alvos.enviada);
    expect(linhas.map((linha) => linha.id)).not.toContain(alvos.devolvida);
    expect(enviadas.json().meta.pagination.total).toBe(linhas.length);

    for (const situacao of ["rascunho", "devolvida", "aprovada"] as const) {
      const filtrada = await listar(`page=1&pageSize=50&ficha=${situacao}`);
      const itens = await linhasDe(filtrada);
      expect(
        itens.every((linha) => linha.fichaSituacao === situacao),
        situacao
      ).toBe(true);
      expect(filtrada.json().meta.pagination.total, situacao).toBe(itens.length);
    }
  });

  it("P0-V6 Deve_RecusarFiltroForaDoEnum", async () => {
    // Nao existe filtro "sem ficha": ausencia nao e situacao, e aceitar um quinto valor aqui seria
    // estado inventado no contrato.
    for (const invalido of ["sem_ficha", "pendente", ""]) {
      const resposta = await listar(`page=1&pageSize=10&ficha=${invalido}`);
      expect(resposta.statusCode, invalido).toBe(400);
    }
  });

  it("P0-V6 Deve_FiltrarPorPausado_SemDevolverCancelado", async () => {
    // CORRECAO: o filtro mapeava com um ternario, e tudo que nao era "ativo" virava "cancelado" —
    // pedir PAUSADO devolvia os CANCELADOS. Os dois estados existem de verdade aqui.
    const pausado = await criarProcesso("FILA Pausada");
    const naoApto = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${pausado}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: 2, situacao: "aso_nao_apto" }
    });
    expect(naoApto.statusCode, naoApto.body).toBe(204);

    const cancelado = await criarProcesso("FILA Cancelada");
    // A versao vem do proprio processo. Fixar `1` presume que registrar o exame nao a avancou — e
    // registrar `aso_nao_apto` avanca, porque pausa. Ler e o unico jeito que nao quebra por tabela.
    const antesDeCancelar = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${cancelado}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(antesDeCancelar, 200);
    const cancelar = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${cancelado}/cancelar`,
      headers: { cookie: cookieAdmin },
      payload: { versao: antesDeCancelar.json().data.versao as number }
    });
    expect(cancelar.statusCode, cancelar.body).toBe(200);

    const pausados = await linhasDe(await listar("page=1&pageSize=50&situacao=pausado"));
    expect(pausados.map((linha) => linha.id)).toContain(pausado);
    expect(pausados.map((linha) => linha.id)).not.toContain(cancelado);

    const inativos = await linhasDe(await listar("page=1&pageSize=50&situacao=inativo"));
    expect(inativos.map((linha) => linha.id)).toContain(cancelado);
    expect(inativos.map((linha) => linha.id)).not.toContain(pausado);
  });

  it("P0-V6 Deve_IsolarPorEmpresa_Quando_OutroTenantTemFichaEnviada", async () => {
    // Processo E ficha montados direto na empresa B. O DP da empresa A filtra por `enviada` e nao
    // pode ve-los — o filtro nao pode virar a porta que o resto do modulo fechou.
    const funcaoB = "44444444-4444-4444-8444-444444440601";
    const testeB = "44444444-4444-4444-8444-444444440602";
    const processoB = "44444444-4444-4444-8444-444444440603";
    await executarSql(
      "insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [funcaoB, idsTeste.empresaB, "Funcao Fila B"]
    );
    await executarSql(
      `insert into admissoes_testes
         (id, empresa_id, nome_completo, cpf, funcao_id, jornada_horario, inicio_em, fim_combinado_em,
          criado_por, atualizado_por)
       select $1, $2, 'FILA Pessoa Da Empresa B', $3, $4, 'seg a sex, 08:00 as 17:00',
              now(), now() + interval '30 days', p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [testeB, idsTeste.empresaB, proximoCpf(), funcaoB]
    );
    await executarSql(
      `insert into admissoes_processos (id, empresa_id, teste_id, criado_por, atualizado_por)
       select $1, $2, $3, p.usuario_id, p.usuario_id from perfis_usuarios p limit 1
       on conflict do nothing`,
      [processoB, idsTeste.empresaB, testeB]
    );
    await executarSql(
      `insert into admissoes_processos_ficha (processo_id, empresa_id, situacao, enviado_em,
         aviso_privacidade_versao, aviso_aceito_em, sem_dependentes)
       values ($1, $2, 'enviada', now(), $3, now(), true)
       on conflict do nothing`,
      [processoB, idsTeste.empresaB, avisoPrivacidadeVigente]
    );

    const enviadas = await listar("page=1&pageSize=50&ficha=enviada");
    const linhas = await linhasDe(enviadas);
    expect(linhas.map((linha) => linha.id)).not.toContain(processoB);
    expect(enviadas.body).not.toContain("FILA Pessoa Da Empresa B");
    expect(enviadas.json().meta.pagination.total).toBe(linhas.length);
  });

  it("P0-V6 Deve_A_GerenciaVerAFilaSemPoderAbrirAFicha", async () => {
    // A Gerencia tem `admissoes_processos_visualizar`, entao ela ve a lista e a coluna — a situacao
    // e informacao de andamento, nao conteudo da ficha. O que ela nao tem e a ficha em si.
    const linhas = await linhasDe(await listar("page=1&pageSize=50&ficha=enviada", cookieGerenciaReal));
    expect(linhas.map((linha) => linha.id)).toContain(alvos.enviada);

    const ficha = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${alvos.enviada}/ficha`,
      headers: { cookie: cookieGerenciaReal }
    });
    expect(ficha.statusCode).toBe(403);
  });

  it("P0-V6 Deve_RecusarAListaInteira_Quando_SemPermissaoDeProcesso", async () => {
    const semPermissao = await cookieSessao(contexto.app, "semPermissao");
    const resposta = await listar("page=1&pageSize=10&ficha=enviada", semPermissao);
    expect(resposta.statusCode).toBe(403);
  });

  it("a checagem de CPF ignora UUID (um id com 11 digitos seguidos nao e CPF)", () => {
    const corpoComIdDeOnzeDigitos = '{"ok":true,"data":[{"id":"01a1834d-4900-7000-8000-12345678901a"}]}';
    expect(corpoComIdDeOnzeDigitos).toMatch(SEQUENCIA_DE_11_DIGITOS);
    expect(semUuids(corpoComIdDeOnzeDigitos)).not.toMatch(SEQUENCIA_DE_11_DIGITOS);
    // E um CPF de verdade, fora de um UUID, continua sendo pego.
    expect(semUuids('{"id":"01a1834d-4900-7000-8000-12345678901a","cpf":"12345678901"}')).toMatch(
      SEQUENCIA_DE_11_DIGITOS
    );
  });
});
