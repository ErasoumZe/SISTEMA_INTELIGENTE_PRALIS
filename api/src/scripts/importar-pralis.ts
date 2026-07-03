// Importador do catalogo Pralis (base-products.json) para o ERP — Fase 4.
// Decisoes do Ze (03/07): Pralis e a fonte de verdade; Padaria Principal = TNP;
// Lisboa e Hora criadas como empresas (Hora sem vinculos = inativa por enquanto);
// migrar tudo preservando status; grupos/unidades viram cadastros reais do ERP.
//
// Uso:
//   npm run importar:pralis --workspace @padaria/api              (staging: so relatorio)
//   npm run importar:pralis --workspace @padaria/api -- --executar (grava no banco)
//
// Produtos entram pela MESMA porta do cadastro manual (salvarProduto): zod, dedup por
// nome/codigo de barras, recomputo de preco (ADR-002) e codigos gerados pelo servidor.
// Idempotente: re-executar pula duplicados em vez de duplicar.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { and, eq, ilike } from "drizzle-orm";
import { empresas, gruposMercadorias, unidadesMedida } from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";
import { ProdutoDuplicadoError, salvarProduto } from "../produtos/produtos.service.js";

type TransformacaoPralis = {
  precisao?: string | null;
  qtd?: number | null;
  unidade?: string | null;
  produtoReceituario?: string | null;
};

type FiscalPralis = {
  ncm?: string | null;
  cest?: string | null;
  categoriaFiscal?: string | null;
  cstPisCofins?: string | null;
  aliquotaCheia?: number | null;
  aliquotaFcp?: number | null;
  aliquotaPis?: number | null;
  aliquotaCofins?: number | null;
  reducaoIcms?: number | null;
  icms?: number | null;
};

type ProdutoPralis = {
  nome: string;
  quantidade?: number | null;
  medidaBase?: string | null;
  codigoBarras?: string | null;
  marca?: string | null;
  embalagem?: string | null;
  cDe?: string | null;
  qtCad?: number | null;
  medidaCompra?: string | null;
  codigoInterno?: string | null;
  fotoUrl?: string | null;
  grupo?: string | null;
  tipo?: string | null;
  status?: string | null;
  estoqueMin?: number | null;
  estoqueMax?: number | null;
  setorEstoque?: string | null;
  custo?: number | null;
  margemPontual?: number | null;
  vVendaPontual?: number | null;
  auto?: boolean | null;
  localVenda1?: string | null;
  localVenda2?: string | null;
  promocoes?: DadosPromoPralis[] | null;
  transformacao?: TransformacaoPralis | null;
  fiscal?: FiscalPralis | null;
};

type DadosPromoPralis = {
  tipo?: string | null;
  valor?: number | null;
  descontoFracao?: number | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  seg?: boolean;
  ter?: boolean;
  qua?: boolean;
  qui?: boolean;
  sex?: boolean;
  sab?: boolean;
  dom?: boolean;
  validaAte?: string | null;
};

const raizRepositorio = fileURLToPath(new URL("../../..", import.meta.url));
const caminhoFonte = path.join(
  raizRepositorio,
  "CADASTRO DE PRODUTOS",
  "pralis",
  "stack",
  "api",
  "src",
  "db",
  "base-products.json"
);
const executar = process.argv.includes("--executar");

