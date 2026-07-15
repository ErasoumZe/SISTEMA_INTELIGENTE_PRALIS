import type { DadosExternos } from "@padaria/shared/api";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  AtualizarCampoIntegracaoPayload,
  CampoVinculoIntegracao,
  CriarIntegracaoChavePayload,
  IntegracaoCampoConfigDto,
  IntegracaoIngestaoResultado,
  IntegracaoQuery,
  SalvarVinculoIntegracaoPayload,
  TipoIntegracao,
  TipoRegistroIntegracao,
  VendaIntegracaoAgregadaPayload
} from "@padaria/shared/integracoes";
import {
  camposVinculoIntegracao,
  tiposRegistroIntegracao,
  vendaIntegracaoAgregadaSchema
} from "@padaria/shared/integracoes";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import { enviarEmail } from "../auth/email.js";
import { ErroDominio, erroValidacao, naoAutorizado, naoProcessavel, proibido } from "../erros.js";
import {
  buscarCaixaParaVendaRepository,
  buscarChavePorCodigoHashRepository,
  buscarClienteAutomaticoRepository,
  buscarFormaPagamentoAutomaticoRepository,
  buscarPdvAutomaticoRepository,
  buscarProdutoAutomaticoRepository,
  buscarRegistroIntegracaoRepository,
  buscarVinculoResolvidoRepository,
  contarVendasIntegradasNoDiaRepository,
  criarChaveIntegracaoRepository,
  criarClienteRepository,
  criarFormaPagamentoRepository,
  criarOuAtualizarVendaIntegradaRepository,
  criarPdvComContaRepository,
  criarProdutoRepository,
  inativarChaveIntegracaoRepository,
  listarCamposConfigRepository,
  listarChavesIntegracaoRepository,
  listarEmailsAdminsDaEmpresaRepository,
  listarEmpresasComChaveAtivaRepository,
  listarHistoricoIntegracaoRepository,
  listarVinculosRepository,
  obterEmpresaDaChaveRepository,
  registrarHistoricoRepository,
  registrarSemNovidadeRepository,
  salvarCampoConfigRepository,
  upsertRegistroIntegracaoRepository,
  upsertVinculoRepository,
  type IntegracaoChaveLinha
} from "./integracoes.repository.js";

export const integracoesDisponiveis: Array<{ tipo: TipoIntegracao; nome: string }> = [
  { tipo: "vendas", nome: "Vendas do PDV" }
];
const tiposIntegracaoDisponiveis = new Set<string>(integracoesDisponiveis.map((integracao) => integracao.tipo));
const tiposRegistroDisponiveis = new Set<string>(tiposRegistroIntegracao);

const alfabetoUlid = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function gerarUlid(): string {
  let tempo = Date.now();
  const chars = new Array<string>(26);
  for (let i = 9; i >= 0; i -= 1) {
    chars[i] = alfabetoUlid[tempo % 32] ?? "0";
    tempo = Math.floor(tempo / 32);
  }
  const random = randomBytes(10);
  let bits = 0;
  let valor = 0;
  let pos = 10;
  for (const byte of random) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5 && pos < 26) {
      chars[pos] = alfabetoUlid[(valor >> (bits - 5)) & 31] ?? "0";
      bits -= 5;
      pos += 1;
    }
  }
  while (pos < 26) {
    chars[pos] = alfabetoUlid[Math.floor(Math.random() * 32)] ?? "0";
    pos += 1;
  }
  return chars.join("");
}

