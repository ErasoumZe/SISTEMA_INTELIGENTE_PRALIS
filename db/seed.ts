import "dotenv/config";
import pg from "pg";
import { and, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { permissoes, type Permissao, type RoleUsuario } from "@padaria/shared";
import { schema } from "./src/schema/schema.js";
import { gerarUuidV7 } from "./src/ids/uuidv7.js";
import {
  areas,
  cargos,
  colaboradores,
  colaboradoresCargos,
  colaboradoresFaltasJustificadas,
  colaboradoresJornadas,
  contas,
  clientes,
  ajustesFechamentoCaixa,
  debitosColaboradores,
  despesas,
  edicoesCaixa,
  empresas,
  fechamentosCaixa,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  itensVendas,
  lacresMalotes,
  malotes,
  mercadorias,
  pdvs,
  permissoesCargos,
  permissoesTabela,
  permissoesUsuarios,
  perfisUsuarios,
  produtos,
  retiradas,
  setores,
  transferencias,
  unidadesMedida,
  usuarioAutenticacao,
  usuariosEmpresas,
  vendas,
  vendasProdutos
} from "./src/schema/index.js";

const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria";
const authSecret = process.env["BETTER_AUTH_SECRET"] ?? "dev-secret-change-me-dev-secret-change-me";
const authBaseUrl = process.env["AUTH_BASE_URL"] ?? "http://localhost:4100";
const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:5174";
const pool = new pg.Pool({ connectionString: databaseUrl });
const banco = drizzle(pool, { schema });
const auth = betterAuth({
  database: drizzleAdapter(banco, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.usuarioAutenticacao,
      session: schema.sessaoAutenticacao,
      account: schema.contaAutenticacao,
      verification: schema.verificacaoAutenticacao
    }
  }),
  secret: authSecret,
  baseURL: authBaseUrl,
  trustedOrigins: [webOrigin],
  advanced: {
    database: {
      generateId: () => gerarUuidV7()
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6
  }
});

function bancoSemSenha(urlBanco: string) {
  try {
    const url = new URL(urlBanco);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "(DATABASE_URL invalida)";
  }
}

const senhaPadraoSeed = "123456";
const emailsSeedLegados = [
  "diretor@padaria.local",
  "caixa@padaria.local",
  "gerencia@padaria.local",
  "tesouraria@padaria.local",
  "compras@padaria.local",
  "dp@padaria.local",
  "rh@padaria.local",
  "fiscal@padaria.local",
  "operacoes@padaria.local",
  "financeiro@padaria.local"
];

const permissoesPorCargoSeed: Record<string, Permissao[]> = {
  Caixa: [
    "entradas",
    "transferencias",
    "despesas",
    "mercadorias",
    "retiradas",
    "operar_caixa",
    "fechamento_com_diferenca",
    "relatorio_produtos_mais_vendidos"
  ],
  Tesouraria: ["cadastro_malotes", "transferencias"],
  Gerencia: [
    "entradas",
    "transferencias",
    "despesas",
    "mercadorias",
    "retiradas",
    "operar_caixa",
    "gerenciar_caixas",
    "fechamento_com_diferenca",
    "relatorio_produtos_mais_vendidos",
    "promocoes",
    "relatorio_faltas_atestados_colaboradores",
    "relatorio_advertencia_suspensao_colaboradores",
    "pedidos",
    "perdas_sobras",
    "estoque_produtos",
    "relatorio_dre",
    "cadastro_avaliacao_clientes"
  ],
  Compras: ["pedidos", "mercadorias", "cadastro_fornecedores", "cadastro_produtos"],
  DP: ["despesas", "cadastro_colaboradores", "folha_ponto"],
  RH: ["avaliacao_qualidade", "avaliacao_colaboradores"],
  Fiscal: ["relatorio_fiscal_produtos", "cadastro_fiscal_produtos"],
  "Diretor de Operacoes": ["relatorio_dre", "cadastro_patrimonio", "cadastro_ficha_tecnica", "cadastro_ingredientes"],
  "Diretor Geral": [...permissoes],
  Financeiro: [
    "vendas_crediario",
    "notas_fiscais",
    "contas_pagar",
    "transferencias",
    "despesas",
    "mercadorias",
    "retiradas",
    "relatorio_dre",
    "cadastro_grupos_vendas",
    "cadastro_pdv",
    "cadastro_formas_pagamento"
  ]
};

