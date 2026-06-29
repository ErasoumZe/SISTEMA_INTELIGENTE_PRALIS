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
  clientes,
  configuracoesTema,
  configuracoesTemasTelas,
  contas,
  ajustesFechamentoCaixa,
  debitosColaboradores,
  despesas,
  despesasItens,
  edicoesCaixa,
  empresas,
  fechamentosCaixa,
  feriados,
  formasPagamento,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  integracoesCamposConfig,
  integracoesChaves,
  integracoesHistorico,
  integracoesRegistros,
  integracoesSemNovidade,
  integracoesVinculos,
  itensVendas,
  lacresMalotes,
  malotes,
  mercadorias,
  mercadoriasItens,
  pdvs,
  permissoesCargos,
  permissoesSetores,
  permissoesTabela,
  permissoesUsuarios,
  perfisUsuarios,
  produtos,
  retiradas,
  sessaoAutenticacao,
  setores,
  transferencias,
  unidadesMedida,
  usuarioAutenticacao,
  usuariosEmpresas,
  vendas,
  vendasPagamentos,
  vendasProdutos,
  verificacaoAutenticacao
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

const MS_DIA = 24 * 60 * 60 * 1000;
const agora = new Date();
const anoAtual = agora.getUTCFullYear();

function dataISO(offsetDias = 0) {
  return new Date(agora.getTime() + offsetDias * MS_DIA).toISOString().slice(0, 10);
}

