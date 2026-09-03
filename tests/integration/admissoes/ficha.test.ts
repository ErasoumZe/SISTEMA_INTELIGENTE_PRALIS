import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import { avisoPrivacidadeVigente, type Permissao } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "../../setup/contexto.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

const RAIZ_TESTE = join(import.meta.dirname, "..", "..", "..");

/**
 * ADM-003 V3 — os P0 da ficha publica.
 *
 * O que esta suite protege nao e a ficha: e a SUPERFICIE PUBLICA. Toda asserção aqui existe porque
 * um erro nela fica exposto na internet, e nao atras de um login.
 */
describe("admissoes ficha publica integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieDpReal: string;
  let cookieGerenciaReal: string;
  let turnoId: string;
  let sequencia = 0;

  const CABECALHO = "x-admissao-convite";

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
    const base = String(61000000 + sequencia++ * 883).padStart(9, "0");
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const d1 = dv(base);
    return `${base}${d1}${dv(base + d1)}`;
  }

  /** Processo com ASO apto e convite emitido. Devolve o token em claro, que so existe aqui. */
  async function processoComToken() {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Da Ficha",
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-15"
      }
    });
    assertOk(criado, 201);
    const processoId = criado.json().data.id as string;

    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: 1, situacao: "aso_apto" }
    });
    expect(exame.statusCode, exame.body).toBe(204);

    const convite = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/convite`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    assertOk(convite, 200);
    return { processoId, token: convite.json().data.token as string };
  }

  function abrirFicha(token: string) {
    return contexto.app.inject({ method: "GET", url: "/api/admissao/ficha", headers: { [CABECALHO]: token } });
  }

  /** Os campos que o contrato exige para ENVIAR. Todos sinteticos. */
  function fichaCompleta(versao: number) {
    return {
      versao,
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
    };
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await vestirCargo("caixa", "DP");
    await vestirCargo("gerente", "Gerencia");
    cookieDpReal = await cookieSessao(contexto.app, "caixa");
    cookieGerenciaReal = await cookieSessao(contexto.app, "gerente");

    turnoId = "66666666-6666-4666-8666-666666660001";
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Manha Ficha', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("P0-V3 Deve_Responder404_Quando_TokenDesconhecido", async () => {
    // 404 e nao 401/410: quem esta adivinhando nao recebe confirmacao de que algo existe.
    const resposta = await abrirFicha("f".repeat(64));
    expect(resposta.statusCode, resposta.body).toBe(404);
  });

  it("P0-V3 Deve_Responder410_Quando_RevogadoOuExpirado", async () => {
    const revogado = await processoComToken();
    const revogar = await contexto.app.inject({
      method: "DELETE",
      url: `/api/admissoes/processos/${revogado.processoId}/convite`,
      headers: { cookie: cookieAdmin }
    });
    expect(revogar.statusCode).toBe(204);
    const aposRevogar = await abrirFicha(revogado.token);
    expect(aposRevogar.statusCode, aposRevogar.body).toBe(410);
    expect(aposRevogar.json().code).toBe("CONVITE_REVOGADO");

    const vencido = await processoComToken();
    // `criado_em` anda junto: o CHECK `expira_em > criado_em` recusa um convite que expirou antes de
    // nascer — e ele esta certo. Envelhecer a linha e o jeito honesto de simular o prazo vencido.
    await executarSql(
      `update admissoes_convites
          set criado_em = now() - interval '20 days', expira_em = now() - interval '1 day'
        where processo_id = $1`,
      [vencido.processoId]
    );
    const aposVencer = await abrirFicha(vencido.token);
    expect(aposVencer.statusCode, aposVencer.body).toBe(410);
    expect(aposVencer.json().code).toBe("CONVITE_EXPIRADO");
  });

  it("P0-V3 Deve_RecusarSemToken_E_NaoAceitarSessaoNoLugar", async () => {
    // A rota e publica, mas nao e aberta: sem token nao entra. E cookie de usuario interno NAO
    // substitui o token — o formulario do candidato nao herda acesso de quem esta logado.
    const semNada = await contexto.app.inject({ method: "GET", url: "/api/admissao/ficha" });
    expect(semNada.statusCode).toBe(401);

    const comSessao = await contexto.app.inject({
      method: "GET",
      url: "/api/admissao/ficha",
      headers: { cookie: cookieAdmin }
    });
    expect(comSessao.statusCode, comSessao.body).toBe(401);
  });

  it("P0-V3 Deve_DerivarEmpresaDoConvite_E_IgnorarOChamador", async () => {
    const { token, processoId } = await processoComToken();
    const aberta = await abrirFicha(token);
    assertOk(aberta, 200);

    const linha = await consultarUm<{ empresa_id: string }>(
      `select empresa_id from admissoes_processos_ficha where processo_id = $1`,
      [processoId]
    );
    // A ficha nasceu na empresa do CONVITE. O candidato nunca informou empresa nenhuma.
    expect(linha?.empresa_id).toBe(idsTeste.empresaA);
  });

  it("P0-V3 Deve_SalvarRascunho_E_UsarConcorrenciaOtimista", async () => {
    const { token } = await processoComToken();
    const aberta = await abrirFicha(token);
    assertOk(aberta, 200);
    const versao = aberta.json().data.versao as number;

    const salvar = await contexto.app.inject({
      method: "PUT",
      url: "/api/admissao/ficha",
      headers: { [CABECALHO]: token },
      payload: { versao, bairro: "Centro" }
    });
    expect(salvar.statusCode, salvar.body).toBe(204);

    // A MESMA versao de novo: a segunda gravacao perdeu a corrida e tem de saber disso.
    const repetido = await contexto.app.inject({
      method: "PUT",
      url: "/api/admissao/ficha",
      headers: { [CABECALHO]: token },
      payload: { versao, bairro: "Outro" }
    });
    expect(repetido.statusCode, repetido.body).toBe(409);
    expect(repetido.json().code).toBe("VERSAO_CONFLITANTE");
  });

  it("P0-V3 Deve_GravarAceiteVersionado_E_TrilhaComAtorExterno_Quando_Enviar", async () => {
    const { token, processoId } = await processoComToken();
    const aberta = await abrirFicha(token);
    assertOk(aberta, 200);

    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(aberta.json().data.versao as number)
    });
    expect(enviar.statusCode, enviar.body).toBe(204);

    const ficha = await consultarUm<{
      situacao: string;
      aviso_privacidade_versao: string;
      aviso_aceito_em: string | null;
      sem_dependentes: boolean;
    }>(
      `select situacao, aviso_privacidade_versao, aviso_aceito_em, sem_dependentes
         from admissoes_processos_ficha where processo_id = $1`,
      [processoId]
    );
    expect(ficha?.situacao).toBe("enviada");
    expect(ficha?.aviso_privacidade_versao).toBe(avisoPrivacidadeVigente);
    expect(ficha?.aviso_aceito_em).not.toBeNull();
    expect(ficha?.sem_dependentes).toBe(true);

    const eventos = await consultarTodos<{ acao: string; ator_usuario_id: string | null; convite_id: string | null }>(
      `select acao, ator_usuario_id, convite_id from admissoes_processos_historico
        where processo_id = $1 and acao = 'ficha_enviada'`,
      [processoId]
    );
    expect(eventos).toHaveLength(1);
    // Ato EXTERNO: o candidato nao tem perfil, e o autor e o convite que o autorizou.
    expect(eventos[0]?.ator_usuario_id).toBeNull();
    expect(eventos[0]?.convite_id).not.toBeNull();
  });

  it("P0-V3 Deve_RecusarEdicao_Quando_JaEnviada", async () => {
    const { token } = await processoComToken();
    const aberta = await abrirFicha(token);
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(aberta.json().data.versao as number)
    });
    expect(enviar.statusCode, enviar.body).toBe(204);

    const depois = await abrirFicha(token);
    const tentar = await contexto.app.inject({
      method: "PUT",
      url: "/api/admissao/ficha",
      headers: { [CABECALHO]: token },
      payload: { versao: depois.json().data.versao, bairro: "Nao pode" }
    });
    expect(tentar.statusCode, tentar.body).toBe(409);
    expect(tentar.json().code).toBe("FICHA_NAO_EDITAVEL");
  });

  it("P0-V3 Deve_DevolverEReabrir_Quando_DpPedeCorrecao", async () => {
    const { token, processoId } = await processoComToken();
    const aberta = await abrirFicha(token);
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(aberta.json().data.versao as number)
    });
    expect(enviar.statusCode, enviar.body).toBe(204);

    const paraRevisar = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/ficha`,
      headers: { cookie: cookieDpReal }
    });
    assertOk(paraRevisar, 200);

    const devolver = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/ficha/devolver`,
      headers: { cookie: cookieDpReal },
      payload: { versao: paraRevisar.json().data.versao, pendencias: "Confira o numero do RG." }
    });
    expect(devolver.statusCode, devolver.body).toBe(204);

    // O candidato volta a editar, e ve o que precisa corrigir.
    const reaberta = await abrirFicha(token);
    assertOk(reaberta, 200);
    expect(reaberta.json().data.situacao).toBe("devolvida");
    expect(reaberta.json().data.revisaoPendencias).toBe("Confira o numero do RG.");

    const reenviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(reaberta.json().data.versao as number)
    });
    expect(reenviar.statusCode, reenviar.body).toBe(204);

    // O CHECK do banco exige revisao ZERADA no ramo `enviada`: reenviar nao pode carregar o carimbo
    // de quem devolveu.
    const linha = await consultarUm<{ situacao: string; revisado_em: string | null }>(
      `select situacao, revisado_em from admissoes_processos_ficha where processo_id = $1`,
      [processoId]
    );
    expect(linha?.situacao).toBe("enviada");
    expect(linha?.revisado_em).toBeNull();
  });

  it("P0-V5 Deve_ListarDependentesSemCpf_Quando_DpRevisa", async () => {
    // ADM-003 V5: o DP passa a ver QUEM foi declarado, e o CPF do dependente nao sai — nem em claro,
    // nem mascarado. Sai so `cpfInformado`. A prova e pelo CORPO da resposta, e nao so pelas chaves:
    // um serializador que incluisse o numero em outro campo passaria numa checagem de chaves.
    const { token, processoId } = await processoComToken();
    const aberta = await abrirFicha(token);
    assertOk(aberta, 200);

    const cpfDoDependente = proximoCpf();
    for (const dependente of [
      {
        nomeCompleto: "Dependente Com Documento",
        nascimento: "2015-03-01",
        parentesco: "Filho(a)",
        cpf: cpfDoDependente,
        finalidades: ["Imposto de renda"]
      },
      { nomeCompleto: "Dependente Sem Documento", nascimento: "2024-11-20", parentesco: "Filho(a)", finalidades: [] }
    ]) {
      const criado = await contexto.app.inject({
        method: "POST",
        url: "/api/admissao/dependentes",
        headers: { [CABECALHO]: token },
        payload: dependente
      });
      assertOk(criado, 200);
    }

    const depois = await abrirFicha(token);
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: { ...fichaCompleta(depois.json().data.versao as number), semDependentes: false }
    });
    expect(enviar.statusCode, enviar.body).toBe(204);

    const paraRevisar = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/ficha`,
      headers: { cookie: cookieDpReal }
    });
    assertOk(paraRevisar, 200);
    const ficha = paraRevisar.json().data as {
      situacao: string;
      semDependentes: boolean | null;
      dependentes: Array<Record<string, unknown>>;
    };
    expect(ficha.situacao).toBe("enviada");
    expect(ficha.semDependentes).toBe(false);
    expect(ficha.dependentes).toHaveLength(2);
    // Na ordem em que foram cadastrados: o DP e o candidato falam do "primeiro dependente" olhando
    // para a mesma pessoa.
    expect(ficha.dependentes.map((d) => d["nomeCompleto"])).toEqual([
      "Dependente Com Documento",
      "Dependente Sem Documento"
    ]);
    expect(ficha.dependentes.map((d) => d["cpfInformado"])).toEqual([true, false]);
    for (const dependente of ficha.dependentes) {
      expect(Object.keys(dependente).sort()).toEqual([
        "cpfInformado",
        "finalidades",
        "id",
        "nascimento",
        "nomeCompleto",
        "parentesco"
      ]);
    }
    // O numero nao esta em lugar nenhum do corpo — nem cru, nem pontuado, nem em parte.
    expect(paraRevisar.body).not.toContain(cpfDoDependente);
    expect(paraRevisar.body).not.toContain(cpfDoDependente.slice(0, 9));
    expect(paraRevisar.body).not.toContain(`"cpf"`);
  });

  it("P0-V5 Deve_Responder404_Quando_DpRevisaProcessoDeOutraEmpresa", async () => {
    // Mesma direcao do P0-1 de processos: o alvo e montado direto na empresa B, e quem le e o DP da
    // empresa A. Antes, o servico respondia 200 com `null` para processo alheio — o que confirmava
    // de graca que o processo existia. Agora e a MESMA resposta de inexistente.
    // Origem por TESTE efetivado, como no P0-1 de processos: e a fixture que o CHECK de coerencia
    // aceita sem turno nem retrato. A origem nao importa para o que se prova aqui — a empresa.
    const funcaoB = "33333333-3333-4333-8333-333333330501";
    const testeB = "33333333-3333-4333-8333-333333330502";
    const processoB = "33333333-3333-4333-8333-333333330503";
    await executarSql(
      "insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing",
      [funcaoB, idsTeste.empresaB, "Funcao Ficha B"]
    );
    await executarSql(
      `insert into admissoes_testes
         (id, empresa_id, nome_completo, cpf, funcao_id, jornada_horario, inicio_em, fim_combinado_em,
          criado_por, atualizado_por)
       select $1, $2, 'Pessoa da Empresa B', $3, $4, 'seg a sex, 08:00 as 17:00',
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
      `insert into admissoes_processos_ficha (processo_id, empresa_id) values ($1, $2) on conflict do nothing`,
      [processoB, idsTeste.empresaB]
    );

    const alheia = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoB}/ficha`,
      headers: { cookie: cookieDpReal }
    });
    expect(alheia.statusCode, alheia.body).toBe(404);
    expect(alheia.body).not.toContain("Pessoa da Empresa B");

    const inexistente = await contexto.app.inject({
      method: "GET",
      url: "/api/admissoes/processos/00000000-0000-4000-8000-000000000000/ficha",
      headers: { cookie: cookieDpReal }
    });
    expect(inexistente.statusCode).toBe(404);

    // Processo DESTA empresa sem ficha continua respondendo `null`, que e "o candidato ainda nao
    // abriu o link" — estado legitimo, e a tela de revisao diz isso.
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Sem Ficha",
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-09-15"
      }
    });
    assertOk(criado, 201);
    const semFicha = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${criado.json().data.id as string}/ficha`,
      headers: { cookie: cookieDpReal }
    });
    assertOk(semFicha, 200);
    expect(semFicha.json().data).toBeNull();
  });

  it("P0-V3 Deve_RecusarRevisao_Quando_CARGO_NaoEhDp", async () => {
    const { processoId } = await processoComToken();
    for (const [rota, payload] of [
      ["ficha", undefined],
      ["ficha/devolver", { versao: 1, pendencias: "x" }]
    ] as const) {
      const metodo = payload ? "POST" : "GET";
      const resposta = await contexto.app.inject({
        method: metodo,
        url: `/api/admissoes/processos/${processoId}/${rota}`,
        headers: { cookie: cookieGerenciaReal },
        ...(payload ? { payload } : {})
      });
      expect(resposta.statusCode, `${metodo} ${rota}`).toBe(403);
    }
  });

  it("P0-V3 Deve_ManterOTokenForaDaUrl_E_ForaDaResposta", async () => {
    // `req.url` e o campo que o logger do Fastify registra SEMPRE. Como a rota nao tem parametro
    // de token nem aceita query, o token nao tem por onde entrar nele.
    const { token } = await processoComToken();
    const resposta = await abrirFicha(token);
    assertOk(resposta, 200);

    // E a resposta tambem nao devolve o token: nao ha rota que o recupere depois da emissao.
    expect(resposta.body).not.toContain(token);

    // A fonte dos controllers prova o resto: nenhuma rota publica declara token em caminho ou
    // query. Os DOIS arquivos entram na varredura — a V4 criou `dependentes.controller.ts`, e
    // varrer so o da ficha teria transformado o arquivo novo num ponto cego bem no lugar onde a
    // garantia importa.
    const arquivos = ["ficha.controller.ts", "dependentes.controller.ts"];
    const rotasPublicas = arquivos.flatMap((arquivo) => {
      const fonte = readFileSync(join(RAIZ_TESTE, "api", "src", "admissoes", arquivo), "utf8");
      return [...fonte.matchAll(/"(\/api\/admissao[^"]*)"/gu)]
        .map((achado) => achado[1])
        .filter((rota): rota is string => rota !== undefined);
    });
    expect(rotasPublicas.length).toBeGreaterThan(0);
    for (const rota of rotasPublicas) {
      expect(rota, rota).not.toContain("?");
      // O UNICO parametro de caminho permitido e `:id`, que e o id do dependente. Qualquer outro
      // nome (`:token`, `:convite`, `:t`) poria segredo em `req.url`, que o logger registra sempre.
      const parametros = [...rota.matchAll(/:([A-Za-z0-9_]+)/gu)].map((a) => a[1]);
      expect(parametros.filter((nome) => nome !== "id"), rota).toEqual([]);
    }
  });
});
