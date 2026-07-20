import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { enviarVendaIntegracao, verificarApi } from "./api-client.js";
import { buscarVendasDia, buscarVendasPorIds, normalizarIds } from "./creare-repository.js";
import { criarPoolCreare } from "./database.js";
import { obterConfig } from "./env.js";
import { montarPayloads } from "./payload.js";
import { ehErroPermanente, enviarComRetry } from "./retry.js";

// REPROCESSO manual: re-le vendas no CREARE e reenvia para a API. Ferramenta de recuperacao para
// vendas que ficaram de fora da ingestao (ex.: falha durante um deploy). E idempotente — o servidor
// deduplica por idVenda + hash, entao vendas ja existentes voltam "sem_novidade" e as que faltavam
// sao criadas. NAO mexe no cursor, na fila nem no lock do agente: pode rodar com o agente no ar.

export const USO = `Uso:
  npm run reprocessar -- --dia 2026-07-15
  npm run reprocessar -- --ids 522987,523147,523369

Alvos (informe exatamente um):
  --dia YYYY-MM-DD   re-le o dia inteiro no CREARE e reenvia todas as vendas.
  --ids a,b,c        reenvia apenas as vendas com esses ID_VENDA_BALCAO.

Idempotente e seguro: vendas ja existentes voltam "sem novidade"; as que
faltavam sao criadas. Nao altera o cursor nem a fila — pode rodar com o
agente/loop no ar.`;

// Erro de uso do CLI (argumentos invalidos). main() imprime a mensagem + o USO e sai com codigo 2.
export class ErroDeUso extends Error {}

function ehDataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

// Interpreta os argumentos e devolve o alvo: { dia } OU { ids }. Puro e testavel (sem I/O).
export function interpretarArgumentos(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { dia: { type: "string" }, ids: { type: "string" } },
      allowPositionals: false
    }));
  } catch (erro) {
    throw new ErroDeUso(erro instanceof Error ? erro.message : String(erro));
  }

  const temDia = typeof values.dia === "string" && values.dia.trim() !== "";
  const temIds = typeof values.ids === "string" && values.ids.trim() !== "";

  if (temDia === temIds) {
    throw new ErroDeUso("Informe exatamente um alvo: --dia OU --ids.");
  }

  if (temDia) {
    const dia = values.dia.trim();
    if (!ehDataValida(dia)) throw new ErroDeUso(`--dia invalido: "${values.dia}". Use o formato YYYY-MM-DD.`);
    return { dia };
  }

  let ids;
  try {
    ids = normalizarIds(values.ids);
  } catch (erro) {
    throw new ErroDeUso(erro instanceof Error ? erro.message : String(erro));
  }
  if (!ids.length) throw new ErroDeUso("--ids vazio. Informe ao menos um ID de venda.");
  return { ids };
}

const DESCRICAO_STATUS = {
  criado: "CRIADA (estava faltando)",
  atualizado: "atualizada",
  sem_novidade: "sem novidade (ja existia igual)"
};

// Envia os payloads um a um (reusa retry + api-client), logando o resultado de cada venda.
async function enviarPayloads(config, payloads) {
  const sync = config.sincronizacao;
  const contagem = { total: payloads.length, criadas: 0, atualizadas: 0, semNovidade: 0, erros: 0 };

  for (const payload of payloads) {
    const idVenda = payload.Venda.idVenda;
    try {
      const resposta = await enviarComRetry(
        () =>
          enviarVendaIntegracao({
            apiUrl: config.padaria.apiUrl,
            codigoIntegracao: config.padaria.codigoIntegracao,
            payload
          }),
        { tentativas: sync.retryTentativas, baseMs: sync.retryBaseMs }
      );
      const status = resposta?.data?.status ?? resposta?.status ?? "desconhecido";
      if (status === "criado") contagem.criadas += 1;
      else if (status === "atualizado") contagem.atualizadas += 1;
      else if (status === "sem_novidade") contagem.semNovidade += 1;
      console.log(`[reprocessar] ${idVenda} -> ${DESCRICAO_STATUS[status] ?? status}`);
    } catch (erro) {
      contagem.erros += 1;
      const tipo = ehErroPermanente(erro) ? "permanente" : "transitorio";
      console.error(`[reprocessar] ${idVenda} -> ERRO (${tipo}): ${erro instanceof Error ? erro.message : erro}`);
    }
  }

  return contagem;
}

// Le do CREARE conforme o alvo, monta os payloads e reenvia. Devolve a contagem do reprocesso.
export async function reprocessar(config, alvo) {
  await verificarApi(config.padaria.apiUrl);

  let dados;
  const pool = criarPoolCreare(config.creare);
  try {
    dados = alvo.dia ? await buscarVendasDia(pool, alvo.dia) : await buscarVendasPorIds(pool, alvo.ids);
  } finally {
    await pool.end();
  }

  const escopo = alvo.dia ? `dia=${alvo.dia}` : `ids=${alvo.ids.join(",")}`;
  console.log(`[reprocessar] ${escopo}: ${dados.vendas.length} venda(s) lida(s) no CREARE.`);

  // Modo --ids: avisa quais IDs pedidos nao existem no CREARE (nao ha o que reenviar).
  if (alvo.ids) {
    const encontrados = new Set(dados.vendas.map((venda) => String(venda.idVendaBalcao)));
    for (const id of alvo.ids) {
      if (!encontrados.has(String(id))) {
        console.warn(`[reprocessar] venda ${id}: NAO ENCONTRADA no CREARE (ignorada).`);
      }
    }
  }

  const payloads = montarPayloads(dados, { offsetFuso: config.sincronizacao.offsetFuso });
  const contagem = await enviarPayloads(config, payloads);

  console.log(
    `[reprocessar] ${escopo} concluido: total=${contagem.total} criadas=${contagem.criadas} ` +
      `atualizadas=${contagem.atualizadas} sem_novidade=${contagem.semNovidade} erros=${contagem.erros}`
  );

  return contagem;
}

async function main() {
  let alvo;
  try {
    alvo = interpretarArgumentos(process.argv.slice(2));
  } catch (erro) {
    if (erro instanceof ErroDeUso) {
      console.error(erro.message);
      console.error(`\n${USO}`);
      process.exitCode = 2;
      return;
    }
    throw erro;
  }

  const config = obterConfig();
  const contagem = await reprocessar(config, alvo);
  // Sai com erro se alguma venda falhou, para o operador (ou um agendador) perceber.
  if (contagem.erros > 0) process.exitCode = 1;
}

// So roda main() quando executado direto (node src/reprocessar.js); nao quando importado (testes).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