function jsonCanonico(valor: DadosExternos): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map((item) => jsonCanonico(item)).join(",")}]`;
  const objeto = valor as Record<string, DadosExternos>;
  return `{${Object.keys(objeto)
    .sort()
    .map((chave) => `${JSON.stringify(chave)}:${jsonCanonico(objeto[chave])}`)
    .join(",")}}`;
}

function hashPayload(payload: VendaIntegracaoAgregadaPayload): string {
  return createHash("sha256").update(jsonCanonico(payload)).digest("hex");
}

function hashChaveIntegracao(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

// Best-effort para atribuir um identificador ao historico quando o payload nem validou.
function extrairIdVenda(corpo: DadosExternos): string | null {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  const venda = (corpo as Record<string, DadosExternos>)["Venda"];
  if (venda === null || typeof venda !== "object" || Array.isArray(venda)) return null;
  const idVenda = (venda as Record<string, DadosExternos>)["idVenda"];
  return typeof idVenda === "string" ? idVenda : null;
}

function compararHashConstante(hashRecebido: string, hashArmazenado: string | null): boolean {
  const esperado = Buffer.from(hashArmazenado ?? "0".repeat(64), "hex");
  const recebido = Buffer.from(hashRecebido.padEnd(64, "0").slice(0, 64), "hex");
  return timingSafeEqual(recebido, esperado) && hashRecebido === hashArmazenado;
}

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function configPadrao(
  configs: IntegracaoCampoConfigDto[],
  campo: CampoVinculoIntegracao
): { criarAutomaticamente: boolean; vincularAutomaticamente: boolean } {
  const encontrada = configs.find((config) => config.campo === campo);
  return {
    criarAutomaticamente: encontrada?.criarAutomaticamente ?? true,
    vincularAutomaticamente: encontrada?.vincularAutomaticamente ?? true
  };
}

function tipoRegistroDoCampo(campo: CampoVinculoIntegracao): TipoRegistroIntegracao {
  if (campo === "forma_pagamento") return "forma_pagamento";
  return campo;
}

async function obterConfigs(chave: IntegracaoChaveLinha, db: ExecutorBanco) {
  return listarCamposConfigRepository(chave.empresaId, chave.tipo, db);
}

async function registrarPendente(input: {
  chave: IntegracaoChaveLinha;
  campo: CampoVinculoIntegracao;
  identificadorExterno: string;
  descricaoExterna?: string | null;
  db: ExecutorBanco;
}) {
  await upsertVinculoRepository(
    {
      empresaId: input.chave.empresaId,
      tipo: input.chave.tipo,
      tipoRegistro: tipoRegistroDoCampo(input.campo),
      identificadorExterno: input.identificadorExterno,
      descricaoExterna: input.descricaoExterna ?? null,
      registroSistemaId: null,
      pendente: true
    },
    input.db
  );
}

async function registrarResolvido(input: {
  chave: IntegracaoChaveLinha;
  campo: CampoVinculoIntegracao;
  identificadorExterno: string;
  descricaoExterna?: string | null;
  registroSistemaId: string;
  db: ExecutorBanco;
}) {
  await upsertVinculoRepository(
    {
      empresaId: input.chave.empresaId,
      tipo: input.chave.tipo,
      tipoRegistro: tipoRegistroDoCampo(input.campo),
      identificadorExterno: input.identificadorExterno,
      descricaoExterna: input.descricaoExterna ?? null,
      registroSistemaId: input.registroSistemaId,
      pendente: false
    },
    input.db
  );
}

async function resolverVinculo(input: {
  chave: IntegracaoChaveLinha;
  campo: CampoVinculoIntegracao;
  identificadorExterno: string;
  descricaoExterna?: string | null;
  configs: IntegracaoCampoConfigDto[];
  db: ExecutorBanco;
  buscarAutomatico: () => Promise<{ id: string } | null>;
  criarAutomatico: () => Promise<{ id: string } | null>;
}): Promise<string | null> {
  const tipoRegistro = tipoRegistroDoCampo(input.campo);
  const vinculo = await buscarVinculoResolvidoRepository(
    input.chave.empresaId,
    input.chave.tipo,
    tipoRegistro,
    input.identificadorExterno,
    input.db
  );
  if (vinculo) return vinculo.id;

  const config = configPadrao(input.configs, input.campo);
  if (config.vincularAutomaticamente) {
    const existente = await input.buscarAutomatico();
    if (existente) {
      await registrarResolvido({ ...input, registroSistemaId: existente.id });
      return existente.id;
    }
  }

  if (config.criarAutomaticamente) {
    const criado = await input.criarAutomatico();
    if (criado) {
      await registrarResolvido({ ...input, registroSistemaId: criado.id });
      return criado.id;
    }
  }

  await registrarPendente(input);
  return null;
}

async function resolverVinculosVenda(
  chave: IntegracaoChaveLinha,
  payload: VendaIntegracaoAgregadaPayload,
  db: ExecutorBanco
) {
  const configs = await obterConfigs(chave, db);
  const venda = payload.Venda;
  const pdvId = await resolverVinculo({
    chave,
    campo: "pdv",
    identificadorExterno: venda.idCaixa,
    descricaoExterna: venda.nomeCaixa,
    configs,
    db,
    buscarAutomatico: () => buscarPdvAutomaticoRepository(chave.empresaId, venda.idCaixa, venda.nomeCaixa, db),
    criarAutomatico: () => criarPdvComContaRepository(chave.empresaId, venda.nomeCaixa, venda.idCaixa, db)
  });

  const clienteId = venda.idCliente
    ? await resolverVinculo({
        chave,
        campo: "cliente",
        identificadorExterno: venda.idCliente,
        descricaoExterna: venda.nomeCliente ?? venda.documentoCliente ?? null,
        configs,
        db,
        buscarAutomatico: () =>
          buscarClienteAutomaticoRepository(chave.empresaId, venda.documentoCliente, venda.nomeCliente, db),
        criarAutomatico: () =>
          venda.nomeCliente
            ? criarClienteRepository(chave.empresaId, venda.nomeCliente, venda.documentoCliente, db)
            : Promise.resolve(null)
      })
    : null;

  const produtosPorIdentificador = new Map<string, string | null>();
  for (const item of payload.ItensVenda) {
    if (produtosPorIdentificador.has(item.idProduto)) continue;
    produtosPorIdentificador.set(
      item.idProduto,
      await resolverVinculo({
        chave,
        campo: "produto",
        identificadorExterno: item.idProduto,
        descricaoExterna: item.descricaoProduto,
        configs,
        db,
        buscarAutomatico: () =>
          buscarProdutoAutomaticoRepository(chave.empresaId, item.idProduto, item.descricaoProduto, db),
        criarAutomatico: () => criarProdutoRepository(chave.empresaId, item.idProduto, item.descricaoProduto, db)
      })
    );
  }

  const formasPagamentoPorIdentificador = new Map<string, string | null>();
  for (const pagamento of payload.PagamentosVenda) {
    if (formasPagamentoPorIdentificador.has(pagamento.idFormaPagamento)) continue;
    formasPagamentoPorIdentificador.set(
      pagamento.idFormaPagamento,
      await resolverVinculo({
        chave,
        campo: "forma_pagamento",
        identificadorExterno: pagamento.idFormaPagamento,
        descricaoExterna: pagamento.descricaoFormaPagamento,
        configs,
        db,
        buscarAutomatico: () =>
          buscarFormaPagamentoAutomaticoRepository(chave.empresaId, pagamento.descricaoFormaPagamento, db),
        criarAutomatico: () => criarFormaPagamentoRepository(chave.empresaId, pagamento.descricaoFormaPagamento, db)
      })
    );
  }

  // Liga a venda ao caixa do mesmo PDV cujo periodo aberto contem a dataVenda (null se nao houver).
  const caixaId =
    pdvId !== null
      ? ((await buscarCaixaParaVendaRepository(chave.empresaId, pdvId, venda.dataHoraVenda, db))?.id ?? null)
      : null;

  return { pdvId, clienteId, colaboradorId: null, caixaId, produtosPorIdentificador, formasPagamentoPorIdentificador };
}

export async function listarIntegracoes(query: IntegracaoQuery, perfil: PerfilUsuario) {
  if (query.empresaId) validarEmpresa(perfil, query.empresaId);
  const empresasLiberadas = empresasPermitidas(perfil);
  const chaves = await listarChavesIntegracaoRepository(query);
  const chavesDisponiveis = chaves.filter((chave) => tiposIntegracaoDisponiveis.has(chave.tipo));
  return {
    integracoes: integracoesDisponiveis,
    chaves: chavesDisponiveis.filter((chave) => empresasLiberadas.includes(chave.empresaId))
  };
}

export async function criarChaveIntegracao(payload: CriarIntegracaoChavePayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  const codigo = gerarUlid();
  return criarChaveIntegracaoRepository({
    ...payload,
    codigo,
    codigoHash: hashChaveIntegracao(codigo),
    criadoPor: perfil.usuarioId
  });
}

export async function inativarChaveIntegracao(id: string, perfil: PerfilUsuario) {
  const chave = await obterEmpresaDaChaveRepository(id);
  if (!chave) throw new Error("Chave nao encontrada");
  validarEmpresa(perfil, chave.empresaId);
  await inativarChaveIntegracaoRepository(id, chave.empresaId);
}

export async function listarHistoricoIntegracao(query: IntegracaoQuery, perfil: PerfilUsuario) {
  if (query.empresaId) validarEmpresa(perfil, query.empresaId);
  const historico = await listarHistoricoIntegracaoRepository(query, empresasPermitidas(perfil));
  return historico.filter((item) => tiposIntegracaoDisponiveis.has(item.tipo));
}

// --- Alerta de silencio da integracao de vendas -----------------------------------------------
// Avisa os administradores por e-mail quando um dia fecha sem NENHUMA venda recebida por integracao
// numa empresa com chave ativa. Disparado best-effort ao carregar o historico (nao ha job diario no
// sistema). Dedup em memoria garante no maximo 1 alerta por empresa/dia por processo — aceitavel
// para um aviso interno; reinicia a cada deploy (sem tabela nova, por decisao de nao criar migrations).
const alertasSilencioEnviados = new Set<string>();

// yyyy-MM-dd do dia anterior a `hoje` (UTC, como o resto do sistema fatia datas). "Todo dia e dia
// util": nao pula fim de semana/feriado.
function diaAnteriorIso(hoje: Date): string {
  const dia = new Date(hoje);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

function assuntoSilencio(dia: string, nomeEmpresa: string): string {
  return `Sem vendas por integracao em ${dia} - ${nomeEmpresa}`;
}

function htmlSilencio(nomeEmpresa: string, dia: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#2f2320">
  <h2 style="color:#c0521d">Integracao de vendas sem movimento</h2>
  <p>A empresa <strong>${nomeEmpresa}</strong> nao recebeu nenhuma venda por integracao no dia <strong>${dia}</strong>.</p>
  <p>Se isso nao era esperado, verifique se a automacao de vendas esta ativa e enviando dados.</p>
  <p style="color:#6f635c;font-size:12px">Alerta automatico do Sistema Cicluz. Voce recebe porque e administrador desta empresa.</p>
</div>`;
}