const usuariosSeed: Array<{
  nome: string;
  email: string;
  senha: string;
  cargo: string;
  cpf: string;
  role: RoleUsuario;
}> = [
  {
    nome: "Diretor Geral",
    email: "diretor@email.com",
    senha: senhaPadraoSeed,
    cargo: "Diretor Geral",
    cpf: "00000000001",
    role: "usuario_admin"
  },
  {
    nome: "Caixa",
    email: "caixa@email.com",
    senha: senhaPadraoSeed,
    cargo: "Caixa",
    cpf: "00000000002",
    role: "usuario_comum"
  },
  {
    nome: "Gerencia",
    email: "gerencia@email.com",
    senha: senhaPadraoSeed,
    cargo: "Gerencia",
    cpf: "00000000003",
    role: "usuario_comum"
  },
  {
    nome: "Tesouraria",
    email: "tesouraria@email.com",
    senha: senhaPadraoSeed,
    cargo: "Tesouraria",
    cpf: "00000000004",
    role: "usuario_comum"
  },
  {
    nome: "Compras",
    email: "compras@email.com",
    senha: senhaPadraoSeed,
    cargo: "Compras",
    cpf: "00000000005",
    role: "usuario_comum"
  },
  { nome: "DP", email: "dp@email.com", senha: senhaPadraoSeed, cargo: "DP", cpf: "00000000006", role: "usuario_comum" },
  { nome: "RH", email: "rh@email.com", senha: senhaPadraoSeed, cargo: "RH", cpf: "00000000007", role: "usuario_comum" },
  {
    nome: "Fiscal",
    email: "fiscal@email.com",
    senha: senhaPadraoSeed,
    cargo: "Fiscal",
    cpf: "00000000008",
    role: "usuario_comum"
  },
  {
    nome: "Diretor de Operacoes",
    email: "operacoes@email.com",
    senha: senhaPadraoSeed,
    cargo: "Diretor de Operacoes",
    cpf: "00000000009",
    role: "usuario_comum"
  },
  {
    nome: "Financeiro",
    email: "financeiro@email.com",
    senha: senhaPadraoSeed,
    cargo: "Financeiro",
    cpf: "00000000010",
    role: "usuario_comum"
  }
];
const nomesCargosSeed = [...Object.keys(permissoesPorCargoSeed), "Operador de caixa"];

async function usuarioPorEmail(email: string) {
  const [usuario] = await banco
    .select({ id: usuarioAutenticacao.id, name: usuarioAutenticacao.name, email: usuarioAutenticacao.email })
    .from(usuarioAutenticacao)
    .where(eq(usuarioAutenticacao.email, email))
    .limit(1);
  return usuario ?? null;
}

async function criarUsuario(seed: (typeof usuariosSeed)[number], empresaId: string | null) {
  let usuario = await usuarioPorEmail(seed.email);
  if (!usuario) {
    await auth.api.signUpEmail({
      body: {
        name: seed.nome,
        email: seed.email,
        password: seed.senha
      }
    });
    usuario = await usuarioPorEmail(seed.email);
  }

  if (!usuario?.id) throw new Error(`Usuario seed nao encontrado: ${seed.email}`);

  await banco
    .insert(perfisUsuarios)
    .values({ usuarioId: usuario.id, empresaId, nome: seed.nome, email: seed.email, role: seed.role })
    .onConflictDoUpdate({
      target: perfisUsuarios.usuarioId,
      set: { empresaId, nome: seed.nome, email: seed.email, role: seed.role, atualizadoEm: new Date() }
    });

  if (empresaId) {
    await banco.insert(usuariosEmpresas).values({ usuarioId: usuario.id, empresaId }).onConflictDoNothing();
  }

  return usuario.id;
}

