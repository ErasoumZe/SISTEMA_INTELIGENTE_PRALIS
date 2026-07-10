import path from "node:path";
import { fileURLToPath } from "node:url";
import { enviarVendaIntegracao, verificarApi } from "./api-client.js";
import { buscarVendasIncrementais } from "./creare-repository.js";
import { criarPoolCreare } from "./database.js";
import { obterConfig } from "./env.js";
import { montarPayloads } from "./payload.js";
import { gravarCursor, lerCursor } from "./cursor.js";
import { gravarFila, lerFila } from "./fila-falhas.js";
import { ehErroPermanente, enviarComRetry } from "./retry.js";

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Inicio padrao (1a execucao, sem cursor): 00:00:00 de (hoje - (diasIniciais-1)), hora local.
function inicioPadrao(diasIniciais) {
  const data = new Date();
  data.setDate(data.getDate() - (Math.max(1, diasIniciais) - 1));
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia} 00:00:00`;
}

function contarStatus(resposta, contagem) {
  const status = resposta?.data?.status ?? resposta?.status;
  if (status === "criado") contagem.criadas += 1;
  else if (status === "atualizado") contagem.atualizadas += 1;
  else if (status === "sem_novidade") contagem.semNovidade += 1;
}

async function main() {
  const config = obterConfig();
  const sync = config.sincronizacao;
  const estadoDir = path.isAbsolute(sync.estadoDir) ? sync.estadoDir : path.join(raizProjeto, sync.estadoDir);
  const cursorArquivo = path.join(estadoDir, "cursor.json");
  const filaArquivo = path.join(estadoDir, "fila-falhas.json");

  await verificarApi(config.padaria.apiUrl);

  const enviar = (payload) =>
    enviarComRetry(
      () =>
        enviarVendaIntegracao({
          apiUrl: config.padaria.apiUrl,
          codigoIntegracao: config.padaria.codigoIntegracao,
          payload
        }),
      { tentativas: sync.retryTentativas, baseMs: sync.retryBaseMs }
    );

  const contagem = { recebidas: 0, filaReprocessada: 0, criadas: 0, atualizadas: 0, semNovidade: 0, erros: 0 };
  const falhas = [];

  async function processar(payload, ehReplay) {
    try {
      const resposta = await enviar(payload);
      contarStatus(resposta, contagem);
      if (ehReplay) contagem.filaReprocessada += 1;
    } catch (erro) {
      if (ehErroPermanente(erro)) {
        contagem.erros += 1;
        console.error(`[sincronizar] erro permanente na venda ${payload?.Venda?.idVenda}: ${erro.message}`);
      } else {
        falhas.push(payload);
      }
    }
  }

  // 1) Reprocessa a fila de falhas anteriores.
  for (const payload of await lerFila(filaArquivo)) {
    await processar(payload, true);
  }

  // 2) Janela incremental desde o cursor.
  const cursor = await lerCursor(cursorArquivo);
  const desde = cursor?.ultimaDataHoraVenda ?? inicioPadrao(sync.diasIniciais);
  let novoCursor = cursor;

  const pool = criarPoolCreare(config.creare);
  try {
    const { vendas, itens, pagamentos } = await buscarVendasIncrementais(pool, desde);
    contagem.recebidas = vendas.length;

    const payloads = montarPayloads({ vendas, itens, pagamentos }, { offsetFuso: sync.offsetFuso });
    for (const payload of payloads) {
      await processar(payload, false);
    }

    let maxData = desde;
    let maxId = cursor?.ultimoIdVendaBalcao ?? null;
    for (const venda of vendas) {
      if (String(venda.dataHoraVenda) > String(maxData)) {
        maxData = String(venda.dataHoraVenda);
        maxId = venda.idVendaBalcao;
      }
    }
    novoCursor = { ultimaDataHoraVenda: maxData, ultimoIdVendaBalcao: maxId };
  } finally {
    await pool.end();
  }

  // 3) Persiste fila e depois cursor (ordem segura a crash: cursor so avanca no fim).
  await gravarFila(filaArquivo, falhas);
  if (novoCursor) await gravarCursor(cursorArquivo, novoCursor);

  // 4) Log resumido do ciclo.
  console.log(
    `[sincronizar] recebidas=${contagem.recebidas} fila_reprocessada=${contagem.filaReprocessada} ` +
      `criadas=${contagem.criadas} atualizadas=${contagem.atualizadas} sem_novidade=${contagem.semNovidade} ` +
      `erros=${contagem.erros} fila_pendente=${falhas.length} cursor=${novoCursor?.ultimaDataHoraVenda ?? "-"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
