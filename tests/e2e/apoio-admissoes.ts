// `test` entra por causa do `test.skip` da fixture: sem catalogo no banco isolado, a suite PULA
// dizendo o que faltou, em vez de falhar por um erro que nao e da tela.
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Apoio dos E2E de ADMISSOES: montar, por API, um processo com ficha em determinado estado.
 *
 * Vive fora dos `.spec` porque duas suites precisam do mesmo cenario — a da revisao e a da fila —, e
 * duas copias divergiriam no primeiro ajuste de payload. Tudo aqui e SINTETICO: nomes com prefixo,
 * CPFs gerados com digito verificador valido e variando por execucao.
 */

export const API = process.env["E2E_API_URL"] ?? "http://localhost:4100";
export const CABECALHO = "x-admissao-convite";

/** CPF sintetico valido por digito verificador. Nada de dado real. */
export function cpfSintetico(base9: string) {
  const dv = (parcial: string) => {
    const numeros = parcial.split("").map(Number);
    const soma = numeros.reduce((total, n, i) => total + n * (numeros.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto > 9 ? 0 : resto;
  };
  const d1 = dv(base9);
  return `${base9}${d1}${dv(base9 + d1)}`;
}

/** Nove digitos que variam por execucao, para o CPF do processo nao colidir com o da rodada anterior. */
export function base9Unica(deslocamento: number) {
  return String((Math.floor(Date.now() / 1000) % 100_000_000) * 7 + deslocamento).padStart(9, "0").slice(-9);
}

export async function dadosJson<T>(resposta: { json(): Promise<unknown> }): Promise<T> {
  const corpo = (await resposta.json()) as { data: T };
  return corpo.data;
}

/**
 * Prepara um processo com ficha ENVIADA e dois dependentes (um com CPF, um sem), tudo por API, com a
 * sessao do DP no navegador. Devolve o id do processo, o nome sintetico e o token do candidato.
 */
export async function processoComFichaEnviada(page: Page, rotulo: string, deslocamento: number) {
  const api: APIRequestContext = page.request;
  const nome = `E2E ${rotulo} ${Date.now()}`;

  const funcoes = await dadosJson<Array<{ id: string }>>(await api.get(`${API}/api/admissoes/funcoes`));
  const turnos = await dadosJson<Array<{ id: string; completo: boolean; ativo: boolean }>>(
    await api.get(`${API}/api/admissoes/turnos`)
  );
  const turno = turnos.find((t) => t.completo && t.ativo);
  test.skip(!funcoes[0] || !turno, "precisa de uma funcao e um turno completo no banco isolado");
  if (!funcoes[0] || !turno) throw new Error("sem catalogo");

  const criado = await api.post(`${API}/api/admissoes/processos`, {
    data: {
      nomeCompleto: nome,
      cpf: cpfSintetico(base9Unica(deslocamento)),
      funcaoId: funcoes[0].id,
      turnoId: turno.id,
      dataAdmissao: "2026-10-01"
    }
  });
  expect(criado.status(), await criado.text()).toBe(201);
  const { id: processoId } = await dadosJson<{ id: string }>(criado);

  const exame = await api.put(`${API}/api/admissoes/processos/${processoId}/exame`, {
    data: { versao: 1, situacao: "aso_apto" }
  });
  expect(exame.status(), await exame.text()).toBe(204);

  const convite = await api.post(`${API}/api/admissoes/processos/${processoId}/convite`, { data: {} });
  expect(convite.status(), await convite.text()).toBe(200);
  const { token } = await dadosJson<{ token: string }>(convite);

  // Daqui em diante e o CANDIDATO: um contexto de rede PROPRIO, sem o cookie do DP — so o token no
  // cabecalho. Reaproveitar `page.request` levaria a sessao do DP junto, e o teste provaria menos.
  const candidato = await request.newContext();
  try {
    const aberta = await candidato.get(`${API}/api/admissao/ficha`, { headers: { [CABECALHO]: token } });
    expect(aberta.status(), await aberta.text()).toBe(200);

    const cpfDoDependente = cpfSintetico(base9Unica(deslocamento + 500));
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
      const resposta = await candidato.post(`${API}/api/admissao/dependentes`, {
        headers: { [CABECALHO]: token },
        data: dependente
      });
      expect(resposta.status(), await resposta.text()).toBe(200);
    }

    await enviarFicha(candidato, token);
    return { processoId, nome, token, cpfDoDependente };
  } finally {
    await candidato.dispose();
  }
}

/** O candidato envia a ficha completa (campos sinteticos). `semDependentes: false`: ha dois cadastrados. */
export async function enviarFicha(candidato: APIRequestContext, token: string) {
  const aberta = await candidato.get(`${API}/api/admissao/ficha`, { headers: { [CABECALHO]: token } });
  const ficha = await dadosJson<{ versao: number; avisoVersaoVigente: string }>(aberta);
  const enviar = await candidato.post(`${API}/api/admissao/ficha/enviar`, {
    headers: { [CABECALHO]: token },
    data: {
      versao: ficha.versao,
      semDependentes: false,
      avisoPrivacidadeVersao: ficha.avisoVersaoVigente,
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
  expect(enviar.status(), await enviar.text()).toBe(204);
}

