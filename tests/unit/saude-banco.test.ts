// G-04 / D-21 — o `/health` precisa TOCAR O BANCO.
//
// Até 05/08/2026 o health devolvia um objeto estático. Com o Postgres fora do ar o container
// continuava verde no Compose e no Coolify, e o agente CREARE seguia abrindo ciclo atrás de ciclo
// contra uma API que não tinha como gravar nada.
//
// O caso perigoso NÃO é o banco recusar conexão — esse falha rápido e sozinho. É o host que engole
// os pacotes: o `connect` do TCP fica pendurado por minutos, e sem tempo limite o health ficaria
// pendurado junto, sem responder nem 200 nem 503. É esse ramo que o teste do meio exercita, e ele é
// a razão de `bancoResponde` receber a consulta por parâmetro.
import { describe, expect, it } from "vitest";
import { pool } from "../../api/src/banco/conexao.js";
import { TEMPO_LIMITE_BANCO_MS, bancoResponde } from "../../api/src/saude/saude.service.js";

// Medido em 05/08/2026, ao verificar a G-04 com `docker stop` no Postgres: SEM este ouvinte, derrubar
// o banco DERRUBAVA A API. O `pg.Pool` emite `error` quando um cliente ocioso cai, e `error` sem
// ouvinte no EventEmitter do Node nao e aviso — e `throw`. O processo morria com "Emitted 'error'
// event on BoundPool instance" e o /health nao chegava a responder 503, que e o proprio objetivo da
// G-04. Com o ouvinte, a API sobrevive, responde 503 e volta sozinha quando o banco retorna.
describe("pool do Postgres", () => {
  it("Deve_TerOuvinteDeErro_ParaQuedaDoBancoNaoDerrubarOProcesso", () => {
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });
});

describe("bancoResponde", () => {
  it("Deve_RetornarVerdadeiro_Quando_ConsultaResponde", async () => {
    await expect(bancoResponde(50, () => Promise.resolve())).resolves.toBe(true);
  });

  it("Deve_RetornarFalso_Quando_ConsultaFalha", async () => {
    // Postgres de pé mas recusando (senha errada, banco derrubado, conexões esgotadas).
    await expect(bancoResponde(50, () => Promise.reject(new Error("ECONNREFUSED")))).resolves.toBe(false);
  });

  it("Deve_RetornarFalso_Quando_ConsultaPendura_SemEsperarPorEla", async () => {
    // Promise que NUNCA resolve = o host que engole pacotes. Sem o tempo limite este teste
    // penduraria a suíte, que é exatamente o que aconteceria com a sonda do Docker em produção.
    const inicio = Date.now();
    await expect(bancoResponde(50, () => new Promise<void>(() => {}))).resolves.toBe(false);
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("Deve_NaoLancar_Quando_ConsultaRejeitaComValorNaoErro", async () => {
    // `catch` sem filtro: driver e camadas por baixo nem sempre rejeitam com Error, e o health não
    // pode virar 500 por causa disso — tem de virar 503 como qualquer outra falha de banco.
    // A regra do lint é desligada AQUI porque rejeitar com algo que não é Error é o próprio objeto
    // deste teste; obedecê-la apagaria o caso que ele cobre.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    await expect(bancoResponde(50, () => Promise.reject("string solta"))).resolves.toBe(false);
  });

  // O 2s não é gosto: os três healthchecks do Compose usam `timeout: 5s`. Passar disso faria o
  // Docker matar a sonda antes de a API conseguir responder 503 — o container cairia do mesmo
  // jeito, mas sem a resposta que diz QUAL dependência quebrou.
  it("Deve_ManterTempoLimiteAbaixoDoTimeoutDoHealthcheckDoCompose", () => {
    expect(TEMPO_LIMITE_BANCO_MS).toBeLessThan(5_000);
    expect(TEMPO_LIMITE_BANCO_MS).toBeGreaterThan(0);
  });
});
