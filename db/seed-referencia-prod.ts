// Seed de REFERENCIA para PRODUCAO. Idempotente e seguro: SO cria o que falta, NUNCA apaga.
// Diferente do seed de desenvolvimento (db/seed.ts):
//   - NAO cria usuarios (nenhuma senha fraca), NAO gera vendas/caixa/despesas/mercadorias fake.
//   - Reaproveita a empresa existente (a que o bootstrap criou); nao duplica.
// Objetivo: dar a uma producao recem-criada a estrutura util pra comecar a operar sem digitar tudo
// na mao — areas/setores/cargos + esquema de permissoes por cargo, grupos, unidades, formas de
// pagamento, contas, PDVs — e alguns EXEMPLOS de fornecedor/cliente/produto (deletaveis).
//
// Rodar (com o DATABASE_URL de producao no ambiente):
//   npm run seed:referencia:prod --workspace @padaria/db
import "dotenv/config";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Permissao } from "@padaria/shared";
import { schema } from "./src/schema/schema.js";
import {
  areas,
  cargos,
  clientes,
  contas,
  empresas,
  formasPagamento,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  gruposVendas,
  pdvs,
  permissoesCargos,
  produtos,
  setores,
  unidadesMedida
} from "./src/schema/index.js";
import { permissoesPorCargo, regrasPermissoes } from "./src/referencia-permissoes.js";

// Interruptor: so roda quando SEED_REFERENCIA=1. Assim pode ficar no passo de deploy (migrate)
// sem re-semear a cada deploy — voce liga a flag uma vez, deixa rodar, e desliga depois.
if (!process.env["SEED_REFERENCIA"]?.trim()) {
  console.info("[seed-referencia] SEED_REFERENCIA ausente — pulando. Defina SEED_REFERENCIA=1 para popular.");
  process.exit(0);
}

const databaseUrl = process.env["DATABASE_URL"]?.trim();
if (!databaseUrl) throw new Error("[seed-referencia] DATABASE_URL obrigatoria");

const pool = new pg.Pool({ connectionString: databaseUrl });
const banco = drizzle(pool, { schema });

console.info("[seed-referencia] Iniciando (idempotente, sem usuarios/financeiro fake)");

// Empresa: reaproveita a mais antiga (a que o bootstrap criou). Nao cria outra se ja houver.
const [empresaExistente] = await banco.select({ id: empresas.id }).from(empresas).orderBy(empresas.criadoEm).limit(1);
const empresaId =
  empresaExistente?.id ??
  (await banco.insert(empresas).values({ nome: "Padaria Principal" }).returning({ id: empresas.id }))[0]?.id;
if (!empresaId) throw new Error("[seed-referencia] Nenhuma empresa — rode o bootstrap de producao antes");
console.info(`[seed-referencia] Empresa: ${empresaId}`);

// --- Helpers idempotentes (select-then-insert; script manual, sem concorrencia). ---
async function garantirArea(nome: string): Promise<string> {
  const [linha] = await banco
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.empresaId, empresaId), eq(areas.nome, nome)))
    .limit(1);
  if (linha) return linha.id;
  const [criado] = await banco.insert(areas).values({ empresaId, nome }).returning({ id: areas.id });
  if (!criado) throw new Error(`[seed-referencia] Falha ao criar area ${nome}`);
  return criado.id;
}

async function garantirSetor(nome: string, areaId: string): Promise<string> {
  const [linha] = await banco
    .select({ id: setores.id })
    .from(setores)
    .where(and(eq(setores.empresaId, empresaId), eq(setores.nome, nome)))
    .limit(1);
  if (linha) return linha.id;
  const [criado] = await banco.insert(setores).values({ empresaId, areaId, nome }).returning({ id: setores.id });
  if (!criado) throw new Error(`[seed-referencia] Falha ao criar setor ${nome}`);
  return criado.id;
}

async function garantirCargo(nome: string): Promise<string> {
  const [linha] = await banco
    .select({ id: cargos.id })
    .from(cargos)
    .where(and(eq(cargos.empresaId, empresaId), eq(cargos.nome, nome)))
    .limit(1);
  if (linha) return linha.id;
  const [criado] = await banco.insert(cargos).values({ empresaId, nome }).returning({ id: cargos.id });
  if (!criado) throw new Error(`[seed-referencia] Falha ao criar cargo ${nome}`);
  return criado.id;
}

