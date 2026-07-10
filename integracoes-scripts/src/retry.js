// Retry com backoff exponencial para o envio de vendas. So re-tenta falhas TRANSITORIAS
// (rede ou HTTP 5xx). Um 4xx e erro permanente (payload invalido): re-tentar nao resolve, entao
// lanca de imediato — o orquestrador conta como erro e nao enfileira (evita fila envenenada).

export function ehErroPermanente(erro) {
  const casado = /HTTP (\d{3})/.exec(String(erro?.message ?? ""));
  const status = casado ? Number(casado[1]) : 0;
  return status >= 400 && status < 500;
}

const esperarPadrao = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export async function enviarComRetry(enviar, { tentativas = 4, baseMs = 500, esperar = esperarPadrao } = {}) {
  let ultimoErro;
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    try {
      return await enviar();
    } catch (erro) {
      ultimoErro = erro;
      if (ehErroPermanente(erro)) throw erro;
      if (tentativa < tentativas - 1) await esperar(baseMs * 2 ** tentativa);
    }
  }
  throw ultimoErro;
}
