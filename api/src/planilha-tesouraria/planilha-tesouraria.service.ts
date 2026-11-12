// Envio dos relatorios do fechamento para a planilha da Tesouraria (Marco, 12/11/2026). ADITIVO: le as fotos ja
// anexadas, confere a matematica, monta as linhas e grava. Nada daqui altera o fechamento, os calculos ou as
// validacoes do caixa. Ultima etapa da Tesouraria: so quem confere fechamento (`fechamentos_caixa_conferir`).
import { readFile } from "node:fs/promises";
import type { PerfilUsuario } from "@padaria/shared";
import {
  ABA_CARTOES,
  ABA_PDV,
  FORMAS_PDV,
  bandeirasDaLeitura,
  celulasCartao,
  celulasPdv,
  chaveCartao,
  chavePdv,
  conferirCartao,
  conferirPdv,
  dataIsoParaPlanilha,
  linhasCartao,
  normalizarData,
  rotuloPdvPlanilha,
  subtrairManha,
  type Conferencia,
  type EnvioPlanilhaPayload,
  type LeituraCartaoPlanilha,
  type PreviaPlanilha,
  type ResultadoEnvioPlanilha
} from "@padaria/shared/planilha-tesouraria";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import {
  buscarCaixaPorIdRepository,
  listarAnexosFechamentoCaixaComCaminhoRepository
} from "../caixa/caixa.repository.js";
import { env } from "../env.js";
import { erroValidacao, ErroDominio, naoEncontrado } from "../erros.js";
import { GoogleConfiguracaoAusenteError } from "../google/google-auth.js";
import { GoogleSheetsGatewayReal, type SheetsGateway } from "../google/google-sheets-gateway.js";
import { caminhoAbsolutoDocumento } from "../lancamentos/foto-documento.js";
import {
  leituraCartaoSimulada,
  leituraPdvSimulada,
  lerCartaoParaPlanilha,
  lerPdvParaPlanilha
} from "./gemini-planilha.js";
import { gravarNaProximaLinha, type ResultadoGravacao } from "./planilha-tesouraria.sheets.js";
import { buscarCaixaDaManhaRepository } from "./planilha-tesouraria.repository.js";

type Caixa = NonNullable<Awaited<ReturnType<typeof buscarCaixaPorIdRepository>>>;

async function caixaEncerrado(caixaId: string, perfil: PerfilUsuario): Promise<Caixa> {
  const caixa = await buscarCaixaPorIdRepository(caixaId);
  if (!caixa || !podeAcessarEmpresa(perfil, caixa.empresaId)) throw naoEncontrado("Caixa nao encontrado");
  if (caixa.status === "aberto") {
    throw new ErroDominio("O relatório só vai para a planilha depois do fechamento.", 409, "PLANILHA_CAIXA_ABERTO");
  }
  return caixa;
}

async function fotos(caixa: Pick<Caixa, "id" | "empresaId">, tipo: "comprovante_cartao" | "relatorio_vendas_creare") {
  const anexos = (await listarAnexosFechamentoCaixaComCaminhoRepository(caixa.id, caixa.empresaId)).filter(
    (anexo) => anexo.tipo === tipo
  );
  return Promise.all(
    anexos.map(async (anexo) => ({
      dados: await readFile(caminhoAbsolutoDocumento(anexo.caminho)),
      mimeType: anexo.mimeType
    }))
  );
}

const simulada = () => env.NODE_ENV === "development" && env.GEMINI_MAQUININHA_SIMULADA;
function configIa() {
  if (!env.GEMINI_API_KEY) {
    throw new ErroDominio("A leitura por IA não está configurada.", 503, "PLANILHA_IA_NAO_CONFIGURADA");
  }
  return { chave: env.GEMINI_API_KEY, modelo: env.GEMINI_MODEL, timeoutMs: env.GEMINI_TIMEOUT_MS };
}

async function lerCartao(caixa: Caixa): Promise<LeituraCartaoPlanilha | null> {
  const arquivos = await fotos(caixa, "comprovante_cartao");
  if (!arquivos.length) return null;
  if (simulada())
    return leituraCartaoSimulada(caixa.maquininhaNumeroSerie ?? null, dataIsoParaPlanilha(caixa.dataMovimento));
  return lerCartaoParaPlanilha(arquivos, configIa());
}