// Remove caracteres invisiveis (word joiner, zero-width) presentes nos nomes de grupo da fonte.
function limparTexto(valor: string | null | undefined): string {
  return String(valor ?? "")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const fonte = JSON.parse(readFileSync(caminhoFonte, "utf8")) as ProdutoPralis[];

const gruposFonte = [...new Set(fonte.map((p) => limparTexto(p.grupo)).filter(Boolean))].sort();
const unidadesFonte = [...new Set(fonte.map((p) => limparTexto(p.medidaBase)).filter(Boolean))].sort();
const contagemNomes = new Map<string, number>();
for (const produto of fonte) {
  const nome = limparTexto(produto.nome);
  contagemNomes.set(nome, (contagemNomes.get(nome) ?? 0) + 1);
}
const duplicadosFonte = [...contagemNomes.entries()].filter(([, total]) => total > 1);
const estoqueInvertido = fonte.filter(
  (p) => p.estoqueMin != null && p.estoqueMax != null && Number(p.estoqueMin) > Number(p.estoqueMax)
);
const porStatus = new Map<string, number>();
const porTipo = new Map<string, number>();
for (const produto of fonte) {
  porStatus.set(produto.status ?? "sem", (porStatus.get(produto.status ?? "sem") ?? 0) + 1);
  porTipo.set(produto.tipo ?? "sem", (porTipo.get(produto.tipo ?? "sem") ?? 0) + 1);
}

function relatorioStaging(): string {
  return [
    "# Importacao Pralis — Relatorio de staging",
    "",
    `Fonte: \`CADASTRO DE PRODUTOS/pralis/stack/api/src/db/base-products.json\` (${fonte.length} produtos, catalogo BASE).`,
    "",
    "## Mapeamento aprovado",
    "- Catalogo BASE -> empresa **TNP** (Padaria Principal renomeada).",
    "- Empresas **Lisboa** e **Hora** criadas; Hora sem vinculos de usuario (inativa por enquanto).",
    "- Replica do catalogo para Lisboa: usar a feature existente de importar/exportar entre empresas.",
    "",
    `## Status: ${[...porStatus.entries()].map(([s, n]) => `${s}=${n}`).join(", ")} · Tipo: ${[...porTipo.entries()]
      .map(([t, n]) => `${t}=${n}`)
      .join(", ")}`,
    "",
    `## Unidades a garantir no cadastro (${unidadesFonte.length})`,
    unidadesFonte.map((u) => `- ${u}`).join("\n"),
    "",
    `## Grupos de mercadoria a garantir no cadastro (${gruposFonte.length})`,
    gruposFonte.map((g) => `- ${g}`).join("\n"),
    "",
    `## Nomes duplicados NA FONTE (${duplicadosFonte.length}) — politica: primeiro vence, demais pulados`,
    duplicadosFonte.map(([nome, total]) => `- ${nome} (${total}x)`).join("\n") || "- nenhum",
    "",
    `## Avisos de qualidade`,
    `- Estoque minimo > maximo em ${estoqueInvertido.length} produto(s): ${estoqueInvertido
      .map((p) => limparTexto(p.nome))
      .join(", ")} (importado como esta; sem constraint no banco)`,
    ""
  ].join("\n");
}

async function garantirEmpresas() {
  await banco.update(empresas).set({ nome: "TNP" }).where(eq(empresas.nome, "Padaria Principal"));
  async function obterOuCriar(nome: string): Promise<string> {
    const [existente] = await banco.select({ id: empresas.id }).from(empresas).where(eq(empresas.nome, nome)).limit(1);
    if (existente) return existente.id;
    const [criada] = await banco.insert(empresas).values({ nome }).returning({ id: empresas.id });
    if (!criada) throw new Error(`Empresa nao criada: ${nome}`);
    return criada.id;
  }
  return { tnp: await obterOuCriar("TNP"), lisboa: await obterOuCriar("Lisboa"), hora: await obterOuCriar("Hora") };
}

async function garantirUnidades(empresaId: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const sigla of new Set([...unidadesFonte, "UN"])) {
    const [existente] = await banco
      .select({ id: unidadesMedida.id })
      .from(unidadesMedida)
      .where(and(eq(unidadesMedida.empresaId, empresaId), ilike(unidadesMedida.sigla, sigla)))
      .limit(1);
    if (existente) {
      mapa.set(sigla, existente.id);
      continue;
    }
    const [criada] = await banco
      .insert(unidadesMedida)
      .values({ empresaId, nome: sigla, sigla })
      .returning({ id: unidadesMedida.id });
    if (!criada) throw new Error(`Unidade nao criada: ${sigla}`);
    mapa.set(sigla, criada.id);
  }
  return mapa;
}

async function garantirGrupos(empresaId: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const nome of gruposFonte) {
    const [existente] = await banco
      .select({ id: gruposMercadorias.id })
      .from(gruposMercadorias)
      .where(and(eq(gruposMercadorias.empresaId, empresaId), eq(gruposMercadorias.nome, nome)))
      .limit(1);
    if (existente) {
      mapa.set(nome, existente.id);
      continue;
    }
    const [criado] = await banco
      .insert(gruposMercadorias)
      .values({ empresaId, nome })
      .returning({ id: gruposMercadorias.id });
    if (!criado) throw new Error(`Grupo nao criado: ${nome}`);
    mapa.set(nome, criado.id);
  }
  return mapa;
}

