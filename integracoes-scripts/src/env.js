function obterObrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variavel de ambiente obrigatoria nao informada: ${nome}`);
  return valor;
}

function obterNumero(nome, padrao) {
  const valor = process.env[nome]?.trim();
  if (!valor) return padrao;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`Variavel de ambiente invalida: ${nome}`);
  return numero;
}

export function obterConfig() {
  return {
    creare: {
      host: obterObrigatoria("SERVIDOR_CREARE_COMPILART"),
      port: obterNumero("PORTA_CREARE_COMPILART", 3306),
      database: obterObrigatoria("BANCO_CREARE_COMPILART"),
      user: obterObrigatoria("USUARIO_CREARE_COMPILART"),
      password: process.env.SENHA_CREARE_COMPILART ?? ""
    },
    padaria: {
      apiUrl: (process.env.PADARIA_API_URL?.trim() || "http://localhost:4100").replace(/\/+$/, ""),
      codigoIntegracao: obterObrigatoria("PADARIA_INTEGRACAO_CODIGO")
    },
    // Usado so pelo modo producao (src/sincronizar.js e src/loop.js). Defaults sensatos.
    sincronizacao: {
      diasIniciais: obterNumero("SYNC_DIAS_INICIAIS", 1),
      // Um minuto e o compromisso operacional: caixa ve a venda quase em tempo real, sem consultar
      // o MySQL em ciclo apertado nem pressionar a API. A reexecucao idempotente captura escrita
      // tardia do CREARE e a fila absorve quedas de rede.
      intervaloMinutos: obterNumero("SYNC_INTERVALO_MINUTOS", 1),
      lockMaxMinutos: obterNumero("SYNC_LOCK_MAX_MINUTOS", 30),
      retryTentativas: obterNumero("SYNC_RETRY_TENTATIVAS", 4),
      retryBaseMs: obterNumero("SYNC_RETRY_BASE_MS", 500),
      // Throttle de saida: teto de req/s para nao estourar o rate limit da API (fica < 300/min da
      // rota). 4 req/s por padrao => intervalo de 250ms entre envios.
      maxReqPorSegundo: obterNumero("SYNC_MAX_REQ_POR_SEGUNDO", 4),
      estadoDir: process.env.SYNC_ESTADO_DIR?.trim() || ".estado",
      // O CREARE fornece hora local; -03:00 converte o horario de Brasilia para o instante UTC real.
      offsetFuso: process.env.SYNC_FUSO_OFFSET?.trim() || "-03:00"
    }
  };
}
