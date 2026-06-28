<script lang="ts">
  import { papeis, permissoes, type AuthSession, type PapelUsuario, type Permissao, type TemaAplicacao, type TipoMovimentacao } from "@padaria/shared";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { apiUrl } from "$lib/config";
  import { aplicarTema, apiGet, apiPost, apiPut, carregarSessao } from "$lib/api";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import * as Table from "$lib/components/ui/table";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { NativeSelect } from "$lib/components/ui/native-select";
  import RelatorioProdutos from "$lib/components/relatorio-produtos.svelte";
  import CadastroSimples from "$lib/components/cadastro-simples.svelte";
  import TreeCadastro from "$lib/components/tree-cadastro.svelte";
  import { Toaster, toast } from "svelte-sonner";
  import {
    ArrowDownLeft,
    ArrowLeftRight,
    BadgeDollarSign,
    Banknote,
    Building2,
    Boxes,
    BriefcaseBusiness,
    ClipboardCheck,
    ClipboardList,
    FileBarChart,
    FileText,
    HandCoins,
    ChevronLeft,
    ChevronRight,
    Landmark,
    Layers3,
    LogOut,
    Menu,
    MapPinned,
    Paintbrush,
    Plus,
    ReceiptText,
    ScrollText,
    ShieldCheck,
    ShoppingBasket,
    Store,
    UsersRound,
    Ruler,
    WalletCards,
    Warehouse,
    CalendarClock
  } from "@lucide/svelte";

	  type Opcao = {
	    id: string;
	    nome?: string;
	    email?: string;
	    descricao?: string;
	    codigo?: string;
	    sigla?: string;
	    empresaId?: string;
	    caminho?: string;
    nivel?: number;
    selecionavel?: boolean;
    totalLacres?: number;
    cpf?: string;
    tipo?: string;
    tipoGrupo?: "despesa" | "mercadoria" | "retirada";
    grupoPaiId?: string | null;
    areaId?: string | null;
    setorPaiId?: string | null;
	    setorId?: string | null;
		    salario?: string;
		    papel?: string;
	    empresaIds?: string[];
		    usuarioId?: string;
	    colaboradorId?: string;
	    cargoId?: string;
	    cargoNome?: string;
	    remuneracaoMinuto?: string;
	    dataInicio?: string;
	    ativo?: boolean;
	    diaDaSemana?: string;
	    horaEntrada?: string;
	    cargaHorariaDiariaEmMinutos?: number;
		    intervaloMinutos?: number;
		    colaboradorCargoId?: string;
	    inicio?: string;
	    fim?: string;
	    motivo?: string;
	    dia?: number;
	    mes?: number;
	    ano?: number | null;
			    tipoPermissao?: "papel" | "setor" | "usuario";
	    codigoPermissao?: string;
	    permissaoCodigo?: string;
	  };
  type Opcoes = {
    empresas: Opcao[];
    contas: Opcao[];
    fornecedores: Opcao[];
	    colaboradores: Opcao[];
		    cargos: Opcao[];
		    colaboradoresCargos: Opcao[];
		    colaboradoresJornadas: Opcao[];
	    colaboradoresFaltasJustificadas: Opcao[];
	    feriados: Opcao[];
		    gruposDespesas: Opcao[];
    gruposMercadorias: Opcao[];
    gruposRetiradas: Opcao[];
    unidadesMedida: Opcao[];
    areas: Opcao[];
    setores: Opcao[];
	    permissoes: Opcao[];
	    papeisPermissoes: Opcao[];
	    setoresPermissoes: Opcao[];
	    usuariosPermissoes: Opcao[];
	    usuarios: Opcao[];
	    produtos: Opcao[];
	    malotes: Opcao[];
	  };
  type Movimento = {
    id: string;
    empresaId: string;
    tipo: TipoMovimentacao;
    dataReferencia: string;
    descricao: string;
    valorOriginal: string;
    computar: boolean;
    status: string;
  };
  type ResumoCaixa = {
    totalEntradas: number;
    totalTransferencias: number;
    totalDespesas: number;
    totalRetiradas: number;
    saldo: number;
  };

  function opcoesVazias(): Opcoes {
    return {
      empresas,
      contas: [],
      fornecedores: [],
	      colaboradores: [],
		      cargos: [],
		      colaboradoresCargos: [],
		      colaboradoresJornadas: [],
	      colaboradoresFaltasJustificadas: [],
	      feriados: [],
	      gruposDespesas: [],
      gruposMercadorias: [],
      gruposRetiradas: [],
      unidadesMedida: [],
      areas: [],
      setores: [],
      permissoes: [],
      papeisPermissoes: [],
      setoresPermissoes: [],
      usuariosPermissoes: [],
      usuarios: [],
      produtos: [],
      malotes: []
    };
  }

	  type ItemMenu = { id: string; titulo: string; permissao: Permissao; icone: typeof Banknote };
	  type TipoPermissaoCadastro = "papel" | "setor" | "usuario";

	  const itemPorTela: Record<string, ItemMenu> = {
    entradas: { id: "entradas", titulo: "Entradas", permissao: "entradas", icone: ArrowDownLeft },
    transferencias: { id: "transferencias", titulo: "Transferencias", permissao: "transferencias", icone: ArrowLeftRight },
    despesas: { id: "despesas", titulo: "Despesas", permissao: "despesas", icone: ReceiptText },
    mercadorias: { id: "mercadorias", titulo: "Mercadorias", permissao: "mercadorias", icone: Boxes },
    retiradas: { id: "retiradas", titulo: "Retiradas", permissao: "retiradas", icone: WalletCards },
    fechamento: { id: "fechamento", titulo: "Fechamento com diferenca", permissao: "fechamento_com_diferenca", icone: BadgeDollarSign },
    relatorio_produtos: { id: "relatorio_produtos", titulo: "Produtos mais vendidos", permissao: "relatorio_produtos_mais_vendidos", icone: FileBarChart },
    malotes: { id: "malotes", titulo: "Malotes", permissao: "cadastro_malotes", icone: BriefcaseBusiness },
    caixa: { id: "caixa", titulo: "Caixa", permissao: "fechamento_com_diferenca", icone: Store },
    promocoes: { id: "promocoes", titulo: "Promocoes", permissao: "promocoes", icone: HandCoins },
    relatorio_faltas: { id: "relatorio_faltas", titulo: "Faltas e atestados", permissao: "relatorio_faltas_atestados_colaboradores", icone: FileBarChart },
    relatorio_advertencias: { id: "relatorio_advertencias", titulo: "Advertencias e suspensoes", permissao: "relatorio_advertencia_suspensao_colaboradores", icone: ClipboardCheck },
    pedidos: { id: "pedidos", titulo: "Pedidos", permissao: "pedidos", icone: ClipboardList },
    perdas_sobras: { id: "perdas_sobras", titulo: "Perdas e sobras", permissao: "perdas_sobras", icone: Boxes },
    estoque_produtos: { id: "estoque_produtos", titulo: "Estoque de produtos", permissao: "estoque_produtos", icone: Warehouse },
    relatorio_dre: { id: "relatorio_dre", titulo: "Relatorio de DRE", permissao: "relatorio_dre", icone: FileBarChart },
    clientes: { id: "clientes", titulo: "Clientes", permissao: "cadastro_avaliacao_clientes", icone: UsersRound },
    fornecedores: { id: "fornecedores", titulo: "Fornecedores", permissao: "cadastro_fornecedores", icone: Building2 },
    produtos: { id: "produtos", titulo: "Produtos", permissao: "cadastro_produtos", icone: ShoppingBasket },
    colaboradores: { id: "colaboradores", titulo: "Colaboradores", permissao: "cadastro_colaboradores", icone: UsersRound },
    feriados: { id: "feriados", titulo: "Feriados", permissao: "cadastro_colaboradores", icone: CalendarClock },
    folha_ponto: { id: "folha_ponto", titulo: "Folha ponto", permissao: "folha_ponto", icone: CalendarClock },
    avaliacao_qualidade: { id: "avaliacao_qualidade", titulo: "Avaliacao de qualidade", permissao: "avaliacao_qualidade", icone: ClipboardCheck },
    avaliacao_colaboradores: { id: "avaliacao_colaboradores", titulo: "Avaliacao de colaboradores", permissao: "avaliacao_colaboradores", icone: ClipboardCheck },
    relatorio_fiscal: { id: "relatorio_fiscal", titulo: "Relatorio fiscal dos produtos", permissao: "relatorio_fiscal_produtos", icone: ScrollText },
    fiscal_produtos: { id: "fiscal_produtos", titulo: "Fiscal de produtos", permissao: "cadastro_fiscal_produtos", icone: FileText },
    patrimonio: { id: "patrimonio", titulo: "Patrimonio", permissao: "cadastro_patrimonio", icone: Landmark },
    ficha_tecnica: { id: "ficha_tecnica", titulo: "Ficha tecnica", permissao: "cadastro_ficha_tecnica", icone: ClipboardList },
    ingredientes: { id: "ingredientes", titulo: "Ingredientes", permissao: "cadastro_ingredientes", icone: ShoppingBasket },
    contas_pagar: { id: "contas_pagar", titulo: "Contas a pagar", permissao: "contas_pagar", icone: ReceiptText },
    vendas_crediario: { id: "vendas_crediario", titulo: "Vendas no crediario", permissao: "vendas_crediario", icone: HandCoins },
    notas_fiscais: { id: "notas_fiscais", titulo: "Notas fiscais", permissao: "notas_fiscais", icone: FileText },
    grupos_vendas: { id: "grupos_vendas", titulo: "Grupos de vendas", permissao: "cadastro_grupos_vendas", icone: Layers3 },
    pdv: { id: "pdv", titulo: "PDV", permissao: "cadastro_pdv", icone: Store },
    formas_pagamento: { id: "formas_pagamento", titulo: "Formas de pagamento", permissao: "cadastro_formas_pagamento", icone: WalletCards },
    contas: { id: "contas", titulo: "Contas", permissao: "cadastro_contas", icone: Building2 },
    empresas: { id: "empresas", titulo: "Empresas", permissao: "cadastro_empresas", icone: Building2 },
    grupos: { id: "grupos", titulo: "Grupos", permissao: "cadastro_grupos_despesas", icone: Layers3 },
    unidades: { id: "unidades", titulo: "Unidades de medida", permissao: "cadastro_unidades_medida", icone: Ruler },
		    areas_setores: { id: "areas_setores", titulo: "Areas e setores", permissao: "cadastro_areas_setores", icone: MapPinned },
	    usuarios: { id: "usuarios", titulo: "Usuarios", permissao: "cadastro_usuarios", icone: UsersRound },
	    permissoes: { id: "permissoes", titulo: "Permissoes", permissao: "cadastro_permissoes", icone: ShieldCheck },
		    aparencia: { id: "aparencia", titulo: "Aparencia", permissao: "configurar_tema", icone: Paintbrush }
	  };

	  const secoesPermissoes = [
	    { titulo: "Transferencias", prefixos: ["transferencias", "cadastro_malotes"] },
	    { titulo: "Despesas", prefixos: ["despesas", "contas_pagar", "cadastro_grupos_despesas"] },
	    { titulo: "Mercadorias", prefixos: ["mercadorias", "pedidos", "estoque_produtos", "perdas_sobras", "cadastro_grupos_mercadorias", "cadastro_produtos", "cadastro_unidades_medida", "cadastro_fornecedores"] },
	    { titulo: "Retiradas", prefixos: ["retiradas", "cadastro_grupos_retiradas"] },
	    { titulo: "Caixa e vendas", prefixos: ["entradas", "fechamento_com_diferenca", "promocoes", "vendas_crediario", "cadastro_pdv", "cadastro_formas_pagamento", "cadastro_grupos_vendas"] },
		    { titulo: "Cadastros", prefixos: ["cadastro_empresas", "cadastro_contas", "cadastro_areas_setores", "cadastro_colaboradores", "cadastro_avaliacao_clientes", "cadastro_fiscal_produtos", "cadastro_patrimonio", "cadastro_ficha_tecnica", "cadastro_ingredientes", "folha_ponto"] },
	    { titulo: "Relatorios", prefixos: ["relatorio_produtos_mais_vendidos", "relatorio_faltas_atestados_colaboradores", "relatorio_advertencia_suspensao_colaboradores", "relatorio_dre", "relatorio_fiscal_produtos"] },
	    { titulo: "Permissoes e aparencia", prefixos: ["cadastro_permissoes", "configurar_tema"] },
	    { titulo: "Outras", prefixos: [] }
	  ];

  const telasPorPapel: Record<PapelUsuario, string[]> = {
    caixa: ["entradas", "transferencias", "despesas", "mercadorias", "retiradas", "fechamento", "relatorio_produtos"],
    tesouraria: ["malotes", "transferencias"],
    gerencia: ["caixa", "promocoes", "relatorio_faltas", "relatorio_advertencias", "pedidos", "perdas_sobras", "estoque_produtos", "relatorio_dre", "clientes"],
    compras: ["pedidos", "mercadorias", "fornecedores", "produtos"],
    dp: ["despesas", "colaboradores", "feriados", "folha_ponto"],
    rh: ["avaliacao_qualidade", "avaliacao_colaboradores"],
    fiscal: ["relatorio_fiscal", "fiscal_produtos"],
    diretor_operacoes: ["relatorio_dre", "patrimonio", "ficha_tecnica", "ingredientes"],
	    diretor_geral: ["empresas", "transferencias", "despesas", "contas_pagar", "retiradas", "contas", "grupos", "unidades", "areas_setores", "usuarios", "permissoes", "aparencia"],
    financeiro: ["vendas_crediario", "notas_fiscais", "contas_pagar", "transferencias", "despesas", "mercadorias", "retiradas", "relatorio_dre", "grupos_vendas", "pdv", "formas_pagamento"]
  };

  const movimentoPorTela: Record<string, TipoMovimentacao> = {
    entradas: "entrada",
    transferencias: "transferencia",
    despesas: "despesa",
    mercadorias: "mercadoria",
    retiradas: "retirada"
  };

	  const telasCrudDiretoria = ["empresas", "contas", "grupos", "unidades", "areas_setores", "usuarios", "permissoes", "colaboradores"];

  type AcaoNovo = {
    tipo?: TipoMovimentacao;
    tela?: "malote";
    titulo: string;
    subtitulo: string;
    permissao: Permissao;
    icone: typeof Banknote;
    cor: string;
  };

	  const opcoesNovo: AcaoNovo[] = [
	    { tipo: "despesa", titulo: "Despesa", subtitulo: "Fornecedor, grupo e itens discriminados", permissao: "despesas", icone: ReceiptText, cor: "text-red-500" },
	    { tipo: "mercadoria", titulo: "Mercadoria", subtitulo: "Compra, nota fiscal e documento", permissao: "mercadorias", icone: Boxes, cor: "text-cyan-600" },
	    { tipo: "transferencia", titulo: "Transferencia", subtitulo: "Contas, malote e lacre", permissao: "transferencias", icone: ArrowLeftRight, cor: "text-blue-600" },
	    { tipo: "retirada", titulo: "Retirada", subtitulo: "Colaborador, fornecedor ou retirada operacional", permissao: "retiradas", icone: WalletCards, cor: "text-orange-500" },
	    { tela: "malote", titulo: "Malote", subtitulo: "Cadastro de malote e lacres", permissao: "cadastro_malotes", icone: BriefcaseBusiness, cor: "text-violet-600" }
	  ];

	  const diasJornada = [
	    { id: "SEGUNDA", nome: "Segunda" },
	    { id: "TERCA", nome: "Terca" },
	    { id: "QUARTA", nome: "Quarta" },
	    { id: "QUINTA", nome: "Quinta" },
	    { id: "SEXTA", nome: "Sexta" },
	    { id: "SABADO", nome: "Sabado" },
	    { id: "DOMINGO", nome: "Domingo" }
	  ];

	  let sessao: AuthSession | null = null;
  let opcoes: Opcoes | null = null;
  let empresas: Opcao[] = [];
  let movimentos: Movimento[] = [];
  let resumo: ResumoCaixa | null = null;
  let telaAtiva = "entradas";
  let paginaMovimentos = 1;
  let carregando = true;
  let erro = "";
  let modalMovimentoAberto = false;
  let modalMaloteAberto = false;
  let modalCadastroAberto = false;
  let modalTemaAberto = false;
  let menuMobileAberto = false;
  let novoAberto = false;
  let saindo = false;
  let tipoNovo: TipoMovimentacao = "entrada";
  let tema: TemaAplicacao = temaPadrao();
  let temaTelaAtual = "";
  let temaTelaEdicao = "entradas";
  let temaSalvando = false;
  let form = formVazio();
  let discriminandoDespesa = false;
  let discriminandoMercadoria = false;
  let lacreNumero = "";
  let lacreStatus = "";
  let itemDespesa = { descricao: "", valor: "", grupoDespesaId: "" };
  let itensDespesa = [itemDespesa];
  let itemMercadoria = { descricao: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "", grupoMercadoriaId: "", unidadeMedidaId: "" };
  let itensMercadoria = [itemMercadoria];
  let maloteEditandoId = "";
  let formMalote = { codigo: "", lacres: [""] };
  let maloteSalvando = false;
  let maloteEditandoCarregandoId = "";
  let malotesAtualizacao = 0;
	  let cadastroTela = "";
	  let cadastroEditandoId = "";
	  let cadastroSalvando = false;
	  let formCadastro = formCadastroVazio();
	  let colaboradorSelecionado: Opcao | null = null;
		  let modalCargosColaboradorAberto = false;
		  let modalJornadaAberto = false;
	  let modalFaltasJustificadasAberto = false;
	  let modalFeriadosAberto = false;
		  let cargoCatalogoNovo = "";
		  let formCargoColaborador = formCargoColaboradorVazio();
		  let formJornada = formJornadaVazio();
	  let formFaltaJustificada = formFaltaJustificadaVazio();
	  let formFeriado = formFeriadoVazio();
		  let salvandoCargoColaborador = false;
		  let salvandoJornada = false;
	  let salvandoFaltaJustificada = false;
	  let salvandoFeriado = false;
	  let modalCopiaAberto = false;
	  let copiaModo: "exportar" | "importar" = "importar";
	  let copiaNivel: "simples" | "completo" = "simples";
	  let copiaTipo = "";
	  let copiaRegistroId = "";
	  let copiaEmpresaOrigemId = "";
	  let copiaEmpresaDestinoId = "";
	  let copiaSalvando = false;
  let empresaSelecionadaId = "";
  let empresasMenuAberto = false;
  let empresaCarregando = false;
  let chaveDadosEmpresa = 0;

  $: empresasDisponiveis = empresas;
  $: if (empresasDisponiveis.length && (!empresaSelecionadaId || !empresasDisponiveis.some((empresa) => empresa.id === empresaSelecionadaId))) {
    empresaSelecionadaId = empresasDisponiveis[0]?.id ?? "";
  }
  $: empresaId = empresaSelecionadaId;
  $: opcoesEmpresa = opcoes ? opcoesFiltradasPorEmpresa(opcoes, empresaId) : null;
  $: empresaAtiva = empresasDisponiveis.find((empresa) => empresa.id === empresaId) ?? null;
  $: colaboradorId = opcoesEmpresa?.colaboradores[0]?.id ?? "";
  $: papelUsuario = sessao?.perfil?.papel ?? null;
  $: permissoesUsuario = sessao?.perfil?.permissoes ?? [];
  $: podeConfigurarTema = permissoesUsuario.includes("configurar_tema");
  $: telasPermitidas = papelUsuario
    ? telasPorPapel[papelUsuario].map((id) => itemPorTela[id]).filter((item) => item && permissoesUsuario.includes(item.permissao))
    : [];
  $: telaAtual = itemPorTela[telaAtiva] ?? telasPermitidas[0];
  $: movimentosDaTela = movimentoPorTela[telaAtiva]
    ? movimentos.filter((movimento) => movimento.tipo === movimentoPorTela[telaAtiva])
    : movimentos;
  $: totalPaginasMovimentos = Math.max(1, Math.ceil(movimentosDaTela.length / 10));
  $: if (paginaMovimentos > totalPaginasMovimentos) paginaMovimentos = totalPaginasMovimentos;
  $: movimentosPaginados = movimentosDaTela.slice((paginaMovimentos - 1) * 10, paginaMovimentos * 10);
  $: inicioMovimentos = movimentosDaTela.length ? (paginaMovimentos - 1) * 10 + 1 : 0;
  $: fimMovimentos = Math.min(paginaMovimentos * 10, movimentosDaTela.length);
  $: telaDaRota = $page.params.tela ?? "entradas";
  $: if (telaDaRota !== telaAtiva && itemPorTela[telaDaRota]) {
    telaAtiva = telaDaRota;
    paginaMovimentos = 1;
  }
  $: if (sessao && telaAtiva && temaTelaAtual !== telaAtiva) carregarTemaTela(telaAtiva);
  $: acoesNovo = opcoesNovo.filter((item) => permissoesUsuario.includes(item.permissao));
  $: totalItensDespesa = itensDespesa.reduce((total, item) => total + Number(item.valor || 0), 0);
  $: totalItensMercadoria = itensMercadoria.reduce((total, item) => total + Number(item.valorTotal || 0), 0);
  $: if (discriminandoDespesa) form.valorOriginal = totalItensDespesa ? String(totalItensDespesa.toFixed(2)) : "";
  $: if (discriminandoMercadoria) form.valorOriginal = totalItensMercadoria ? String(totalItensMercadoria.toFixed(2)) : "";
  $: if (form.temNotaFiscal) form.computar = true;
  $: valorTotalMovimento = Math.max(0, Number(form.valorOriginal || 0) + Number(form.valorAcrescimo || 0) - Number(form.valorDesconto || 0));

  function formVazio() {
    return {
      dataReferencia: new Date().toISOString().slice(0, 10),
      dataVencimento: new Date().toISOString().slice(0, 10),
      descricao: "",
      observacao: "",
      valorOriginal: "",
      contaOrigemId: "",
      contaDestinoId: "",
      fornecedorId: "",
      colaboradorId: "",
      grupoDespesaId: "",
      grupoMercadoriaId: "",
      grupoRetiradaId: "",
      maloteId: "",
      lacreMaloteId: "",
      notaFiscalId: "",
      temNotaFiscal: false,
      computar: true,
      fotoDocumentoUrl: "",
      pagamentoRealizado: false,
      dataPagamento: "",
      valorAcrescimo: "",
      descricaoAcrescimo: "",
      valorDesconto: "",
      descricaoDesconto: "",
      tipoBeneficiario: "fornecedor"
    };
  }

  function temaPadrao(): TemaAplicacao {
    return {
      corPrimaria: "#6d28d9",
      corSecundaria: "#0891b2",
      corFundo: "#eaf1f9",
      corCartao: "#ffffff",
      corSucesso: "#16a34a",
      corAviso: "#f59e0b",
      corErro: "#ef4444"
    };
  }

	  function formCadastroVazio() {
    return {
	      nome: "",
	      cpf: "",
		      email: "",
			      senha: "",
	      empresaId: "",
	      empresaIds: [] as string[],
			      tipo: "caixa",
	      sigla: "",
      tipoGrupo: "despesa" as "despesa" | "mercadoria" | "retirada",
      grupoPaiId: "",
      tipoAreaSetor: "area" as "area" | "setor",
      areaId: "",
      setorPaiId: "",
	      setorId: "",
	      salario: "0",
	      tipoPermissao: "papel" as TipoPermissaoCadastro,
	      papel: "caixa" as PapelUsuario,
	      usuarioId: "",
	      permissoes: [] as Permissao[]
	    };
		  }

		  function formCargoColaboradorVazio() {
	    return {
	      cargoId: "",
	      setorId: "",
	      remuneracaoMinuto: "",
	      dataInicio: new Date().toISOString().slice(0, 10),
	      ativo: true
	    };
	  }

	  function faixaJornadaVazia() {
	    return {
	      horaEntrada: "08:00",
	      cargaHorariaDiariaEmMinutos: "480",
	      intervaloMinutos: "60",
	      colaboradorCargoId: ""
	    };
	  }

		  function formJornadaVazio() {
		    return {
		      dataInicio: new Date().toISOString().slice(0, 10),
		      dias: diasJornada.map((dia) => ({ diaDaSemana: dia.id, faixas: [{ ...faixaJornadaVazia() }] }))
		    };
		  }

	  function dataHoraLocalAgora() {
	    const agora = new Date();
	    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
	    return agora.toISOString().slice(0, 16);
	  }

	  function formFaltaJustificadaVazio() {
	    return {
	      inicio: dataHoraLocalAgora(),
	      fim: dataHoraLocalAgora(),
	      motivo: ""
	    };
	  }

	  function formFeriadoVazio() {
	    return {
	      nome: "",
	      dia: "",
	      mes: "",
	      ano: ""
	    };
	  }

  function temPermissao(permissao: Permissao) {
    return permissoesUsuario.includes(permissao);
  }

	  function itensDaEmpresa(itens: Opcao[], idEmpresa: string) {
	    if (!idEmpresa) return [];
	    return itens.filter((item) => {
	      if (item.empresaIds?.length) return item.empresaIds.includes(idEmpresa);
	      return !item.empresaId || item.empresaId === idEmpresa;
	    });
	  }

	  function nomesEmpresas(ids: string[] = []) {
	    return ids
	      .map((id) => empresasDisponiveis.find((empresa) => empresa.id === id)?.nome ?? id)
	      .join(", ");
	  }

	  function alternarEmpresaCadastro(idEmpresa: string, marcado: boolean) {
	    const ids = new Set(formCadastro.empresaIds);
	    if (marcado) ids.add(idEmpresa);
	    else ids.delete(idEmpresa);
	    const empresaIds = [...ids];
	    formCadastro = { ...formCadastro, empresaIds, empresaId: empresaIds[0] ?? "" };
	  }

  function opcoesFiltradasPorEmpresa(listas: Opcoes, idEmpresa: string): Opcoes {
    const usuarios = itensDaEmpresa(listas.usuarios, idEmpresa);
    const usuariosIds = new Set(usuarios.map((usuario) => usuario.usuarioId).filter(Boolean));
    const setores = itensDaEmpresa(listas.setores, idEmpresa);
    const setoresIds = new Set(setores.map((setor) => setor.id));
    return {
      ...listas,
      contas: itensDaEmpresa(listas.contas, idEmpresa),
      fornecedores: itensDaEmpresa(listas.fornecedores, idEmpresa),
	      colaboradores: itensDaEmpresa(listas.colaboradores, idEmpresa),
		      cargos: itensDaEmpresa(listas.cargos, idEmpresa),
		      colaboradoresCargos: itensDaEmpresa(listas.colaboradoresCargos, idEmpresa),
		      colaboradoresJornadas: itensDaEmpresa(listas.colaboradoresJornadas, idEmpresa),
	      colaboradoresFaltasJustificadas: itensDaEmpresa(listas.colaboradoresFaltasJustificadas, idEmpresa),
	      feriados: itensDaEmpresa(listas.feriados, idEmpresa),
	      gruposDespesas: itensDaEmpresa(listas.gruposDespesas, idEmpresa),
      gruposMercadorias: itensDaEmpresa(listas.gruposMercadorias, idEmpresa),
      gruposRetiradas: itensDaEmpresa(listas.gruposRetiradas, idEmpresa),
      unidadesMedida: itensDaEmpresa(listas.unidadesMedida, idEmpresa),
      areas: itensDaEmpresa(listas.areas, idEmpresa),
      setores,
      setoresPermissoes: listas.setoresPermissoes.filter((item) => item.setorId && setoresIds.has(item.setorId)),
      usuariosPermissoes: listas.usuariosPermissoes.filter((item) => item.usuarioId && usuariosIds.has(item.usuarioId)),
      usuarios,
      produtos: itensDaEmpresa(listas.produtos, idEmpresa),
      malotes: itensDaEmpresa(listas.malotes, idEmpresa)
    };
  }

  function telasDoUsuario() {
    const papel = papelUsuario;
    if (!papel) return [];
    return telasPorPapel[papel].map((id) => itemPorTela[id]).filter((item) => item && permissoesUsuario.includes(item.permissao));
  }

  function dinheiro(valor: number | string) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

	  async function selecionarTela(tela: string) {
    telaAtiva = tela;
    paginaMovimentos = 1;
    menuMobileAberto = false;
    await goto(rotaTela(tela));
    await carregarDadosTela(tela, empresaId);
  }

	  async function carregarDadosTela(tela: string, idEmpresa = empresaId) {
    if (!idEmpresa || empresaCarregando) return;
    empresaCarregando = true;
    erro = "";
    paginaMovimentos = 1;
    movimentos = [];
    resumo = null;
    try {
      const tarefas: Array<Promise<unknown>> = tela === "empresas" ? [carregarEmpresas()] : [carregarDadosPagina(idEmpresa, tela)];
      if (movimentoPorTela[tela]) tarefas.push(carregarMovimentos(idEmpresa));
      if (movimentoPorTela[tela] || tela === "fechamento" || tela === "caixa") tarefas.push(carregarResumo(idEmpresa));
      await Promise.all(tarefas);
      chaveDadosEmpresa += 1;
    } catch (error) {
      erro = mensagemErro(error);
    } finally {
      empresaCarregando = false;
    }
	  }

	  async function trocarEmpresa(idEmpresa = empresaId) {
    await carregarDadosTela(telaAtiva, idEmpresa);
	  }

  async function selecionarEmpresa(id: string) {
    if (!id || id === empresaSelecionadaId) {
      empresasMenuAberto = false;
      return;
    }
    empresaSelecionadaId = id;
    empresasMenuAberto = false;
    paginaMovimentos = 1;
    await trocarEmpresa(id);
  }

  function rotaTela(tela: string) {
    return tela === "entradas" ? "/" : `/${tela}`;
  }

	  function rotuloGrupo(grupo: Opcao) {
	    return grupo.nome ?? "";
	  }

	  function gruposAgrupados(grupos: Opcao[]) {
	    const filhosPorPai = new Map<string, Opcao[]>();
	    for (const grupo of grupos) {
	      const chave = grupo.grupoPaiId ?? "";
	      filhosPorPai.set(chave, [...(filhosPorPai.get(chave) ?? []), grupo]);
	    }
	    for (const filhos of filhosPorPai.values()) filhos.sort((a, b) => rotuloGrupo(a).localeCompare(rotuloGrupo(b)));

	    const montar = (grupo: Opcao, nivel: number): Opcao[] => [
	      ...(grupo.selecionavel ? [{ ...grupo, nome: `${"- ".repeat(nivel)}${rotuloGrupo(grupo)}` }] : []),
	      ...(filhosPorPai.get(grupo.id) ?? []).flatMap((filho) => montar(filho, nivel + 1))
	    ];

	    return (filhosPorPai.get("") ?? []).map((raiz) => ({
	      rotulo: rotuloGrupo(raiz),
	      itens: montar(raiz, 0)
	    })).filter((grupo) => grupo.itens.length);
	  }

	  function gruposPorTipo(tipo: "despesa" | "mercadoria" | "retirada") {
	    if (!opcoesEmpresa) return [];
	    if (tipo === "mercadoria") return opcoesEmpresa.gruposMercadorias;
	    if (tipo === "retirada") return opcoesEmpresa.gruposRetiradas;
	    return opcoesEmpresa.gruposDespesas;
	  }

	  function gruposPorTipoHierarquicos(tipo: "despesa" | "mercadoria" | "retirada") {
	    const grupos = gruposPorTipo(tipo);
	    const filhosPorPai = new Map<string, Opcao[]>();
	    for (const grupo of grupos) {
	      const chave = grupo.grupoPaiId ?? "";
	      filhosPorPai.set(chave, [...(filhosPorPai.get(chave) ?? []), grupo]);
	    }
	    for (const filhos of filhosPorPai.values()) filhos.sort((a, b) => rotuloGrupo(a).localeCompare(rotuloGrupo(b)));
	    const montar = (paiId: string, nivel: number): Opcao[] => (filhosPorPai.get(paiId) ?? [])
	      .flatMap((grupo) => [{ ...grupo, nome: `${"- ".repeat(nivel)}${rotuloGrupo(grupo)}` }, ...montar(grupo.id, nivel + 1)]);
	    return montar("", 0);
	  }

  function adicionarItemDespesa() {
    itensDespesa = [...itensDespesa, { descricao: "", valor: "", grupoDespesaId: "" }];
  }

  function removerItemDespesa(indice: number) {
    itensDespesa = itensDespesa.filter((_, itemIndice) => itemIndice !== indice);
  }

  function adicionarItemMercadoria() {
    itensMercadoria = [
      ...itensMercadoria,
      { descricao: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "", grupoMercadoriaId: "", unidadeMedidaId: "" }
    ];
  }

  function removerItemMercadoria(indice: number) {
    itensMercadoria = itensMercadoria.filter((_, itemIndice) => itemIndice !== indice);
  }

  async function validarLacre() {
    form.lacreMaloteId = "";
    form.maloteId = "";
    lacreStatus = "";
    if (!lacreNumero.trim()) return;

    const resposta = await apiGet<{
      existe: boolean;
      disponivel: boolean;
      erro?: string | null;
      id?: string;
      maloteId?: string;
      maloteCodigo?: string;
    }>(`/api/lacres/validar?numero=${encodeURIComponent(lacreNumero.trim())}`);

    if (!resposta.existe || !resposta.disponivel || !resposta.id || !resposta.maloteId) {
      lacreStatus = resposta.erro ?? "Lacre invalido";
      return;
    }

    form.lacreMaloteId = resposta.id;
    form.maloteId = resposta.maloteId;
    lacreStatus = "";
  }

  function abrirMovimento(tipo: TipoMovimentacao) {
    novoAberto = false;
    menuMobileAberto = false;
    tipoNovo = tipo;
    form = { ...formVazio(), computar: true, tipoBeneficiario: tipo === "retirada" ? "colaborador" : "fornecedor" };
    discriminandoDespesa = false;
    discriminandoMercadoria = false;
    lacreNumero = "";
    lacreStatus = "";
    itemDespesa = { descricao: "", valor: "", grupoDespesaId: "" };
    itensDespesa = [{ ...itemDespesa }];
    itemMercadoria = { descricao: "", quantidade: "1", valorUnitario: "", valorTotal: "", produtoId: "", grupoMercadoriaId: "", unidadeMedidaId: "" };
    itensMercadoria = [{ ...itemMercadoria }];
    modalMovimentoAberto = true;
  }

  function executarAcaoNovo(acao: AcaoNovo) {
    if (acao.tipo) {
      abrirMovimento(acao.tipo);
      return;
    }
    if (acao.tela === "malote") abrirMaloteNovo();
  }

  function lacresDoFormulario() {
    return formMalote.lacres
      .map((lacre) => lacre.trim())
      .filter(Boolean);
  }

  function atualizarLacreMalote(indice: number, valor: string) {
    formMalote = {
      ...formMalote,
      lacres: formMalote.lacres.map((lacre, itemIndice) => itemIndice === indice ? valor : lacre)
    };
  }

  function adicionarLacreMalote() {
    formMalote = { ...formMalote, lacres: [...formMalote.lacres, ""] };
  }

  function removerLacreMalote(indice: number) {
    const lacres = formMalote.lacres.filter((_, itemIndice) => itemIndice !== indice);
    formMalote = { ...formMalote, lacres: lacres.length ? lacres : [""] };
  }

  function abrirMaloteNovo() {
    novoAberto = false;
    menuMobileAberto = false;
    maloteEditandoId = "";
    formMalote = { codigo: "", lacres: [""] };
    modalMaloteAberto = true;
  }

  async function abrirMaloteEditar(linha: Record<string, string | undefined>) {
    const id = linha.id;
    if (!id) return;
    maloteEditandoCarregandoId = id;
    const toastId = toast.loading("Carregando malote...");
    try {
      const lacres = await apiGet<Array<{ numero: string }>>(`/api/malotes/${id}/lacres`);
      maloteEditandoId = id;
      formMalote = {
        codigo: linha.codigo ?? "",
        lacres: lacres.length ? lacres.map((lacre) => lacre.numero) : [""]
      };
      modalMaloteAberto = true;
      toast.success("Malote carregado para edicao.", { id: toastId });
    } catch (error) {
      toast.error("Erro ao carregar malote.", { id: toastId, description: mensagemErro(error) });
    } finally {
      maloteEditandoCarregandoId = "";
    }
  }

  async function salvarMalote() {
    if (maloteSalvando) return;
    const payload = {
      empresaId,
      codigo: formMalote.codigo,
      lacres: lacresDoFormulario()
    };

    maloteSalvando = true;
    const estavaEditando = Boolean(maloteEditandoId);
    const toastId = toast.loading(estavaEditando ? "Atualizando malote..." : "Cadastrando malote...");
    try {
      if (maloteEditandoId) {
        await apiPut(`/api/malotes/${maloteEditandoId}`, {
          codigo: payload.codigo,
          lacres: payload.lacres
        });
      } else {
        await apiPost("/api/malotes", payload);
      }

      await carregarDadosPagina(empresaId, "malotes");
      const mensagem = estavaEditando ? "Malote atualizado com sucesso." : "Malote cadastrado com sucesso.";
      modalMaloteAberto = false;
      toast.success(mensagem, { id: toastId });
    } catch (error) {
      const detalhe = mensagemErro(error);
      toast.error("Erro ao salvar malote.", { id: toastId, description: detalhe });
    } finally {
      maloteSalvando = false;
    }
  }

  async function carregarEmpresas() {
    empresas = await apiGet<Opcao[]>("/api/empresas");
  }

	  async function carregarDadosPagina(idEmpresa = empresaId, tela = telaAtiva) {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (idEmpresa) params.set("empresaId", idEmpresa);
    const query = `?${params.toString()}`;
    const dados = opcoesVazias();

    if (tela === "contas" || tela === "entradas") {
      dados.contas = await apiGet<Opcao[]>(`/api/contas${query}`);
    } else if (tela === "transferencias") {
      [dados.contas, dados.malotes] = await Promise.all([
        apiGet<Opcao[]>(`/api/contas${query}`),
        apiGet<Opcao[]>(`/api/malotes${query}`)
      ]);
    } else if (tela === "despesas") {
      const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`);
      [dados.contas, dados.fornecedores] = await Promise.all([
        apiGet<Opcao[]>(`/api/contas${query}`),
        apiGet<Opcao[]>(`/api/fornecedores${query}`)
      ]);
      Object.assign(dados, grupos);
    } else if (tela === "mercadorias") {
      const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`);
      [dados.fornecedores, dados.unidadesMedida, dados.produtos] = await Promise.all([
        apiGet<Opcao[]>(`/api/fornecedores${query}`),
        apiGet<Opcao[]>(`/api/unidades_medida${query}`),
        apiGet<Opcao[]>(`/api/produtos${query}`)
      ]);
      Object.assign(dados, grupos);
    } else if (tela === "retiradas") {
      const grupos = await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`);
      [dados.fornecedores, dados.colaboradores] = await Promise.all([
        apiGet<Opcao[]>(`/api/fornecedores${query}`),
        apiGet<Opcao[]>(`/api/colaboradores${query}`)
      ]);
      Object.assign(dados, grupos);
    } else if (tela === "grupos") {
      Object.assign(dados, await apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`));
    } else if (tela === "unidades") {
      dados.unidadesMedida = await apiGet<Opcao[]>(`/api/unidades_medida${query}`);
    } else if (tela === "areas_setores") {
      Object.assign(dados, await apiGet<Pick<Opcoes, "areas" | "setores">>(`/api/areas_setores${query}`));
    } else if (tela === "usuarios") {
      [dados.usuarios, dados.setores] = await Promise.all([
        apiGet<Opcao[]>(`/api/usuarios${query}`),
        apiGet<Opcao[]>(`/api/setores${query}`)
      ]);
    } else if (tela === "permissoes") {
      Object.assign(dados, await apiGet<Pick<Opcoes, "permissoes" | "papeisPermissoes" | "setores" | "setoresPermissoes" | "usuarios" | "usuariosPermissoes">>(`/api/permissoes${query}`));
    } else if (tela === "malotes") {
      dados.malotes = await apiGet<Opcao[]>(`/api/malotes${query}`);
    } else if (tela === "colaboradores") {
      [dados.colaboradores, dados.cargos, dados.setores] = await Promise.all([
        apiGet<Opcao[]>(`/api/colaboradores${query}`),
        apiGet<Opcao[]>(`/api/cargos${query}`),
        apiGet<Opcao[]>(`/api/setores${query}`)
      ]);
    } else if (tela === "feriados") {
      dados.feriados = await apiGet<Opcao[]>(`/api/feriados${query}`);
    } else if (tela === "fornecedores") {
      dados.fornecedores = await apiGet<Opcao[]>(`/api/fornecedores${query}`);
    } else if (tela === "produtos" || tela === "relatorio_produtos") {
      [dados.produtos, dados.gruposMercadorias, dados.unidadesMedida] = await Promise.all([
        apiGet<Opcao[]>(`/api/produtos${query}`),
        apiGet<Pick<Opcoes, "gruposDespesas" | "gruposMercadorias" | "gruposRetiradas">>(`/api/grupos${query}`).then((grupos) => grupos.gruposMercadorias),
        apiGet<Opcao[]>(`/api/unidades_medida${query}`)
      ]);
    }

    opcoes = dados;
	    malotesAtualizacao += 1;
	  }

	  function abrirCadastroNovo(tela: string, valores: Partial<ReturnType<typeof formCadastroVazio>> = {}) {
	    cadastroTela = tela;
	    cadastroEditandoId = "";
	    formCadastro = { ...formCadastroVazio(), ...valores };
	    if (tela === "usuarios" && !formCadastro.empresaIds.length) {
	      formCadastro = { ...formCadastro, empresaId, empresaIds: [empresaId].filter(Boolean) };
	    }
	    if (tela === "permissoes") {
		      formCadastro.usuarioId = opcoesEmpresa?.usuarios[0]?.usuarioId ?? "";
		      formCadastro.setorId = opcoesEmpresa?.setores[0]?.id ?? "";
	      formCadastro.permissoes = permissoesDoAlvoCadastro(formCadastro);
	    }
	    modalCadastroAberto = true;
	  }

  function abrirCadastroFilho(linha: Record<string, string | undefined>) {
    if (telaAtiva === "grupos") {
      abrirCadastroNovo("grupos", {
        tipoGrupo: (linha.tipoGrupo as "despesa" | "mercadoria" | "retirada") ?? "despesa",
        grupoPaiId: linha.id ?? ""
      });
      return;
    }
    if (telaAtiva === "areas_setores") {
      abrirCadastroNovo("areas_setores", {
        tipoAreaSetor: "setor",
        areaId: linha.tipoAreaSetor === "area" ? linha.id ?? "" : linha.areaId ?? "",
        setorPaiId: linha.tipoAreaSetor === "setor" ? linha.id ?? "" : ""
      });
    }
  }

  function abrirCadastroEditar(linha: Record<string, string | undefined>) {
    cadastroTela = telaAtiva;
    cadastroEditandoId = linha.id ?? "";
	    formCadastro = {
		      ...formCadastroVazio(),
	      empresaId: linha.empresaId ?? empresaId,
	      empresaIds: linha.empresaIds ? linha.empresaIds.split(",").filter(Boolean) : [linha.empresaId ?? empresaId].filter(Boolean),
		      nome: linha.nome ?? "",
	      cpf: linha.cpf ?? "",
	      email: linha.email ?? "",
	      senha: "",
	      tipo: linha.tipo ?? "",
      sigla: linha.sigla ?? "",
      tipoGrupo: (linha.tipoGrupo as "despesa" | "mercadoria" | "retirada") ?? "despesa",
      grupoPaiId: linha.grupoPaiId ?? "",
      tipoAreaSetor: linha.tipoAreaSetor === "setor" ? "setor" : "area",
      areaId: linha.areaId ?? "",
	      setorPaiId: linha.setorPaiId ?? "",
	      setorId: linha.setorId ?? "",
	      salario: linha.salario ?? "0",
	      tipoPermissao: (linha.tipoPermissao as TipoPermissaoCadastro) ?? "papel",
	      papel: (linha.papel as PapelUsuario) ?? "caixa",
	      usuarioId: linha.usuarioId ?? "",
	      permissoes: []
	    };
	    if (cadastroTela === "permissoes") formCadastro.permissoes = permissoesDoAlvoCadastro(formCadastro);
	    modalCadastroAberto = true;
	  }

	  function tipoEndpointCadastro() {
	    if (cadastroTela === "unidades") return "unidades";
	    if (cadastroTela === "areas_setores") return formCadastro.tipoAreaSetor === "setor" ? "setores" : "areas";
	    return cadastroTela;
	  }

  function payloadCadastro() {
	    if (cadastroTela === "colaboradores") return { empresaId, nome: formCadastro.nome, cpf: formCadastro.cpf || null };
    if (cadastroTela === "empresas") return { nome: formCadastro.nome };
	    if (cadastroTela === "contas") return { empresaId, nome: formCadastro.nome };
    if (cadastroTela === "grupos") return { empresaId, nome: formCadastro.nome, tipoGrupo: formCadastro.tipoGrupo, grupoPaiId: formCadastro.grupoPaiId || null };
    if (cadastroTela === "unidades") return { empresaId, nome: formCadastro.nome, sigla: formCadastro.sigla };
    if (cadastroTela === "areas_setores") {
      return formCadastro.tipoAreaSetor === "setor"
        ? { empresaId, nome: formCadastro.nome, areaId: formCadastro.areaId || null, setorPaiId: formCadastro.setorPaiId || null }
        : { empresaId, nome: formCadastro.nome };
    }
	    if (cadastroTela === "usuarios") {
	      const empresaIds = formCadastro.empresaIds.length ? formCadastro.empresaIds : [empresaId].filter(Boolean);
	      return { empresaId: empresaIds[0], empresaIds, nome: formCadastro.nome, email: formCadastro.email, senha: formCadastro.senha, papel: formCadastro.papel, setorId: formCadastro.setorId || null };
	    }
	    if (cadastroTela === "permissoes") {
	      return {
	        tipoPermissao: formCadastro.tipoPermissao,
	        papel: formCadastro.papel,
	        setorId: formCadastro.setorId || null,
	        usuarioId: formCadastro.usuarioId,
	        permissoes: formCadastro.permissoes
	      };
	    }
	    return { empresaId, nome: formCadastro.nome };
	  }

	  async function salvarCadastro() {
    if (cadastroSalvando) return;
    cadastroSalvando = true;
    const endpoint = tipoEndpointCadastro();
    const toastId = toast.loading(cadastroEditandoId ? "Atualizando cadastro..." : "Criando cadastro...");
    try {
      let resultado: { id?: string } | null = null;
	      if (cadastroEditandoId && cadastroTela !== "permissoes") {
	        resultado = await apiPut(`/api/cadastros/${endpoint}/${cadastroEditandoId}`, payloadCadastro());
	      } else {
	        resultado = await apiPost(`/api/cadastros/${endpoint}`, payloadCadastro());
	      }
      const empresaParaRecarregar = cadastroTela === "empresas" && resultado?.id ? resultado.id : empresaId;
      if (cadastroTela === "empresas" && resultado?.id) {
        await carregarEmpresas();
        empresaSelecionadaId = resultado.id;
        paginaMovimentos = 1;
      }
	      await carregarDadosTela(cadastroTela, empresaParaRecarregar);
      chaveDadosEmpresa += 1;
	      modalCadastroAberto = false;
      toast.success(cadastroEditandoId ? "Cadastro atualizado." : "Cadastro criado.", { id: toastId });
    } catch (error) {
      toast.error("Erro ao salvar cadastro.", { id: toastId, description: mensagemErro(error) });
    } finally {
      cadastroSalvando = false;
	    }
	  }

	  function colaboradorPorLinha(linha: Record<string, string | undefined>) {
	    return opcoesEmpresa?.colaboradores.find((item) => item.id === linha.id) ?? null;
	  }

	  async function abrirCargosColaborador(linha: Record<string, string | undefined>) {
	    const colaborador = colaboradorPorLinha(linha);
	    if (!colaborador) return;
	    colaboradorSelecionado = colaborador;
	    formCargoColaborador = formCargoColaboradorVazio();
	    cargoCatalogoNovo = "";
	    const [cargos, historico] = await Promise.all([
	      apiGet<Opcao[]>(`/api/cargos?empresaId=${empresaId}`),
	      apiGet<Opcao[]>(`/api/colaboradores/${colaborador.id}/cargos`)
	    ]);
	    opcoes = {
	      ...(opcoes ?? opcoesVazias()),
	      cargos,
	      colaboradoresCargos: historico
	    };
	    modalCargosColaboradorAberto = true;
	  }

	  async function criarCargoCatalogo() {
	    if (!cargoCatalogoNovo.trim()) return;
	    const resultado = await apiPost<{ id?: string }>("/api/cargos", { empresaId, nome: cargoCatalogoNovo });
	    const cargos = await apiGet<Opcao[]>(`/api/cargos?empresaId=${empresaId}`);
	    opcoes = { ...(opcoes ?? opcoesVazias()), cargos };
	    formCargoColaborador = { ...formCargoColaborador, cargoId: resultado.id ?? cargos.find((cargo) => cargo.nome === cargoCatalogoNovo)?.id ?? "" };
	    cargoCatalogoNovo = "";
	  }

	  async function salvarCargoColaborador() {
	    if (!colaboradorSelecionado || salvandoCargoColaborador) return;
	    salvandoCargoColaborador = true;
	    const toastId = toast.loading("Salvando cargo...");
	    try {
	      await apiPost(`/api/colaboradores/${colaboradorSelecionado.id}/cargos`, {
	        empresaId,
	        cargoId: formCargoColaborador.cargoId,
	        setorId: formCargoColaborador.setorId || null,
	        remuneracaoMinuto: Number(formCargoColaborador.remuneracaoMinuto || 0),
	        dataInicio: formCargoColaborador.dataInicio,
	        ativo: formCargoColaborador.ativo
	      });
	      await abrirCargosColaborador({ id: colaboradorSelecionado.id });
	      toast.success("Cargo salvo.", { id: toastId });
	    } catch (error) {
	      toast.error("Erro ao salvar cargo.", { id: toastId, description: mensagemErro(error) });
	    } finally {
	      salvandoCargoColaborador = false;
	    }
	  }

	  async function interromperCargoColaborador(registro: Opcao) {
	    if (!colaboradorSelecionado) return;
	    await apiPut(`/api/colaboradores/${colaboradorSelecionado.id}/cargos/${registro.id}`, { empresaId, ativo: false });
	    await abrirCargosColaborador({ id: colaboradorSelecionado.id });
	  }

	  async function abrirJornadaColaborador(linha: Record<string, string | undefined>) {
	    const colaborador = colaboradorPorLinha(linha);
	    if (!colaborador) return;
	    colaboradorSelecionado = colaborador;
	    formJornada = formJornadaVazio();
	    const [historicoCargos, historicoJornadas] = await Promise.all([
	      apiGet<Opcao[]>(`/api/colaboradores/${colaborador.id}/cargos`),
	      apiGet<Opcao[]>(`/api/colaboradores/${colaborador.id}/jornadas`)
	    ]);
	    const cargoPadrao = historicoCargos.find((item) => item.ativo)?.id ?? "";
	    formJornada = {
	      ...formJornada,
	      dias: formJornada.dias.map((dia) => ({ ...dia, faixas: dia.faixas.map((faixa) => ({ ...faixa, colaboradorCargoId: cargoPadrao })) }))
	    };
	    opcoes = {
	      ...(opcoes ?? opcoesVazias()),
	      colaboradoresCargos: historicoCargos,
	      colaboradoresJornadas: historicoJornadas
	    };
	    modalJornadaAberto = true;
	  }

	  function adicionarFaixaJornada(indiceDia: number) {
	    formJornada = {
	      ...formJornada,
	      dias: formJornada.dias.map((dia, index) => index === indiceDia ? { ...dia, faixas: [...dia.faixas, { ...faixaJornadaVazia() }] } : dia)
	    };
	  }

	  function removerFaixaJornada(indiceDia: number, indiceFaixa: number) {
	    formJornada = {
	      ...formJornada,
	      dias: formJornada.dias.map((dia, index) => {
	        if (index !== indiceDia) return dia;
	        const faixas = dia.faixas.filter((_, faixaIndex) => faixaIndex !== indiceFaixa);
	        return { ...dia, faixas: faixas.length ? faixas : [{ ...faixaJornadaVazia(), cargaHorariaDiariaEmMinutos: "0", intervaloMinutos: "0", horaEntrada: "", colaboradorCargoId: "" }] };
	      })
	    };
	  }

	  function atualizarFaixaJornada(indiceDia: number, indiceFaixa: number, campo: keyof ReturnType<typeof faixaJornadaVazia>, valor: string) {
	    formJornada = {
	      ...formJornada,
	      dias: formJornada.dias.map((dia, index) => index === indiceDia
	        ? { ...dia, faixas: dia.faixas.map((faixa, faixaIndex) => faixaIndex === indiceFaixa ? { ...faixa, [campo]: valor } : faixa) }
	        : dia)
	    };
	  }

	  async function salvarJornadaColaborador() {
	    if (!colaboradorSelecionado || salvandoJornada) return;
	    salvandoJornada = true;
	    const toastId = toast.loading("Salvando jornada...");
	    try {
	      await apiPost(`/api/colaboradores/${colaboradorSelecionado.id}/jornadas`, {
	        empresaId,
	        dataInicio: formJornada.dataInicio,
	        dias: formJornada.dias.map((dia) => ({
	          diaDaSemana: dia.diaDaSemana,
	          faixas: dia.faixas.map((faixa) => ({
	            horaEntrada: faixa.horaEntrada,
	            cargaHorariaDiariaEmMinutos: Number(faixa.cargaHorariaDiariaEmMinutos || 0),
	            intervaloMinutos: Number(faixa.intervaloMinutos || 0),
	            colaboradorCargoId: faixa.colaboradorCargoId || null
	          }))
	        }))
	      });
	      await abrirJornadaColaborador({ id: colaboradorSelecionado.id });
	      toast.success("Jornada salva.", { id: toastId });
	    } catch (error) {
	      toast.error("Erro ao salvar jornada.", { id: toastId, description: mensagemErro(error) });
	    } finally {
	      salvandoJornada = false;
	    }
	  }

	  function cargoAtivoNome(id?: string | null) {
	    return opcoesEmpresa?.colaboradoresCargos.find((cargo) => cargo.id === id)?.cargoNome ?? "Cargo";
	  }

	  async function abrirFaltasJustificadasColaborador(linha: Record<string, string | undefined>) {
	    const colaborador = colaboradorPorLinha(linha);
	    if (!colaborador) return;
	    colaboradorSelecionado = colaborador;
	    formFaltaJustificada = formFaltaJustificadaVazio();
	    const faltas = await apiGet<Opcao[]>(`/api/colaboradores/${colaborador.id}/faltas-justificadas`);
	    opcoes = {
	      ...(opcoes ?? opcoesVazias()),
	      colaboradoresFaltasJustificadas: faltas
	    };
	    modalFaltasJustificadasAberto = true;
	  }

	  async function salvarFaltaJustificada() {
	    if (!colaboradorSelecionado || salvandoFaltaJustificada) return;
	    salvandoFaltaJustificada = true;
	    const toastId = toast.loading("Salvando falta...");
	    try {
	      await apiPost(`/api/colaboradores/${colaboradorSelecionado.id}/faltas-justificadas`, {
	        empresaId,
	        inicio: formFaltaJustificada.inicio,
	        fim: formFaltaJustificada.fim,
	        motivo: formFaltaJustificada.motivo
	      });
	      await abrirFaltasJustificadasColaborador({ id: colaboradorSelecionado.id });
	      toast.success("Falta justificada salva.", { id: toastId });
	    } catch (error) {
	      toast.error("Erro ao salvar falta.", { id: toastId, description: mensagemErro(error) });
	    } finally {
	      salvandoFaltaJustificada = false;
	    }
	  }

	  async function abrirFeriados() {
	    formFeriado = formFeriadoVazio();
	    const feriados = await apiGet<Opcao[]>(`/api/feriados?empresaId=${empresaId}`);
	    opcoes = { ...(opcoes ?? opcoesVazias()), feriados };
	    modalFeriadosAberto = true;
	  }

	  function abrirFeriadoNovo() {
	    formFeriado = formFeriadoVazio();
	    modalFeriadosAberto = true;
	  }

	  async function salvarFeriado() {
	    if (salvandoFeriado) return;
	    salvandoFeriado = true;
	    const toastId = toast.loading("Salvando feriado...");
	    try {
	      await apiPost("/api/feriados", {
	        empresaId,
	        nome: formFeriado.nome,
	        dia: Number(formFeriado.dia),
	        mes: Number(formFeriado.mes),
	        ano: formFeriado.ano ? Number(formFeriado.ano) : null
	      });
	      await carregarDadosTela("feriados", empresaId);
	      formFeriado = formFeriadoVazio();
	      modalFeriadosAberto = false;
	      toast.success("Feriado salvo.", { id: toastId });
	    } catch (error) {
	      toast.error("Erro ao salvar feriado.", { id: toastId, description: mensagemErro(error) });
	    } finally {
	      salvandoFeriado = false;
	    }
	  }

	  function tipoCopiaTela(tela = telaAtiva) {
	    return ["contas", "fornecedores", "colaboradores", "grupos", "unidades", "areas_setores", "produtos", "malotes"].includes(tela)
	      ? tela
	      : "";
	  }

	  function caminhoCopia(tipo: string) {
	    const caminhos: Record<string, string> = {
	      contas: "contas",
	      fornecedores: "fornecedores",
	      colaboradores: "colaboradores",
	      grupos: "grupos",
	      unidades: "unidades_medida",
	      areas_setores: "areas_setores",
	      produtos: "produtos",
	      malotes: "malotes"
	    };
	    return caminhos[tipo] ?? tipo;
	  }

	  function abrirImportacao(tela = telaAtiva) {
	    const tipo = tipoCopiaTela(tela);
	    if (!tipo) return;
	    copiaModo = "importar";
	    copiaNivel = "simples";
	    copiaTipo = tipo;
	    copiaRegistroId = "";
	    copiaEmpresaOrigemId = empresasDisponiveis.find((empresa) => empresa.id !== empresaId)?.id ?? "";
	    copiaEmpresaDestinoId = empresaId;
	    modalCopiaAberto = true;
	  }

	  function abrirExportacao(linha: Record<string, string | undefined>) {
	    const tipo = tipoCopiaTela(telaAtiva);
	    if (!tipo || !linha.id) return;
	    copiaModo = "exportar";
	    copiaNivel = "simples";
	    copiaTipo = tipo;
	    copiaRegistroId = linha.id;
	    copiaEmpresaOrigemId = empresaId;
	    copiaEmpresaDestinoId = empresasDisponiveis.find((empresa) => empresa.id !== empresaId)?.id ?? "";
	    modalCopiaAberto = true;
	  }

	  async function executarCopia() {
	    if (copiaSalvando) return;
	    copiaSalvando = true;
	    const toastId = toast.loading(copiaModo === "importar" ? "Importando dados..." : "Exportando registro...");
	    try {
	      const caminho = caminhoCopia(copiaTipo);
	      const resultado = copiaModo === "importar"
	        ? await apiPost<{ inseridos: number }>(`/api/${caminho}/importar`, { empresaOrigemId: copiaEmpresaOrigemId, empresaDestinoId: copiaEmpresaDestinoId, modo: copiaNivel })
	        : await apiPost<{ inseridos: number }>(`/api/${caminho}/${copiaRegistroId}/exportar`, { empresaDestinoId: copiaEmpresaDestinoId, modo: copiaNivel });
	      await carregarDadosTela(telaAtiva, empresaId);
	      modalCopiaAberto = false;
	      toast.success(`${resultado.inseridos} registro(s) copiado(s).`, { id: toastId });
	    } catch (error) {
	      toast.error("Erro ao copiar dados.", { id: toastId, description: mensagemErro(error) });
	    } finally {
	      copiaSalvando = false;
	    }
	  }

			  function permissoesDoPapel(papel: PapelUsuario) {
		    return (opcoesEmpresa?.papeisPermissoes ?? [])
	      .filter((item) => item.papel === papel)
	      .map((item) => item.permissaoCodigo)
	      .filter((permissao): permissao is Permissao => Boolean(permissao));
	  }

		  function permissoesDoSetor(setorId: string) {
		    return (opcoesEmpresa?.setoresPermissoes ?? [])
	      .filter((item) => item.setorId === setorId)
	      .map((item) => item.permissaoCodigo)
	      .filter((permissao): permissao is Permissao => Boolean(permissao));
	  }

		  function permissoesDoUsuario(usuarioId: string) {
		    return (opcoesEmpresa?.usuariosPermissoes ?? [])
	      .filter((item) => item.usuarioId === usuarioId)
	      .map((item) => item.permissaoCodigo)
	      .filter((permissao): permissao is Permissao => Boolean(permissao));
	  }

	  function permissoesDoAlvoCadastro(formulario = formCadastro) {
	    if (formulario.tipoPermissao === "setor") return permissoesDoSetor(formulario.setorId);
	    if (formulario.tipoPermissao === "usuario") return permissoesDoUsuario(formulario.usuarioId);
	    return permissoesDoPapel(formulario.papel);
	  }

	  function atualizarAlvoPermissao() {
	    const proximo = { ...formCadastro };
		    if (proximo.tipoPermissao === "setor" && !proximo.setorId) proximo.setorId = opcoesEmpresa?.setores[0]?.id ?? "";
		    if (proximo.tipoPermissao === "usuario" && !proximo.usuarioId) proximo.usuarioId = opcoesEmpresa?.usuarios[0]?.usuarioId ?? "";
	    formCadastro = { ...proximo, permissoes: permissoesDoAlvoCadastro(proximo) };
	  }

	  function permissoesDaSecao(secao: (typeof secoesPermissoes)[number]) {
	    if (!secao.prefixos.length) {
	      return permissoes.filter((permissao) => !secoesPermissoes.some((item) => item.prefixos.some((prefixo) => permissao === prefixo || permissao.startsWith(`${prefixo}_`))));
	    }
	    return permissoes.filter((permissao) => secao.prefixos.some((prefixo) => permissao === prefixo || permissao.startsWith(`${prefixo}_`)));
	  }

  function alternarPermissao(permissao: Permissao, marcado: boolean) {
    formCadastro = {
      ...formCadastro,
      permissoes: marcado
        ? Array.from(new Set([...formCadastro.permissoes, permissao]))
        : formCadastro.permissoes.filter((item) => item !== permissao)
    };
  }

  async function carregarTudo() {
    carregando = true;
    erro = "";
    try {
      sessao = await carregarSessao();
      if (!sessao) {
        await goto("/login");
        return;
      }

	      await carregarTemaTela(telaAtiva);
	      await carregarEmpresas();
      if (!empresaSelecionadaId) empresaSelecionadaId = empresas[0]?.id ?? "";
      if (empresaSelecionadaId && telaAtiva !== "empresas") await carregarDadosPagina(empresaSelecionadaId, telaAtiva);
	      const telas = telasDoUsuario();
      if (telas.length && !telas.some((item) => item.id === telaAtiva)) {
        telaAtiva = telas[0].id;
        await goto(rotaTela(telaAtiva), { replaceState: true });
      }
      if (movimentoPorTela[telaAtiva]) await carregarMovimentos(empresaId);
      if (movimentoPorTela[telaAtiva] || telaAtiva === "fechamento" || telaAtiva === "caixa") await carregarResumo(empresaId);
      chaveDadosEmpresa += 1;
    } catch (error) {
      erro = error instanceof Error ? error.message : "Erro ao carregar dados.";
    } finally {
      carregando = false;
    }
  }

	  async function carregarMovimentos(idEmpresa = empresaId) {
	    if (!idEmpresa) {
      movimentos = [];
      return;
    }
	    movimentos = await apiGet<Movimento[]>(`/api/movimentacoes?empresaId=${idEmpresa}`);
	  }
	
	  async function carregarResumo(idEmpresa = empresaId) {
	    if (!idEmpresa || !temPermissao("fechamento_com_diferenca")) {
      resumo = null;
      return;
    }
	    resumo = await apiGet<ResumoCaixa>(`/api/fechamento-caixa/resumo?empresaId=${idEmpresa}&data=${new Date().toISOString().slice(0, 10)}`);
	  }

  async function salvarMovimento() {
    if (tipoNovo === "transferencia" && lacreNumero.trim() && !form.lacreMaloteId) {
      erro = "Informe um lacre existente e disponivel.";
      return;
    }

    const itensDespesaPayload = tipoNovo === "despesa" && discriminandoDespesa
      ? itensDespesa
          .filter((item) => item.descricao && Number(item.valor || 0) > 0)
          .map((item) => ({ descricao: item.descricao, valor: Number(item.valor), grupoDespesaId: item.grupoDespesaId || null }))
      : [];
    const itensMercadoriaPayload = tipoNovo === "mercadoria" && discriminandoMercadoria
      ? itensMercadoria
          .filter((item) => item.descricao && Number(item.valorTotal || 0) > 0)
          .map((item) => ({
            descricao: item.descricao,
            quantidade: Number(item.quantidade || 1),
            valorUnitario: Number(item.valorUnitario || 0),
            valorTotal: Number(item.valorTotal),
            produtoId: item.produtoId || null,
            grupoMercadoriaId: item.grupoMercadoriaId || null,
            unidadeMedidaId: item.unidadeMedidaId || null
          }))
      : [];

    await apiPost("/api/movimentacoes", {
      empresaId,
      tipo: tipoNovo,
      dataReferencia: form.dataReferencia,
      dataVencimento: tipoNovo === "transferencia" ? null : form.dataVencimento,
      descricao: form.descricao,
      observacao: form.observacao || null,
      valorOriginal: Number(form.valorOriginal),
      valorAcrescimo: Number(form.valorAcrescimo || 0),
      descricaoAcrescimo: form.descricaoAcrescimo || null,
      valorDesconto: Number(form.valorDesconto || 0),
      descricaoDesconto: form.descricaoDesconto || null,
      dataPagamento: form.pagamentoRealizado ? form.dataPagamento || form.dataReferencia : null,
      contaOrigemId: form.contaOrigemId || null,
      contaDestinoId: form.contaDestinoId || null,
      fornecedorId: form.tipoBeneficiario === "fornecedor" ? form.fornecedorId || null : null,
      colaboradorId: form.tipoBeneficiario === "colaborador" ? form.colaboradorId || colaboradorId || null : form.colaboradorId || null,
      grupoDespesaId: form.grupoDespesaId || null,
      grupoMercadoriaId: form.grupoMercadoriaId || null,
      grupoRetiradaId: form.grupoRetiradaId || null,
      maloteId: form.maloteId || null,
      lacreMaloteId: form.lacreMaloteId || null,
      notaFiscalId: form.notaFiscalId || null,
      temNotaFiscal: form.temNotaFiscal,
      computar: form.computar,
      fotoDocumentoUrl: form.fotoDocumentoUrl || null,
      itensDespesa: itensDespesaPayload,
      itensMercadoria: itensMercadoriaPayload
    });
    modalMovimentoAberto = false;
	    await carregarMovimentos(empresaId);
	    await carregarResumo(empresaId);
  }

  async function salvarTema() {
    if (temaSalvando) return;
    temaSalvando = true;
    const toastId = toast.loading("Salvando aparencia...");
    try {
      tema = await apiPut<TemaAplicacao>("/api/tema", { tela: temaTelaEdicao, ...tema });
      if (temaTelaEdicao === telaAtiva) aplicarTema(tema);
      temaTelaAtual = temaTelaEdicao === telaAtiva ? telaAtiva : "";
      modalTemaAberto = false;
      toast.success("Aparencia salva.", { id: toastId });
    } catch (error) {
      toast.error("Erro ao salvar aparencia.", { id: toastId, description: mensagemErro(error) });
    } finally {
      temaSalvando = false;
    }
  }

  async function carregarTemaTela(tela: string) {
    temaTelaAtual = tela;
    try {
      tema = await apiGet<TemaAplicacao>(`/api/tema?tela=${encodeURIComponent(tela)}`);
      aplicarTema(tema);
    } catch {
      tema = temaPadrao();
      aplicarTema(tema);
    }
  }

  async function abrirTema(tela = telaAtiva) {
    temaTelaEdicao = tela;
    modalTemaAberto = true;
    tema = await apiGet<TemaAplicacao>(`/api/tema?tela=${encodeURIComponent(tela)}`);
  }

  async function acertarSaldo() {
    if (!resumo || !empresaId || !colaboradorId) return;
    await apiPost("/api/fechamento-caixa/acertar-saldo", {
      empresaId,
      colaboradorId,
      contaOrigemId: opcoesEmpresa?.contas[0]?.id ?? null,
      data: new Date().toISOString().slice(0, 10),
      valorDiferenca: resumo.saldo
    });
	    await carregarMovimentos(empresaId);
	    await carregarResumo(empresaId);
  }

  async function logout() {
    if (saindo) return;
    saindo = true;
    try {
      await fetch(`${apiUrl}/api/auth/sign-out`, { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Erro ao encerrar sessao", error);
    } finally {
      sessao = null;
      await goto("/login", { replaceState: true });
      saindo = false;
    }
  }

	  function dadosCadastro(tela: string): Array<Record<string, string | undefined>> {
    if (tela === "empresas") return empresas.map((item) => ({ id: item.id, nome: item.nome }));
	    if (!opcoes) return [];
	    const listas = tela === "empresas" ? opcoes : opcoesEmpresa;
    if (!listas) return [];
	    if (tela === "contas") return listas.contas.map((item) => ({ id: item.id, nome: item.nome }));
	    if (tela === "colaboradores") return listas.colaboradores.map((item) => ({ id: item.id, nome: item.nome, cpf: item.cpf ?? "" }));
    if (tela === "feriados") {
      return listas.feriados.map((item) => ({
        id: item.id,
        nome: item.nome,
        data: `${String(item.dia).padStart(2, "0")}/${String(item.mes).padStart(2, "0")}${item.ano ? `/${item.ano}` : ""}`,
        ano: item.ano ? String(item.ano) : "Todos"
      }));
    }
    if (tela === "grupos") {
      return [
        ...listas.gruposDespesas.map((item) => ({ ...item, tipoGrupo: "despesa" as const })),
        ...listas.gruposMercadorias.map((item) => ({ ...item, tipoGrupo: "mercadoria" as const })),
        ...listas.gruposRetiradas.map((item) => ({ ...item, tipoGrupo: "retirada" as const }))
      ].map((item) => ({ id: item.id, nome: item.nome, tipo: grupoTipo(item, listas), tipoGrupo: item.tipoGrupo, grupoPaiId: item.grupoPaiId ?? "" }));
    }
    if (tela === "unidades") return listas.unidadesMedida.map((item) => ({ id: item.id, nome: item.nome, sigla: item.sigla }));
    if (tela === "areas_setores") {
      return [
        ...listas.areas.map((item) => ({ id: item.id, nome: item.nome, tipo: "Area", tipoAreaSetor: "area" })),
        ...listas.setores.map((item) => ({ id: item.id, nome: item.nome, tipo: "Setor", tipoAreaSetor: "setor", areaId: item.areaId ?? "", setorPaiId: item.setorPaiId ?? "" }))
      ];
    }
	    if (tela === "usuarios") {
			      return listas.usuarios.map((item) => ({
			        id: item.usuarioId,
	        empresaId: item.empresaId ?? "",
	        empresaIds: item.empresaIds?.join(",") ?? item.empresaId ?? "",
	        empresas: nomesEmpresas(item.empresaIds?.length ? item.empresaIds : item.empresaId ? [item.empresaId] : []),
			        nome: item.nome ?? "",
	        email: item.email ?? "",
	        papel: item.papel ?? "",
	        setorId: item.setorId ?? "",
	        tipo: item.papel?.replaceAll("_", " ") ?? ""
	      }));
	    }
		    if (tela === "permissoes") {
	      return [
	        ...papeis.map((papel) => ({
	          id: `papel:${papel}`,
	          tipo: "Papel",
	          tipoPermissao: "papel" as const,
	          papel,
	          nome: papel.replaceAll("_", " "),
	          permissoes: String(permissoesDoPapel(papel).length)
	        })),
	        ...listas.setores.map((setor) => ({
	          id: `setor:${setor.id}`,
	          tipo: "Setor",
	          tipoPermissao: "setor" as const,
	          setorId: setor.id,
	          nome: setor.nome ?? "",
	          permissoes: String(permissoesDoSetor(setor.id).length)
	        })),
	        ...listas.usuarios.map((usuario) => ({
	          id: `usuario:${usuario.usuarioId}`,
	          tipo: "Usuario",
	          tipoPermissao: "usuario" as const,
	          usuarioId: usuario.usuarioId,
	          nome: usuario.nome ?? usuario.email ?? "",
	          papel: usuario.papel,
	          permissoes: String(permissoesDoUsuario(usuario.usuarioId ?? "").length)
	        }))
	      ];
	    }
    if (tela === "malotes") {
      return listas.malotes.map((item) => ({
        id: item.id,
        codigo: item.codigo,
        lacres: String(item.totalLacres ?? 0)
      }));
    }
    return [];
  }

  function grupoTipo(item: Opcao, listas: Opcoes) {
    if (listas.gruposDespesas.some((grupo) => grupo.id === item.id)) return "Despesa";
    if (listas.gruposMercadorias.some((grupo) => grupo.id === item.id)) return "Mercadoria";
    return "Retirada";
  }

  function descricaoTela(tela: string) {
    const descricoes: Record<string, string> = {
	      entradas: "Lancamentos de valores recebidos no caixa ou em conta.",
      empresas: "Empresas que agrupam usuarios, caixas, gerentes, tesoureiros e cadastros operacionais.",
      transferencias: "Transferencias entre contas, com suporte a malote e lacre.",
      despesas: "Despesas com grupo, fornecedor e discriminacao de itens.",
      mercadorias: "Compras de mercadorias com computar, nota fiscal e foto do documento.",
      retiradas: "Retiradas vinculadas a colaborador, fornecedor ou rotina operacional.",
      malotes: "Cadastro de malotes e lacres disponiveis para transferencias.",
      contas: "Contas internas usadas em pagamentos, entradas e transferencias.",
      grupos: "Grupos de despesas, mercadorias e retiradas.",
      unidades: "Unidades usadas no cadastro e discriminacao de produtos.",
	      areas_setores: "Areas e setores para organizar colaboradores e cargos.",
		      usuarios: "Usuarios do sistema, papeis, empresas e vinculo com setor.",
	      permissoes: "Matriz de papeis e permissoes do sistema.",
      aparencia: "Cores configuraveis pelo diretor geral.",
      colaboradores: "Cadastro de colaboradores com nome e CPF.",
      feriados: "Feriados recorrentes ou especificos de um ano para o DP.",
      folha_ponto: "Registro de ponto dos colaboradores."
    };
    return descricoes[tela] ?? "Cadastro operacional.";
  }

  function colunasCadastro(tela: string) {
    if (tela === "unidades") return ["Nome", "Sigla"];
    if (tela === "grupos") return ["Nome", "Tipo"];
	    if (tela === "contas") return ["Nome"];
    if (tela === "empresas") return ["Nome"];
    if (tela === "colaboradores") return ["Nome", "CPF"];
    if (tela === "feriados") return ["Nome", "Data", "Ano"];
	    if (tela === "permissoes") return ["Papel", "Permissoes"];
		    if (tela === "usuarios") return ["Nome", "Email", "Papel", "Empresas"];
	    if (tela === "areas_setores") return ["Nome", "Tipo"];
    if (tela === "malotes") return ["Codigo", "Lacres"];
    return ["Nome", "Detalhe"];
  }

  function ordenarArvore(itens: Array<Record<string, string | undefined>>, paiId = "", nivel = 0): Array<{ id: string; nome: string; detalhe?: string; nivel: number; item: Record<string, string | undefined> }> {
    return itens
      .filter((item) => parentIdArvore(item) === String(paiId || ""))
      .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? "")))
      .flatMap((item) => [
        { id: item.id ?? "", nome: item.nome ?? "-", detalhe: item.tipo, nivel, item },
        ...ordenarArvore(itens, item.id ?? "", nivel + 1)
      ]);
  }

  function parentIdArvore(item: Record<string, string | undefined>) {
    if (item.grupoPaiId) return item.grupoPaiId;
    if (item.setorPaiId) return item.setorPaiId;
    return item.areaId ?? "";
  }

  function treeGrupos() {
    return ordenarArvore(dadosCadastro("grupos"));
  }

  function treeAreasSetores() {
    const itens = dadosCadastro("areas_setores");
    const areas = itens.filter((item) => item.tipoAreaSetor === "area");
    const setores = itens.filter((item) => item.tipoAreaSetor === "setor");
    return areas
      .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? "")))
      .flatMap((area) => [
        { id: area.id ?? "", nome: area.nome ?? "-", detalhe: "Area", nivel: 0, item: area },
        ...ordenarArvore(setores, area.id ?? "", 1)
      ]);
  }

  function mensagemErro(error: unknown) {
    if (!(error instanceof Error)) return "Erro inesperado.";
    try {
      const dados = JSON.parse(error.message);
      return dados.erro ?? dados.message ?? dados.error ?? error.message;
    } catch {
      return error.message || "Erro inesperado.";
    }
  }

  onMount(carregarTudo);