async function removerUsuariosSeed() {
  const emailsSeed = [...usuariosSeed.map((usuario) => usuario.email), ...emailsSeedLegados];
  const usuarios = await banco
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(inArray(usuarioAutenticacao.email, emailsSeed));
  const ids = usuarios.map((usuario) => usuario.id);
  if (!ids.length) return;

  await banco.delete(permissoesUsuarios).where(inArray(permissoesUsuarios.usuarioId, ids));
  await banco.delete(usuariosEmpresas).where(inArray(usuariosEmpresas.usuarioId, ids));
  await banco.delete(perfisUsuarios).where(inArray(perfisUsuarios.usuarioId, ids));
  await banco.delete(usuarioAutenticacao).where(inArray(usuarioAutenticacao.id, ids));
  console.info(`[seed] OK Usuarios seed antigos removidos: ${ids.length}`);
}

console.info("[seed] Aplicando seed de desenvolvimento");
console.info(`[seed] Banco: ${bancoSemSenha(databaseUrl)}`);
console.info(`[seed] Permissoes: ${permissoes.length}`);
console.info(`[seed] Usuarios planejados: ${usuariosSeed.length}`);

for (const permissao of permissoes) {
  await banco
    .insert(permissoesTabela)
    .values({
      codigo: permissao,
      nome: permissao.replaceAll("_", " "),
      descricao: `Permissao para ${permissao.replaceAll("_", " ")}`
    })
    .onConflictDoUpdate({
      target: permissoesTabela.codigo,
      set: {
        nome: permissao.replaceAll("_", " "),
        descricao: `Permissao para ${permissao.replaceAll("_", " ")}`
      }
    });
}
console.info("[seed] OK Permissoes cadastradas/atualizadas");

const [empresaExistente] = await banco
  .select({ id: empresas.id })
  .from(empresas)
  .where(eq(empresas.nome, "Padaria Principal"))
  .orderBy(empresas.criadoEm)
  .limit(1);

const empresaId =
  empresaExistente?.id ??
  (await banco.insert(empresas).values({ nome: "Padaria Principal" }).returning({ id: empresas.id }))[0]?.id;

if (!empresaId) throw new Error("Empresa principal nao foi criada");
console.info(`[seed] OK Empresa principal: Padaria Principal (${empresaId})`);

await banco.delete(empresas).where(and(eq(empresas.nome, "Padaria Principal"), ne(empresas.id, empresaId)));

const caixasEmpresa = await banco
  .select({ id: fechamentosCaixa.id })
  .from(fechamentosCaixa)
  .where(eq(fechamentosCaixa.empresaId, empresaId));
const caixaIds = caixasEmpresa.map((caixa) => caixa.id);

if (caixaIds.length) {
  await banco.delete(ajustesFechamentoCaixa).where(inArray(ajustesFechamentoCaixa.fechamentoCaixaId, caixaIds));
  await banco.delete(edicoesCaixa).where(inArray(edicoesCaixa.caixaId, caixaIds));
}
await banco.delete(debitosColaboradores).where(eq(debitosColaboradores.empresaId, empresaId));
await banco.delete(despesas).where(eq(despesas.empresaId, empresaId));
await banco.delete(mercadorias).where(eq(mercadorias.empresaId, empresaId));
await banco.delete(retiradas).where(eq(retiradas.empresaId, empresaId));
await banco.delete(transferencias).where(eq(transferencias.empresaId, empresaId));
await banco.delete(itensVendas).where(eq(itensVendas.empresaId, empresaId));
await banco.delete(vendas).where(eq(vendas.empresaId, empresaId));
await banco.delete(clientes).where(eq(clientes.empresaId, empresaId));
if (caixaIds.length) await banco.delete(fechamentosCaixa).where(inArray(fechamentosCaixa.id, caixaIds));