async function importarProdutos(empresaId: string, unidades: Map<string, string>, grupos: Map<string, string>) {
  let inseridos = 0;
  const pulados: string[] = [];
  const erros: string[] = [];
  for (const produto of fonte) {
    const nome = limparTexto(produto.nome);
    const sigla = limparTexto(produto.medidaBase) || "UN";
    const payload = {
      empresaId,
      codigoBarras: limparTexto(produto.codigoBarras) || null,
      descricao: nome,
      marca: limparTexto(produto.marca) || null,
      unidadeIndividualId: unidades.get(sigla) ?? unidades.get("UN"),
      quantidadeIndividual: produto.quantidade ?? 1,
      embalagem: limparTexto(produto.embalagem) || null,
      cDe: limparTexto(produto.cDe) || null,
      quantidadeCaixa: produto.qtCad ?? 1,
      medidaCompra: limparTexto(produto.medidaCompra) || null,
      grupoMercadoriaId: grupos.get(limparTexto(produto.grupo)) ?? null,
      custo: produto.custo ?? null,
      margem: produto.margemPontual ?? null,
      precoVenda: produto.vVendaPontual ?? null,
      auto: produto.auto ?? true,
      status: produto.status === "inativo" ? "inativo" : "ativo",
      tipo: produto.tipo === "transformacao" ? "transformacao" : "revenda",
      quantidadeEstoque: null,
      estoqueMin: produto.estoqueMin ?? null,
      estoqueMax: produto.estoqueMax ?? null,
      setorEstoque: limparTexto(produto.setorEstoque) || null,
      localVenda1: limparTexto(produto.localVenda1) || null,
      localVenda2: limparTexto(produto.localVenda2) || null,
      fotoUrl: limparTexto(produto.fotoUrl) || null,
      conversoes: [],
      fiscal: produto.fiscal ?? null,
      transformacao: produto.transformacao
        ? {
            precisao: produto.transformacao.precisao ?? null,
            quantidade: produto.transformacao.qtd ?? null,
            unidade: produto.transformacao.unidade ?? null,
            produtoReceituario: produto.transformacao.produtoReceituario ?? null
          }
        : null,
      promocoes: (produto.promocoes ?? []).map((promo) => ({
        tipo: promo.tipo === "valor" ? "valor" : "desconto",
        valor: promo.valor ?? null,
        descontoFracao: promo.descontoFracao ?? null,
        horaInicio: promo.horaInicio ?? null,
        horaFim: promo.horaFim ?? null,
        seg: Boolean(promo.seg),
        ter: Boolean(promo.ter),
        qua: Boolean(promo.qua),
        qui: Boolean(promo.qui),
        sex: Boolean(promo.sex),
        sab: Boolean(promo.sab),
        dom: Boolean(promo.dom),
        validaAte: promo.validaAte ?? null
      }))
    };
    try {
      await salvarProduto(null, payload, null);
      inseridos += 1;
    } catch (error) {
      if (error instanceof ProdutoDuplicadoError) {
        pulados.push(nome);
      } else {
        erros.push(`${nome}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      }
    }
  }
  return { inseridos, pulados, erros };
}

const caminhoRelatorio = path.join(
  raizRepositorio,
  "docs",
  executar ? "IMPORTACAO-PRALIS-RESULTADO.md" : "IMPORTACAO-PRALIS-STAGING.md"
);

if (!executar) {
  writeFileSync(caminhoRelatorio, relatorioStaging());
  console.info(`[importar-pralis] STAGING: nada gravado. Relatorio em ${caminhoRelatorio}`);
  console.info(
    `[importar-pralis] ${fonte.length} produtos | ${gruposFonte.length} grupos | ${unidadesFonte.length} unidades | ${duplicadosFonte.length} nomes duplicados na fonte`
  );
  process.exit(0);
}

const empresasIds = await garantirEmpresas();
const unidades = await garantirUnidades(empresasIds.tnp);
const grupos = await garantirGrupos(empresasIds.tnp);
const resultado = await importarProdutos(empresasIds.tnp, unidades, grupos);

const resumoExecucao = [
  "# Importacao Pralis — Resultado da execucao",
  "",
  `- Empresa destino: TNP (${empresasIds.tnp})`,
  `- Empresas garantidas: Lisboa (${empresasIds.lisboa}), Hora (${empresasIds.hora}, sem vinculos = inativa)`,
  `- Unidades garantidas: ${unidades.size} · Grupos garantidos: ${grupos.size}`,
  `- Produtos inseridos: ${resultado.inseridos}`,
  `- Pulados (duplicado ja existente): ${resultado.pulados.length}`,
  resultado.pulados.length ? resultado.pulados.map((nome) => `  - ${nome}`).join("\n") : "",
  `- Erros: ${resultado.erros.length}`,
  resultado.erros.length ? resultado.erros.map((erro) => `  - ${erro}`).join("\n") : "",
  ""
].join("\n");
writeFileSync(caminhoRelatorio, resumoExecucao);
console.info(resumoExecucao);
process.exit(resultado.erros.length ? 1 : 0);
