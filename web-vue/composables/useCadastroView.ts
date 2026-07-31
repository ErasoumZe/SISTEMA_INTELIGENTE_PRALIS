import { toValue, type MaybeRefOrGetter, type Ref } from "vue";
import type { Permissao } from "@padaria/shared";
import type { CadastroForm, Opcao, Opcoes, PermissoesPaginadas, TreeItem } from "~/types/padaria";
import { dinheiro, permissaoPertenceASecao, permissoes, permissoesOcultasNaTela } from "~/utils/domain";
import type { SecaoPermissao } from "~/utils/domain";

type LinhaCadastro = Record<string, string | undefined>;

export function useCadastroView(params: {
  opcoes: MaybeRefOrGetter<Opcoes>;
  opcoesEmpresa: MaybeRefOrGetter<Opcoes>;
  empresas: MaybeRefOrGetter<Opcao[]>;
  permissoesPagina: MaybeRefOrGetter<PermissoesPaginadas>;
  formCadastro: Ref<CadastroForm>;
}) {
  function dadosCadastro(tela: string): LinhaCadastro[] {
    const listas = tela === "empresas" ? toValue(params.opcoes) : toValue(params.opcoesEmpresa);
    if (tela === "empresas")
      return toValue(params.empresas).map((item) => ({
        id: item.id,
        nome: item.nome ?? "",
        cnpj: item.cnpj ? String(item.cnpj) : undefined
      }));
    if (tela === "contas")
      return listas.contas.map((item) => ({
        id: item.id,
        nome: item.nome,
        // Fundo e Saldo atual vem de /api/contas/saldos (D8). O saldo NAO e coluna: e derivado dos
        // movimentos a cada carga — por isso nao ha "atualizar saldo" em lugar nenhum.
        fundo: dinheiro(item.saldoInicial ?? 0),
        saldoAtual: dinheiro(item.saldoAtual ?? 0),
        saldoInicial: item.saldoInicial != null ? String(item.saldoInicial) : "",
        usuariosIds: (item.usuariosIds ?? []).join(",")
      }));
    if (tela === "formas_pagamento") return listas.formasPagamento.map((item) => ({ id: item.id, nome: item.nome }));
    if (tela === "pdv")
      return listas.pdvs.map((item) => ({
        id: item.id,
        nome: item.nome,
        conta: listas.contas.find((conta) => conta.id === item.contaId)?.nome ?? "",
        contaId: item.contaId,
        ativo: item.ativo === false ? "Não" : "Sim"
      }));
    if (tela === "fornecedores")
      return listas.fornecedores.map((item) => ({ id: item.id, nome: item.nome, documento: item.documento }));
    if (tela === "socios_gestores")
      return listas.sociosGestores.map((item) => ({
        id: item.id,
        nome: item.nome,
        ativo: item.ativo === false ? "Não" : "Sim"
      }));
    if (tela === "maquininhas")
      return listas.maquininhas.map((item) => ({
        id: item.id,
        nome: item.apelido ?? item.nome,
        numeroSerie: item.numeroSerie,
        ativo: item.ativo === false ? "Não" : "Sim"
      }));
    if (tela === "clientes")
      return listas.clientes.map((item) => ({
        id: item.id,
        nome: item.nome,
        documento: item.documento,
        dataNascimento: item.dataNascimento,
        whatsapp: item.whatsapp,
        email: item.email,
        cep: item.cep,
        rua: item.rua,
        numero: item.numero,
        complemento: item.complemento,
        bairro: item.bairro,
        cidade: item.cidade,
        estado: item.estado
      }));
    if (tela === "produtos")
      return listas.produtos.map((item) => ({
        id: item.id,
        nome: item.descricao,
        descricao: item.descricao,
        codigo: item.codigo,
        codigoBarras: item.codigoBarras,
        marca: item.marca ?? "",
        grupoMercadoriaId: item.grupoMercadoriaId ?? "",
        unidadeIndividualId: item.unidadeIndividualId ?? item.unidadeMedidaId ?? "",
        unidade:
          listas.unidadesMedida.find((unidade) => unidade.id === (item.unidadeIndividualId ?? item.unidadeMedidaId))
            ?.sigla ?? "",
        quantidadeIndividual: String(item.quantidadeIndividual ?? "1"),
        embalagem: item.embalagem ?? "",
        cDe: item.cDe ?? "",
        quantidadeCaixa: String(item.quantidadeCaixa ?? "1"),
        medidaCompra: item.medidaCompra ?? "",
        custo: item.custo != null ? String(item.custo) : "",
        margem: item.margem != null ? String(Number(item.margem) * 100) : "",
        precoVenda: item.precoVenda != null ? String(item.precoVenda) : "",
        preco_atual: item.precoVendaAtual != null ? dinheiro(item.precoVendaAtual) : "-",
        auto: item.auto ? "true" : "false",
        status: item.status ?? "ativo",
        tipo: item.tipo ?? "revenda",
        quantidadeEstoque: String(item.quantidadeEstoque ?? "0"),
        estoqueMin: item.estoqueMin != null ? String(item.estoqueMin) : "",
        estoqueMax: item.estoqueMax != null ? String(item.estoqueMax) : "",
        setorEstoque: item.setorEstoque ?? "",
        localVenda1: item.localVenda1 ?? "",
        localVenda2: item.localVenda2 ?? "",
        fotoUrl: item.fotoUrl ?? "",
        fiscal: JSON.stringify(item.fiscal ?? null),
        transformacao: JSON.stringify(item.transformacao ?? null),
        promocoes: JSON.stringify(item.promocoes ?? []),
        conversoes: JSON.stringify(item.conversoes ?? [])
      }));
    if (tela === "colaboradores")
      return listas.colaboradores.map((item) => ({
        id: item.id,
        nome: item.nome,
        cpf: item.cpf,
        setor: item.descricao,
        setorId: item.setorId ?? undefined,
        turnoPadraoId: item.turnoPadraoId ?? undefined,
        cargo: item.cargos?.[0] ?? item.cargoNome ?? "",
        cargoId: item.cargoIds?.[0] ?? item.cargoId ?? ""
      }));
    if (tela === "unidades")
      return listas.unidadesMedida.map((item) => ({ id: item.id, nome: item.nome, sigla: item.sigla }));
    // Patrimonio (D2): uma tabela so com os GRUPOS (sigla) e os ITENS abaixo, cada linha sabendo o
    // que e — a coluna Tipo. Grupo alimenta o campo Grupo da discriminacao de maquinario (§5).
    if (tela === "patrimonio")
      return [
        ...listas.gruposPatrimonio.map((item) => ({
          id: item.id,
          tipo: "Grupo",
          sig: item.sig ?? "",
          nome: item.nome ?? "",
          marca: "",
          setor: "",
          tipoPatrimonio: "grupo"
        })),
        ...listas.patrimonioItens.map((item) => ({
          id: item.id,
          tipo: "Item",
          sig: item.sig ?? "",
          nome: item.nome ?? "",
          marca: item.marca ?? "",
          setor: item.descricao ?? "",
          grupoPatrimonioId: item.grupoPatrimonioId ?? "",
          setorId: item.setorId ?? "",
          tipoPatrimonio: "item"
        }))
      ];
    if (tela === "turnos")
      return listas.turnos.map((item) => ({
        id: item.id,
        nome: item.nome ?? "",
        inicio: (item.horaInicio ?? "").slice(0, 5),
        fim: (item.horaFim ?? "").slice(0, 5),
        ativo: item.ativo === false ? "Não" : "Sim"
      }));
    if (tela === "usuarios")
      return listas.usuarios.map((item) => ({
        id: item.usuarioId ?? item.id,
        usuarioId: item.usuarioId ?? item.id,
        nome: item.nome,
        email: item.email,
        role: item.role,
        colaboradorId: item.colaboradorId,
        cargos: item.cargos?.join(", ") ?? "",
        setor: item.descricao,
        setorId: item.setorId ?? undefined
      }));
    if (tela === "permissoes")
      return toValue(params.permissoesPagina)
        .itens.map(removerPermissoesOcultasDaLinha)
        .filter((linha): linha is LinhaCadastro => Boolean(linha));
    if (tela === "grupos") {
      return [
        ...listas.gruposDespesas.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: "Despesa",
          tipoGrupo: "despesa",
          grupoPaiId: item.grupoPaiId ?? ""
        })),
        ...listas.gruposMercadorias.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: "Mercadoria",
          tipoGrupo: "mercadoria",
          grupoPaiId: item.grupoPaiId ?? ""
        })),
        ...listas.gruposRetiradas.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: "Retirada",
          tipoGrupo: "retirada",
          grupoPaiId: item.grupoPaiId ?? ""
        })),
        ...listas.gruposVendas.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: "Vendas",
          tipoGrupo: "vendas",
          grupoPaiId: item.grupoPaiId ?? ""
        }))
      ];
    }
    if (tela === "areas_setores") {
      return [
        ...listas.areas.map((item) => ({ id: item.id, nome: item.nome, tipo: "Área", tipoAreaSetor: "area" })),
        ...listas.setores.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: "Setor",
          tipoAreaSetor: "setor",
          areaId: item.areaId ?? "",
          setorPaiId: item.setorPaiId ?? ""
        }))
      ];
    }
    return [];
  }

  function descricaoTela(tela: string) {
    const descricoes: Record<string, string> = {
      empresas: "Empresas disponíveis no sistema.",
      contas: "Contas usadas nos lançamentos financeiros.",
      formas_pagamento: "Formas de pagamento usadas nas vendas.",
      grupos: "Hierarquia de grupos de despesas, mercadorias e retiradas.",
      unidades: "Unidades de medida usadas nos produtos.",
      patrimonio: "Grupos (sigla) e itens de patrimônio. O grupo classifica maquinário na discriminação.",
      turnos: "Turnos de trabalho (ex.: Manhã 06:00-14:00). Pré-selecionam o turno na abertura do caixa.",
      areas_setores: "Áreas e setores organizacionais.",
      usuarios: "Usuários e acessos do sistema.",
      permissoes: "Permissões por cargo, setor ou usuário.",
      colaboradores: "Cadastro de colaboradores.",
      fornecedores: "Cadastro de fornecedores.",
      socios_gestores: "Cadastro de sócios e gestores que podem ser credores de retiradas.",
      maquininhas: "Equipamentos de cartão disponíveis para vínculo opcional na abertura do caixa.",
      clientes: "Cadastro de clientes.",
      produtos: "Cadastro de produtos.",
      pdv: "Pontos de venda vinculados a uma conta de caixa."
    };
    return descricoes[tela] ?? "Cadastro operacional.";
  }

  function colunasCadastro(tela: string) {
    const colunas: Record<string, string[]> = {
      empresas: ["Nome", "CNPJ"],
      // Fundo = ponto de partida declarado; Saldo atual = derivado dos movimentos (D8).
      contas: ["Nome", "Fundo", "Saldo atual"],
      formas_pagamento: ["Nome"],
      pdv: ["Nome", "Conta", "Ativo"],
      grupos: ["Nome", "Tipo"],
      unidades: ["Nome", "Sigla"],
      patrimonio: ["Tipo", "Sigla", "Nome", "Marca", "Setor"],
      turnos: ["Nome", "Inicio", "Fim", "Ativo"],
      areas_setores: ["Nome", "Tipo"],
      usuarios: ["Nome", "Email", "Role", "Cargos"],
      permissoes: ["Tipo", "Alvo", "Regras"],
      colaboradores: ["Nome", "CPF", "Cargo", "Setor"],
      fornecedores: ["Nome", "Documento"],
      socios_gestores: ["Nome", "Ativo"],
      maquininhas: ["Apelido", "Número de série", "Ativo"],
      clientes: ["Nome", "Documento"],
      produtos: ["Código", "Nome", "Marca", "Unidade", "Preço atual"]
    };
    return colunas[tela] ?? ["Nome"];
  }

  function ordenarArvore(itens: LinhaCadastro[], paiId = "", nivel = 0): TreeItem[] {
    return itens
      .filter((item) => parentIdArvore(item) === paiId)
      .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? "")))
      .flatMap((item) => [
        { id: item.id ?? "", nome: item.nome ?? "", detalhe: item.tipo, nivel, item },
        ...ordenarArvore(itens, item.id ?? "", nivel + 1)
      ]);
  }

  function parentIdArvore(item: LinhaCadastro) {
    if (item.tipoAreaSetor === "setor") return item.setorPaiId || item.areaId || "";
    return item.grupoPaiId || "";
  }

  function treeGrupos() {
    return ordenarArvore(dadosCadastro("grupos"));
  }

  function treeAreasSetores() {
    return ordenarArvore(dadosCadastro("areas_setores"));
  }

  function regrasDaLinha(linha: LinhaCadastro) {
    try {
      const regras = JSON.parse(linha.regrasJson ?? linha.regras_json ?? "{}") as Record<string, boolean>;
      return Object.fromEntries(Object.entries(regras).filter(([, valor]) => typeof valor === "boolean"));
    } catch {
      return {};
    }
  }

  function permissaoEstaVisivel(permissao: string) {
    return Boolean(permissao) && !permissoesOcultasNaTela.has(permissao as Permissao);
  }

  function removerPermissoesOcultasDaLinha(linha: LinhaCadastro): LinhaCadastro | undefined {
    const regras = regrasDaLinha(linha);
    const entradasVisiveis = Object.entries(regras).filter(([permissao]) => permissaoEstaVisivel(permissao));

    if (entradasVisiveis.length) {
      return {
        ...linha,
        permissao: entradasVisiveis.map(([permissao]) => permissao).join(","),
        regras: entradasVisiveis
          .map(([permissao, permitir]) => `${permissao}: ${permitir ? "permitir" : "negar"}`)
          .join("; "),
        regrasJson: JSON.stringify(Object.fromEntries(entradasVisiveis))
      };
    }

    const permissoesVisiveis = (linha.permissao ?? "")
      .split(",")
      .map((permissao) => permissao.trim())
      .filter((permissao) => permissaoEstaVisivel(permissao));
    if (!permissoesVisiveis.length) return undefined;
    return { ...linha, permissao: permissoesVisiveis.join(",") };
  }

  function permissoesDaSecao(secao: SecaoPermissao) {
    const usadas = new Set(Object.keys(params.formCadastro.value.regras));
    return permissoes
      .filter((permissao) => permissaoPertenceASecao(permissao, secao))
      .sort((a, b) => {
        const pesoA = usadas.has(a) ? 0 : 1;
        const pesoB = usadas.has(b) ? 0 : 1;
        return pesoA - pesoB || a.localeCompare(b);
      });
  }

  function estadoRegraPermissao(permissao: string) {
    const valor = params.formCadastro.value.regras[permissao];
    if (valor === true) return "permitir";
    if (valor === false) return "negar";
    return "herdar";
  }

  function definirRegraPermissao(permissao: string, estado: string) {
    const regras = { ...params.formCadastro.value.regras };
    if (estado === "permitir") regras[permissao] = true;
    else if (estado === "negar") regras[permissao] = false;
    else delete regras[permissao];
    params.formCadastro.value.regras = regras;
  }

  return {
    dadosCadastro,
    descricaoTela,
    colunasCadastro,
    treeGrupos,
    treeAreasSetores,
    regrasDaLinha,
    permissoesDaSecao,
    estadoRegraPermissao,
    definirRegraPermissao
  };
}
