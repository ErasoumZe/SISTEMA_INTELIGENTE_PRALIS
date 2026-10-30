import { createHash } from "node:crypto";
import type { JsonValue } from "@padaria/shared/api";
import { executarEmTransacao } from "../banco/conexao.js";
import { unidadesEGruposDaEmpresaRepository } from "./produtos-base.repository.js";
import { montarPayloadBase } from "./produtos-catalogo-base.service.js";
import {
  basesPorOrigemRepository,
  estadoDaCargaRepository,
  juntarProdutosAntigosRepository,
  linhasDaLojaNaCargaRepository,
  produtosDaLojaRepository,
  vendasDosProdutosRepository
} from "./produtos-central-loja.repository.js";
import {
  CodigoBarrasDuplicadoError,
  ProdutoDuplicadoError,
  salvarProduto,
  type AtorDaEscrita
} from "./produtos.service.js";
import { lojaDaEmpresa, VinculoBaseError } from "./produtos-vinculo-base.service.js";

/**
 * Fase B2 da virada (29/10/2026, José): a loja do ERP passa a ter os produtos dela COMO ESTAO no paralelo
 * (que e o espelho da planilha, o sistema antigo da padaria). Fonte: as linhas da loja no backup completo ja
 * carregado na Central. Todos os produtos entram, ativos e inativos, cada um com a situacao que tem la; preco,
 * custo, margem, estoque minimo/maximo, grupo, unidade e fiscal vem da linha da loja (nao da BASE). Foto fica
 * de fora (decisao do José).
 *
 * - produto da loja ja ligado a BASE daquela linha: e ATUALIZADO (mantem o id, o historico de vendas e o
 *   codigo do PDV);
 * - produtos antigos da loja, soltos, com o mesmo codigo do PDV da linha (o PDV mandou o codigo com e sem
 *   zeros e a integracao criou um para cada formato): sao JUNTADOS (30/10/2026, José). Fica o que mais vendeu
 *   (empate: a venda mais recente); ele e ligado a BASE e atualizado como acima; os vinculos de venda dos
 *   outros passam a apontar para ele e os outros sao inativados, com as vendas antigas;
 * - sem produto ligado nem antigo com o codigo: e CRIADO pelo mesmo caminho da copia BASE -> loja;
 * - fica de fora, com o motivo na previa: linha sem BASE no ERP, codigo interno de outro produto, produto
 *   antigo disputado por duas linhas e o que a copia recusa (unidade, medida base, tipo...).
 *
 * Volume (cerca de 7 mil produtos): a gravacao vai em lotes; cada produto e idempotente (rodar de novo so
 * atualiza), entao o lote pode ser repetido e a acao inteira pode ser refeita antes da virada.
 */
export const CONFIRMACAO_LOJA_PELO_BACKUP = "APLICAR A LOJA PELO BACKUP";
export const LOTE_LOJA_PELO_BACKUP = 150;
const ESTADOS_COM_FONTES = new Set(["validada", "ativa", "substituida"]);

type Ator = { administrador: boolean; empresasPermitidas: string[]; usuarioId: string | null; nome: string | null };
type ProdutoDaLoja = Awaited<ReturnType<typeof produtosDaLojaRepository>>[number];

const semZeros = (valor: string | null | undefined) =>
  String(valor ?? "")
    .replace(/\D/gu, "")
    .replace(/^0+(?=\d)/u, "");

const texto = (valor: JsonValue | undefined) =>
  typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";

/** Quem fica num par: mais vendas; empate, a venda mais recente; empate, o id (estavel entre lotes). */
function escolherQuemFica(
  candidatos: ProdutoDaLoja[],
  vendas: Map<string, { vendas: number; ultima: Date | null }>
): ProdutoDaLoja {
  const pontos = (produto: ProdutoDaLoja) => vendas.get(produto.id) ?? { vendas: 0, ultima: null };
  return [...candidatos].sort((a, b) => {
    const [pa, pb] = [pontos(a), pontos(b)];
    if (pa.vendas !== pb.vendas) return pb.vendas - pa.vendas;
    const [ua, ub] = [pa.ultima?.getTime() ?? 0, pb.ultima?.getTime() ?? 0];
    if (ua !== ub) return ub - ua;
    return a.id.localeCompare(b.id);
  })[0]!;
}

