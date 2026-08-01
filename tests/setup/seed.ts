import pg from "pg";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { permissoes, permissoesAcessoTotal, type Permissao, type RegrasPermissoes } from "@padaria/shared";
import {
  areas,
  cargos,
  clientes,
  colaboradores,
  colaboradoresCargos,
  contas,
  empresas,
  fechamentosCaixa,
  formasPagamento,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposPatrimonio,
  gruposRetiradas,
  gruposVendas,
  integracoesCamposConfig,
  integracoesChaves,
  integracoesVinculos,
  pdvs,
  perfisUsuarios,
  permissoesTabela,
  permissoesUsuarios,
  produtos,
  setores,
  unidadesMedida,
  usuariosEmpresas,
  vendas,
  vendasPagamentos,
  vendasProdutos
} from "@padaria/db/schema";
import { auth } from "../../api/src/auth/config.js";
import { banco } from "../../api/src/banco/conexao.js";
import { idsTeste, usuariosTeste, type PerfilTeste } from "./contexto.js";

type UsuarioSeed = {
  perfil: PerfilTeste;
  cargoId: string;
  colaboradorId: string;
  colaboradorCargoId: string;
  role: "usuario_comum" | "usuario_admin";
  permissoes: Permissao[];
};

const usuarios: UsuarioSeed[] = [
  {
    perfil: "admin",
    cargoId: idsTeste.cargoAdmin,
    colaboradorId: idsTeste.colaboradorAdmin,
    colaboradorCargoId: idsTeste.colaboradorCargoAdmin,
    role: "usuario_admin",
    // Acesso TOTAL = catalogo sem as flags `_somente_caixa_aberto` (restricoes). O role
    // usuario_admin ja resolve assim no perfil.service; o cargo espelha para nao mentir.
    permissoes: [...permissoesAcessoTotal]
  },
  {
    perfil: "caixa",
    cargoId: idsTeste.cargoCaixa,
    colaboradorId: idsTeste.colaboradorCaixa,
    colaboradorCargoId: idsTeste.colaboradorCargoCaixa,
    role: "usuario_comum",
    // Espelha `db/src/referencia-permissoes.ts` (cargo Caixa). Antes so tinha 4 permissoes e a
    // divergencia fazia o teste "provar" que o operador nao lanca despesa — que e o contrario da
    // R-121. Fixture que nao espelha a producao testa um sistema que nao existe.
    permissoes: [
      "caixa_operar",
      "entradas_visualizar",
      "entradas_criar",
      "transferencias_criar",
      "despesas_visualizar",
      "despesas_criar",
      "despesas_editar",
      "mercadorias_visualizar",
      "mercadorias_criar",
      "mercadorias_editar",
      "retiradas_visualizar",
      "retiradas_criar",
      "retiradas_editar"
    ]
  },
  {
    perfil: "gerente",
    cargoId: idsTeste.cargoGerente,
    colaboradorId: idsTeste.colaboradorGerente,
    colaboradorCargoId: idsTeste.colaboradorCargoGerente,
    role: "usuario_comum",
    permissoes: [
      "aparencia_visualizar",
      "aparencia_editar",
      "transferencias_visualizar",
      "transferencias_criar",
      "transferencias_conferir",
      "cadastro_contas_visualizar",
      "cadastro_pdv_visualizar",
      "cadastro_empresas_visualizar",
      "cadastro_usuarios_visualizar",
      "cadastro_permissoes_visualizar",
      "caixa_operar",
      "caixas_gerenciar",
      // Gerencia configura o vinculo usuario<->conta (FOTO 4) — paridade com a referencia de producao.
      "cadastro_contas_usuarios_visualizar",
      "cadastro_contas_usuarios_criar",
      "cadastro_contas_usuarios_excluir"
    ]
  },
  {
    perfil: "tesouraria",
    cargoId: idsTeste.cargoTesouraria,
    colaboradorId: idsTeste.colaboradorTesouraria,
    colaboradorCargoId: idsTeste.colaboradorCargoTesouraria,
    role: "usuario_comum",
    permissoes: [
      "transferencias_visualizar",
      "transferencias_criar",
      "transferencias_conferir",
      // Tesouraria opera os LACRES (selo do movimento) — paridade com a referencia de producao.
      "cadastro_lacres_visualizar",
      "cadastro_lacres_criar"
    ]
  },
  {
    perfil: "semPermissao",
    cargoId: idsTeste.cargoSemPermissao,
    colaboradorId: idsTeste.colaboradorSemPermissao,
    colaboradorCargoId: idsTeste.colaboradorCargoSemPermissao,
    role: "usuario_comum",
    permissoes: []
  },
  {
    perfil: "multiempresa",
    cargoId: idsTeste.cargoMultiempresa,
    colaboradorId: idsTeste.colaboradorMultiempresa,
    colaboradorCargoId: idsTeste.colaboradorCargoMultiempresa,
    role: "usuario_admin",
    permissoes: [...permissoesAcessoTotal]
  },
  {
    // So visualiza e discrimina (sem criar/editar/caixa) — prova a permissao propria isolada.
    // Carrega TAMBEM as flags `_somente_caixa_aberto` e NAO tem caixa aberto: e a fixture do
    // escopo restrito por caixa (o admin deixou de servir para isso, ele nao herda restricao).
    perfil: "discriminador",
    cargoId: idsTeste.cargoDiscriminador,
    colaboradorId: idsTeste.colaboradorDiscriminador,
    colaboradorCargoId: idsTeste.colaboradorCargoDiscriminador,
    role: "usuario_comum",
    permissoes: [
      "mercadorias_visualizar",
      "mercadorias_discriminar",
      "despesas_visualizar",
      "despesas_discriminar",
      "menu_mercadorias_somente_caixa_aberto",
      "menu_despesas_somente_caixa_aberto"
    ]
  },
  {
    // Ciclo de vida R7 (Fase 1): opera caixa e lanca/edita despesa, mas NAO paga, NAO ve/edita pago.
    perfil: "caixaCiclo",
    cargoId: idsTeste.cargoCaixaCiclo,
    colaboradorId: idsTeste.colaboradorCaixaCiclo,
    colaboradorCargoId: idsTeste.colaboradorCargoCaixaCiclo,
    role: "usuario_comum",
    permissoes: [
      "caixa_operar",
      "menu_caixa_mostrar",
      "despesas_visualizar",
      "despesas_criar",
      "despesas_editar",
      "menu_despesas_mostrar"
    ]
  },
  {
    // Opera caixa E tem o ciclo de pagamento completo de despesas (pagar + *_dpago) — lado "com permissao".
    perfil: "financeiroCiclo",
    cargoId: idsTeste.cargoFinanceiroCiclo,
    colaboradorId: idsTeste.colaboradorFinanceiroCiclo,
    colaboradorCargoId: idsTeste.colaboradorCargoFinanceiroCiclo,
    role: "usuario_comum",
    permissoes: [
      "caixa_operar",
      "menu_caixa_mostrar",
      "despesas_visualizar",
      "despesas_criar",
      "despesas_editar",
      "despesas_pagar",
      "despesas_editar_dpago",
      "despesas_visualizar_dpago",
      "menu_despesas_mostrar"
    ]
  },
  {
    // Recorrencia (D3): lanca despesa e retirada, NAO opera caixa e NAO tem
    // lancamentos_recorrencia_criar. Sem caixa_operar de proposito: os perfis *Ciclo esbarrariam
    // antes no "abra um caixa" e o teste provaria a regra errada.
    perfil: "semRecorrencia",
    cargoId: idsTeste.cargoSemRecorrencia,
    colaboradorId: idsTeste.colaboradorSemRecorrencia,
    colaboradorCargoId: idsTeste.colaboradorCargoSemRecorrencia,
    role: "usuario_comum",
    permissoes: [
      "despesas_visualizar",
      "despesas_criar",
      "retiradas_visualizar",
      "retiradas_criar",
      "menu_despesas_mostrar",
      "menu_retiradas_mostrar"
    ]
  },
  {
    // Entradas do dia (D7): a flag `menu_entradas_somente_caixa_aberto` E um caixa aberto proprio
    // (caixaAbertoEntradas, no pdvLivre). E a unica combinacao que exercita o escopo da tela de
    // Entradas — sem a flag o escopo nem se aplica, sem o caixa a listagem so bloqueia.
    perfil: "operadorEntradas",
    cargoId: idsTeste.cargoOperadorEntradas,
    colaboradorId: idsTeste.colaboradorOperadorEntradas,
    colaboradorCargoId: idsTeste.colaboradorCargoOperadorEntradas,
    role: "usuario_comum",
    permissoes: ["caixa_operar", "entradas_visualizar", "menu_entradas_mostrar", "menu_entradas_somente_caixa_aberto"]
  }
];

