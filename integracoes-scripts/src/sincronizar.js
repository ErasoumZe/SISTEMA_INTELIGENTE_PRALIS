import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { enviarVendaIntegracao, verificarApi } from "./api-client.js";
import { buscarVendasIncrementais } from "./creare-repository.js";
import { criarPoolCreare } from "./database.js";
import { obterConfig } from "./env.js";
import { montarPayloads } from "./payload.js";
import { gravarCursor, lerCursor } from "./cursor.js";
import { gravarFila, lerFila } from "./fila-falhas.js";
import { ehErroPermanente, enviarComRetry } from "./retry.js";
import { adquirirLock, liberarLock } from "./lock.js";

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Caminhos do estado de runtime (cursor, fila e lock). Compartilhado pelo modo 1-ciclo e pelo loop.
export function derivarCaminhos(config) {
  const estadoDir = path.isAbsolute(config.sincronizacao.estadoDir)
    ? config.sincronizacao.estadoDir
    : path.join(raizProjeto, config.sincronizacao.estadoDir);
  return {
    estadoDir,
    cursorArquivo: path.join(estadoDir, "cursor.json"),
    filaArquivo: path.join(estadoDir, "fila-falhas.json"),
    lockArquivo: path.join(estadoDir, "agente.lock")
  };
}

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

// Um ciclo de sincronizacao (sem lock — quem chama garante a exclusao). Reusado pelo modo 1-ciclo
// e pelo loop. Pode lancar (ex.: API fora do ar); o chamador decide se aborta ou tenta de novo.
export async function executarCiclo(config, caminhos) {
  const sync = config.sincronizacao;
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
  for (const payload of await lerFila(caminhos.filaArquivo)) {
    await processar(payload, true);
  }

  // 2) Janela incremental desde o cursor.
  const cursor = await lerCursor(caminhos.cursorArquivo);
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
  await gravarFila(caminhos.filaArquivo, falhas);
  if (novoCursor) await gravarCursor(caminhos.cursorArquivo, novoCursor);

  // 4) Log resumido do ciclo.
  console.log(
    `[sincronizar] recebidas=${contagem.recebidas} fila_reprocessada=${contagem.filaReprocessada} ` +
      `criadas=${contagem.criadas} atualizadas=${contagem.atualizadas} sem_novidade=${contagem.semNovidade} ` +
      `erros=${contagem.erros} fila_pendente=${falhas.length} cursor=${novoCursor?.ultimaDataHoraVenda ?? "-"}`
  );

  return { ...contagem, filaPendente: falhas.length };
}

// Modo 1-CICLO (ex.: Agendador de Tarefas): adquire o lock, roda um ciclo e libera. Se ja houver
// execucao em andamento (lock ativo), pula — evita sobrepor com o loop ou outra tarefa agendada.
async function main() {
  const config = obterConfig();
  const caminhos = derivarCaminhos(config);
  const maxIdadeMs = config.sincronizacao.lockMaxMinutos * 60_000;

  if (!(await adquirirLock(caminhos.lockArquivo, { maxIdadeMs }))) {
    console.log("[sincronizar] outra execucao em andamento (lock ativo); pulando este ciclo.");
    return;
  }
  try {
    await executarCiclo(config, caminhos);
  } finally {
    await liberarLock(caminhos.lockArquivo);
  }
}

// So roda main() quando executado direto (node src/sincronizar.js); nao quando importado (loop.js).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