async function planejar(cargaId: string, empresaId: string, loja: string) {
  const estado = await estadoDaCargaRepository(cargaId);
  if (!estado) throw new VinculoBaseError("Carga da Central não encontrada.", 422, "CARGA_NAO_ENCONTRADA");
  if (!ESTADOS_COM_FONTES.has(estado)) {
    throw new VinculoBaseError("Valide a carga antes de aplicar na loja.", 422, "CARGA_NAO_VALIDADA");
  }
  const linhas = await linhasDaLojaNaCargaRepository(cargaId, loja);
  if (!linhas.length) {
    throw new VinculoBaseError(`A carga não tem produtos da loja ${loja} do backup.`, 422, "CARGA_SEM_LOJA");
  }
  const [bases, daLoja, referencia] = [
    await basesPorOrigemRepository(),
    await produtosDaLojaRepository(empresaId),
    await unidadesEGruposDaEmpresaRepository(empresaId)
  ];
  const porBase = new Map(daLoja.filter((p) => p.produtoBaseId).map((p) => [p.produtoBaseId!, p]));
  const donoDoCodigoInterno = new Map(
    daLoja.filter((p) => p.codigoInterno?.trim()).map((p) => [p.codigoInterno!.trim(), p.id])
  );
  // Produtos antigos da loja, soltos, que a integracao do PDV criou so com o codigo do PDV.
  const soltosPorCodigo = new Map<string, ProdutoDaLoja[]>();
  for (const produto of daLoja.filter((p) => !p.produtoBaseId)) {
    const chave = semZeros(produto.codigo);
    if (chave) soltosPorCodigo.set(chave, [...(soltosPorCodigo.get(chave) ?? []), produto]);
  }
  const vendas = await vendasDosProdutosRepository(
    empresaId,
    [...soltosPorCodigo.values()].flat().map((p) => p.id)
  );
  const jaEscolhidos = new Set<string>();

  const itens = linhas.map((linha) => {
    const base = { chave: linha.chave, nome: linha.nome, codigoInterno: linha.codigoInterno.trim() || null };
    const recusar = (motivo: string) => ({ ...base, acao: "bloqueado" as const, motivo });
    const produtoBaseId = bases.get(texto(linha.dados["base_product_id"]));
    if (!produtoBaseId) return recusar("Sem o produto da BASE no ERP");
    const ligado = porBase.get(produtoBaseId);
    const antigos = ligado
      ? []
      : [
          ...new Map(
            [semZeros(linha.codigoInterno), semZeros(linha.codigoBarras)]
              .filter(Boolean)
              .flatMap((k) => soltosPorCodigo.get(k) ?? [])
              .map((p) => [p.id, p])
          ).values()
        ];
    if (antigos.some((p) => jaEscolhidos.has(p.id))) {
      return recusar("Produto antigo do PDV disputado por mais de uma linha do backup (resolver à mão)");
    }
    const fica = ligado ?? (antigos.length ? escolherQuemFica(antigos, vendas) : undefined);
    const dono = base.codigoInterno ? donoDoCodigoInterno.get(base.codigoInterno) : undefined;
    if (dono && dono !== fica?.id) return recusar("Outro produto da loja já usa este código interno");
    const convertido = montarPayloadBase(
      { codigoBarras: linha.codigoBarras.trim() || null, nome: linha.nome, dadosOficiais: linha.dados },
      referencia.unidades,
      referencia.grupos,
      empresaId,
      { ignorarFoto: true }
    );
    if (convertido.erro) return recusar(convertido.erro);
    for (const antigo of antigos) jaEscolhidos.add(antigo.id);
    // O codigo do PDV do produto antigo fica: e por ele que o historico da integracao o reconhece.
    // Criar com `forcar` ("cadastrar mesmo assim"): nome e EAN repetidos ja existem no sistema oficial (246
    // nomes repetidos no paralelo) e todos os produtos da loja entram (decisao do José).
    const payload = fica ? { ...convertido.payload, codigo: fica.codigo } : { ...convertido.payload, forcar: true };
    const juntar = !ligado && fica;
    return {
      ...base,
      acao: ligado ? ("atualizar" as const) : juntar ? ("juntar" as const) : ("criar" as const),
      produtoId: fica?.id ?? null,
      produtoBaseId,
      payload,
      fica: fica?.descricao ?? null,
      // Codigo interno de quem fica: o que ele ja tem ou o da linha (como na fase A, so preenche o vazio).
      codigoInternoDeQuemFica: fica?.codigoInterno?.trim() || base.codigoInterno,
      inativar: juntar ? antigos.filter((p) => p.id !== fica.id) : []
    };
  });
  const hashPlano = createHash("sha256")
    .update(JSON.stringify({ cargaId, empresaId, chaves: linhas.map((l) => l.chave) }))
    .digest("hex");
  return { itens, hashPlano };
}