async function aplicarPermissoesCargo(cargoId: string, lista: Permissao[]): Promise<void> {
  const regras = regrasPermissoes(lista);
  const [existe] = await banco
    .select({ cargoId: permissoesCargos.cargoId })
    .from(permissoesCargos)
    .where(eq(permissoesCargos.cargoId, cargoId))
    .limit(1);
  if (existe) await banco.update(permissoesCargos).set({ regras }).where(eq(permissoesCargos.cargoId, cargoId));
  else await banco.insert(permissoesCargos).values({ cargoId, regras });
}

async function garantirGrupoDespesa(nome: string): Promise<void> {
  const [linha] = await banco
    .select({ id: gruposDespesas.id })
    .from(gruposDespesas)
    .where(and(eq(gruposDespesas.empresaId, empresaId), eq(gruposDespesas.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(gruposDespesas).values({ empresaId, nome }).onConflictDoNothing();
}

async function garantirGrupoMercadoria(nome: string): Promise<void> {
  const [linha] = await banco
    .select({ id: gruposMercadorias.id })
    .from(gruposMercadorias)
    .where(and(eq(gruposMercadorias.empresaId, empresaId), eq(gruposMercadorias.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(gruposMercadorias).values({ empresaId, nome }).onConflictDoNothing();
}

async function garantirGrupoRetirada(nome: string): Promise<void> {
  const [linha] = await banco
    .select({ id: gruposRetiradas.id })
    .from(gruposRetiradas)
    .where(and(eq(gruposRetiradas.empresaId, empresaId), eq(gruposRetiradas.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(gruposRetiradas).values({ empresaId, nome }).onConflictDoNothing();
}

async function garantirGrupoVenda(nome: string): Promise<void> {
  const [linha] = await banco
    .select({ id: gruposVendas.id })
    .from(gruposVendas)
    .where(and(eq(gruposVendas.empresaId, empresaId), eq(gruposVendas.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(gruposVendas).values({ empresaId, nome }).onConflictDoNothing();
}

async function garantirUnidade(nome: string, sigla: string): Promise<string> {
  const [linha] = await banco
    .select({ id: unidadesMedida.id })
    .from(unidadesMedida)
    .where(and(eq(unidadesMedida.empresaId, empresaId), eq(unidadesMedida.nome, nome)))
    .limit(1);
  if (linha) return linha.id;
  const [criado] = await banco
    .insert(unidadesMedida)
    .values({ empresaId, nome, sigla })
    .returning({ id: unidadesMedida.id });
  if (!criado) throw new Error(`[seed-referencia] Falha ao criar unidade ${nome}`);
  return criado.id;
}

async function garantirFormaPagamento(nome: string): Promise<void> {
  const [linha] = await banco
    .select({ id: formasPagamento.id })
    .from(formasPagamento)
    .where(and(eq(formasPagamento.empresaId, empresaId), eq(formasPagamento.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(formasPagamento).values({ empresaId, nome }).onConflictDoNothing();
}

async function garantirConta(nome: string): Promise<string> {
  const [linha] = await banco
    .select({ id: contas.id })
    .from(contas)
    .where(and(eq(contas.empresaId, empresaId), eq(contas.nome, nome)))
    .limit(1);
  if (linha) return linha.id;
  const [criado] = await banco.insert(contas).values({ empresaId, nome, ativa: true }).returning({ id: contas.id });
  if (!criado) throw new Error(`[seed-referencia] Falha ao criar conta ${nome}`);
  return criado.id;
}

async function garantirPdv(nome: string, codigo: string, contaId: string): Promise<void> {
  const [linha] = await banco
    .select({ id: pdvs.id })
    .from(pdvs)
    .where(and(eq(pdvs.empresaId, empresaId), eq(pdvs.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(pdvs).values({ empresaId, nome, codigo, contaId, ativo: true }).onConflictDoNothing();
}

async function garantirFornecedor(nome: string, documento: string): Promise<void> {
  const [linha] = await banco
    .select({ id: fornecedores.id })
    .from(fornecedores)
    .where(and(eq(fornecedores.empresaId, empresaId), eq(fornecedores.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(fornecedores).values({ empresaId, nome, documento }).onConflictDoNothing();
}

async function garantirCliente(nome: string, documento: string): Promise<void> {
  const [linha] = await banco
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), eq(clientes.nome, nome)))
    .limit(1);
  if (!linha) await banco.insert(clientes).values({ empresaId, nome, documento }).onConflictDoNothing();
}

async function garantirProduto(
  codigo: string,
  descricao: string,
  grupoMercadoriaId: string,
  unidadeMedidaId: string
): Promise<void> {
  const [linha] = await banco
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.codigo, codigo)))
    .limit(1);
  if (!linha)
    await banco
      .insert(produtos)
      .values({ empresaId, codigo, descricao, grupoMercadoriaId, unidadeMedidaId })
      .onConflictDoNothing();
}

// --- 1) Estrutura: area -> setores -> cargos + esquema de permissoes ---
const areaOperacao = await garantirArea("Operacao");
await garantirSetor("Loja", areaOperacao);
await garantirSetor("Producao", areaOperacao);
// NOTA (auditoria): a camada de permissoes POR SETOR (permissoes_setores) e OPCIONAL e fica
// vazia de proposito neste seed. O acesso efetivo vem de cargo + usuario (ver resolverPermissoesEfetivas);
// o setor e um ajuste fino que a operacao concede sob demanda pela tela de Permissoes. Se quiser um
// default por setor, use aplicarPermissoesCargo como modelo e grave em permissoes_setores aqui.

for (const [nomeCargo, listaPermissoes] of Object.entries(permissoesPorCargo)) {
  const cargoId = await garantirCargo(nomeCargo);
  await aplicarPermissoesCargo(cargoId, listaPermissoes);
}
console.info(`[seed-referencia] OK estrutura e permissoes (${Object.keys(permissoesPorCargo).length} cargos)`);

// --- 2) Referencia operacional ---
for (const nome of ["Operacional", "Contas fixas", "Quebra de caixa"]) await garantirGrupoDespesa(nome);
for (const nome of ["Insumos", "Embalagens", "Revenda"]) await garantirGrupoMercadoria(nome);
for (const nome of ["Sangria", "Adiantamento"]) await garantirGrupoRetirada(nome);
for (const nome of ["Balcao", "Delivery"]) await garantirGrupoVenda(nome);

const unidadeUn = await garantirUnidade("Unidade", "un");
await garantirUnidade("Quilograma", "kg");
await garantirUnidade("Litro", "L");

for (const nome of ["Dinheiro", "Pix", "Cartao credito", "Cartao debito"]) await garantirFormaPagamento(nome);

const contaCaixa = await garantirConta("Caixa loja");
await garantirConta("Banco");
// Cofre: origem da transferencia automatica de abertura do caixa (R8). Mapeado na empresa (Regra 5)
// somente quando ainda nao ha um definido — nunca sobrescreve uma escolha manual.
const contaCofre = await garantirConta("Cofre");
const [empresaAtual] = await banco
  .select({ contaCofreId: empresas.contaCofreId })
  .from(empresas)
  .where(eq(empresas.id, empresaId));
if (!empresaAtual?.contaCofreId) {
  await banco.update(empresas).set({ contaCofreId: contaCofre }).where(eq(empresas.id, empresaId));
}
await garantirPdv("PDV 01", "PDV-01", contaCaixa);
console.info("[seed-referencia] OK grupos, unidades, formas de pagamento, contas, cofre e PDV");

// --- 3) Exemplos de cadastro (fake, deletaveis) ---
const [grupoInsumos] = await banco
  .select({ id: gruposMercadorias.id })
  .from(gruposMercadorias)
  .where(and(eq(gruposMercadorias.empresaId, empresaId), eq(gruposMercadorias.nome, "Insumos")))
  .limit(1);

await garantirFornecedor("Fornecedor Exemplo", "00000000000100");
await garantirCliente("Cliente Exemplo", "00000000000999");
if (grupoInsumos) {
  await garantirProduto("EXEMPLO-001", "Produto de exemplo", grupoInsumos.id, unidadeUn);
}
console.info("[seed-referencia] OK exemplos de fornecedor/cliente/produto (apague se nao quiser)");

await pool.end();
console.info("[seed-referencia] Concluido");
