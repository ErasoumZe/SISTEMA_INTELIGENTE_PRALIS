import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { avisoPrivacidadeVigente } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * ADM-003 V4 — os P0 dos dependentes do candidato.
 *
 * O que esta suite protege sao dados de TERCEIROS — muitas vezes de criancas — informados por gente
 * que pode nunca ser admitida, numa rota que fica exposta na internet e nao atras de um login. Cada
 * asserção aqui existe porque a falha correspondente vaza ou corrompe dado de quem nem sabe que o
 * sistema existe.
 *
 * Duas provas sao feitas DUAS vezes, pela API e por SQL direto: digito verificador e duplicidade de
 * CPF. O motivo e a decisao D-7 — a regra tem de valer para qualquer caminho, e um teste que so
 * passa pela API prova o Zod, nao o banco.
 */
describe("admissoes dependentes publicos integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let turnoId: string;
  let sequencia = 0;

  const CABECALHO = "x-admissao-convite";

  function comDigitos(base: string) {
    const dv = (parcial: string) => {
      const numeros = parcial.split("").map(Number);
      const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
      const resto = (soma * 10) % 11;
      return resto > 9 ? 0 : resto;
    };
    const d1 = dv(base);
    return `${base}${d1}${dv(base + d1)}`;
  }

  /** CPF do PROCESSO: precisa ser inedito no banco inteiro, entao anda com a sequencia. */
  function proximoCpf() {
    return comDigitos(String(72000000 + sequencia++ * 977).padStart(9, "0"));
  }

  /** CPF de DEPENDENTE: unico so dentro do processo, entao pode repetir entre processos. */
  function cpfDeDependente(n: number) {
    return comDigitos(String(100200300 + n));
  }

  /** O mesmo CPF com o ultimo digito trocado: forma valida, digito verificador errado. */
  function comDvErrado(cpf: string) {
    return cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);
  }

  const NOVO_DEPENDENTE = {
    nomeCompleto: "Dependente Sintetico Um",
    nascimento: "2016-03-04",
    parentesco: "Filho(a)",
    finalidades: ["Imposto de renda"]
  };

  async function processoComToken() {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Dos Dependentes",
        cpf: proximoCpf(),
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-10-01"
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
    const token = convite.json().data.token as string;

    // A ficha nasce no primeiro acesso do candidato, e e ela que as rotas de dependente travam.
    // Abrir aqui e o que a tela faz de verdade: o formulario carrega a ficha antes de tudo.
    const aberta = await contexto.app.inject({
      method: "GET",
      url: "/api/admissao/ficha",
      headers: { [CABECALHO]: token }
    });
    assertOk(aberta, 200);
    return { processoId, token, versao: aberta.json().data.versao as number };
  }

  function listar(token: string) {
    return contexto.app.inject({
      method: "GET",
      url: "/api/admissao/dependentes",
      headers: { [CABECALHO]: token }
    });
  }

  function criar(token: string, payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/admissao/dependentes",
      headers: { [CABECALHO]: token },
      payload
    });
  }

  function editar(token: string, id: string, payload: Record<string, unknown>) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/admissao/dependentes/${id}`,
      headers: { [CABECALHO]: token },
      payload
    });
  }

  function excluir(token: string, id: string) {
    return contexto.app.inject({
      method: "DELETE",
      url: `/api/admissao/dependentes/${id}`,
      headers: { [CABECALHO]: token }
    });
  }

  function fichaCompleta(versao: number, semDependentes: boolean | undefined) {
    return {
      versao,
      ...(semDependentes === undefined ? {} : { semDependentes }),
      avisoPrivacidadeVersao: avisoPrivacidadeVigente,
      nascimento: "1994-02-11",
      sexo: "Masculino",
      estadoCivil: "Casado",
      racaCor: "Branca",
      grauInstrucao: "Ensino medio completo",
      nacionalidade: "Brasileira",
      naturalidade: "Cidade Sintetica/SP",
      nomeMae: "Mae Sintetica",
      cep: "01001000",
      logradouro: "Rua Sintetica",
      numero: "200",
      bairro: "Centro",
      municipio: "Cidade Sintetica",
      uf: "SP",
      telefone: "11999990001",
      rgNumero: "000000001",
      rgOrgao: "SSP",
      rgUf: "SP",
      rgEmissao: "2014-05-02"
    };
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    turnoId = "77777777-7777-4777-8777-777777770001";
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Manha Dependentes', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  // --- A porta ----------------------------------------------------------------------------------

  it("P0-V4 Deve_Responder401_Quando_SemToken_E_NaoAceitarSessaoNoLugar", async () => {
    const semNada = await contexto.app.inject({ method: "GET", url: "/api/admissao/dependentes" });
    expect(semNada.statusCode).toBe(401);

    // Cookie de usuario interno NAO substitui o token: o DP nao entra pela porta do candidato.
    const comSessao = await contexto.app.inject({
      method: "GET",
      url: "/api/admissao/dependentes",
      headers: { cookie: cookieAdmin }
    });
    expect(comSessao.statusCode, comSessao.body).toBe(401);
  });

  it("P0-V4 Deve_Responder404_Quando_TokenDesconhecido", async () => {
    // 404 e nao 401/410: quem esta adivinhando nao recebe confirmacao de que algo existe.
    const alvo = "99999999-9999-4999-8999-999999990001";
    const desconhecido = "f".repeat(64);
    expect((await listar(desconhecido)).statusCode).toBe(404);
    expect((await criar(desconhecido, NOVO_DEPENDENTE)).statusCode).toBe(404);
    expect((await editar(desconhecido, alvo, NOVO_DEPENDENTE)).statusCode).toBe(404);
    expect((await excluir(desconhecido, alvo)).statusCode).toBe(404);
  });

  it("P0-V4 Deve_Responder410_Quando_ConviteRevogadoOuExpirado", async () => {
    const revogado = await processoComToken();
    const revogar = await contexto.app.inject({
      method: "DELETE",
      url: `/api/admissoes/processos/${revogado.processoId}/convite`,
      headers: { cookie: cookieAdmin }
    });
    expect(revogar.statusCode).toBe(204);
    const aposRevogar = await listar(revogado.token);
    expect(aposRevogar.statusCode, aposRevogar.body).toBe(410);
    expect(aposRevogar.json().code).toBe("CONVITE_REVOGADO");

    const vencido = await processoComToken();
    // `criado_em` anda junto: o CHECK `expira_em > criado_em` recusa convite que expirou antes de
    // nascer, e ele esta certo. Envelhecer a linha e o jeito honesto de simular o prazo vencido.
    await executarSql(
      `update admissoes_convites
          set criado_em = now() - interval '20 days', expira_em = now() - interval '1 day'
        where processo_id = $1`,
      [vencido.processoId]
    );
    const aposVencer = await criar(vencido.token, NOVO_DEPENDENTE);
    expect(aposVencer.statusCode, aposVencer.body).toBe(410);
    expect(aposVencer.json().code).toBe("CONVITE_EXPIRADO");
  });

  // --- O ciclo de vida --------------------------------------------------------------------------

  it("P0-V4 Deve_CriarEditarEExcluir_E_DerivarEmpresaDoConvite", async () => {
    const { token, processoId } = await processoComToken();

    const vazio = await listar(token);
    assertOk(vazio, 200);
    expect(vazio.json().data.itens).toHaveLength(0);
    // Ninguem respondeu nada ainda — e isso NAO e "tem dependentes".
    expect(vazio.json().data.semDependentes).toBeNull();

    const criado = await criar(token, { ...NOVO_DEPENDENTE, cpf: cpfDeDependente(1) });
    assertOk(criado, 200);
    expect(criado.json().data.itens).toHaveLength(1);
    // Cadastrar alguem desmarca "nao tenho dependentes" no mesmo ato.
    expect(criado.json().data.semDependentes).toBe(false);
    const id = criado.json().data.itens[0].id as string;

    const linha = await consultarUm<{ empresa_id: string; cpf: string; finalidades: string[] }>(
      `select empresa_id, cpf, finalidades from admissoes_processos_dependentes where id = $1`,
      [id]
    );
    // A empresa saiu do CONVITE. O candidato nunca informou empresa nem processo.
    expect(linha?.empresa_id).toBe(idsTeste.empresaA);
    expect(linha?.cpf).toBe(cpfDeDependente(1));
    expect(linha?.finalidades).toEqual(["Imposto de renda"]);

    const editado = await editar(token, id, {
      ...NOVO_DEPENDENTE,
      nomeCompleto: "Dependente Sintetico Corrigido",
      cpf: "",
      finalidades: []
    });
    assertOk(editado, 200);
    expect(editado.json().data.itens[0].nomeCompleto).toBe("Dependente Sintetico Corrigido");
    // CPF vazio LIMPA em vez de reprovar: crianca costuma nao ter, e o campo e opcional de proposito.
    expect(editado.json().data.itens[0].cpf).toBeNull();
    // Editar nao mexe na declaracao: quem tem um dependente continua tendo depois de corrigir o nome.
    expect(editado.json().data.semDependentes).toBe(false);

    const removido = await excluir(token, id);
    assertOk(removido, 200);
    expect(removido.json().data.itens).toHaveLength(0);
    // Remover o ULTIMO volta para "nao respondeu", e nao marca "nao tenho" no lugar do candidato.
    expect(removido.json().data.semDependentes).toBeNull();

    const conferencia = await consultarUm<{ sem_dependentes: boolean | null }>(
      `select sem_dependentes from admissoes_processos_ficha where processo_id = $1`,
      [processoId]
    );
    expect(conferencia?.sem_dependentes).toBeNull();
  });

  it("P0-V4 Deve_ManterOsDadosDoDependenteForaDaTrilha", async () => {
    // A trilha e append-only e guarda NOMES de campo, nunca valores. Gravar nome ou CPF de um
    // terceiro ali duplicaria a PII num lugar de onde ela nao sai mais.
    const { token, processoId } = await processoComToken();
    const cpf = cpfDeDependente(2);
    const criado = await criar(token, { ...NOVO_DEPENDENTE, cpf });
    assertOk(criado, 200);

    const eventos = await consultarTodos<{ linha: string }>(
      `select h::text as linha from admissoes_processos_historico h where processo_id = $1`,
      [processoId]
    );
    for (const evento of eventos) {
      expect(evento.linha).not.toContain(cpf);
      expect(evento.linha).not.toContain(NOVO_DEPENDENTE.nomeCompleto);
    }
  });

  it("P0-V4 Deve_RecusarMexerEmDependente_Quando_FichaJaFoiEnviada", async () => {
    const { token } = await processoComToken();
    const criado = await criar(token, NOVO_DEPENDENTE);
    assertOk(criado, 200);
    const id = criado.json().data.itens[0].id as string;

    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(criado.json().data.versao as number, false)
    });
    expect(enviar.statusCode, enviar.body).toBe(204);

    // Depois de enviada a ficha sai das maos do candidato — inclusive a lista de dependentes.
    for (const resposta of [
      await criar(token, NOVO_DEPENDENTE),
      await editar(token, id, NOVO_DEPENDENTE),
      await excluir(token, id)
    ]) {
      expect(resposta.statusCode, resposta.body).toBe(409);
      expect(resposta.json().code).toBe("FICHA_NAO_EDITAVEL");
    }
  });

  // --- CPF: a decisao D-7 ------------------------------------------------------------------------

  it("P0-V4 Deve_RecusarCpfComDigitoVerificadorErrado_NaApi_E_NoBanco", async () => {
    const { token, processoId } = await processoComToken();
    const invalido = comDvErrado(cpfDeDependente(3));

    const pelaApi = await criar(token, { ...NOVO_DEPENDENTE, cpf: invalido });
    expect(pelaApi.statusCode, pelaApi.body).toBe(400);

    // E agora SEM passar pela API: o CHECK da migration 0040 refaz a conta do modulo 11. Antes da
    // D-7 esta linha entrava, porque o banco so conferia "onze digitos".
    await expect(
      executarSql(
        `insert into admissoes_processos_dependentes
           (empresa_id, processo_id, nome_completo, nascimento, parentesco, cpf)
         values ($1, $2, 'Fora Do Contrato', '2015-01-01', 'Filho(a)', $3)`,
        [idsTeste.empresaA, processoId, invalido]
      )
    ).rejects.toThrow(/admissoes_processos_dependentes_cpf_check/u);

    // As onze sequencias repetidas passam na aritmetica do modulo 11 e por isso tem guarda propria.
    await expect(
      executarSql(
        `insert into admissoes_processos_dependentes
           (empresa_id, processo_id, nome_completo, nascimento, parentesco, cpf)
         values ($1, $2, 'Fora Do Contrato', '2015-01-01', 'Filho(a)', '11111111111')`,
        [idsTeste.empresaA, processoId]
      )
    ).rejects.toThrow(/admissoes_processos_dependentes_cpf_check/u);

    // E o NULL continua entrando: o CPF do dependente e opcional, e essa e a razao de a coluna
    // existir sem NOT NULL.
    await executarSql(
      `insert into admissoes_processos_dependentes
         (empresa_id, processo_id, nome_completo, nascimento, parentesco, cpf)
       values ($1, $2, 'Sem Cpf Mesmo', '2020-07-07', 'Filho(a)', null)`,
      [idsTeste.empresaA, processoId]
    );
    const semCpf = await consultarTodos(
      `select id from admissoes_processos_dependentes where processo_id = $1 and cpf is null`,
      [processoId]
    );
    expect(semCpf).toHaveLength(1);
  });

  it("P0-V4 Deve_RecusarCpfRepetidoNoMesmoProcesso_NaApi_E_NoBanco", async () => {
    const { token, processoId } = await processoComToken();
    const cpf = cpfDeDependente(4);

    assertOk(await criar(token, { ...NOVO_DEPENDENTE, cpf }), 200);

    const repetido = await criar(token, {
      ...NOVO_DEPENDENTE,
      nomeCompleto: "Outra Pessoa Mesmo Cpf",
      cpf
    });
    expect(repetido.statusCode, repetido.body).toBe(409);
    expect(repetido.json().code).toBe("DEPENDENTE_CPF_DUPLICADO");

    // Pelo banco, sem a API no caminho: o indice unico parcial e quem realmente garante.
    await expect(
      executarSql(
        `insert into admissoes_processos_dependentes
           (empresa_id, processo_id, nome_completo, nascimento, parentesco, cpf)
         values ($1, $2, 'Fora Do Contrato', '2015-01-01', 'Filho(a)', $3)`,
        [idsTeste.empresaA, processoId, cpf]
      )
    ).rejects.toThrow(/admissoes_processos_dependentes_cpf_unico/u);

    // O indice e PARCIAL: dois dependentes sem CPF convivem, porque exigir CPF de crianca criaria
    // dado falso. Isso e decisao, nao lacuna — e esta escrita aqui para nao ser "corrigida" por engano.
    for (const nome of ["Bebe Um", "Bebe Dois"]) {
      assertOk(await criar(token, { ...NOVO_DEPENDENTE, nomeCompleto: nome }), 200);
    }
  });

  it("P0-V4 Deve_NaoDuplicar_Quando_DuasAbasCadastramOMesmoCpfAoMesmoTempo", async () => {
    const { token, processoId } = await processoComToken();
    const cpf = cpfDeDependente(5);

    // Sem serializacao as duas leriam "nao existe" e as duas gravariam. O lock da ficha ordena, e o
    // indice unico decide — a segunda perde, e perde com 409, nao com 500.
    const [uma, outra] = await Promise.all([
      criar(token, { ...NOVO_DEPENDENTE, cpf }),
      criar(token, { ...NOVO_DEPENDENTE, cpf })
    ]);
    expect([uma.statusCode, outra.statusCode].sort()).toEqual([200, 409]);

    const linhas = await consultarTodos(
      `select id from admissoes_processos_dependentes where processo_id = $1 and cpf = $2`,
      [processoId, cpf]
    );
    expect(linhas).toHaveLength(1);
  });

  // --- Isolamento ---------------------------------------------------------------------------------

  it("P0-V4 Deve_IsolarPorEmpresa_Quando_DependenteEhDeOutroTenant", async () => {
    // O alvo EXISTE, e e de outra empresa. Um id inexistente daria 404 tambem e nao provaria nada
    // sobre isolamento — provaria so que 404 acontece.
    const funcaoB = "77777777-7777-4777-8777-777777770002";
    const turnoB = "77777777-7777-4777-8777-777777770003";
    const processoB = "77777777-7777-4777-8777-777777770004";
    const dependenteB = "77777777-7777-4777-8777-777777770005";

    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao B Dependentes')
       on conflict do nothing`,
      [funcaoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno B Dependentes', '06:00', '14:00', 'M', array['SEGUNDA']::text[])
       on conflict do nothing`,
      [turnoB, idsTeste.empresaB]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa da Empresa B', $3, $4, $5, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [processoB, idsTeste.empresaB, proximoCpf(), funcaoB, turnoB]
    );
    await executarSql(
      `insert into admissoes_processos_dependentes
         (id, empresa_id, processo_id, nome_completo, nascimento, parentesco)
       values ($1, $2, $3, 'Dependente Da Empresa B', '2018-09-09', 'Filho(a)')
       on conflict do nothing`,
      [dependenteB, idsTeste.empresaB, processoB]
    );

    const { token } = await processoComToken();
    assertOk(await criar(token, NOVO_DEPENDENTE), 200);

    // Ler nao ve o alheio...
    const listagem = await listar(token);
    assertOk(listagem, 200);
    const ids = (listagem.json().data.itens as { id: string }[]).map((item) => item.id);
    expect(ids).not.toContain(dependenteB);

    // ...e escrever nao alcanca. 404, nao 403: distinguir entregaria a existencia de graca.
    for (const resposta of [
      await editar(token, dependenteB, { ...NOVO_DEPENDENTE, nomeCompleto: "Invadido" }),
      await excluir(token, dependenteB)
    ]) {
      expect(resposta.statusCode, resposta.body).toBe(404);
      expect(resposta.json().code).toBe("DEPENDENTE_NAO_ENCONTRADO");
    }

    // E a linha alheia continua la, intacta.
    const sobrevivente = await consultarUm<{ nome_completo: string }>(
      `select nome_completo from admissoes_processos_dependentes where id = $1`,
      [dependenteB]
    );
    expect(sobrevivente?.nome_completo).toBe("Dependente Da Empresa B");
  });

  it("P0-V4 Deve_IsolarPorProcesso_Quando_OConviteEhDeOutroCandidato", async () => {
    // Mesma empresa, candidatos diferentes. O `id` do dependente sozinho acharia a linha; e o filtro
    // por processo que impede um candidato de mexer na familia do outro.
    const primeiro = await processoComToken();
    const segundo = await processoComToken();

    const criado = await criar(primeiro.token, NOVO_DEPENDENTE);
    assertOk(criado, 200);
    const id = criado.json().data.itens[0].id as string;

    const espiar = await listar(segundo.token);
    assertOk(espiar, 200);
    expect(espiar.json().data.itens).toHaveLength(0);

    const apagar = await excluir(segundo.token, id);
    expect(apagar.statusCode, apagar.body).toBe(404);

    const continua = await consultarTodos(
      `select id from admissoes_processos_dependentes where id = $1`,
      [id]
    );
    expect(continua).toHaveLength(1);
  });

  // --- A declaracao ---------------------------------------------------------------------------------

  it("P0-V4 Deve_RecusarDeclararQueNaoTem_Quando_HaDependenteCadastrado", async () => {
    const { token } = await processoComToken();
    const criado = await criar(token, NOVO_DEPENDENTE);
    assertOk(criado, 200);

    // No rascunho: a incoerencia que ja da para recusar cedo e recusada cedo.
    const rascunho = await contexto.app.inject({
      method: "PUT",
      url: "/api/admissao/ficha",
      headers: { [CABECALHO]: token },
      payload: { versao: criado.json().data.versao, semDependentes: true }
    });
    expect(rascunho.statusCode, rascunho.body).toBe(409);
    expect(rascunho.json().code).toBe("DEPENDENTES_INCOERENTES");

    // E no envio tambem: o CHECK do banco cobra que a declaracao EXISTA, nao que ela seja verdade.
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(criado.json().data.versao as number, true)
    });
    expect(enviar.statusCode, enviar.body).toBe(409);
    expect(enviar.json().code).toBe("DEPENDENTES_INCOERENTES");
  });

  it("P0-V4 Deve_RecusarEnvio_Quando_DeclarouQueTem_E_NaoCadastrouNinguem", async () => {
    const { token, versao } = await processoComToken();
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(versao, false)
    });
    expect(enviar.statusCode, enviar.body).toBe(409);
    expect(enviar.json().code).toBe("DEPENDENTES_INCOERENTES");
  });

  it("P0-V4 Deve_RecusarEnvio_Quando_NaoHouveDeclaracao", async () => {
    // Lista vazia tambem significa "nao respondeu". Sem a resposta explicita, o envio nao passa —
    // e a recusa e do contrato, antes de chegar ao banco.
    const { token, versao } = await processoComToken();
    const enviar = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: token },
      payload: fichaCompleta(versao, undefined)
    });
    expect(enviar.statusCode, enviar.body).toBe(400);
  });

  it("P0-V4 Deve_AceitarEnvio_Quando_DeclaracaoBateComALista", async () => {
    // Os dois caminhos coerentes existem e passam: com dependente e `false`, sem dependente e `true`.
    const comDependente = await processoComToken();
    const criado = await criar(comDependente.token, { ...NOVO_DEPENDENTE, cpf: cpfDeDependente(6) });
    assertOk(criado, 200);
    const enviarUm = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: comDependente.token },
      payload: fichaCompleta(criado.json().data.versao as number, false)
    });
    expect(enviarUm.statusCode, enviarUm.body).toBe(204);

    const semDependente = await processoComToken();
    const enviarDois = await contexto.app.inject({
      method: "POST",
      url: "/api/admissao/ficha/enviar",
      headers: { [CABECALHO]: semDependente.token },
      payload: fichaCompleta(semDependente.versao, true)
    });
    expect(enviarDois.statusCode, enviarDois.body).toBe(204);

    const linha = await consultarUm<{ sem_dependentes: boolean }>(
      `select sem_dependentes from admissoes_processos_ficha where processo_id = $1`,
      [comDependente.processoId]
    );
    expect(linha?.sem_dependentes).toBe(false);
  });
});