await banco.delete(colaboradores).where(
  and(
    eq(colaboradores.empresaId, empresaId),
    inArray(
      colaboradores.cpf,
      usuariosSeed.map((usuario) => usuario.cpf)
    )
  )
);
await banco.delete(malotes).where(and(eq(malotes.empresaId, empresaId), eq(malotes.codigo, "MALOTE-001")));
await removerUsuariosSeed();

const usuarioIds = new Map<string, string>();
for (const usuario of usuariosSeed) {
  usuarioIds.set(usuario.email, await criarUsuario(usuario, empresaId));
}
console.info("[seed] OK Usuarios e perfis cadastrados/atualizados");

await banco.delete(vendas).where(and(eq(vendas.empresaId, empresaId), eq(vendas.descricao, "Venda exemplo")));
await banco.delete(produtos).where(and(eq(produtos.empresaId, empresaId), eq(produtos.codigo, "PAO-FRANCES")));
await banco.delete(colaboradoresJornadas).where(eq(colaboradoresJornadas.empresaId, empresaId));
await banco.delete(colaboradoresFaltasJustificadas).where(eq(colaboradoresFaltasJustificadas.empresaId, empresaId));

const cargosSeed = await banco
  .select({ id: cargos.id })
  .from(cargos)
  .where(and(eq(cargos.empresaId, empresaId), inArray(cargos.nome, nomesCargosSeed)));
const colaboradoresSeed = await banco
  .select({ id: colaboradores.id })
  .from(colaboradores)
  .where(
    and(
      eq(colaboradores.empresaId, empresaId),
      inArray(
        colaboradores.cpf,
        usuariosSeed.map((usuario) => usuario.cpf)
      )
    )
  );
const idsCargosSeed = cargosSeed.map((cargo) => cargo.id);
const idsColaboradoresSeed = colaboradoresSeed.map((colaborador) => colaborador.id);
if (idsCargosSeed.length)
  await banco.delete(colaboradoresCargos).where(inArray(colaboradoresCargos.cargoId, idsCargosSeed));
if (idsColaboradoresSeed.length) {
  await banco.delete(colaboradoresCargos).where(inArray(colaboradoresCargos.colaboradorId, idsColaboradoresSeed));
}

await banco.delete(colaboradores).where(
  and(
    eq(colaboradores.empresaId, empresaId),
    inArray(
      colaboradores.cpf,
      usuariosSeed.map((usuario) => usuario.cpf)
    )
  )
);
await banco.delete(cargos).where(and(eq(cargos.empresaId, empresaId), inArray(cargos.nome, nomesCargosSeed)));
await banco.delete(setores).where(and(eq(setores.empresaId, empresaId), eq(setores.nome, "Loja")));
await banco.delete(areas).where(and(eq(areas.empresaId, empresaId), eq(areas.nome, "Operacao")));
await banco.delete(unidadesMedida).where(and(eq(unidadesMedida.empresaId, empresaId), eq(unidadesMedida.sigla, "un")));
await banco
  .delete(gruposRetiradas)
  .where(
    and(
      eq(gruposRetiradas.empresaId, empresaId),
      inArray(gruposRetiradas.nome, ["Sangria", "Retiradas operacionais", "Retirada operacional"])
    )
  );
await banco
  .delete(gruposMercadorias)
  .where(and(eq(gruposMercadorias.empresaId, empresaId), inArray(gruposMercadorias.nome, ["Farinhas", "Insumos"])));
await banco
  .delete(gruposDespesas)
  .where(
    and(
      eq(gruposDespesas.empresaId, empresaId),
      inArray(gruposDespesas.nome, ["Pecas de maquina", "Manutencao", "Operacional", "Quebra de caixa"])
    )
  );