</script>

<svelte:head>
  <title>Padaria v2</title>
</svelte:head>

<Toaster richColors closeButton position="top-right" />

{#if carregando}
  <div class="grid min-h-screen place-items-center bg-background text-sm font-semibold text-muted-foreground">Carregando...</div>
{:else if sessao}
  <div class="min-h-screen bg-background">
    <Sheet.Root bind:open={menuMobileAberto}>
      <Sheet.Content side="left" class="flex w-80 flex-col p-5">
	        <Sheet.Header>
          <Sheet.Title class="sr-only">Empresa ativa</Sheet.Title>
          <div class="relative">
            <button
              class="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-muted"
              type="button"
              onclick={() => (empresasMenuAberto = !empresasMenuAberto)}
              title="Trocar empresa"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 class="size-5" /></span>
              <span class="min-w-0">
                <span class="block text-xs font-semibold uppercase text-muted-foreground">Empresa ativa</span>
                <span class="block truncate text-xl font-black text-primary">{empresaAtiva?.nome ?? "Sem empresa"}</span>
              </span>
            </button>
            {#if empresasMenuAberto}
              <Card.Root class="absolute left-0 top-14 z-40 w-full overflow-hidden border bg-card shadow-xl">
                <Card.Content class="p-1">
                  {#each empresasDisponiveis as empresa}
                    <button class={`flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition ${empresa.id === empresaId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`} type="button" onclick={() => selecionarEmpresa(empresa.id)}>
                      {empresa.nome}
                    </button>
                  {/each}
                </Card.Content>
              </Card.Root>
            {/if}
          </div>
	        </Sheet.Header>
        <div class="relative mt-6 shrink-0">
          <Button class="h-12 w-full justify-start gap-3 rounded-full text-base shadow-lg shadow-primary/20" onclick={() => (novoAberto = !novoAberto)}>
            <Plus class="size-5" /> Novo
          </Button>
          {#if novoAberto}
            <Card.Root class="mt-3 overflow-hidden rounded-2xl border bg-card shadow-xl">
              <Card.Content class="p-0">
                {#each acoesNovo as acao}
                  <button class="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted" onclick={() => executarAcaoNovo(acao)}>
                    <svelte:component this={acao.icone} class={`size-5 ${acao.cor}`} />
                    <span>
                      <span class="block text-base font-semibold">{acao.titulo}</span>
                      <span class="block text-xs text-muted-foreground">{acao.subtitulo}</span>
                    </span>
                  </button>
                {:else}
                  <div class="px-5 py-4 text-sm text-muted-foreground">Nenhuma acao disponivel.</div>
                {/each}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>
        <nav class="mt-6 grid gap-1 overflow-y-auto">
          {#each telasPermitidas as item}
            <button
              class={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${telaAtiva === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              onclick={() => selecionarTela(item.id)}
            >
              <svelte:component this={item.icone} class="size-5" />
              {item.titulo}
            </button>
          {/each}
        </nav>
      </Sheet.Content>
    </Sheet.Root>

	    <aside class="fixed inset-y-0 left-0 hidden w-72 flex-col border-r bg-card p-5 shadow-sm lg:flex">
	      <div class="relative shrink-0">
	        <button
	          class="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-muted"
	          type="button"
	          onclick={() => (empresasMenuAberto = !empresasMenuAberto)}
	          title="Trocar empresa"
	        >
	          <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Building2 class="size-5" /></span>
	          <span class="min-w-0">
	            <span class="block text-xs font-semibold uppercase text-muted-foreground">Empresa ativa</span>
	            <span class="block truncate text-2xl font-black text-primary">{empresaAtiva?.nome ?? "Sem empresa"}</span>
	          </span>
	        </button>
	        {#if empresasMenuAberto}
	          <Card.Root class="absolute left-0 top-16 z-40 w-full overflow-hidden border bg-card shadow-xl">
	            <Card.Content class="p-1">
	              {#each empresasDisponiveis as empresa}
	                <button class={`flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition ${empresa.id === empresaId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`} type="button" onclick={() => selecionarEmpresa(empresa.id)}>
	                  {empresa.nome}
	                </button>
	              {/each}
	            </Card.Content>
	          </Card.Root>
	        {/if}
	      </div>
      <div class="relative mt-8 shrink-0">
        <Button class="h-12 w-full justify-start gap-3 rounded-full text-base shadow-lg shadow-primary/20" onclick={() => (novoAberto = !novoAberto)}>
          <Plus class="size-5" /> Novo
        </Button>
        {#if novoAberto}
          <Card.Root class="absolute left-0 top-14 z-30 w-[340px] overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <Card.Content class="p-0">
              {#each acoesNovo as acao}
                <button
                  class="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted"
                  onclick={() => executarAcaoNovo(acao)}
                >
                  <svelte:component this={acao.icone} class={`size-5 ${acao.cor}`} />
                  <span>
                    <span class="block text-base font-semibold">{acao.titulo}</span>
                    <span class="block text-xs text-muted-foreground">{acao.subtitulo}</span>
                  </span>
                </button>
              {:else}
                <div class="px-5 py-4 text-sm text-muted-foreground">Nenhuma acao disponivel.</div>
              {/each}
            </Card.Content>
          </Card.Root>
        {/if}
      </div>
      <nav class="mt-8 grid gap-1 overflow-y-auto">
        {#each telasPermitidas as item}
          <button
            class={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${telaAtiva === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onclick={() => selecionarTela(item.id)}
          >
            <svelte:component this={item.icone} class="size-5" />
            {item.titulo}
          </button>
        {/each}
      </nav>
    </aside>

    <main class="lg:pl-72">
      <header class="flex h-20 items-center justify-between px-5 lg:px-8">
        <div class="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" class="lg:hidden" onclick={() => (menuMobileAberto = true)} title="Menu">
            <Menu class="size-4" />
          </Button>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-muted-foreground">{sessao.perfil?.papel.replaceAll("_", " ")}</div>
            <h1 class="truncate text-2xl font-black md:text-3xl">{telaAtual?.titulo ?? "Operacao financeira"}</h1>
          </div>
        </div>
	        <div class="flex items-center gap-3">
		          <Badge variant="secondary">{sessao.perfil?.nome}</Badge>
          {#if podeConfigurarTema}
            <Button variant="outline" size="icon" onclick={() => abrirTema(telaAtiva)} title="Aparencia">
              <Paintbrush class="size-4" />
            </Button>
          {/if}
          <Button variant="outline" size="icon" onclick={logout} title="Sair" disabled={saindo}>
            <LogOut class="size-4" />
          </Button>
        </div>
      </header>

      <section class="space-y-6 px-5 pb-10 lg:px-8">
        {#if erro}
          <Card.Root class="border-destructive/30 text-destructive">
            <Card.Content class="p-4 text-sm">{erro}</Card.Content>
          </Card.Root>
        {/if}

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card.Root class="shadow-sm">
            <Card.Content class="flex items-center gap-4 p-5">
              <span class="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><Banknote /></span>
              <div><p class="text-sm text-muted-foreground">Entradas</p><p class="text-2xl font-black">{dinheiro(resumo?.totalEntradas ?? 0)}</p></div>
            </Card.Content>
          </Card.Root>
          <Card.Root class="shadow-sm">
            <Card.Content class="flex items-center gap-4 p-5">
              <span class="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><ArrowLeftRight /></span>
              <div><p class="text-sm text-muted-foreground">Transferencias</p><p class="text-2xl font-black">{dinheiro(resumo?.totalTransferencias ?? 0)}</p></div>
            </Card.Content>
          </Card.Root>
          <Card.Root class="shadow-sm">
            <Card.Content class="flex items-center gap-4 p-5">
              <span class="grid size-12 place-items-center rounded-full bg-destructive text-white"><ReceiptText /></span>
              <div><p class="text-sm text-muted-foreground">Despesas e retiradas</p><p class="text-2xl font-black">{dinheiro((resumo?.totalDespesas ?? 0) + (resumo?.totalRetiradas ?? 0))}</p></div>
            </Card.Content>
          </Card.Root>
          <Card.Root class="shadow-sm">
            <Card.Content class="flex items-center justify-between gap-4 p-5">
              <div><p class="text-sm text-muted-foreground">Saldo do caixa</p><p class={`text-2xl font-black ${(resumo?.saldo ?? 0) === 0 ? "text-[var(--success)]" : "text-destructive"}`}>{dinheiro(resumo?.saldo ?? 0)}</p></div>
              {#if temPermissao("fechamento_com_diferenca") && resumo && resumo.saldo !== 0}
                <Button size="sm" onclick={acertarSaldo}>Acertar saldo</Button>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>

        {#key `${empresaId}:${telaAtiva}:${chaveDadosEmpresa}`}
        {#if empresaCarregando}
          <Card.Root class="shadow-sm">
            <Card.Content class="p-8 text-center text-sm font-semibold text-muted-foreground">Atualizando dados da empresa...</Card.Content>
          </Card.Root>
        {:else if movimentoPorTela[telaAtiva]}
        <Card.Root class="shadow-sm">
          <Card.Header class="flex-row items-center justify-between">
            <div>
              <Card.Title>{telaAtual.titulo}</Card.Title>
              <Card.Description>{descricaoTela(telaAtiva)}</Card.Description>
            </div>
            {#if telaAtiva !== "entradas"}
              <div class="flex flex-wrap gap-2">
                <Button size="sm" onclick={() => abrirMovimento(movimentoPorTela[telaAtiva])}><Plus class="size-4" />Novo</Button>
              </div>
            {/if}
          </Card.Header>
          <Card.Content>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Tipo</Table.Head>
                  <Table.Head>Data</Table.Head>
                  <Table.Head>Descricao</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head class="text-right">Valor</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each movimentosPaginados as movimento}
                  <Table.Row>
                    <Table.Cell><Badge variant="outline">{movimento.tipo}</Badge></Table.Cell>
                    <Table.Cell>{String(movimento.dataReferencia).slice(0, 10).split("-").reverse().join("/")}</Table.Cell>
                    <Table.Cell class="font-medium">{movimento.descricao}</Table.Cell>
                    <Table.Cell>{movimento.status}</Table.Cell>
                    <Table.Cell class="text-right font-bold">{dinheiro(movimento.valorOriginal)}</Table.Cell>
                  </Table.Row>
                {:else}
                  <Table.Row><Table.Cell colspan={5} class="h-28 text-center text-muted-foreground">Nenhum registro cadastrado para esta tela.</Table.Cell></Table.Row>
                {/each}
	              </Table.Body>
	            </Table.Root>
              {#if movimentosDaTela.length > 10}
                <div class="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>Mostrando {inicioMovimentos}-{fimMovimentos} de {movimentosDaTela.length}</span>
                  <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" onclick={() => (paginaMovimentos = Math.max(1, paginaMovimentos - 1))} disabled={paginaMovimentos === 1}>
                      <ChevronLeft class="size-4" />
                      Anterior
                    </Button>
                    <span class="min-w-16 text-center text-sm font-semibold text-foreground">{paginaMovimentos} / {totalPaginasMovimentos}</span>
                    <Button variant="outline" size="sm" onclick={() => (paginaMovimentos = Math.min(totalPaginasMovimentos, paginaMovimentos + 1))} disabled={paginaMovimentos === totalPaginasMovimentos}>
                      Proxima
                      <ChevronRight class="size-4" />
                    </Button>
                  </div>
                </div>
              {/if}
	          </Card.Content>
	        </Card.Root>
        {:else if telaAtiva === "relatorio_produtos" && temPermissao("relatorio_produtos_mais_vendidos")}
          <RelatorioProdutos {empresaId} />
        {:else if telaAtiva === "fechamento" || telaAtiva === "caixa"}
          <Card.Root class="shadow-sm">
            <Card.Header>
              <Card.Title>Folha de caixa</Card.Title>
              <Card.Description>Entradas, transferencias, despesas e retiradas precisam fechar saldo zero.</Card.Description>
            </Card.Header>
            <Card.Content class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div><p class="text-sm text-muted-foreground">Entradas</p><p class="text-xl font-black">{dinheiro(resumo?.totalEntradas ?? 0)}</p></div>
              <div><p class="text-sm text-muted-foreground">Transferencias</p><p class="text-xl font-black">{dinheiro(resumo?.totalTransferencias ?? 0)}</p></div>
              <div><p class="text-sm text-muted-foreground">Despesas</p><p class="text-xl font-black">{dinheiro(resumo?.totalDespesas ?? 0)}</p></div>
              <div><p class="text-sm text-muted-foreground">Retiradas</p><p class="text-xl font-black">{dinheiro(resumo?.totalRetiradas ?? 0)}</p></div>
              <div>
                <p class="text-sm text-muted-foreground">Saldo</p>
                <p class={`text-xl font-black ${(resumo?.saldo ?? 0) === 0 ? "text-[var(--success)]" : "text-destructive"}`}>{dinheiro(resumo?.saldo ?? 0)}</p>
                {#if temPermissao("fechamento_com_diferenca") && resumo && resumo.saldo !== 0}
                  <Button class="mt-3" size="sm" onclick={acertarSaldo}>Acertar saldo</Button>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        {:else if telaAtiva === "malotes"}
          <div class="grid gap-4">
            {#key malotesAtualizacao}
              <CadastroSimples
                titulo="Malotes"
                descricao="Cada malote criado possui N lacres, usados nas transferencias."
                colunas={colunasCadastro("malotes")}
                linhas={dadosCadastro("malotes")}
	                acao="Novo malote"
	                aoAcionar={abrirMaloteNovo}
	                aoImportar={() => abrirImportacao("malotes")}
	                aoEditar={abrirMaloteEditar}
	                aoExportar={abrirExportacao}
	                editarCarregandoId={maloteEditandoCarregandoId}
	              />
            {/key}
          </div>
        {:else if telaAtiva === "grupos"}
          <TreeCadastro
            titulo="Grupos"
            descricao="Organize grupos e subgrupos em qualquer nivel."
	            itens={treeGrupos()}
	            acao="Novo grupo"
	            aoAcionar={() => abrirCadastroNovo("grupos")}
	            aoImportar={() => abrirImportacao("grupos")}
	            aoEditar={abrirCadastroEditar}
	            aoExportar={abrirExportacao}
	            aoCriarFilho={abrirCadastroFilho}
	          />
        {:else if telaAtiva === "areas_setores"}
          <TreeCadastro
            titulo="Areas e setores"
            descricao="Organize areas, setores e subsetores em arvore."
	            itens={treeAreasSetores()}
	            acao="Nova area"
	            aoAcionar={() => abrirCadastroNovo("areas_setores")}
	            aoImportar={() => abrirImportacao("areas_setores")}
	            aoEditar={abrirCadastroEditar}
	            aoExportar={abrirExportacao}
	            aoCriarFilho={abrirCadastroFilho}
	          />
        {:else if telaAtiva === "aparencia"}
          <Card.Root class="shadow-sm">
            <Card.Header>
              <Card.Title>Aparencia</Card.Title>
              <Card.Description>Cores configuraveis pelo diretor geral.</Card.Description>
            </Card.Header>
            <Card.Content class="grid max-w-xl gap-4">
              <div class="grid gap-2">
                <Label>Pagina/secao</Label>
                <NativeSelect bind:value={temaTelaEdicao}>
                  {#each telasPermitidas as tela}
                    <option value={tela.id}>{tela.titulo}</option>
                  {/each}
                </NativeSelect>
              </div>
              <Button onclick={() => abrirTema(temaTelaEdicao)}>
                <Paintbrush class="size-4" />
                Editar aparencia
              </Button>
            </Card.Content>
          </Card.Root>
	        {:else if telaAtiva === "folha_ponto"}
	          <div class="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
	            <CalendarClock class="size-12 opacity-30" />
	            <p class="text-sm">Em breve.</p>
	          </div>
	        {:else if telaAtiva === "colaboradores"}
	          <CadastroSimples
	            titulo="Colaboradores"
	            descricao="Cadastro do DP com cargos, remuneracao, faltas e jornadas versionadas."
	            colunas={colunasCadastro("colaboradores")}
	            linhas={dadosCadastro("colaboradores")}
	            acao="Novo colaborador"
	            aoImportar={() => abrirImportacao("colaboradores")}
	            aoAcionar={() => abrirCadastroNovo("colaboradores")}
	            aoEditar={abrirCadastroEditar}
	            aoExportar={abrirExportacao}
	            acoesExtras={[
	              { label: "Cargos", handler: abrirCargosColaborador },
	              { label: "Jornada", handler: abrirJornadaColaborador },
	              { label: "Faltas", handler: abrirFaltasJustificadasColaborador }
	            ]}
	          />
	        {:else if telaAtiva === "feriados"}
	          <CadastroSimples
	            titulo="Feriados"
	            descricao={descricaoTela("feriados")}
	            colunas={colunasCadastro("feriados")}
	            linhas={dadosCadastro("feriados")}
	            acao="Novo feriado"
	            aoAcionar={abrirFeriadoNovo}
	          />
	        {:else if ["empresas", "contas", "grupos", "unidades", "areas_setores", "usuarios", "permissoes", "aparencia", "promocoes", "relatorio_faltas", "relatorio_advertencias", "pedidos", "perdas_sobras", "estoque_produtos", "relatorio_dre", "clientes", "fornecedores", "produtos", "avaliacao_qualidade", "avaliacao_colaboradores", "relatorio_fiscal", "fiscal_produtos", "patrimonio", "ficha_tecnica", "ingredientes", "contas_pagar", "vendas_crediario", "notas_fiscais", "grupos_vendas", "pdv", "formas_pagamento"].includes(telaAtiva)}
          <CadastroSimples
            titulo={telaAtual.titulo}
            descricao={descricaoTela(telaAtiva)}
            colunas={colunasCadastro(telaAtiva)}
            linhas={dadosCadastro(telaAtiva)}
	            acao={`Novo ${telaAtual.titulo.toLowerCase()}`}
	            aoImportar={tipoCopiaTela(telaAtiva) ? () => abrirImportacao(telaAtiva) : undefined}
	            aoAcionar={telasCrudDiretoria.includes(telaAtiva) ? () => abrirCadastroNovo(telaAtiva) : undefined}
	            aoEditar={telasCrudDiretoria.includes(telaAtiva) ? abrirCadastroEditar : undefined}
	            aoExportar={tipoCopiaTela(telaAtiva) ? abrirExportacao : undefined}
	          />
        {/if}
        {/key}

      </section>
    </main>
  </div>
{/if}

<Dialog.Root bind:open={modalMovimentoAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Nova {tipoNovo}</Dialog.Title>
      <Dialog.Description>Preencha os campos principais da movimentacao.</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      {#if tipoNovo === "mercadoria"}
        <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
          <div>
            <h3 class="text-sm font-bold uppercase text-muted-foreground">Secao fiscal</h3>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="flex h-10 items-center gap-2 text-sm font-semibold"><Checkbox bind:checked={form.temNotaFiscal} />Possui nota fiscal?</label>
            <label class="flex h-10 items-center gap-2 text-sm font-semibold"><Checkbox bind:checked={form.computar} disabled={form.temNotaFiscal} />Computar</label>
            <div class="grid gap-2"><Label>Numero da nota</Label><Input bind:value={form.notaFiscalId} disabled={!form.temNotaFiscal} /></div>
            <div class="grid gap-2"><Label>Foto do documento</Label><Input bind:value={form.fotoDocumentoUrl} placeholder="URL ou caminho do documento" /></div>
          </div>
        </section>
      {/if}

      <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
        <h3 class="text-sm font-bold uppercase text-muted-foreground">Gerais</h3>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="grid gap-2"><Label>Data de referencia</Label><Input type="date" bind:value={form.dataReferencia} /></div>
          {#if tipoNovo !== "transferencia" && tipoNovo !== "retirada"}
            <div class="grid gap-2"><Label>Data de vencimento</Label><Input type="date" bind:value={form.dataVencimento} /></div>
          {/if}
          {#if tipoNovo === "transferencia"}
            <div class="grid gap-2"><Label>Conta de origem</Label><NativeSelect bind:value={form.contaOrigemId}><option value="">Selecione</option>{#each opcoesEmpresa?.contas ?? [] as conta}<option value={conta.id}>{conta.nome}</option>{/each}</NativeSelect></div>
            <div class="grid gap-2"><Label>Conta de destino</Label><NativeSelect bind:value={form.contaDestinoId}><option value="">Selecione</option>{#each opcoesEmpresa?.contas ?? [] as conta}<option value={conta.id}>{conta.nome}</option>{/each}</NativeSelect></div>
            <div class="grid gap-2 md:col-span-2">
              <Label>Numero do lacre</Label>
              <Input bind:value={lacreNumero} onblur={validarLacre} placeholder="Ex: LACRE-001" />
              {#if lacreStatus}<p class="text-xs text-destructive">{lacreStatus}</p>{/if}
            </div>
          {/if}
          <div class="grid gap-2 md:col-span-2"><Label>Descricao</Label><Input bind:value={form.descricao} /></div>
          <div class="grid gap-2 md:col-span-2"><Label>Observacao</Label><Textarea bind:value={form.observacao} /></div>
        </div>
      </section>

      {#if tipoNovo === "despesa" || tipoNovo === "retirada" || tipoNovo === "mercadoria"}
        <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
          <h3 class="text-sm font-bold uppercase text-muted-foreground">Grupo</h3>
          <div class="grid gap-3 md:grid-cols-2">
            {#if tipoNovo === "despesa"}
              <div class="grid gap-2"><Label>Grupo</Label><NativeSelect bind:value={form.grupoDespesaId}><option value="">Selecione</option>{#each gruposAgrupados(opcoesEmpresa?.gruposDespesas ?? []) as agrupamento}<optgroup label={agrupamento.rotulo}>{#each agrupamento.itens as grupo}<option value={grupo.id}>{rotuloGrupo(grupo)}</option>{/each}</optgroup>{/each}</NativeSelect></div>
            {:else if tipoNovo === "retirada"}
              <div class="grid gap-2"><Label>Grupo</Label><NativeSelect bind:value={form.grupoRetiradaId}><option value="">Selecione</option>{#each gruposAgrupados(opcoesEmpresa?.gruposRetiradas ?? []) as agrupamento}<optgroup label={agrupamento.rotulo}>{#each agrupamento.itens as grupo}<option value={grupo.id}>{rotuloGrupo(grupo)}</option>{/each}</optgroup>{/each}</NativeSelect></div>
            {:else}
              <div class="grid gap-2"><Label>Grupo</Label><NativeSelect bind:value={form.grupoMercadoriaId}><option value="">Selecione</option>{#each gruposAgrupados(opcoesEmpresa?.gruposMercadorias ?? []) as agrupamento}<optgroup label={agrupamento.rotulo}>{#each agrupamento.itens as grupo}<option value={grupo.id}>{rotuloGrupo(grupo)}</option>{/each}</optgroup>{/each}</NativeSelect></div>
            {/if}
          </div>
        </section>
      {/if}

      <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-bold uppercase text-muted-foreground">Valor</h3>
          {#if tipoNovo === "despesa"}
            <label class="flex items-center gap-2 text-sm font-semibold"><Switch bind:checked={discriminandoDespesa} />Discriminar despesa</label>
          {:else if tipoNovo === "mercadoria"}
            <label class="flex items-center gap-2 text-sm font-semibold"><Switch bind:checked={discriminandoMercadoria} />Discriminar mercadorias</label>
          {/if}
        </div>

        {#if tipoNovo === "despesa" && discriminandoDespesa}
          <div class="grid gap-3">
            {#each itensDespesa as item, indice}
              <div class="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-[1fr_1fr_140px_auto]">
                <div class="grid gap-2"><Label>Item</Label><Input bind:value={item.descricao} placeholder="Ex: Peca X, Mao de obra" /></div>
                <div class="grid gap-2"><Label>Grupo do item</Label><NativeSelect bind:value={item.grupoDespesaId}><option value="">Selecione</option>{#each gruposAgrupados(opcoesEmpresa?.gruposDespesas ?? []) as agrupamento}<optgroup label={agrupamento.rotulo}>{#each agrupamento.itens as grupo}<option value={grupo.id}>{rotuloGrupo(grupo)}</option>{/each}</optgroup>{/each}</NativeSelect></div>
                <div class="grid gap-2"><Label>Valor</Label><Input type="number" step="0.01" bind:value={item.valor} /></div>
                <Button class="self-end" variant="outline" type="button" onclick={() => removerItemDespesa(indice)}>Remover</Button>
              </div>
            {/each}
            <Button variant="outline" type="button" onclick={adicionarItemDespesa}>Adicionar item</Button>
          </div>
          <Separator />
        {/if}

        {#if tipoNovo === "mercadoria" && discriminandoMercadoria}
          <div class="grid gap-3">
            {#each itensMercadoria as item, indice}
              <div class="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-3">
                <div class="grid gap-2 md:col-span-2"><Label>Mercadoria</Label><Input bind:value={item.descricao} /></div>
                <div class="grid gap-2"><Label>Produto</Label><NativeSelect bind:value={item.produtoId}><option value="">Sem vinculo</option>{#each opcoesEmpresa?.produtos ?? [] as produto}<option value={produto.id}>{produto.descricao}</option>{/each}</NativeSelect></div>
                <div class="grid gap-2"><Label>Grupo do item</Label><NativeSelect bind:value={item.grupoMercadoriaId}><option value="">Selecione</option>{#each gruposAgrupados(opcoesEmpresa?.gruposMercadorias ?? []) as agrupamento}<optgroup label={agrupamento.rotulo}>{#each agrupamento.itens as grupo}<option value={grupo.id}>{rotuloGrupo(grupo)}</option>{/each}</optgroup>{/each}</NativeSelect></div>
                <div class="grid gap-2"><Label>Unidade</Label><NativeSelect bind:value={item.unidadeMedidaId}><option value="">Selecione</option>{#each opcoesEmpresa?.unidadesMedida ?? [] as unidade}<option value={unidade.id}>{unidade.nome}</option>{/each}</NativeSelect></div>
                <div class="grid gap-2"><Label>Quantidade</Label><Input type="number" step="0.001" bind:value={item.quantidade} /></div>
                <div class="grid gap-2"><Label>Valor unitario</Label><Input type="number" step="0.0001" bind:value={item.valorUnitario} /></div>
                <div class="grid gap-2"><Label>Total</Label><Input type="number" step="0.01" bind:value={item.valorTotal} /></div>
                <Button class="self-end" variant="outline" type="button" onclick={() => removerItemMercadoria(indice)}>Remover</Button>
              </div>
            {/each}
            <Button variant="outline" type="button" onclick={adicionarItemMercadoria}>Adicionar item</Button>
          </div>
          <Separator />
        {/if}

        <div class="grid gap-3 md:grid-cols-2">
          <div class="grid gap-2"><Label>Valor original</Label><Input type="number" min="0" step="0.01" bind:value={form.valorOriginal} disabled={discriminandoDespesa || discriminandoMercadoria} /></div>
          <div class="rounded-lg border bg-card p-3 text-sm font-bold">Valor total: {dinheiro(valorTotalMovimento)}</div>
          <label class="flex items-center gap-2 text-sm font-semibold"><Checkbox checked={Number(form.valorAcrescimo || 0) > 0} />Houve acrescimo</label>
          <div class="grid gap-2"><Label>Valor de acrescimo</Label><Input type="number" min="0" step="0.01" bind:value={form.valorAcrescimo} /></div>
          <div class="grid gap-2 md:col-span-2"><Label>Descricao do acrescimo</Label><Input bind:value={form.descricaoAcrescimo} /></div>
          <label class="flex items-center gap-2 text-sm font-semibold"><Checkbox checked={Number(form.valorDesconto || 0) > 0} />Houve desconto</label>
          <div class="grid gap-2"><Label>Valor de desconto</Label><Input type="number" min="0" step="0.01" bind:value={form.valorDesconto} /></div>
          <div class="grid gap-2 md:col-span-2"><Label>Descricao do desconto</Label><Input bind:value={form.descricaoDesconto} /></div>
        </div>
      </section>

      <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
        <h3 class="text-sm font-bold uppercase text-muted-foreground">Destino</h3>
        <div class="grid gap-3 md:grid-cols-2">
          {#if tipoNovo === "despesa" || tipoNovo === "mercadoria"}
            <div class="grid gap-2">
              <Label>Fornecedor/colaborador</Label>
              <NativeSelect bind:value={form.tipoBeneficiario}>
                <option value="fornecedor">Fornecedor</option>
                <option value="colaborador">Colaborador</option>
              </NativeSelect>
            </div>
            {#if form.tipoBeneficiario === "fornecedor"}
              <div class="grid gap-2"><Label>Fornecedor</Label><NativeSelect bind:value={form.fornecedorId}><option value="">Selecione</option>{#each opcoesEmpresa?.fornecedores ?? [] as fornecedor}<option value={fornecedor.id}>{fornecedor.nome}</option>{/each}</NativeSelect></div>
            {:else}
              <div class="grid gap-2"><Label>Colaborador</Label><NativeSelect bind:value={form.colaboradorId}><option value="">Selecione</option>{#each opcoesEmpresa?.colaboradores ?? [] as colaborador}<option value={colaborador.id}>{colaborador.nome}</option>{/each}</NativeSelect></div>
              <div class="rounded-lg border bg-card p-3 md:col-span-2">
                <Label>Discriminacao dos colaboradores</Label>
                <div class="mt-2 grid gap-3 md:grid-cols-2">
                  <NativeSelect bind:value={form.colaboradorId}><option value="">Selecione</option>{#each opcoesEmpresa?.colaboradores ?? [] as colaborador}<option value={colaborador.id}>{colaborador.nome}</option>{/each}</NativeSelect>
                  <Input type="number" min="0" step="0.01" bind:value={form.valorOriginal} placeholder="Valor" />
                </div>
              </div>
            {/if}
          {:else if tipoNovo === "retirada"}
            <div class="grid gap-2"><Label>Colaborador</Label><NativeSelect bind:value={form.colaboradorId}><option value="">Selecione</option>{#each opcoesEmpresa?.colaboradores ?? [] as colaborador}<option value={colaborador.id}>{colaborador.nome}</option>{/each}</NativeSelect></div>
            <div class="rounded-lg border bg-card p-3 md:col-span-2">
              <Label>Discriminacao dos colaboradores</Label>
              <div class="mt-2 grid gap-3 md:grid-cols-2">
                <NativeSelect bind:value={form.colaboradorId}><option value="">Selecione</option>{#each opcoesEmpresa?.colaboradores ?? [] as colaborador}<option value={colaborador.id}>{colaborador.nome}</option>{/each}</NativeSelect>
                <Input type="number" min="0" step="0.01" bind:value={form.valorOriginal} placeholder="Valor" />
              </div>
            </div>
          {/if}
          <label class="flex items-center gap-2 text-sm font-semibold"><Checkbox bind:checked={form.pagamentoRealizado} />Pagamento realizado</label>
          {#if form.pagamentoRealizado}<div class="grid gap-2"><Label>Data de pagamento</Label><Input type="date" bind:value={form.dataPagamento} /></div>{/if}
          {#if tipoNovo !== "transferencia"}
            <div class="grid gap-2"><Label>Conta de origem</Label><NativeSelect bind:value={form.contaOrigemId}><option value="">Selecione</option>{#each opcoesEmpresa?.contas ?? [] as conta}<option value={conta.id}>{conta.nome}</option>{/each}</NativeSelect></div>
          {/if}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalMovimentoAberto = false)}>Cancelar</Button>
      <Button onclick={salvarMovimento}>Salvar</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalMaloteAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{maloteEditandoId ? "Editar malote" : "Novo malote"}</Dialog.Title>
      <Dialog.Description>Cadastre o codigo do malote e a lista de lacres disponiveis para transferencias.</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
        <h3 class="text-sm font-bold uppercase text-muted-foreground">Malote</h3>
        <div class="grid gap-3">
          <div class="grid gap-2">
            <Label>Codigo</Label>
            <Input bind:value={formMalote.codigo} placeholder="Ex: MALOTE-001" disabled={maloteSalvando} />
          </div>
        </div>
      </section>

      <section class="space-y-4 rounded-xl border bg-muted/40 p-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-bold uppercase text-muted-foreground">Lacres</h3>
          <Button variant="outline" size="sm" type="button" onclick={adicionarLacreMalote} disabled={maloteSalvando}>
            <Plus class="size-4" />
            Adicionar lacre
          </Button>
        </div>
        <div class="grid gap-3">
          {#each formMalote.lacres as lacre, indice}
            <div class="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_auto]">
              <div class="grid gap-2">
                <Label>Lacre {indice + 1}</Label>
                <Input value={lacre} placeholder="Ex: LACRE-001" oninput={(event) => atualizarLacreMalote(indice, event.currentTarget.value)} disabled={maloteSalvando} />
              </div>
              <Button class="self-end" variant="outline" type="button" onclick={() => removerLacreMalote(indice)} disabled={maloteSalvando}>Remover</Button>
            </div>
          {/each}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalMaloteAberto = false)} disabled={maloteSalvando}>Cancelar</Button>
      <Button onclick={salvarMalote} disabled={maloteSalvando}>
        {#if maloteSalvando}
          Salvando...
        {:else}
          {maloteEditandoId ? "Salvar alteracoes" : "Salvar malote"}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalCopiaAberto}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{copiaModo === "importar" ? "Importar dados" : "Exportar registro"}</Dialog.Title>
      <Dialog.Description>{telaAtual?.titulo ?? "Cadastro operacional"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-2">
      <div class="grid gap-2">
        <Label>Tipo de copia</Label>
        <NativeSelect bind:value={copiaNivel} disabled={copiaSalvando}>
          <option value="simples">Simples</option>
          <option value="completo">Completo</option>
        </NativeSelect>
      </div>
      {#if copiaModo === "importar"}
        <div class="grid gap-2">
          <Label>Empresa origem</Label>
          <NativeSelect bind:value={copiaEmpresaOrigemId} disabled={copiaSalvando}>
            <option value="">Selecione</option>
            {#each empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaDestinoId) as empresa}
              <option value={empresa.id}>{empresa.nome}</option>
            {/each}
          </NativeSelect>
        </div>
      {/if}
      <div class="grid gap-2">
        <Label>Empresa destino</Label>
        <NativeSelect bind:value={copiaEmpresaDestinoId} disabled={copiaSalvando}>
          <option value="">Selecione</option>
          {#each empresasDisponiveis.filter((empresa) => copiaModo === "exportar" || empresa.id !== copiaEmpresaOrigemId) as empresa}
            <option value={empresa.id}>{empresa.nome}</option>
          {/each}
        </NativeSelect>
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalCopiaAberto = false)} disabled={copiaSalvando}>Cancelar</Button>
      <Button onclick={executarCopia} disabled={copiaSalvando || !copiaEmpresaDestinoId || (copiaModo === "importar" && !copiaEmpresaOrigemId)}>
        {copiaSalvando ? "Copiando..." : "Copiar"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalCargosColaboradorAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Cargos</Dialog.Title>
      <Dialog.Description>{colaboradorSelecionado?.nome ?? "Colaborador"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
        <h3 class="text-sm font-bold">Novo cargo no catalogo</h3>
        <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input bind:value={cargoCatalogoNovo} placeholder="Ex: Atendente" disabled={salvandoCargoColaborador} />
          <Button type="button" variant="outline" onclick={criarCargoCatalogo} disabled={salvandoCargoColaborador}>Adicionar</Button>
        </div>
      </section>

      <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
        <h3 class="text-sm font-bold">Atribuir cargo ao colaborador</h3>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="grid gap-2">
            <Label>Cargo</Label>
            <NativeSelect bind:value={formCargoColaborador.cargoId} disabled={salvandoCargoColaborador}>
              <option value="">Selecione</option>
              {#each opcoesEmpresa?.cargos ?? [] as cargo}
                <option value={cargo.id}>{cargo.nome}</option>
              {/each}
            </NativeSelect>
          </div>
          <div class="grid gap-2">
            <Label>Setor</Label>
            <NativeSelect bind:value={formCargoColaborador.setorId} disabled={salvandoCargoColaborador}>
              <option value="">Sem setor</option>
              {#each opcoesEmpresa?.setores ?? [] as setor}
                <option value={setor.id}>{setor.nome}</option>
              {/each}
            </NativeSelect>
          </div>
          <div class="grid gap-2"><Label>Remuneracao por minuto</Label><Input type="number" min="0" step="0.000001" bind:value={formCargoColaborador.remuneracaoMinuto} disabled={salvandoCargoColaborador} /></div>
          <div class="grid gap-2"><Label>Data de inicio</Label><Input type="date" bind:value={formCargoColaborador.dataInicio} disabled={salvandoCargoColaborador} /></div>
          <label class="flex items-center gap-2 text-sm font-semibold"><Checkbox bind:checked={formCargoColaborador.ativo} disabled={salvandoCargoColaborador} />Ativo</label>
        </div>
        <Button type="button" onclick={salvarCargoColaborador} disabled={salvandoCargoColaborador || !formCargoColaborador.cargoId || !formCargoColaborador.remuneracaoMinuto}>Salvar cargo</Button>
      </section>

      <section class="grid gap-3">
        <h3 class="text-sm font-bold">Historico</h3>
        <div class="grid gap-2">
          {#each opcoesEmpresa?.colaboradoresCargos ?? [] as registro}
            <div class="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_auto]">
              <div>
                <p class="text-sm font-bold">{registro.cargoNome}</p>
                <p class="text-xs text-muted-foreground">Inicio {registro.dataInicio} | R$ {registro.remuneracaoMinuto}/min | {registro.ativo ? "Ativo" : "Inativo"}</p>
              </div>
              {#if registro.ativo}
                <Button type="button" variant="outline" size="sm" onclick={() => interromperCargoColaborador(registro)}>Interromper</Button>
              {/if}
            </div>
          {:else}
            <p class="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Nenhum cargo atribuido.</p>
          {/each}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalCargosColaboradorAberto = false)} disabled={salvandoCargoColaborador}>Fechar</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalJornadaAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Jornada de trabalho</Dialog.Title>
      <Dialog.Description>{colaboradorSelecionado?.nome ?? "Colaborador"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      <div class="grid gap-2 max-w-xs">
        <Label>Data de inicio da versao</Label>
        <Input type="date" bind:value={formJornada.dataInicio} disabled={salvandoJornada} />
      </div>

      <div class="grid gap-3">
        {#each formJornada.dias as dia, indiceDia}
          <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-bold">{diasJornada.find((item) => item.id === dia.diaDaSemana)?.nome}</h3>
              <Button type="button" size="sm" variant="outline" onclick={() => adicionarFaixaJornada(indiceDia)} disabled={salvandoJornada}>Adicionar faixa</Button>
            </div>
            {#each dia.faixas as faixa, indiceFaixa}
              <div class="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[130px_150px_150px_1fr_auto]">
                <div class="grid gap-2"><Label>Entrada</Label><Input type="time" value={faixa.horaEntrada} oninput={(event) => atualizarFaixaJornada(indiceDia, indiceFaixa, "horaEntrada", event.currentTarget.value)} disabled={salvandoJornada} /></div>
                <div class="grid gap-2"><Label>Carga diaria min.</Label><Input type="number" min="0" value={faixa.cargaHorariaDiariaEmMinutos} oninput={(event) => atualizarFaixaJornada(indiceDia, indiceFaixa, "cargaHorariaDiariaEmMinutos", event.currentTarget.value)} disabled={salvandoJornada} /></div>
                <div class="grid gap-2"><Label>Intervalo min.</Label><Input type="number" min="0" value={faixa.intervaloMinutos} oninput={(event) => atualizarFaixaJornada(indiceDia, indiceFaixa, "intervaloMinutos", event.currentTarget.value)} disabled={salvandoJornada} /></div>
                <div class="grid gap-2">
                  <Label>Cargo</Label>
                  <NativeSelect value={faixa.colaboradorCargoId} onchange={(event) => atualizarFaixaJornada(indiceDia, indiceFaixa, "colaboradorCargoId", event.currentTarget.value)} disabled={salvandoJornada}>
                    <option value="">Selecione</option>
                    {#each (opcoesEmpresa?.colaboradoresCargos ?? []).filter((cargo) => cargo.ativo) as cargo}
                      <option value={cargo.id}>{cargo.cargoNome}</option>
                    {/each}
                  </NativeSelect>
                </div>
                <Button class="self-end" type="button" variant="outline" onclick={() => removerFaixaJornada(indiceDia, indiceFaixa)} disabled={salvandoJornada}>Remover</Button>
              </div>
            {/each}
          </section>
        {/each}
      </div>

      <section class="grid gap-3">
        <h3 class="text-sm font-bold">Historico de jornadas</h3>
        <div class="grid gap-2">
          {#each opcoesEmpresa?.colaboradoresJornadas ?? [] as registro}
            <div class="rounded-lg border bg-card p-3 text-sm">
              <p class="font-bold">{registro.dataInicio} | {registro.diaDaSemana} | {registro.ativo ? "Ativa" : "Inativa"}</p>
              <p class="text-muted-foreground">{registro.horaEntrada ?? "--:--"} | {registro.cargaHorariaDiariaEmMinutos ?? 0} min | intervalo {registro.intervaloMinutos ?? 0} min | {registro.cargoNome ?? cargoAtivoNome(registro.colaboradorCargoId)}</p>
            </div>
          {:else}
            <p class="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Nenhuma jornada cadastrada.</p>
          {/each}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalJornadaAberto = false)} disabled={salvandoJornada}>Cancelar</Button>
      <Button onclick={salvarJornadaColaborador} disabled={salvandoJornada || !(opcoesEmpresa?.colaboradoresCargos ?? []).some((cargo) => cargo.ativo)}>{salvandoJornada ? "Salvando..." : "Salvar jornada"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalFaltasJustificadasAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Faltas justificadas</Dialog.Title>
      <Dialog.Description>{colaboradorSelecionado?.nome ?? "Colaborador"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
        <h3 class="text-sm font-bold">Nova falta</h3>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="grid gap-2"><Label>Inicio</Label><Input type="datetime-local" bind:value={formFaltaJustificada.inicio} disabled={salvandoFaltaJustificada} /></div>
          <div class="grid gap-2"><Label>Fim</Label><Input type="datetime-local" bind:value={formFaltaJustificada.fim} disabled={salvandoFaltaJustificada} /></div>
          <div class="grid gap-2 md:col-span-2"><Label>Motivo</Label><Textarea bind:value={formFaltaJustificada.motivo} disabled={salvandoFaltaJustificada} /></div>
        </div>
        <Button type="button" onclick={salvarFaltaJustificada} disabled={salvandoFaltaJustificada || !formFaltaJustificada.motivo}>Salvar falta</Button>
      </section>

      <section class="grid gap-3">
        <h3 class="text-sm font-bold">Historico</h3>
        <div class="grid gap-2">
          {#each opcoesEmpresa?.colaboradoresFaltasJustificadas ?? [] as falta}
            <div class="rounded-lg border bg-card p-3 text-sm">
              <p class="font-bold">{falta.inicio} ate {falta.fim}</p>
              <p class="text-muted-foreground">{falta.motivo}</p>
            </div>
          {:else}
            <p class="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Nenhuma falta justificada cadastrada.</p>
          {/each}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalFaltasJustificadasAberto = false)} disabled={salvandoFaltaJustificada}>Fechar</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalFeriadosAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Feriados</Dialog.Title>
      <Dialog.Description>{empresaAtiva?.nome ?? "Empresa"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-5 py-2">
      <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
        <h3 class="text-sm font-bold">Novo feriado</h3>
        <div class="grid gap-3 md:grid-cols-[1fr_90px_90px_120px]">
          <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formFeriado.nome} disabled={salvandoFeriado} /></div>
          <div class="grid gap-2"><Label>Dia</Label><Input type="number" min="1" max="31" bind:value={formFeriado.dia} disabled={salvandoFeriado} /></div>
          <div class="grid gap-2"><Label>Mes</Label><Input type="number" min="1" max="12" bind:value={formFeriado.mes} disabled={salvandoFeriado} /></div>
          <div class="grid gap-2"><Label>Ano</Label><Input type="number" min="1900" max="9999" bind:value={formFeriado.ano} disabled={salvandoFeriado} /></div>
        </div>
        <Button type="button" onclick={salvarFeriado} disabled={salvandoFeriado || !formFeriado.nome || !formFeriado.dia || !formFeriado.mes}>Salvar feriado</Button>
      </section>

      <section class="grid gap-3">
        <h3 class="text-sm font-bold">Lista</h3>
        <div class="grid gap-2">
          {#each opcoesEmpresa?.feriados ?? [] as feriado}
            <div class="rounded-lg border bg-card p-3 text-sm">
              <p class="font-bold">{feriado.nome}</p>
              <p class="text-muted-foreground">{String(feriado.dia).padStart(2, "0")}/{String(feriado.mes).padStart(2, "0")}{feriado.ano ? `/${feriado.ano}` : ""}</p>
            </div>
          {:else}
            <p class="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Nenhum feriado cadastrado.</p>
          {/each}
        </div>
      </section>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalFeriadosAberto = false)} disabled={salvandoFeriado}>Fechar</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalCadastroAberto}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{cadastroEditandoId ? "Editar cadastro" : "Novo cadastro"}</Dialog.Title>
      <Dialog.Description>{telaAtual?.titulo ?? "Cadastro operacional"}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-2">
      {#if cadastroTela === "empresas"}
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
      {:else if cadastroTela === "colaboradores"}
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
        <div class="grid gap-2"><Label>CPF</Label><Input bind:value={formCadastro.cpf} disabled={cadastroSalvando} /></div>
      {:else if cadastroTela === "contas"}
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
      {:else if cadastroTela === "grupos"}
        <div class="grid gap-2">
          <Label>Tipo de grupo</Label>
          <NativeSelect bind:value={formCadastro.tipoGrupo} disabled={cadastroSalvando || Boolean(cadastroEditandoId)}>
            <option value="despesa">Despesa</option>
            <option value="mercadoria">Mercadoria</option>
            <option value="retirada">Retirada</option>
          </NativeSelect>
        </div>
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
        <div class="grid gap-2">
          <Label>Grupo pai</Label>
          <NativeSelect bind:value={formCadastro.grupoPaiId} disabled={cadastroSalvando}>
            <option value="">Sem grupo pai</option>
	            {#each gruposPorTipoHierarquicos(formCadastro.tipoGrupo) as grupo}
	              {#if grupo.id !== cadastroEditandoId}
	                <option value={grupo.id}>{grupo.nome}</option>
	              {/if}
	            {/each}
	          </NativeSelect>
	        </div>
      {:else if cadastroTela === "unidades"}
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
        <div class="grid gap-2"><Label>Sigla</Label><Input bind:value={formCadastro.sigla} disabled={cadastroSalvando} /></div>
      {:else if cadastroTela === "areas_setores"}
        <div class="grid gap-2">
          <Label>Tipo</Label>
          <NativeSelect bind:value={formCadastro.tipoAreaSetor} disabled={cadastroSalvando || Boolean(cadastroEditandoId)}>
            <option value="area">Area</option>
            <option value="setor">Setor</option>
          </NativeSelect>
        </div>
        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
        {#if formCadastro.tipoAreaSetor === "setor"}
          <div class="grid gap-2">
            <Label>Area</Label>
            <NativeSelect bind:value={formCadastro.areaId} disabled={cadastroSalvando}>
              <option value="">Sem area</option>
              {#each opcoesEmpresa?.areas ?? [] as area}
                <option value={area.id}>{area.nome}</option>
              {/each}
            </NativeSelect>
          </div>
          <div class="grid gap-2">
            <Label>Setor pai</Label>
            <NativeSelect bind:value={formCadastro.setorPaiId} disabled={cadastroSalvando}>
              <option value="">Direto na area</option>
              {#each opcoesEmpresa?.setores ?? [] as setor}
                {#if setor.id !== cadastroEditandoId}
                  <option value={setor.id}>{setor.nome}</option>
                {/if}
              {/each}
            </NativeSelect>
          </div>
        {/if}
		      {:else if cadastroTela === "usuarios"}
	        <div class="grid gap-2"><Label>Nome</Label><Input bind:value={formCadastro.nome} disabled={cadastroSalvando} /></div>
	        <div class="grid gap-2"><Label>Email</Label><Input type="email" bind:value={formCadastro.email} disabled={cadastroSalvando} /></div>
		        <div class="grid gap-2">
		          <Label>Papel</Label>
		          <NativeSelect bind:value={formCadastro.papel} disabled={cadastroSalvando}>
	            {#each papeis as papel}
	              <option value={papel}>{papel.replaceAll("_", " ")}</option>
	            {/each}
		          </NativeSelect>
		        </div>
	        <div class="grid gap-3 rounded-lg border bg-muted/40 p-3">
	          <Label>Empresas</Label>
	          <div class="grid gap-2 sm:grid-cols-2">
	            {#each empresasDisponiveis as empresa}
	              <label class="flex items-center gap-2 text-sm font-semibold">
	                <Checkbox checked={formCadastro.empresaIds.includes(empresa.id)} disabled={cadastroSalvando} onCheckedChange={(marcado) => alternarEmpresaCadastro(empresa.id, Boolean(marcado))} />
	                {empresa.nome}
	              </label>
	            {/each}
	          </div>
	        </div>
		        <div class="grid gap-2">
		          <Label>Setor</Label>
	          <NativeSelect bind:value={formCadastro.setorId} disabled={cadastroSalvando}>
	            <option value="">Sem setor</option>
	            {#each opcoesEmpresa?.setores ?? [] as setor}
	              <option value={setor.id}>{setor.nome}</option>
	            {/each}
	          </NativeSelect>
	        </div>
	        {#if !cadastroEditandoId}
	          <div class="grid gap-2">
	            <Label>Senha</Label>
	            <Input type="password" minlength={8} bind:value={formCadastro.senha} disabled={cadastroSalvando} />
	          </div>
	        {/if}
		      {:else if cadastroTela === "permissoes"}
	        <div class="grid gap-2">
	          <Label>Tipo de permissao</Label>
	          <NativeSelect bind:value={formCadastro.tipoPermissao} onchange={atualizarAlvoPermissao} disabled={cadastroSalvando}>
	            <option value="setor">Por setor</option>
	            <option value="papel">Por papel</option>
	            <option value="usuario">Por usuario</option>
	          </NativeSelect>
	        </div>
	        {#if formCadastro.tipoPermissao === "papel"}
	          <div class="grid gap-2">
	            <Label>Papel</Label>
	            <NativeSelect bind:value={formCadastro.papel} onchange={atualizarAlvoPermissao} disabled={cadastroSalvando}>
	              {#each papeis as papel}
	                <option value={papel}>{papel.replaceAll("_", " ")}</option>
	              {/each}
	            </NativeSelect>
	          </div>
	        {:else if formCadastro.tipoPermissao === "setor"}
	          <div class="grid gap-2">
	            <Label>Setor</Label>
	            <NativeSelect bind:value={formCadastro.setorId} onchange={atualizarAlvoPermissao} disabled={cadastroSalvando}>
	              {#each opcoesEmpresa?.setores ?? [] as setor}
	                <option value={setor.id}>{setor.nome}</option>
	              {/each}
	            </NativeSelect>
	          </div>
	        {:else}
	          <div class="grid gap-2">
	            <Label>Usuario</Label>
	            <NativeSelect bind:value={formCadastro.usuarioId} onchange={atualizarAlvoPermissao} disabled={cadastroSalvando}>
	              {#each opcoesEmpresa?.usuarios ?? [] as usuario}
	                <option value={usuario.usuarioId}>{usuario.nome ?? usuario.email}</option>
	              {/each}
	            </NativeSelect>
	          </div>
	        {/if}
	        <div class="grid gap-3">
	          {#each secoesPermissoes as secao}
	            {@const itensSecao = permissoesDaSecao(secao)}
	            {#if itensSecao.length}
	              <section class="grid gap-3 rounded-lg border bg-muted/40 p-3">
	                <h3 class="text-sm font-bold">{secao.titulo}</h3>
	                <div class="grid gap-3 sm:grid-cols-2">
	                  {#each itensSecao as permissao}
	                    <label class="flex items-center gap-2 text-sm font-semibold">
	                      <Checkbox checked={formCadastro.permissoes.includes(permissao)} disabled={cadastroSalvando} onCheckedChange={(marcado) => alternarPermissao(permissao, Boolean(marcado))} />
	                      {permissao.replaceAll("_", " ")}
	                    </label>
	                  {/each}
	                </div>
	              </section>
	            {/if}
	          {/each}
	        </div>
	      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalCadastroAberto = false)} disabled={cadastroSalvando}>Cancelar</Button>
      <Button onclick={salvarCadastro} disabled={cadastroSalvando}>{cadastroSalvando ? "Salvando..." : "Salvar"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modalTemaAberto}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Aparencia</Dialog.Title>
      <Dialog.Description>Cores editaveis por pagina/secao.</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-3 py-2">
      <div class="grid gap-2">
        <Label>Pagina/secao</Label>
        <NativeSelect bind:value={temaTelaEdicao} onchange={() => abrirTema(temaTelaEdicao)} disabled={temaSalvando}>
          {#each telasPermitidas as tela}
            <option value={tela.id}>{tela.titulo}</option>
          {/each}
        </NativeSelect>
      </div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Primaria</Label><Input type="color" bind:value={tema.corPrimaria} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Secundaria</Label><Input type="color" bind:value={tema.corSecundaria} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Fundo</Label><Input type="color" bind:value={tema.corFundo} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Cartao</Label><Input type="color" bind:value={tema.corCartao} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Sucesso</Label><Input type="color" bind:value={tema.corSucesso} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Aviso</Label><Input type="color" bind:value={tema.corAviso} disabled={temaSalvando} /></div>
      <div class="grid grid-cols-[1fr_120px] items-center gap-3"><Label>Erro</Label><Input type="color" bind:value={tema.corErro} disabled={temaSalvando} /></div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (modalTemaAberto = false)} disabled={temaSalvando}>Cancelar</Button>
      <Button onclick={salvarTema} disabled={temaSalvando}>{temaSalvando ? "Salvando..." : "Salvar tema"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