function regrasPermissoes(lista: Permissao[]): RegrasPermissoes {
  return Object.fromEntries(lista.map((permissao) => [permissao, true]));
}

function hashChave(codigo: string) {
  return createHash("sha256").update(codigo).digest("hex");
}

async function truncarBanco() {
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    await pool.query(`
      do $$
      declare tabela record;
      begin
        for tabela in select schemaname, tablename from pg_tables where schemaname = 'public' loop
          execute format('truncate table %I.%I restart identity cascade', tabela.schemaname, tabela.tablename);
        end loop;
      end $$;
    `);
  } finally {
    await pool.end();
  }
}

async function criarUsuario(perfil: PerfilTeste) {
  const usuario = usuariosTeste[perfil];
  await auth.api.signUpEmail({
    body: {
      name: usuario.nome,
      email: usuario.email,
      password: usuario.senha
    }
  });
  const [linha] = await banco
    .select({ id: perfisUsuarios.usuarioId })
    .from(perfisUsuarios)
    .where(eq(perfisUsuarios.email, usuario.email))
    .limit(1);
  if (linha) return linha.id;

  const [usuarioAuth] = await banco.query.usuarioAutenticacao.findMany({
    where: (tabela, { eq: igual }) => igual(tabela.email, usuario.email),
    limit: 1
  });
  if (!usuarioAuth?.id) throw new Error(`Usuario de integracao nao foi criado: ${usuario.email}`);
  return usuarioAuth.id;
}