await banco
  .delete(fornecedores)
  .where(and(eq(fornecedores.empresaId, empresaId), eq(fornecedores.nome, "Fornecedor Exemplo")));
await banco.delete(pdvs).where(and(eq(pdvs.empresaId, empresaId), eq(pdvs.codigo, "PDV-01")));
await banco.delete(contas).where(and(eq(contas.empresaId, empresaId), inArray(contas.nome, ["Caixa loja", "Banco"])));

const contaCaixa = (await banco.insert(contas).values({ empresaId, nome: "Caixa loja" }).returning({ id: contas.id }))[0];
await banco.insert(contas).values({ empresaId, nome: "Banco" }).returning({ id: contas.id });
if (!contaCaixa) throw new Error("Conta caixa nao foi criada");
await banco.insert(pdvs).values({ empresaId, nome: "PDV 01", codigo: "PDV-01", contaId: contaCaixa.id });

const grupoDespesaPai = (
  await banco.insert(gruposDespesas).values({ empresaId, nome: "Operacional" }).returning({ id: gruposDespesas.id })
)[0];
if (!grupoDespesaPai) throw new Error("Grupo de despesa pai nao foi criado");
const grupoDespesaSub = (
  await banco
    .insert(gruposDespesas)
    .values({ empresaId, nome: "Manutencao", grupoPaiId: grupoDespesaPai.id })
    .returning({ id: gruposDespesas.id })
)[0];
if (!grupoDespesaSub) throw new Error("Grupo de despesa filho nao foi criado");
await banco.insert(gruposDespesas).values({ empresaId, nome: "Quebra de caixa" });
await banco.insert(gruposDespesas).values({ empresaId, nome: "Pecas de maquina", grupoPaiId: grupoDespesaSub.id });

const grupoMercadoriaPai = (
  await banco.insert(gruposMercadorias).values({ empresaId, nome: "Insumos" }).returning({ id: gruposMercadorias.id })
)[0];
if (!grupoMercadoriaPai) throw new Error("Grupo de mercadoria pai nao foi criado");
const grupoMercadoria = (
  await banco
    .insert(gruposMercadorias)
    .values({ empresaId, nome: "Farinhas", grupoPaiId: grupoMercadoriaPai.id })
    .returning({ id: gruposMercadorias.id })
)[0];
if (!grupoMercadoria) throw new Error("Grupo de mercadoria nao foi criado");

const grupoRetiradaPai = (
  await banco
    .insert(gruposRetiradas)
    .values({ empresaId, nome: "Retiradas operacionais" })
    .returning({ id: gruposRetiradas.id })
)[0];
if (!grupoRetiradaPai) throw new Error("Grupo de retirada pai nao foi criado");
await banco.insert(gruposRetiradas).values({ empresaId, nome: "Sangria", grupoPaiId: grupoRetiradaPai.id });

const unidade = (
  await banco
    .insert(unidadesMedida)
    .values({ empresaId, nome: "Unidade", sigla: "un" })
    .returning({ id: unidadesMedida.id })
)[0];
if (!unidade) throw new Error("Unidade de medida nao foi criada");

const area = (await banco.insert(areas).values({ empresaId, nome: "Operacao" }).returning({ id: areas.id }))[0];
if (!area) throw new Error("Area nao foi criada");

const setor = (
  await banco.insert(setores).values({ empresaId, areaId: area.id, nome: "Loja" }).returning({ id: setores.id })
)[0];
if (!setor) throw new Error("Setor nao foi criado");