function juntarConferencias(...conferencias: Conferencia[]): Conferencia {
  const avisos = conferencias.flatMap((c) => c.avisos);
  const status = conferencias.some((c) => c.status === "DIVERGENTE")
    ? "DIVERGENTE"
    : conferencias.some((c) => c.status === "CONFERÊNCIA NECESSÁRIA")
      ? "CONFERÊNCIA NECESSÁRIA"
      : "CONCILIADO";
  return { status, avisos };
}

async function previaCartao(caixa: Caixa, pdv: string): Promise<PreviaPlanilha["cartao"]> {
  const leitura = await lerCartao(caixa);
  if (!leitura) return null;
  let conferencia = conferirCartao(leitura);
  const avisos: string[] = [];
  const data = normalizarData(leitura.data) ?? dataIsoParaPlanilha(caixa.dataMovimento);
  if (!normalizarData(leitura.data)) avisos.push("DATA NÃO LIDA: USADA A DATA DO CAIXA. CONFIRA.");
  const serieDoCaixa = caixa.maquininhaNumeroSerie?.trim().toUpperCase() ?? null;
  const serieLida = leitura.numeroSerie?.trim().toUpperCase() ?? null;
  if (serieDoCaixa && serieLida && serieDoCaixa !== serieLida) {
    avisos.push(`Nº DE SÉRIE LIDO (${serieLida}) DIFERENTE DA MAQUININHA DO CAIXA (${serieDoCaixa}).`);
  }
  let bandeiras = bandeirasDaLeitura(leitura);
  if (caixa.turnoCaixa === "tarde") {
    // A tarde grava acumulado MENOS a manha, por bandeira (mesma maquininha do PDV).
    const manha = caixa.pdvId
      ? await buscarCaixaDaManhaRepository({
          empresaId: caixa.empresaId,
          pdvId: caixa.pdvId,
          dataMovimento: caixa.dataMovimento
        })
      : null;
    const caixaManha = manha ? await buscarCaixaPorIdRepository(manha.id) : null;
    const leituraManha = caixaManha ? await lerCartao(caixaManha) : null;
    if (!leituraManha) {
      return {
        linhas: [],
        totalEfetivado: leitura.totalEfetivado.valor,
        conferencia: {
          status: "CONFERÊNCIA NECESSÁRIA",
          avisos: [...avisos, "SEM O RELATÓRIO DO TURNO DA MANHÃ, NÃO DÁ PARA TIRAR DO ACUMULADO O VALOR DA MANHÃ."]
        }
      };
    }
    const diferenca = subtrairManha(leitura, leituraManha);
    bandeiras = diferenca.bandeiras;
    avisos.push(...diferenca.avisos);
    conferencia = juntarConferencias(conferencia, conferirCartao(leituraManha));
  }
  return {
    linhas: linhasCartao(bandeiras, { data, numeroSerie: serieLida ?? serieDoCaixa ?? "", pdv }).filter(
      (linha) => linha.numeroSerie
    ),
    totalEfetivado: leitura.totalEfetivado.valor,
    conferencia: avisos.length
      ? juntarConferencias(conferencia, { status: "CONFERÊNCIA NECESSÁRIA", avisos })
      : conferencia
  };
}

async function previaPdv(caixa: Caixa, pdv: string): Promise<PreviaPlanilha["relatorioPdv"]> {
  const arquivos = await fotos(caixa, "relatorio_vendas_creare");
  if (!arquivos.length) return null;
  const leitura = simulada()
    ? leituraPdvSimulada(dataIsoParaPlanilha(caixa.dataMovimento))
    : await lerPdvParaPlanilha(arquivos, configIa());
  const avisos: string[] = [];
  const data = normalizarData(leitura.data) ?? dataIsoParaPlanilha(caixa.dataMovimento);
  if (!normalizarData(leitura.data)) avisos.push("DATA DAS VENDAS NÃO LIDA: USADA A DATA DO CAIXA. CONFIRA.");
  const operador = caixa.caixaResponsavelNomeAbertura?.trim() ?? "";
  if (!operador) avisos.push("OPERADOR DO CAIXA NÃO IDENTIFICADO. PREENCHA ANTES DE ENVIAR.");
  const formas = Object.fromEntries(FORMAS_PDV.map((forma) => [forma, leitura.formas[forma] ?? 0])) as Record<
    (typeof FORMAS_PDV)[number],
    number
  >;
  const conferencia = conferirPdv(leitura);
  return {
    linha: { data, pdv, operador: operador.toUpperCase() || "-", ...formas },
    totalImpresso: leitura.totalImpresso,
    conferencia: avisos.length
      ? juntarConferencias(conferencia, { status: "CONFERÊNCIA NECESSÁRIA", avisos })
      : conferencia
  };
}