export interface ResumoSilencioIntegracao {
  dia: string;
  verificadas: number;
  silenciosas: number;
  alertasEnviados: number;
}

// Verifica as empresas com chave de vendas ATIVA (restrito a `empresaIds`, quando informado) e, para
// cada dia silencioso ainda nao alertado, envia e-mail aos admins. Robusto por empresa: um erro numa
// nao interrompe as demais. Nunca lanca para o chamador (proprio para fire-and-forget).
export async function verificarSilencioIntegracao(input: {
  empresaIds?: string[] | undefined;
  hoje: Date;
}): Promise<ResumoSilencioIntegracao> {
  const dia = diaAnteriorIso(input.hoje);
  const comChaveAtiva = await listarEmpresasComChaveAtivaRepository("vendas");
  const filtro = input.empresaIds ? new Set(input.empresaIds) : null;
  const alvo = filtro ? comChaveAtiva.filter((empresa) => filtro.has(empresa.empresaId)) : comChaveAtiva;

  let silenciosas = 0;
  let alertasEnviados = 0;
  for (const empresa of alvo) {
    const chaveDedup = `${empresa.empresaId}:${dia}`;
    if (alertasSilencioEnviados.has(chaveDedup)) continue;
    try {
      const recebidas = await contarVendasIntegradasNoDiaRepository(empresa.empresaId, dia);
      if (recebidas > 0) continue;
      silenciosas += 1;
      const admins = await listarEmailsAdminsDaEmpresaRepository(empresa.empresaId);
      // Marca antes de enviar: mesmo com falha parcial de e-mail, nao repetimos o alerta hoje.
      alertasSilencioEnviados.add(chaveDedup);
      for (const admin of admins) {
        await enviarEmail({
          para: admin.email,
          assunto: assuntoSilencio(dia, empresa.nome),
          html: htmlSilencio(empresa.nome, dia)
        });
        alertasEnviados += 1;
      }
    } catch (erro) {
      console.error(
        `[integracoes] falha ao verificar silencio da empresa ${empresa.empresaId} em ${dia}:`,
        erro instanceof Error ? erro.message : erro
      );
    }
  }

  return { dia, verificadas: alvo.length, silenciosas, alertasEnviados };
}