export async function previaLojaPeloBackup(cargaId: string, empresaId: string, ator: Ator) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  const { itens, hashPlano } = await planejar(cargaId, empresaId, loja);
  const contar = (acao: string) => itens.filter((i) => i.acao === acao).length;
  const motivos: Record<string, number> = {};
  for (const item of itens) if (item.acao === "bloqueado") motivos[item.motivo] = (motivos[item.motivo] ?? 0) + 1;
  const validos = itens.filter((i) => i.acao !== "bloqueado");
  const juntados = validos.filter((i) => i.acao === "juntar");
  return {
    loja,
    total: itens.length,
    criar: contar("criar"),
    atualizar: contar("atualizar"),
    juntar: juntados.length,
    inativar: juntados.reduce((soma, i) => soma + ("inativar" in i ? i.inativar.length : 0), 0),
    bloqueados: contar("bloqueado"),
    ativos: validos.filter((i) => "payload" in i && i.payload.status === "ativo").length,
    inativos: validos.filter((i) => "payload" in i && i.payload.status === "inativo").length,
    motivos,
    juntados: juntados.slice(0, 60).map((i) => ({
      codigoInterno: i.codigoInterno,
      fica: "fica" in i ? i.fica : null,
      inativados: "inativar" in i ? i.inativar.map((p) => p.descricao) : []
    })),
    exemplosBloqueados: itens
      .filter((i) => i.acao === "bloqueado")
      .slice(0, 50)
      .map((i) => ({ codigoInterno: i.codigoInterno, nome: i.nome, motivo: "motivo" in i ? i.motivo : "" })),
    amostra: validos.slice(0, 20).map((i) => ({
      acao: i.acao,
      codigoInterno: i.codigoInterno,
      nome: i.nome,
      situacao: "payload" in i ? i.payload.status : null,
      precoVenda: "payload" in i ? (i.payload.precoVenda ?? null) : null
    })),
    lote: LOTE_LOJA_PELO_BACKUP,
    hashPlano,
    confirmacao: CONFIRMACAO_LOJA_PELO_BACKUP
  };
}

export async function aplicarLojaPeloBackup(
  cargaId: string,
  empresaId: string,
  entrada: { confirmacao: string; hashPlano: string; cursor: number },
  ator: Ator
) {
  const loja = await lojaDaEmpresa(empresaId, ator);
  if (entrada.confirmacao.trim().toUpperCase() !== CONFIRMACAO_LOJA_PELO_BACKUP) {
    throw new VinculoBaseError(`Digite exatamente ${CONFIRMACAO_LOJA_PELO_BACKUP}.`, 400, "CONFIRMACAO_INVALIDA");
  }
  const { itens, hashPlano } = await planejar(cargaId, empresaId, loja);
  if (hashPlano !== entrada.hashPlano) {
    throw new VinculoBaseError(
      "A carga ou a loja mudou desde a prévia. Confira de novo; o lote não foi gravado.",
      409,
      "PREVIA_DESATUALIZADA"
    );
  }
  const escritor: AtorDaEscrita = {
    usuarioId: ator.usuarioId,
    nome: ator.nome,
    empresasPermitidas: ator.empresasPermitidas,
    administrador: ator.administrador
  };
  const fim = Math.min(entrada.cursor + LOTE_LOJA_PELO_BACKUP, itens.length);
  const resultado = {
    criados: 0,
    atualizados: 0,
    juntados: 0,
    ignorados: 0,
    falhas: [] as Array<{ nome: string; motivo: string }>
  };
  for (const item of itens.slice(entrada.cursor, fim)) {
    if (item.acao === "bloqueado") {
      resultado.ignorados += 1;
      continue;
    }
    try {
      // Juntar: liga quem fica a BASE, leva para ele os vinculos de venda dos outros e inativa os outros, numa
      // transacao. Se a atualizacao abaixo falhar, rodar de novo ja o encontra ligado e so atualiza.
      if (item.acao === "juntar") {
        await executarEmTransacao((tx) =>
          juntarProdutosAntigosRepository(tx, {
            empresaId,
            ficaId: item.produtoId!,
            produtoBaseId: item.produtoBaseId,
            codigoInterno: item.codigoInternoDeQuemFica,
            inativarIds: item.inativar.map((p) => p.id)
          })
        );
      }
      await salvarProduto(item.produtoId, item.payload, escritor, {
        produtoBaseId: item.produtoBaseId,
        preservarPrecoImportado: true,
        codigoInterno: item.codigoInterno,
        // O arquivo do PDV e o catalogo inteiro e so sai depois da virada: aqui nada e publicado.
        publicarNoDrive: false
      });
      if (item.acao === "criar") resultado.criados += 1;
      else if (item.acao === "juntar") resultado.juntados += 1;
      else resultado.atualizados += 1;
    } catch (causa) {
      const motivo =
        causa instanceof CodigoBarrasDuplicadoError || causa instanceof ProdutoDuplicadoError
          ? causa.message
          : causa instanceof Error
            ? causa.message
            : "Falha ao gravar este produto.";
      resultado.falhas.push({ nome: item.nome, motivo });
    }
  }
  return { loja, total: itens.length, processados: fim, proximoCursor: fim < itens.length ? fim : null, ...resultado };
}