export async function montarPreviaPlanilha(caixaId: string, perfil: PerfilUsuario): Promise<PreviaPlanilha> {
  const caixa = await caixaEncerrado(caixaId, perfil);
  const pdv = rotuloPdvPlanilha(caixa.pdvNome, caixa.turnoCaixa);
  const turno = caixa.turnoCaixa === "manha" ? "MANHÃ" : caixa.turnoCaixa === "tarde" ? "TARDE" : null;
  if (!pdv) {
    return {
      caixaId,
      pdv: null,
      turno,
      cartao: null,
      relatorioPdv: null,
      avisos: ["PDV OU TURNO DO CAIXA NÃO IDENTIFICADO: NADA SERÁ GRAVADO ATÉ RESOLVER."]
    };
  }
  const [cartao, relatorioPdv] = await Promise.all([previaCartao(caixa, pdv), previaPdv(caixa, pdv)]);
  const avisos: string[] = [];
  if (!cartao) avisos.push("SEM FOTO DO RELATÓRIO DA MAQUININHA NESTE FECHAMENTO.");
  if (!relatorioPdv) avisos.push("SEM FOTO DO RELATÓRIO DO PDV (CREARE) NESTE FECHAMENTO.");
  return { caixaId, pdv, turno, cartao, relatorioPdv, avisos };
}

function semAcesso(aba: string, faltaConfiguracao: boolean): ResultadoGravacao {
  const mensagem = faltaConfiguracao
    ? "INTEGRAÇÃO COM O GOOGLE NÃO CONFIGURADA. OS DADOS FORAM PREPARADOS, MAS NÃO FORAM GRAVADOS."
    : "SEM ACESSO À PLANILHA (COMPARTILHE COM A CONTA GOOGLE DO SISTEMA COMO EDITOR). NADA FOI GRAVADO.";
  return { aba, gravado: false, linhaInicial: null, linhas: 0, mensagem };
}

/**
 * Grava o que a Tesouraria conferiu (e, se preciso, corrigiu) na previa. O PDV e SEMPRE o do caixa: uma linha com
 * outro PDV e recusada. Cada aba e independente; sucesso so com a gravacao confirmada.
 */
export async function enviarParaPlanilha(
  caixaId: string,
  payload: EnvioPlanilhaPayload,
  perfil: PerfilUsuario,
  gateway: SheetsGateway = new GoogleSheetsGatewayReal()
): Promise<ResultadoEnvioPlanilha> {
  const caixa = await caixaEncerrado(caixaId, perfil);
  const pdv = rotuloPdvPlanilha(caixa.pdvNome, caixa.turnoCaixa);
  if (!pdv) throw erroValidacao("PDV ou turno do caixa não identificado: nada foi gravado.", "PLANILHA_SEM_PDV");
  const linhasCartao = payload.cartao ?? [];
  if (linhasCartao.some((linha) => linha.pdv !== pdv) || (payload.relatorioPdv && payload.relatorioPdv.pdv !== pdv)) {
    throw erroValidacao(`O PDV das linhas precisa ser o do caixa (${pdv}).`, "PLANILHA_PDV_DIFERENTE");
  }
  if (payload.relatorioPdv && payload.relatorioPdv.operador.trim().length < 2) {
    throw erroValidacao("Informe o nome do operador.", "PLANILHA_SEM_OPERADOR");
  }

  const gravar = async (
    aba: string,
    ultimaColuna: "L" | "N",
    linhas: Array<Array<string | number>>,
    chave: typeof chaveCartao
  ) => {
    try {
      return await gravarNaProximaLinha({
        gateway,
        planilhaId: env.PLANILHA_TESOURARIA_ID,
        aba,
        ultimaColuna,
        linhas,
        chave
      });
    } catch (erro) {
      return semAcesso(aba, erro instanceof GoogleConfiguracaoAusenteError);
    }
  };
  const cartao = linhasCartao.length
    ? await gravar(ABA_CARTOES, "L", linhasCartao.map(celulasCartao), chaveCartao)
    : null;
  const relatorioPdv = payload.relatorioPdv
    ? await gravar(ABA_PDV, "N", [celulasPdv(payload.relatorioPdv)], chavePdv)
    : null;
  return { cartao, relatorioPdv };
}