export async function listarDicionarioIntegracao(
  query: { empresaId: string; tipo: TipoIntegracao },
  perfil: PerfilUsuario
) {
  validarEmpresa(perfil, query.empresaId);
  const [salvos, vinculos] = await Promise.all([
    listarCamposConfigRepository(query.empresaId, query.tipo),
    listarVinculosRepository(query.empresaId, query.tipo)
  ]);
  const configs = camposVinculoIntegracao.map((campo) => {
    const salvo = salvos.find((item) => item.campo === campo);
    return {
      empresaId: query.empresaId,
      tipo: query.tipo,
      campo,
      criarAutomaticamente: salvo?.criarAutomaticamente ?? true,
      vincularAutomaticamente: salvo?.vincularAutomaticamente ?? true
    };
  });
  return { configs, vinculos: vinculos.filter((vinculo) => tiposRegistroDisponiveis.has(vinculo.tipoRegistro)) };
}

export async function salvarCampoIntegracao(payload: AtualizarCampoIntegracaoPayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  await salvarCampoConfigRepository(payload);
  return payload;
}

export async function salvarVinculoIntegracao(payload: SalvarVinculoIntegracaoPayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  await upsertVinculoRepository({
    empresaId: payload.empresaId,
    tipo: payload.tipo,
    tipoRegistro: payload.tipoRegistro,
    identificadorExterno: payload.identificadorExterno,
    descricaoExterna: payload.descricaoExterna ?? null,
    registroSistemaId: payload.registroSistemaId,
    pendente: false
  });
  return payload;
}

