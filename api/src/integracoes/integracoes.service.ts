import { createHash, randomBytes } from "node:crypto";
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
import { camposVinculoIntegracao } from "@padaria/shared/integracoes";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { empresasPermitidas, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import {
  buscarChavePorCodigoRepository,
  buscarClienteAutomaticoRepository,
  buscarColaboradorAutomaticoRepository,
  buscarFormaPagamentoAutomaticoRepository,
  buscarPdvAutomaticoRepository,
  buscarProdutoAutomaticoRepository,
  buscarRegistroIntegracaoRepository,
  buscarVinculoResolvidoRepository,
  criarChaveIntegracaoRepository,
  criarClienteRepository,
  criarColaboradorRepository,
  criarFormaPagamentoRepository,
  criarOuAtualizarVendaIntegradaRepository,
  criarPdvComContaRepository,
  criarProdutoRepository,
  inativarChaveIntegracaoRepository,
  listarCamposConfigRepository,
  listarChavesIntegracaoRepository,
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
  { tipo: "vendas", nome: "Vendas" },
  { tipo: "produtos_vendas", nome: "Produtos das vendas" }
];

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

function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map((item) => jsonCanonico(item)).join(",")}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto)
    .sort()
    .map((chave) => `${JSON.stringify(chave)}:${jsonCanonico(objeto[chave])}`)
    .join(",")}}`;
}

function hashPayload(payload: VendaIntegracaoAgregadaPayload): string {
  return createHash("sha256").update(jsonCanonico(payload)).digest("hex");
}

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw new Error("Empresa nao permitida");
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
  if (campo === "vendedor") return "colaborador";
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

async function resolverVinculosVenda(chave: IntegracaoChaveLinha, payload: VendaIntegracaoAgregadaPayload, db: ExecutorBanco) {
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

  const colaboradorId = venda.idVendedor
    ? await resolverVinculo({
        chave,
        campo: "vendedor",
        identificadorExterno: venda.idVendedor,
        descricaoExterna: venda.nomeVendedor ?? venda.documentoVendedor ?? null,
        configs,
        db,
        buscarAutomatico: () =>
          buscarColaboradorAutomaticoRepository(chave.empresaId, venda.documentoVendedor, venda.nomeVendedor, db),
        criarAutomatico: () =>
          venda.nomeVendedor
            ? criarColaboradorRepository(chave.empresaId, venda.nomeVendedor, venda.documentoVendedor, db)
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

  return { pdvId, clienteId, colaboradorId, produtosPorIdentificador, formasPagamentoPorIdentificador };
}

export async function listarIntegracoes(query: IntegracaoQuery, perfil: PerfilUsuario) {
  if (query.empresaId) validarEmpresa(perfil, query.empresaId);
  const empresasLiberadas = empresasPermitidas(perfil);
  const chaves = await listarChavesIntegracaoRepository(query);
  return {
    integracoes: integracoesDisponiveis,
    chaves: empresasLiberadas === null ? chaves : chaves.filter((chave) => empresasLiberadas.includes(chave.empresaId))
  };
}

export async function criarChaveIntegracao(payload: CriarIntegracaoChavePayload, perfil: PerfilUsuario) {
  validarEmpresa(perfil, payload.empresaId);
  return criarChaveIntegracaoRepository({ ...payload, codigo: gerarUlid(), criadoPor: perfil.usuarioId });
}

export async function inativarChaveIntegracao(id: string, perfil: PerfilUsuario) {
  const chave = await obterEmpresaDaChaveRepository(id);
  if (!chave) throw new Error("Chave nao encontrada");
  validarEmpresa(perfil, chave.empresaId);
  await inativarChaveIntegracaoRepository(id, chave.empresaId);
}

export async function listarHistoricoIntegracao(query: IntegracaoQuery, perfil: PerfilUsuario) {
  if (query.empresaId) validarEmpresa(perfil, query.empresaId);
  return listarHistoricoIntegracaoRepository(query, empresasPermitidas(perfil));
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
  return { configs, vinculos };
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
  codigo: string,
  payload: VendaIntegracaoAgregadaPayload
): Promise<IntegracaoIngestaoResultado> {
  const chave = await buscarChavePorCodigoRepository(codigo);
  if (!chave) throw new Error("Chave de integracao invalida");
  if (chave.tipo !== "vendas") throw new Error("Integracao nao aceita payload de vendas");

  const identificadorExterno = payload.Venda.idVenda;
  const hashConteudo = hashPayload(payload);

  return banco.transaction(async (tx) => {
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
}