function dataHora(offsetDias = 0, hora = 12, minuto = 0) {
  const data = new Date(Date.UTC(anoAtual, agora.getUTCMonth(), agora.getUTCDate() + offsetDias, hora, minuto, 0));
  return data;
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

  await banco.delete(sessaoAutenticacao).where(inArray(sessaoAutenticacao.userId, ids));
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
const vendasEmpresa = await banco.select({ id: vendas.id }).from(vendas).where(eq(vendas.empresaId, empresaId));
const vendaIds = vendasEmpresa.map((venda) => venda.id);
const despesasEmpresa = await banco.select({ id: despesas.id }).from(despesas).where(eq(despesas.empresaId, empresaId));
const despesaIds = despesasEmpresa.map((despesa) => despesa.id);
const mercadoriasEmpresa = await banco
  .select({ id: mercadorias.id })
  .from(mercadorias)
  .where(eq(mercadorias.empresaId, empresaId));
const mercadoriaIds = mercadoriasEmpresa.map((mercadoria) => mercadoria.id);
const setoresEmpresa = await banco
  .select({ id: setores.id })
  .from(setores)
  .where(and(eq(setores.empresaId, empresaId), eq(setores.nome, "Loja")));
const setorIds = setoresEmpresa.map((setorLinha) => setorLinha.id);

if (caixaIds.length) {
  await banco.delete(ajustesFechamentoCaixa).where(inArray(ajustesFechamentoCaixa.fechamentoCaixaId, caixaIds));
  await banco.delete(edicoesCaixa).where(inArray(edicoesCaixa.caixaId, caixaIds));
}
await banco
  .delete(verificacaoAutenticacao)
  .where(inArray(verificacaoAutenticacao.identifier, ["seed-verificacao@email.com", "seed-reset@email.com"]));
await banco.delete(integracoesSemNovidade).where(eq(integracoesSemNovidade.empresaId, empresaId));
await banco.delete(integracoesHistorico).where(eq(integracoesHistorico.empresaId, empresaId));
await banco.delete(integracoesRegistros).where(eq(integracoesRegistros.empresaId, empresaId));
await banco.delete(integracoesVinculos).where(eq(integracoesVinculos.empresaId, empresaId));
await banco.delete(integracoesCamposConfig).where(eq(integracoesCamposConfig.empresaId, empresaId));
await banco.delete(integracoesChaves).where(eq(integracoesChaves.empresaId, empresaId));
if (vendaIds.length) {
  await banco.delete(vendasPagamentos).where(inArray(vendasPagamentos.vendaId, vendaIds));
  await banco.delete(vendasProdutos).where(inArray(vendasProdutos.vendaId, vendaIds));
}
if (despesaIds.length) {
  await banco.delete(despesasItens).where(inArray(despesasItens.despesaId, despesaIds));
}
if (mercadoriaIds.length) {
  await banco.delete(mercadoriasItens).where(inArray(mercadoriasItens.mercadoriaId, mercadoriaIds));
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
if (setorIds.length) await banco.delete(permissoesSetores).where(inArray(permissoesSetores.setorId, setorIds));

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
await banco
  .delete(feriados)
  .where(
    and(eq(feriados.empresaId, empresaId), inArray(feriados.nome, ["Aniversario da padaria", "Treinamento interno"]))
  );
await banco
  .delete(formasPagamento)
  .where(
    and(eq(formasPagamento.empresaId, empresaId), inArray(formasPagamento.nome, ["Dinheiro", "Pix", "Cartao credito"]))
  );
await banco
  .delete(configuracoesTemasTelas)
  .where(
    and(eq(configuracoesTemasTelas.empresaId, empresaId), inArray(configuracoesTemasTelas.tela, ["pdv", "caixa"]))
  );
await removerUsuariosSeed();

const usuarioIds = new Map<string, string>();
for (const usuario of usuariosSeed) {
  usuarioIds.set(usuario.email, await criarUsuario(usuario, empresaId));
}
const usuarioFinanceiroId = usuarioIds.get("financeiro@email.com");
if (!usuarioFinanceiroId) throw new Error("Usuario financeiro nao foi criado");
await banco
  .insert(permissoesUsuarios)
  .values({ usuarioId: usuarioFinanceiroId, permissaoCodigo: "contas_pagar" })
  .onConflictDoNothing();
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

const contaCaixa = (
  await banco.insert(contas).values({ empresaId, nome: "Caixa loja" }).returning({ id: contas.id })
)[0];
const contaBanco = (await banco.insert(contas).values({ empresaId, nome: "Banco" }).returning({ id: contas.id }))[0];
if (!contaCaixa) throw new Error("Conta caixa nao foi criada");
if (!contaBanco) throw new Error("Conta banco nao foi criada");
const pdv = (
  await banco
    .insert(pdvs)
    .values({ empresaId, nome: "PDV 01", codigo: "PDV-01", contaId: contaCaixa.id })
    .returning({ id: pdvs.id })
)[0];
if (!pdv) throw new Error("PDV nao foi criado");

await banco
  .insert(configuracoesTema)
  .values({
    id: true,
    corPrimaria: "#2563eb",
    corSecundaria: "#059669",
    corFundo: "#f8fafc",
    corCartao: "#ffffff",
    corSucesso: "#16a34a",
    corAviso: "#d97706",
    corErro: "#dc2626",
    atualizadoPor: usuarioIds.get("diretor@email.com") ?? null
  })
  .onConflictDoUpdate({
    target: configuracoesTema.id,
    set: {
      corPrimaria: "#2563eb",
      corSecundaria: "#059669",
      corFundo: "#f8fafc",
      corCartao: "#ffffff",
      corSucesso: "#16a34a",
      corAviso: "#d97706",
      corErro: "#dc2626",
      atualizadoPor: usuarioIds.get("diretor@email.com") ?? null,
      atualizadoEm: new Date()
    }
  });

await banco
  .insert(configuracoesTemasTelas)
  .values([
    {
      empresaId,
      tela: "pdv",
      corPrimaria: "#0f766e",
      corSecundaria: "#7c3aed",
      corFundo: "#f1f5f9",
      corCartao: "#ffffff",
      corSucesso: "#15803d",
      corAviso: "#ca8a04",
      corErro: "#b91c1c",
      atualizadoPor: usuarioIds.get("diretor@email.com") ?? null
    },
    {
      empresaId,
      tela: "caixa",
      corPrimaria: "#1d4ed8",
      corSecundaria: "#0891b2",
      corFundo: "#eef2ff",
      corCartao: "#ffffff",
      corSucesso: "#16a34a",
      corAviso: "#f59e0b",
      corErro: "#ef4444",
      atualizadoPor: usuarioIds.get("gerencia@email.com") ?? null
    }
  ])
  .onConflictDoNothing();

const formasPagamentoSeed = await banco
  .insert(formasPagamento)
  .values(["Dinheiro", "Pix", "Cartao credito"].map((nome) => ({ empresaId, nome })))
  .returning({ id: formasPagamento.id, nome: formasPagamento.nome });
const formaPagamentoIds = new Map(formasPagamentoSeed.map((forma) => [forma.nome, forma.id]));

await banco.insert(feriados).values([
  { empresaId, nome: "Aniversario da padaria", dia: agora.getUTCDate(), mes: agora.getUTCMonth() + 1, ano: anoAtual },
  { empresaId, nome: "Treinamento interno", dia: 15, mes: 8, ano: anoAtual }
]);

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

await banco
  .insert(permissoesSetores)
  .values(
    ["entradas", "operar_caixa", "relatorio_produtos_mais_vendidos"].map((permissaoCodigo) => ({
      setorId: setor.id,
      permissaoCodigo: permissaoCodigo as Permissao
    }))
  )
  .onConflictDoNothing();

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

const colaboradorIds = new Map<string, string>();
const colaboradorCargoIds = new Map<string, string>();
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
  colaboradorIds.set(usuario.email, colaborador.id);

  const colaboradorCargo = (
    await banco
      .insert(colaboradoresCargos)
      .values({
        empresaId,
        colaboradorId: colaborador.id,
        setorId: setor.id,
        cargoId,
        remuneracaoMinuto: "0.136364",
        dataInicio: dataISO(-30),
        ativo: true
      })
      .onConflictDoNothing()
      .returning({ id: colaboradoresCargos.id })
  )[0];
  if (colaboradorCargo) colaboradorCargoIds.set(usuario.email, colaboradorCargo.id);
}
console.info("[seed] OK Colaboradores seed vinculados aos usuarios e cargos");

const colaboradorCaixaId = colaboradorIds.get("caixa@email.com");
const colaboradorComprasId = colaboradorIds.get("compras@email.com");
const colaboradorFinanceiroId = colaboradorIds.get("financeiro@email.com");
const colaboradorCargoCaixaId = colaboradorCargoIds.get("caixa@email.com");
if (!colaboradorCaixaId || !colaboradorComprasId || !colaboradorFinanceiroId) {
  throw new Error("Colaboradores base do seed nao foram criados");
}

await banco.insert(colaboradoresJornadas).values([
  {
    empresaId,
    colaboradorId: colaboradorCaixaId,
    diaDaSemana: "SEGUNDA",
    cargaHorariaDiariaEmMinutos: 480,
    intervaloMinutos: 60,
    colaboradorCargoId: colaboradorCargoCaixaId ?? null,
    horaEntrada: "08:00",
    dataInicio: dataISO(-30),
    ativo: true
  },
  {
    empresaId,
    colaboradorId: colaboradorComprasId,
    diaDaSemana: "TERCA",
    cargaHorariaDiariaEmMinutos: 420,
    intervaloMinutos: 60,
    horaEntrada: "09:00",
    dataInicio: dataISO(-30),
    ativo: true
  }
]);

await banco.insert(colaboradoresFaltasJustificadas).values({
  empresaId,
  colaboradorId: colaboradorCaixaId,
  inicio: dataHora(-7, 9),
  fim: dataHora(-7, 18),
  motivo: "Atestado medico seed"
});

const fornecedor = (
  await banco
    .insert(fornecedores)
    .values({ empresaId, nome: "Fornecedor Exemplo", documento: "00000000000100" })
    .returning({ id: fornecedores.id })
)[0];
if (!fornecedor) throw new Error("Fornecedor nao foi criado");

const cliente = (
  await banco
    .insert(clientes)
    .values({ empresaId, nome: "Cliente Balcao Seed", documento: "00000000000999" })
    .returning({ id: clientes.id })
)[0];
if (!cliente) throw new Error("Cliente nao foi criado");

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

const [integracaoVendas, integracaoProdutos] = await banco
  .insert(integracoesChaves)
  .values([
    { empresaId, tipo: "vendas", codigo: "SEED-VENDAS-DEV", criadoPor: usuarioIds.get("diretor@email.com") ?? null },
    {
      empresaId,
      tipo: "produtos_vendas",
      codigo: "SEED-PRODUTOS-VENDAS-DEV",
      criadoPor: usuarioIds.get("diretor@email.com") ?? null
    }
  ])
  .returning({ id: integracoesChaves.id, tipo: integracoesChaves.tipo });
if (!integracaoVendas || !integracaoProdutos) throw new Error("Chaves de integracao seed nao foram criadas");

await banco.insert(integracoesCamposConfig).values(
  ["pdv", "cliente", "vendedor", "produto", "forma_pagamento"].map((campo) => ({
    empresaId,
    tipo: "vendas" as const,
    campo: campo as "pdv" | "cliente" | "vendedor" | "produto" | "forma_pagamento",
    criarAutomaticamente: true,
    vincularAutomaticamente: true
  }))
);

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

const lacres = await banco
  .insert(lacresMalotes)
  .values([
    { empresaId, maloteId: malote.id, numero: "LACRE-001", status: "usado", usadoEm: dataHora(-1, 16) },
    { empresaId, maloteId: malote.id, numero: "LACRE-002" },
    { empresaId, maloteId: malote.id, numero: "LACRE-003", status: "cancelado" }
  ])
  .returning({ id: lacresMalotes.id, numero: lacresMalotes.numero });
const lacreTransferencia = lacres.find((lacre) => lacre.numero === "LACRE-001");
if (!lacreTransferencia) throw new Error("Lacre de transferencia nao foi criado");

const caixaFechado = (
  await banco
    .insert(fechamentosCaixa)
    .values({
      empresaId,
      pdvId: pdv.id,
      usuarioId: usuarioIds.get("gerencia@email.com") ?? null,
      usuarioCaixaId: usuarioIds.get("caixa@email.com") ?? null,
      colaboradorId: colaboradorCaixaId,
      dataMovimento: dataISO(-1),
      dataHoraAbertura: dataHora(-1, 7, 50),
      abertoEm: dataHora(-1, 7, 50),
      dataHoraFechamento: dataHora(-1, 18, 10),
      fechadoEm: dataHora(-1, 18, 12),
      tokenEdicao: "SEED-TOKEN-CAIXA",
      observacao: "Caixa seed fechado com ajuste",
      totalEntradas: "96.00",
      totalTransferencias: "20.00",
      totalTransferenciasEntrada: "0.00",
      totalTransferenciasSaida: "20.00",
      totalDespesas: "35.00",
      totalRetiradas: "12.00",
      totalMercadorias: "44.00",
      saldo: "5.00",
      status: "ajustado",
      criadoPor: usuarioIds.get("gerencia@email.com") ?? null
    })
    .returning({ id: fechamentosCaixa.id })
)[0];
if (!caixaFechado) throw new Error("Fechamento de caixa seed nao foi criado");

await banco.insert(edicoesCaixa).values({
  caixaId: caixaFechado.id,
  tokenUsado: "SEED-TOKEN-USADO",
  editadoPor: usuarioIds.get("gerencia@email.com") ?? null,
  editadoEm: dataHora(-1, 18, 20),
  valoresAntigos: { saldo: "0.00", observacao: "Fechamento original seed" },
  valoresNovos: { saldo: "5.00", observacao: "Caixa seed fechado com ajuste" }
});

const venda = (
  await banco
    .insert(vendas)
    .values({
      empresaId,
      integracaoChaveId: integracaoVendas.id,
      caixaId: caixaFechado.id,
      dataReferencia: dataISO(-1),
      dataVenda: dataHora(-1, 10, 30),
      descricao: "Venda exemplo",
      observacao: "Venda fake gerada pelo seed",
      valorOriginal: "96.00",
      dataPagamento: dataISO(-1),
      contaOrigemId: contaCaixa.id,
      pdvId: pdv.id,
      colaboradorId: colaboradorCaixaId,
      clienteId: cliente.id,
      identificadorExterno: "SEED-VENDA-001",
      hashIntegracao: "seed-hash-venda-001",
      statusExterno: "finalizada",
      numeroNotaFiscal: "NF-SEED-001",
      pdvAutomacaoId: "PDV-AUTO-001",
      pdvAutomacao: "PDV Automacao Seed",
      vendedorAutomacaoId: "VENDEDOR-AUTO-001",
      vendedorAutomacao: "Caixa Seed",
      vendedorAutomacaoDocumento: "00000000002",
      clienteAutomacaoId: "CLIENTE-AUTO-001",
      clienteAutomacao: "Cliente Balcao Seed",
      clienteAutomacaoDocumento: "00000000000999",
      automacaoId: "AUTO-SEED-001",
      criadoPor: usuarioIds.get("caixa@email.com") ?? null
    })
    .returning({ id: vendas.id })
)[0];
if (!venda) throw new Error("Venda exemplo nao foi criada");

await banco.insert(vendasProdutos).values({
  vendaId: venda.id,
  produtoId: produto.id,
  produtoAutomacaoId: "PROD-AUTO-001",
  produtoAutomacaoCodigo: "PAO-FRANCES",
  descricaoProduto: "Pao frances",
  dataHoraItem: dataHora(-1, 10, 31),
  quantidade: "120",
  valorUnitario: "0.8000",
  valorTotal: "96.00"
});

await banco.insert(vendasPagamentos).values({
  vendaId: venda.id,
  formaPagamentoId: formaPagamentoIds.get("Dinheiro") ?? null,
  tipoPagamentoAutomacaoId: "DIN",
  tipoPagamentoAutomacao: "Dinheiro",
  numeroVendas: 1,
  totalPago: "96.00"
});

await banco.insert(itensVendas).values({
  empresaId,
  produtoId: produto.id,
  descricaoProduto: "Pao frances",
  quantidade: "120",
  valorTotal: "96.00",
  dataVenda: dataISO(-1)
});

const despesa = (
  await banco
    .insert(despesas)
    .values({
      empresaId,
      caixaId: caixaFechado.id,
      grupoDespesaId: grupoDespesaSub.id,
      fornecedorId: fornecedor.id,
      colaboradorId: colaboradorFinanceiroId,
      dataReferencia: dataISO(-2),
      dataVencimento: dataISO(7),
      dataPagamento: dataISO(-1),
      descricao: "Manutencao preventiva seed",
      observacao: "Despesa fake para demonstracao",
      valorOriginal: "35.00",
      contaOrigemId: contaBanco.id,
      fotoDocumentoUrl: "https://example.com/seed/despesa.jpg",
      criadoPor: usuarioIds.get("financeiro@email.com") ?? null
    })
    .returning({ id: despesas.id })
)[0];
if (!despesa) throw new Error("Despesa seed nao foi criada");

await banco.insert(despesasItens).values({
  despesaId: despesa.id,
  grupoDespesaId: grupoDespesaSub.id,
  colaboradorId: colaboradorFinanceiroId,
  descricao: "Troca de resistencia",
  valor: "35.00"
});

const mercadoria = (
  await banco
    .insert(mercadorias)
    .values({
      empresaId,
      caixaId: caixaFechado.id,
      grupoMercadoriaId: grupoMercadoria.id,
      fornecedorId: fornecedor.id,
      dataReferencia: dataISO(-3),
      dataVencimento: dataISO(7),
      dataPagamento: dataISO(-1),
      descricao: "Compra de farinha seed",
      observacao: "Mercadoria fake para demonstracao",
      valorOriginal: "44.00",
      contaOrigemId: contaBanco.id,
      notaFiscalId: "NF-MERC-SEED-001",
      temNotaFiscal: true,
      fotoDocumentoUrl: "https://example.com/seed/mercadoria.jpg",
      criadoPor: usuarioIds.get("compras@email.com") ?? null
    })
    .returning({ id: mercadorias.id })
)[0];
if (!mercadoria) throw new Error("Mercadoria seed nao foi criada");

await banco.insert(mercadoriasItens).values({
  mercadoriaId: mercadoria.id,
  produtoId: produto.id,
  grupoMercadoriaId: grupoMercadoria.id,
  unidadeMedidaId: unidade.id,
  descricao: "Farinha de trigo",
  quantidade: "10.000",
  valorUnitario: "4.4000",
  valorTotal: "44.00"
});

const retirada = (
  await banco
    .insert(retiradas)
    .values({
      empresaId,
      caixaId: caixaFechado.id,
      grupoRetiradaId: grupoRetiradaPai.id,
      colaboradorId: colaboradorCaixaId,
      dataReferencia: dataISO(-1),
      dataVencimento: dataISO(-1),
      dataPagamento: dataISO(-1),
      descricao: "Retirada operacional seed",
      observacao: "Retirada fake para demonstracao",
      valorOriginal: "12.00",
      contaOrigemId: contaCaixa.id,
      criadoPor: usuarioIds.get("caixa@email.com") ?? null
    })
    .returning({ id: retiradas.id })
)[0];
if (!retirada) throw new Error("Retirada seed nao foi criada");

await banco.insert(transferencias).values({
  empresaId,
  caixaId: caixaFechado.id,
  dataReferencia: dataISO(-1),
  descricao: "Transferencia para banco seed",
  observacao: "Transferencia fake com malote e lacre",
  valorOriginal: "20.00",
  contaOrigemId: contaCaixa.id,
  contaDestinoId: contaBanco.id,
  maloteId: malote.id,
  lacreMaloteId: lacreTransferencia.id,
  criadoPor: usuarioIds.get("tesouraria@email.com") ?? null
});

await banco.insert(ajustesFechamentoCaixa).values({
  fechamentoCaixaId: caixaFechado.id,
  despesaId: despesa.id,
  valorDiferenca: "5.00"
});

await banco.insert(debitosColaboradores).values([
  {
    empresaId,
    colaboradorId: colaboradorCaixaId,
    tipo: "FECHAMENTO_CAIXA",
    despesaId: despesa.id,
    caixaId: caixaFechado.id,
    valor: "5.00",
    observacao: "Diferenca de caixa seed",
    criadoPor: usuarioIds.get("gerencia@email.com") ?? null
  },
  {
    empresaId,
    colaboradorId: colaboradorCaixaId,
    tipo: "RETIRADA",
    retiradaId: retirada.id,
    caixaId: caixaFechado.id,
    valor: "12.00",
    observacao: "Retirada operacional seed",
    criadoPor: usuarioIds.get("caixa@email.com") ?? null
  }
]);

await banco.insert(integracoesVinculos).values([
  {
    empresaId,
    tipo: "vendas",
    tipoRegistro: "pdv",
    identificadorExterno: "PDV-AUTO-001",
    descricaoExterna: "PDV Automacao Seed",
    registroSistemaId: pdv.id,
    pendente: false
  },
  {
    empresaId,
    tipo: "vendas",
    tipoRegistro: "cliente",
    identificadorExterno: "CLIENTE-AUTO-001",
    descricaoExterna: "Cliente Balcao Seed",
    registroSistemaId: cliente.id,
    pendente: false
  },
  {
    empresaId,
    tipo: "vendas",
    tipoRegistro: "colaborador",
    identificadorExterno: "VENDEDOR-AUTO-001",
    descricaoExterna: "Caixa Seed",
    registroSistemaId: colaboradorCaixaId,
    pendente: false
  },
  {
    empresaId,
    tipo: "produtos_vendas",
    tipoRegistro: "produto",
    identificadorExterno: "PROD-AUTO-001",
    descricaoExterna: "Pao frances",
    registroSistemaId: produto.id,
    pendente: false
  },
  {
    empresaId,
    tipo: "vendas",
    tipoRegistro: "forma_pagamento",
    identificadorExterno: "DIN",
    descricaoExterna: "Dinheiro",
    registroSistemaId: formaPagamentoIds.get("Dinheiro") ?? null,
    pendente: false
  }
]);

await banco.insert(integracoesRegistros).values({
  empresaId,
  integracaoChaveId: integracaoVendas.id,
  tipoRegistro: "venda",
  identificadorExterno: "SEED-VENDA-001",
  hashConteudo: "seed-hash-venda-001",
  registroSistemaId: venda.id,
  payload: {
    Venda: { idVenda: "SEED-VENDA-001", valorTotal: 96, dataHoraVenda: dataHora(-1, 10, 30).toISOString() },
    ItensVenda: [{ idRegistro: "SEED-ITEM-001", descricaoProduto: "Pao frances", total: 96 }],
    PagamentosVenda: [{ idFormaPagamento: "DIN", valor: 96 }]
  }
});

await banco.insert(integracoesHistorico).values([
  {
    empresaId,
    integracaoChaveId: integracaoVendas.id,
    tipo: "vendas",
    identificadorExterno: "SEED-VENDA-001",
    hashConteudo: "seed-hash-venda-001",
    status: "criado",
    payload: { status: "criado", vendaId: venda.id }
  },
  {
    empresaId,
    integracaoChaveId: integracaoProdutos.id,
    tipo: "produtos_vendas",
    identificadorExterno: "PROD-AUTO-001",
    hashConteudo: "seed-hash-produto-001",
    status: "sem_novidade",
    payload: { status: "sem_novidade", produtoId: produto.id }
  }
]);

await banco.insert(integracoesSemNovidade).values({
  empresaId,
  integracaoChaveId: integracaoProdutos.id,
  tipo: "produtos_vendas",
  identificadorExterno: "PROD-AUTO-001",
  hashConteudo: "seed-hash-produto-001",
  payload: { produtoId: produto.id, descricao: "Pao frances" }
});

const usuarioDiretorId = usuarioIds.get("diretor@email.com");
if (!usuarioDiretorId) throw new Error("Usuario diretor nao foi criado");

await banco.insert(sessaoAutenticacao).values({
  id: "seed-session-expirada",
  token: "seed-session-expirada-token",
  userId: usuarioDiretorId,
  expiresAt: dataHora(-1, 0),
  ipAddress: "127.0.0.1",
  userAgent: "seed"
});

await banco.insert(verificacaoAutenticacao).values({
  id: "seed-verification-expirada",
  identifier: "seed-verificacao@email.com",
  value: "seed-token-expirado",
  expiresAt: dataHora(-1, 0)
});

console.info("[seed] OK Dados fake completos aplicados em cadastros, caixa, lancamentos, integracoes e auth");
console.info("[seed] Credenciais de desenvolvimento:");
for (const usuario of usuariosSeed) {
  console.info(`[seed] - ${usuario.email} / ${usuario.senha} / ${usuario.role} / ${usuario.cargo}`);
}

await pool.end();
console.info("[seed] OK Seed aplicado.");