export async function aplicarSeedIntegracao() {
  await truncarBanco();

  await banco.insert(permissoesTabela).values(
    permissoes.map((permissao) => ({
      codigo: permissao,
      nome: permissao.replaceAll("_", " "),
      descricao: `Permissao para ${permissao.replaceAll("_", " ")}`
    }))
  );

  await banco.insert(empresas).values([
    { id: idsTeste.empresaA, nome: "Padaria Integracao A", cnpj: "00000000000191" },
    { id: idsTeste.empresaB, nome: "Padaria Integracao B", cnpj: "00000000000272" }
  ]);

  await banco.insert(areas).values({ id: idsTeste.areaA, empresaId: idsTeste.empresaA, nome: "Operacao" });
  await banco
    .insert(setores)
    .values({ id: idsTeste.setorA, empresaId: idsTeste.empresaA, areaId: idsTeste.areaA, nome: "Loja" });

  const usuarioIds = new Map<PerfilTeste, string>();
  for (const usuario of usuarios) {
    const usuarioId = await criarUsuario(usuario.perfil);
    usuarioIds.set(usuario.perfil, usuarioId);
    const dadosUsuario = usuariosTeste[usuario.perfil];
    await banco.insert(perfisUsuarios).values({
      usuarioId,
      empresaId: idsTeste.empresaA,
      nome: dadosUsuario.nome,
      email: dadosUsuario.email,
      role: usuario.role
    });
    await banco.insert(usuariosEmpresas).values({ usuarioId, empresaId: idsTeste.empresaA });
    if (usuario.perfil === "multiempresa") {
      await banco.insert(usuariosEmpresas).values({ usuarioId, empresaId: idsTeste.empresaB });
    }
    await banco.insert(cargos).values({ id: usuario.cargoId, empresaId: idsTeste.empresaA, nome: dadosUsuario.nome });
    await banco.insert(colaboradores).values({
      id: usuario.colaboradorId,
      empresaId: idsTeste.empresaA,
      nome: dadosUsuario.nome,
      cpf: null,
      setorId: idsTeste.setorA,
      usuarioId
    });
    await banco.insert(colaboradoresCargos).values({
      id: usuario.colaboradorCargoId,
      empresaId: idsTeste.empresaA,
      colaboradorId: usuario.colaboradorId,
      setorId: idsTeste.setorA,
      cargoId: usuario.cargoId,
      remuneracaoMinuto: "1.000000",
      dataInicio: "2026-01-01",
      ativo: true
    });
    await banco.insert(permissoesUsuarios).values({ usuarioId, regras: regrasPermissoes(usuario.permissoes) });
  }

  await banco.insert(contas).values([
    { id: idsTeste.contaCaixa, empresaId: idsTeste.empresaA, nome: "Caixa Integracao", ativa: true },
    { id: idsTeste.contaBanco, empresaId: idsTeste.empresaA, nome: "Banco Integracao", ativa: true },
    { id: idsTeste.contaLivre, empresaId: idsTeste.empresaA, nome: "Conta Livre Integracao", ativa: true },
    { id: idsTeste.contaCofre, empresaId: idsTeste.empresaA, nome: "Cofre Integracao", ativa: true },
    { id: idsTeste.contaEntradas, empresaId: idsTeste.empresaA, nome: "Conta Entradas Integracao", ativa: true }
  ]);
  // Conta cofre mapeada na empresa (Regra 5): origem da transferencia automatica de abertura (R8).
  await banco.update(empresas).set({ contaCofreId: idsTeste.contaCofre }).where(eq(empresas.id, idsTeste.empresaA));
  await banco.insert(pdvs).values([
    {
      id: idsTeste.pdvA,
      empresaId: idsTeste.empresaA,
      nome: "PDV Integracao",
      codigo: "PDV-INT",
      contaId: idsTeste.contaCaixa,
      ativo: true
    },
    {
      id: idsTeste.pdvLivre,
      empresaId: idsTeste.empresaA,
      nome: "PDV Livre Integracao",
      codigo: "PDV-LIVRE",
      contaId: idsTeste.contaLivre,
      ativo: true
    },
    {
      // PDV exclusivo do caixa aberto do operadorEntradas (D7). Existe para NAO ocupar o pdvLivre,
      // que e onde turnos/caixa/alteracao-horario abrem caixa.
      id: idsTeste.pdvEntradas,
      empresaId: idsTeste.empresaA,
      nome: "PDV Entradas Integracao",
      codigo: "PDV-ENTRADAS",
      contaId: idsTeste.contaEntradas,
      ativo: true
    }
  ]);
  await banco
    .insert(formasPagamento)
    .values({ id: idsTeste.formaPagamentoDinheiro, empresaId: idsTeste.empresaA, nome: "Dinheiro" });
  await banco.insert(gruposDespesas).values([
    { id: idsTeste.grupoDespesaOperacional, empresaId: idsTeste.empresaA, nome: "Operacional" },
    { id: idsTeste.grupoDespesaQuebra, empresaId: idsTeste.empresaA, nome: "Quebra de caixa" }
  ]);
  await banco
    .insert(gruposMercadorias)
    .values({ id: idsTeste.grupoMercadoriaInsumos, empresaId: idsTeste.empresaA, nome: "Insumos" });
  // Sigla UTS (utensilios) de proposito: grupos_patrimonio tem unique(empresa_id, sig) e o teste de
  // cadastro (cadastros/patrimonio.test.ts) cria MAQ e MOB na empresa A. Um seed com MAQ faria
  // aquele POST falhar por sigla duplicada — o seed nao pode ocupar as siglas que os testes criam.
  await banco.insert(gruposPatrimonio).values([
    { id: idsTeste.grupoPatrimonioMaquinas, empresaId: idsTeste.empresaA, sig: "UTS", nome: "Utensilios" },
    { id: idsTeste.grupoPatrimonioOutraEmpresa, empresaId: idsTeste.empresaB, sig: "UTS", nome: "Utensilios" }
  ]);
  await banco
    .insert(gruposRetiradas)
    .values({ id: idsTeste.grupoRetiradaSangria, empresaId: idsTeste.empresaA, nome: "Sangria" });
  await banco
    .insert(gruposVendas)
    .values({ id: idsTeste.grupoVendaBalcao, empresaId: idsTeste.empresaA, nome: "Balcao" });
  await banco
    .insert(unidadesMedida)
    .values({ id: idsTeste.unidade, empresaId: idsTeste.empresaA, nome: "Unidade", sigla: "un" });
  await banco.insert(fornecedores).values({
    id: idsTeste.fornecedor,
    empresaId: idsTeste.empresaA,
    nome: "Fornecedor Integracao",
    documento: "00000000000100"
  });
  await banco.insert(clientes).values({
    id: idsTeste.cliente,
    empresaId: idsTeste.empresaA,
    nome: "Cliente Integracao",
    documento: "00000000000999"
  });
  await banco.insert(produtos).values({
    id: idsTeste.produto,
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
    unidadeMedidaId: idsTeste.unidade,
    codigo: "PROD-INT",
    descricao: "Produto Integracao"
  });

  const adminId = usuarioIds.get("admin");
  const caixaId = usuarioIds.get("caixa");
  const operadorEntradasId = usuarioIds.get("operadorEntradas");
  if (!adminId || !caixaId || !operadorEntradasId) throw new Error("Usuarios base de integracao nao foram criados");

  await banco.insert(fechamentosCaixa).values([
    {
      id: idsTeste.caixaAberto,
      empresaId: idsTeste.empresaA,
      pdvId: idsTeste.pdvA,
      usuarioId: adminId,
      usuarioCaixaId: adminId,
      colaboradorId: idsTeste.colaboradorAdmin,
      dataMovimento: "2026-06-30",
      dataHoraAbertura: new Date("2026-06-30T08:00:00.000Z"),
      abertoEm: new Date("2026-06-30T08:00:00.000Z"),
      tokenEdicao: "TOKEN-ABERTO",
      observacao: "Caixa aberto seed",
      status: "aberto",
      criadoPor: adminId
    },
    {
      id: idsTeste.caixaFechado,
      empresaId: idsTeste.empresaA,
      pdvId: idsTeste.pdvLivre,
      usuarioId: caixaId,
      usuarioCaixaId: caixaId,
      colaboradorId: idsTeste.colaboradorCaixa,
      dataMovimento: "2026-06-29",
      dataHoraAbertura: new Date("2026-06-29T08:00:00.000Z"),
      abertoEm: new Date("2026-06-29T08:00:00.000Z"),
      dataHoraFechamento: new Date("2026-06-29T18:00:00.000Z"),
      fechadoEm: new Date("2026-06-29T18:00:00.000Z"),
      tokenEdicao: "TOKEN-FECHADO",
      observacao: "Caixa fechado seed",
      totalEntradas: "42.00",
      saldo: "42.00",
      status: "fechado",
      criadoPor: caixaId
    },
    {
      // Entradas do dia (D7): caixa ABERTO do operadorEntradas, no PDV EXCLUSIVO dele. Nao pode ser
      // o pdvLivre: la os testes de turnos/caixa/alteracao-horario ABREM caixa, e um aberto no seed
      // os faz falhar por caixa_aberto_unico_por_pdv (migration 0003).
      id: idsTeste.caixaAbertoEntradas,
      empresaId: idsTeste.empresaA,
      pdvId: idsTeste.pdvEntradas,
      usuarioId: operadorEntradasId,
      usuarioCaixaId: operadorEntradasId,
      colaboradorId: idsTeste.colaboradorOperadorEntradas,
      // Dia PROPRIO (01/07), diferente do 30/06 do caixaAberto: o teste de historico do caixa
      // filtra por 2026-06-30 e espera exatamente um caixa naquele dia. O teste de entradas cria
      // as vendas que precisa neste dia, entao nao depende do seed de ninguem.
      dataMovimento: "2026-07-01",
      dataHoraAbertura: new Date("2026-07-01T08:00:00.000Z"),
      abertoEm: new Date("2026-07-01T08:00:00.000Z"),
      tokenEdicao: "TOKEN-ABERTO-ENTRADAS",
      observacao: "Caixa aberto do operador de entradas",
      status: "aberto",
      criadoPor: operadorEntradasId
    }
  ]);

  await banco.insert(vendas).values({
    id: idsTeste.vendaSeed,
    empresaId: idsTeste.empresaA,
    caixaId: idsTeste.caixaAberto,
    dataReferencia: "2026-06-30",
    descricao: "Venda seed integracao",
    valorOriginal: "42.00",
    dataPagamento: "2026-06-30",
    contaOrigemId: idsTeste.contaCaixa,
    pdvId: idsTeste.pdvA,
    colaboradorId: idsTeste.colaboradorAdmin,
    clienteId: idsTeste.cliente,
    criadoPor: adminId
  });
  await banco.insert(vendasProdutos).values({
    vendaId: idsTeste.vendaSeed,
    produtoId: idsTeste.produto,
    descricaoProduto: "Produto Integracao",
    dataHoraItem: new Date("2026-06-30T09:00:00.000Z"),
    quantidade: "2",
    valorUnitario: "21.0000",
    valorTotal: "42.00"
  });
  await banco.insert(vendasPagamentos).values({
    vendaId: idsTeste.vendaSeed,
    formaPagamentoId: idsTeste.formaPagamentoDinheiro,
    numeroVendas: 1,
    totalPago: "42.00"
  });
  await banco.insert(integracoesChaves).values({
    id: idsTeste.integracaoChave,
    empresaId: idsTeste.empresaA,
    tipo: "vendas",
    codigo: idsTeste.integracaoCodigo,
    codigoHash: hashChave(idsTeste.integracaoCodigo),
    criadoPor: adminId
  });
  await banco.insert(integracoesCamposConfig).values(
    ["pdv", "cliente", "produto", "forma_pagamento"].map((campo) => ({
      empresaId: idsTeste.empresaA,
      tipo: "vendas" as const,
      campo: campo as "pdv" | "cliente" | "produto" | "forma_pagamento",
      criarAutomaticamente: true,
      vincularAutomaticamente: true
    }))
  );
  await banco.insert(integracoesVinculos).values([
    {
      empresaId: idsTeste.empresaA,
      tipo: "vendas",
      tipoRegistro: "pdv",
      identificadorExterno: "PDV-EXT",
      descricaoExterna: "PDV Integracao",
      registroSistemaId: idsTeste.pdvA,
      pendente: false
    },
    {
      empresaId: idsTeste.empresaA,
      tipo: "vendas",
      tipoRegistro: "produto",
      identificadorExterno: "PROD-EXT",
      descricaoExterna: "Produto Integracao",
      registroSistemaId: idsTeste.produto,
      pendente: false
    },
    {
      empresaId: idsTeste.empresaA,
      tipo: "vendas",
      tipoRegistro: "forma_pagamento",
      identificadorExterno: "DIN",
      descricaoExterna: "Dinheiro",
      registroSistemaId: idsTeste.formaPagamentoDinheiro,
      pendente: false
    }
  ]);
}