export async function receberVendaIntegracao(
  chaveApi: string,
  corpo: DadosExternos
): Promise<IntegracaoIngestaoResultado> {
  const hashRecebido = hashChaveIntegracao(chaveApi);
  const chave = await buscarChavePorCodigoHashRepository(hashRecebido);
  if (!chave || !compararHashConstante(hashRecebido, chave.codigoHash)) {
    throw naoAutorizado("Chave de integracao invalida", "INVALID_INTEGRATION_KEY");
  }
  if (chave.tipo !== "vendas")
    throw erroValidacao("Integracao nao aceita payload de vendas", "INVALID_INTEGRATION_TYPE");

  // Validacao do payload: falha vira registro "erro" no historico + erro estruturado 400.
  const analise = vendaIntegracaoAgregadaSchema.safeParse(corpo);
  if (!analise.success) {
    const detalhes = analise.error.issues.map((issue) => ({
      caminho: issue.path.join("."),
      mensagem: issue.message
    }));
    const mensagemErro = detalhes
      .slice(0, 5)
      .map((detalhe) => `${detalhe.caminho || "(raiz)"}: ${detalhe.mensagem}`)
      .join("; ");
    await registrarHistoricoRepository({
      chave,
      identificadorExterno: extrairIdVenda(corpo),
      hashConteudo: null,
      status: "erro",
      mensagemErro,
      payload: corpo
    });
    throw erroValidacao("Payload de venda integrada invalido", "INTEGRATION_VALIDATION_ERROR", detalhes);
  }

  const payload = analise.data;
  const identificadorExterno = payload.Venda.idVenda;
  const hashConteudo = hashPayload(payload);

  try {
    return await banco.transaction(async (tx) => {
      const registro = await buscarRegistroIntegracaoRepository(chave, "venda", identificadorExterno, tx);
      if (registro?.hashConteudo === hashConteudo) {
        await registrarSemNovidadeRepository(chave, identificadorExterno, hashConteudo, payload, tx);
        await registrarHistoricoRepository(
          { chave, identificadorExterno, hashConteudo, status: "sem_novidade", payload },
          tx
        );
        return { status: "sem_novidade", vendaId: registro.registroSistemaId, identificadorExterno };
      }

      const vinculos = await resolverVinculosVenda(chave, payload, tx);
      const venda = await criarOuAtualizarVendaIntegradaRepository(
        {
          chave,
          payload,
          hashConteudo,
          ...(registro ? { vendaSistemaId: registro.registroSistemaId } : {}),
          ...vinculos
        },
        tx
      );

      await upsertRegistroIntegracaoRepository(
        {
          chave,
          identificadorExterno,
          hashConteudo,
          registroSistemaId: venda.id,
          payload
        },
        tx
      );

      const status = registro ? "atualizado" : "criado";
      await registrarHistoricoRepository({ chave, identificadorExterno, hashConteudo, status, payload }, tx);
      return { status, vendaId: venda.id, identificadorExterno };
    });
  } catch (error) {
    // Erros de dominio ja sao estruturados; nao viram "erro" de processamento.
    if (error instanceof ErroDominio) throw error;
    const mensagemErro = error instanceof Error ? error.message : String(error);
    try {
      // Fora da transacao que sofreu rollback: conexao nova (banco default) -> o registro sobrevive.
      await registrarHistoricoRepository({
        chave,
        identificadorExterno,
        hashConteudo,
        status: "erro",
        mensagemErro,
        payload
      });
    } catch {
      // Nem gravar o erro foi possivel (ex.: banco fora): propaga o original -> 500 -> agente re-tenta.
      throw error instanceof Error ? error : new Error(mensagemErro);
    }
    throw naoProcessavel(`Falha ao processar venda integrada: ${mensagemErro}`, "INTEGRATION_PROCESSING_ERROR");
  }
}
