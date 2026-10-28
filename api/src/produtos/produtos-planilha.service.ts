import { env } from "../env.js";
import { GoogleSheetsGatewayReal, sanitizeError } from "../google/google-sheets-gateway.js";
import { EscritorPlanilhaGoogle } from "./produtos-planilha-escritor.js";
import type { ExecutorBanco } from "../banco/conexao.js";
import {
  filaDaPlanilhaRepository,
  marcarFalhaRepository,
  marcarSincronizadoRepository,
  reanimarDesistidosRepository,
  registrarPendenciaRepository,
  resumoDaFilaRepository,
  type AlvoDaPlanilha
} from "./produtos-planilha.repository.js";

/**
 * Espelho do cadastro na planilha Google (oficial `ProductSheetService` + `ReenvioSheetsService`, R-222).
 *
 * DESLIGADO ate a virada (`GOOGLE_PRODUTOS_ESPELHO_ENABLED=false`): enquanto o app de Produtos estiver no
 * ar, ele e quem escreve na planilha — dois escritores na mesma linha trocariam cadastros. Desligado,
 * nada entra na fila e o reenvio nao roda.
 *
 * Quem escreve de fato e o `EscritorDaPlanilha`: o real e o `EscritorPlanilhaGoogle` (porte do oficial —
 * reserva de linha por ID, formulas da linha-modelo, faixa da loja, abas de loja). Os testes injetam um
 * escritor com gateway falso; o cliente Google real recusa rodar sob teste.
 */
export interface EscritorDaPlanilha {
  escrever(alvo: AlvoDaPlanilha): Promise<{ linha: number | null }>;
}

let escritorInjetado: EscritorDaPlanilha | null = null;
let escritorReal: EscritorDaPlanilha | null = null;

/** So para testes: troca o escritor. */
export function definirEscritorDaPlanilhaParaTeste(escritor: EscritorDaPlanilha | null): void {
  escritorInjetado = escritor;
}

function escritor(): EscritorDaPlanilha {
  if (escritorInjetado) return escritorInjetado;
  const planilhaId = env.GOOGLE_PRODUTOS_SPREADSHEET_ID;
  // Ligado sem destino explicito: recusa antes de qualquer chamada ao Google (oficial `misconfigured`).
  if (!planilhaId) {
    return {
      async escrever() {
        throw new Error(
          "Espelho ligado, mas sem destino configurado: GOOGLE_PRODUTOS_SPREADSHEET_ID. Nada foi escrito."
        );
      }
    };
  }
  // Um por processo: o cache de aba/leiaute e a fila interna (primeira linha livre) sao dele.
  escritorReal ??= new EscritorPlanilhaGoogle(new GoogleSheetsGatewayReal(), planilhaId);
  return escritorReal;
}

export const espelhoNaPlanilhaLigado = () => env.GOOGLE_PRODUTOS_ESPELHO_ENABLED;

/** Coloca o produto na fila do espelho — na MESMA transacao da gravacao. Desligado, nao faz nada. */
export async function registrarNaFilaDaPlanilha(tx: ExecutorBanco, alvo: AlvoDaPlanilha): Promise<void> {
  if (!espelhoNaPlanilhaLigado()) return;
  await registrarPendenciaRepository(tx, alvo, {
    planilhaId: env.GOOGLE_PRODUTOS_SPREADSHEET_ID ?? "",
    aba: env.GOOGLE_PRODUTOS_BASE_TAB
  });
}

export interface ResultadoReenvio {
  ligado: boolean;
  tentados: number;
  sincronizados: number;
  falharam: number;
  desistidos: number;
  reanimados: number;
}

/** Uma rodada do reenvio (o worker roda a cada 5 minutos; o administrador pode forcar). */
export async function reprocessarFilaDaPlanilha(
  limite = 50,
  opcoes: { incluirDesistidos?: boolean } = {}
): Promise<ResultadoReenvio> {
  if (!espelhoNaPlanilhaLigado()) {
    return { ligado: false, tentados: 0, sincronizados: 0, falharam: 0, desistidos: 0, reanimados: 0 };
  }
  const reanimados = opcoes.incluirDesistidos ? await reanimarDesistidosRepository() : 0;
  const fila = await filaDaPlanilhaRepository(limite);
  let sincronizados = 0;
  let falharam = 0;
  for (const item of fila) {
    const alvo: AlvoDaPlanilha = item.produtoBaseId
      ? { produtoBaseId: item.produtoBaseId }
      : { empresaId: item.empresaId ?? "", produtoId: item.produtoId ?? "" };
    try {
      const { linha } = await escritor().escrever(alvo);
      await marcarSincronizadoRepository(item.id, linha, item.atualizadoEm);
      sincronizados += 1;
    } catch (erro) {
      await marcarFalhaRepository(
        item.id,
        item.tentativas,
        erro instanceof Error ? sanitizeError(erro) : "Falha ao escrever",
        item.atualizadoEm
      );
      falharam += 1;
    }
  }
  const { desistidos } = await resumoDaFilaRepository();
  return { ligado: true, tentados: fila.length, sincronizados, falharam, desistidos, reanimados };
}

export async function situacaoDaFilaDaPlanilha() {
  return { ligado: espelhoNaPlanilhaLigado(), ...(await resumoDaFilaRepository()) };
}

const CINCO_MINUTOS = 5 * 60_000;

/** Worker do reenvio (oficial: so em producao e com o espelho ligado; uma instancia). */
export function iniciarReenvioDaPlanilha(): NodeJS.Timeout | null {
  if (!espelhoNaPlanilhaLigado() || process.env["NODE_ENV"] !== "production") return null;
  const timer = setInterval(() => {
    void reprocessarFilaDaPlanilha(50).catch(() => undefined);
  }, CINCO_MINUTOS);
  timer.unref();
  return timer;
}
