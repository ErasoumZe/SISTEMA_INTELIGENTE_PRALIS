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
    // Usado so pelo modo producao (src/sincronizar.js). Defaults sensatos; nada obrigatorio.
    sincronizacao: {
      diasIniciais: obterNumero("SYNC_DIAS_INICIAIS", 1),
      retryTentativas: obterNumero("SYNC_RETRY_TENTATIVAS", 4),
      retryBaseMs: obterNumero("SYNC_RETRY_BASE_MS", 500),
      estadoDir: process.env.SYNC_ESTADO_DIR?.trim() || ".estado",
      // Vazio = rotula a hora local do CREARE como Z (mesma convencao do caixa do ERP).
      // Ex.: "-03:00" para gerar o instante UTC real, se um dia o ERP passar a usar UTC de verdade.
      offsetFuso: process.env.SYNC_FUSO_OFFSET?.trim() || ""
    }
  };
}
