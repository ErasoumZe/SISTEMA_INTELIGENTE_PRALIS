declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export type PerfilTeste =
  | "admin"
  | "caixa"
  | "gerente"
  | "tesouraria"
  | "semPermissao"
  | "multiempresa"
  | "discriminador"
  // Ciclo de vida R7 (Fase 1): operadores de caixa com perfis de pagamento distintos para a matriz.
  | "caixaCiclo"
  | "financeiroCiclo";

export const idsTeste = {
  empresaA: "11111111-1111-4111-8111-111111111111",
  empresaB: "33333333-3333-4333-8333-333333333333",
  contaCaixa: "11111111-1111-4111-8111-111111111201",
  contaBanco: "11111111-1111-4111-8111-111111111202",
  contaLivre: "11111111-1111-4111-8111-111111111203",
  contaCofre: "11111111-1111-4111-8111-111111111204",
  pdvA: "11111111-1111-4111-8111-111111111301",
  pdvLivre: "11111111-1111-4111-8111-111111111302",
  areaA: "11111111-1111-4111-8111-111111111401",
  setorA: "11111111-1111-4111-8111-111111111402",
  cargoAdmin: "11111111-1111-4111-8111-111111111501",
  cargoCaixa: "11111111-1111-4111-8111-111111111502",
  cargoGerente: "11111111-1111-4111-8111-111111111503",
  cargoTesouraria: "11111111-1111-4111-8111-111111111504",
  cargoSemPermissao: "11111111-1111-4111-8111-111111111505",
  cargoMultiempresa: "11111111-1111-4111-8111-111111111506",
  cargoDiscriminador: "11111111-1111-4111-8111-111111111507",
  colaboradorAdmin: "11111111-1111-4111-8111-111111111601",
  colaboradorCaixa: "11111111-1111-4111-8111-111111111602",
  colaboradorGerente: "11111111-1111-4111-8111-111111111603",
  colaboradorTesouraria: "11111111-1111-4111-8111-111111111604",
  colaboradorSemPermissao: "11111111-1111-4111-8111-111111111605",
  colaboradorMultiempresa: "11111111-1111-4111-8111-111111111606",
  colaboradorDiscriminador: "11111111-1111-4111-8111-111111111607",
  colaboradorCargoAdmin: "11111111-1111-4111-8111-111111111701",
  colaboradorCargoCaixa: "11111111-1111-4111-8111-111111111702",
  colaboradorCargoGerente: "11111111-1111-4111-8111-111111111703",
  colaboradorCargoTesouraria: "11111111-1111-4111-8111-111111111704",
  colaboradorCargoSemPermissao: "11111111-1111-4111-8111-111111111705",
  colaboradorCargoMultiempresa: "11111111-1111-4111-8111-111111111706",
  colaboradorCargoDiscriminador: "11111111-1111-4111-8111-111111111707",
  grupoDespesaOperacional: "11111111-1111-4111-8111-111111111711",
  grupoDespesaQuebra: "11111111-1111-4111-8111-111111111712",
  grupoMercadoriaInsumos: "11111111-1111-4111-8111-111111111713",
  grupoRetiradaSangria: "11111111-1111-4111-8111-111111111714",
  grupoVendaBalcao: "11111111-1111-4111-8111-111111111715",
  unidade: "11111111-1111-4111-8111-111111111716",
  formaPagamentoDinheiro: "11111111-1111-4111-8111-111111111717",
  fornecedor: "11111111-1111-4111-8111-111111111718",
  cliente: "11111111-1111-4111-8111-111111111719",
  produto: "11111111-1111-4111-8111-111111111720",
  caixaAberto: "11111111-1111-4111-8111-111111111721",
  caixaFechado: "11111111-1111-4111-8111-111111111722",
  vendaSeed: "11111111-1111-4111-8111-111111111723",
  integracaoChave: "11111111-1111-4111-8111-111111111724",
  integracaoCodigo: "INTEGRACAO-TESTE-CHAVE",
  maloteA: "11111111-1111-4111-8111-111111111801",
  maloteB: "33333333-3333-4333-8333-333333333801",
  lacreA: "11111111-1111-4111-8111-111111111901",
  lacreB: "33333333-3333-4333-8333-333333333901",
  cargoCaixaCiclo: "11111111-1111-4111-8111-111111112001",
  colaboradorCaixaCiclo: "11111111-1111-4111-8111-111111112002",
  colaboradorCargoCaixaCiclo: "11111111-1111-4111-8111-111111112003",
  cargoFinanceiroCiclo: "11111111-1111-4111-8111-111111112011",
  colaboradorFinanceiroCiclo: "11111111-1111-4111-8111-111111112012",
  colaboradorCargoFinanceiroCiclo: "11111111-1111-4111-8111-111111112013",
  // Patrimonio (D2): segunda origem do campo Grupo da discriminacao (§5, item 6). O grupo da
  // empresa B existe para provar que o escopo por empresa vale tambem para esta origem.
  grupoPatrimonioMaquinas: "11111111-1111-4111-8111-111111112101",
  grupoPatrimonioOutraEmpresa: "33333333-3333-4333-8333-333333332101"
} as const;

export const usuariosTeste: Record<PerfilTeste, { email: string; nome: string; senha: string }> = {
  admin: { email: "admin.integracao@padaria.local", nome: "Admin Integracao", senha: "Teste#2026!admin" },
  caixa: { email: "caixa.integracao@padaria.local", nome: "Caixa Integracao", senha: "Teste#2026!caixa" },
  gerente: { email: "gerente.integracao@padaria.local", nome: "Gerente Integracao", senha: "Teste#2026!gerente" },
  tesouraria: {
    email: "tesouraria.integracao@padaria.local",
    nome: "Tesouraria Integracao",
    senha: "Teste#2026!tesouraria"
  },
  semPermissao: {
    email: "sem-permissao.integracao@padaria.local",
    nome: "Sem Permissao Integracao",
    senha: "Teste#2026!sem"
  },
  multiempresa: {
    email: "multiempresa.integracao@padaria.local",
    nome: "Multiempresa Integracao",
    senha: "Teste#2026!multi"
  },
  discriminador: {
    email: "discriminador.integracao@padaria.local",
    nome: "Discriminador Integracao",
    senha: "Teste#2026!discrimina"
  },
  caixaCiclo: {
    email: "caixa-ciclo.integracao@padaria.local",
    nome: "Caixa Ciclo Integracao",
    senha: "Teste#2026!caixaciclo"
  },
  financeiroCiclo: {
    email: "financeiro-ciclo.integracao@padaria.local",
    nome: "Financeiro Ciclo Integracao",
    senha: "Teste#2026!finciclo"
  }
};
