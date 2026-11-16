import { randomBytes } from "node:crypto";
import type { DadosExternos } from "@padaria/shared/api";
import { executarEmTransacao } from "../banco/conexao.js";
import { env } from "../env.js";
import {
  enviarWhatsapp,
  estadoConexaoWhatsapp,
  whatsappSegurandoFila,
  telefoneParaWhatsapp,
  type MensagemWhatsapp
} from "../whatsapp/whatsapp-provedor.js";
import { resumoDosItens } from "../whatsapp/texto-whatsapp.js";
import { hashTokenRodada } from "./compras-rodadas.service.js";
import {
  dadosDoConviteParaEnvioRepository,
  dadosDoPedidoParaEnvioRepository,
  enfileirarEnviosRepository,
  enviadosNasUltimas24hRepository,
  proximosEnviosRepository,
  registrarResultadoEnvioRepository,
  trocarTokenDoConviteRepository,
  whatsappDoFornecedorDoPedidoRepository
} from "./compras-whatsapp.repository.js";

// Doc 57 §3: o sistema manda pelo WhatsApp a cotacao (link do convite) e o "pode entregar" (pedido
// confirmado). Roda no tick de Compras. Sem provedor configurado, nada sai e a fila espera.

const LOTE = 20;
const BYTES_DO_TOKEN = 32;

/**
 * Cadência anti-bloqueio da Evolution (16/11/2026): o WhatsApp baniu o número da padaria depois de rajadas de até
 * 20 mensagens com link. Pela Evolution sai UMA mensagem por tick (o tick roda a cada 60 s) e no máximo
 * `LIMITE_DIARIO_EVOLUTION` em 24 h; o resto espera na fila, sem gastar tentativa. Gateway por webhook e o
 * provedor de teste seguem em lote.
 */
export const LIMITE_DIARIO_EVOLUTION = 40;

/** Quantas mensagens este tick pode mandar: 0 quando o limite de 24 h da Evolution já foi atingido. */
export function loteDoTick(provedor: string, enviadasEm24h: number): number {
  if (provedor !== "evolution") return LOTE;
  return enviadasEm24h >= LIMITE_DIARIO_EVOLUTION ? 0 : 1;
}

function prazoLocal(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" }).format(instante);
}

function quantidadeBr(valor: string): string {
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

type Envio = Awaited<ReturnType<typeof proximosEnviosRepository>>[number];
type Transacao = Parameters<Parameters<typeof executarEmTransacao>[0]>[0];

/**
 * Monta a mensagem. No convite, gera um token NOVO (o banco guarda so o hash): o link que sai no WhatsApp e
 * o unico valido dali em diante.
 */
async function montarMensagem(envio: Envio, tx: Transacao): Promise<MensagemWhatsapp | null> {
  if (envio.tipo === "convite" && envio.conviteId) {
    const dados = await dadosDoConviteParaEnvioRepository(envio.conviteId, tx);
    if (!dados || (dados.status !== "aberto" && dados.status !== "aguardando_comprador")) return null;
    const token = randomBytes(BYTES_DO_TOKEN).toString("hex");
    await trocarTokenDoConviteRepository(
      { conviteId: envio.conviteId, tokenHash: hashTokenRodada(token), telefone: envio.telefone },
      tx
    );
    const link = new URL(`/rodada#t=${token}`, env.WEB_ORIGIN).toString();
    const prazo = prazoLocal(dados.expiraEm, dados.fusoHorario);
    return {
      telefone: envio.telefone,
      tipo: "convite",
      texto: [
        `Olá, ${dados.fornecedorNome}!`,
        `A ${dados.empresaNome} tem uma cotação de ${dados.totalItens} item(ns) para você.`,
        `Responda até ${prazo}: ${link}`
      ].join("\n\n")
    };
  }
  if (envio.tipo === "pedido_confirmado" && envio.pedidoId) {
    const dados = await dadosDoPedidoParaEnvioRepository(envio.pedidoId, tx);
    if (!dados) return null;
    const resumo = resumoDosItens(dados.itens.map((item) => `${quantidadeBr(item.quantidade)} ${item.descricao}`));
    return {
      telefone: envio.telefone,
      tipo: "pedido_confirmado",
      texto: [
        `Olá, ${dados.fornecedorNome}!`,
        `A ${dados.empresaNome} comprou estes produtos de você. Pode separar e entregar.`,
        resumo
      ].join("\n\n")
    };
  }
  return null;
}

/**
 * Doc 58 §6: a compra foi feita (automatica ou aceita pelo comprador). O fornecedor recebe pelo WhatsApp o que
 * ganhou e pode separar e entregar. Sem WhatsApp no cadastro, nada entra na fila.
 */
export async function enfileirarAvisoDeCompra(pedidoId: string, tx: Transacao): Promise<void> {
  const dados = await whatsappDoFornecedorDoPedidoRepository(pedidoId, tx);
  if (!dados?.whatsapp) return;
  await enfileirarEnviosRepository(
    [
      {
        empresaId: dados.empresaId,
        tipo: "pedido_confirmado",
        pedidoId,
        telefone: telefoneParaWhatsapp(dados.whatsapp)
      }
    ],
    tx
  );
}

/** Uma transacao por mensagem: uma falha nao segura as outras. Devolve quantas sairam. */
export async function processarFilaWhatsapp(aoFalhar: (envioId: string, erro: DadosExternos) => void): Promise<number> {
  // Desligado ou desconectado (13/11/2026): a fila espera sem gastar tentativa. Antes, com a instância caída, as
  // 5 tentativas acabavam em minutos ("Connection Closed") e a cotação não saía mais depois de reconectar.
  if (whatsappSegurandoFila(await estadoConexaoWhatsapp())) return 0;
  const lote = loteDoTick(
    env.WHATSAPP_PROVEDOR,
    env.WHATSAPP_PROVEDOR === "evolution" ? await enviadosNasUltimas24hRepository() : 0
  );
  let enviadas = 0;
  for (let rodada = 0; rodada < lote; rodada += 1) {
    const processou = await executarEmTransacao(async (tx) => {
      const [envio] = await proximosEnviosRepository(1, tx);
      if (!envio) return false;
      try {
        const mensagem = await montarMensagem(envio, tx);
        if (!mensagem) {
          // Convite encerrado ou pedido sumiu: nao ha o que mandar.
          await registrarResultadoEnvioRepository(
            { id: envio.id, ok: false, idExterno: null, erro: "Nada a enviar (convite encerrado)", tentativas: 99 },
            tx
          );
          return true;
        }
        const resultado = await enviarWhatsapp(mensagem);
        await registrarResultadoEnvioRepository(
          {
            id: envio.id,
            ok: resultado.ok,
            idExterno: resultado.ok ? resultado.idExterno : null,
            erro: resultado.ok ? null : resultado.erro,
            tentativas: envio.tentativas + 1
          },
          tx
        );
        if (resultado.ok) enviadas += 1;
        else aoFalhar(envio.id, new Error(resultado.erro));
      } catch (erro) {
        // Erro inesperado (banco, rede): conta a tentativa em vez de desfazer, senao a mesma mensagem
        // travaria a fila em todo tick.
        aoFalhar(envio.id, erro);
        await registrarResultadoEnvioRepository(
          {
            id: envio.id,
            ok: false,
            idExterno: null,
            erro: erro instanceof Error ? erro.message : "Falha ao enviar",
            tentativas: envio.tentativas + 1
          },
          tx
        );
      }
      return true;
    });
    if (!processou) break;
  }
  return enviadas;
}