const cargoIds = new Map<string, string>();
for (const nome of Object.keys(permissoesPorCargoSeed)) {
  const cargoSeed = (
    await banco
      .insert(cargos)
      .values({ empresaId, nome })
      .onConflictDoUpdate({
        target: [cargos.empresaId, cargos.nome],
        set: { nome, atualizadoEm: new Date() }
      })
      .returning({ id: cargos.id })
  )[0];
  if (!cargoSeed) throw new Error(`Cargo nao foi criado: ${nome}`);
  cargoIds.set(nome, cargoSeed.id);

  await banco.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoSeed.id));
  const permissoesCargo = permissoesPorCargoSeed[nome] ?? [];
  if (permissoesCargo.length) {
    await banco
      .insert(permissoesCargos)
      .values(permissoesCargo.map((permissaoCodigo) => ({ cargoId: cargoSeed.id, permissaoCodigo })))
      .onConflictDoNothing();
  }
}
console.info("[seed] OK Cargos e permissoes por cargo sincronizados");

for (const usuario of usuariosSeed) {
  const usuarioId = usuarioIds.get(usuario.email);
  const cargoId = cargoIds.get(usuario.cargo);
  if (!usuarioId || !cargoId) throw new Error(`Usuario/cargo seed ausente: ${usuario.email}`);

  const colaborador = (
    await banco
      .insert(colaboradores)
      .values({ empresaId, nome: usuario.nome, cpf: usuario.cpf, setorId: setor.id, usuarioId })
      .returning({ id: colaboradores.id })
  )[0];
  if (!colaborador) throw new Error(`Colaborador nao foi criado: ${usuario.email}`);

  await banco
    .insert(colaboradoresCargos)
    .values({
      empresaId,
      colaboradorId: colaborador.id,
      setorId: setor.id,
      cargoId,
      remuneracaoMinuto: "0.136364",
      dataInicio: new Date().toISOString().slice(0, 10),
      ativo: true
    })
    .onConflictDoNothing();
}
console.info("[seed] OK Colaboradores seed vinculados aos usuarios e cargos");

await banco.insert(fornecedores).values({ empresaId, nome: "Fornecedor Exemplo", documento: "00000000000100" });

const produto = (
  await banco
    .insert(produtos)
    .values({
      empresaId,
      grupoMercadoriaId: grupoMercadoria.id,
      unidadeMedidaId: unidade.id,
      codigo: "PAO-FRANCES",
      descricao: "Pao frances"
    })
    .returning({ id: produtos.id })
)[0];
if (!produto) throw new Error("Produto nao foi criado");

const malote = (
  await banco
    .insert(malotes)
    .values({
      empresaId,
      codigo: "MALOTE-001",
      descricao: "Malote seed",
      criadoPor: usuarioIds.get("tesouraria@email.com") ?? null
    })
    .returning({ id: malotes.id })
)[0];
if (!malote) throw new Error("Malote nao foi criado");

await banco
  .insert(lacresMalotes)
  .values(["LACRE-001", "LACRE-002", "LACRE-003"].map((numero) => ({ empresaId, maloteId: malote.id, numero })))
  .onConflictDoNothing();

const venda = (
  await banco
    .insert(vendas)
    .values({
      empresaId,
      dataReferencia: new Date().toISOString().slice(0, 10),
      descricao: "Venda exemplo",
      valorOriginal: "96.00"
    })
    .returning({ id: vendas.id })
)[0];
if (!venda) throw new Error("Venda exemplo nao foi criada");

await banco.insert(vendasProdutos).values({
  vendaId: venda.id,
  produtoId: produto.id,
  descricaoProduto: "Pao frances",
  quantidade: "120",
  valorUnitario: "0.8000",
  valorTotal: "96.00"
});

console.info("[seed] OK Cadastros base, malote, lacres e venda exemplo aplicados");
console.info("[seed] Credenciais de desenvolvimento:");
for (const usuario of usuariosSeed) {
  console.info(`[seed] - ${usuario.email} / ${usuario.senha} / ${usuario.role} / ${usuario.cargo}`);
}

await pool.end();
console.info("[seed] OK Seed aplicado.");
