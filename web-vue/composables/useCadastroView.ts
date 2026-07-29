import { toValue, type MaybeRefOrGetter, type Ref } from "vue";
import type { Permissao } from "@padaria/shared";
import type { CadastroForm, Opcao, Opcoes, PermissoesPaginadas, TreeItem } from "~/types/padaria";
import { dinheiro, permissoes, permissoesOcultasNaTela, secoesPermissoes } from "~/utils/domain";

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
    if (tela === "contas") return listas.contas.map((item) => ({ id: item.id, nome: item.nome }));
    if (tela === "formas_pagamento") return listas.formasPagamento.map((item) => ({ id: item.id, nome: item.nome }));
    if (tela === "pdv")
      return listas.pdvs.map((item) => ({
        id: item.id,
        nome: item.nome,
        conta: listas.contas.find((conta) => conta.id === item.contaId)?.nome ?? "",
        contaId: item.contaId,
        ativo: item.ativo === false ? "Nao" : "Sim"
      }));
    if (tela === "fornecedores")
      return listas.fornecedores.map((item) => ({ id: item.id, nome: item.nome, documento: item.documento }));
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
        ativo: item.ativo === false ? "Nao" : "Sim"
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
    if (tela === "malotes")
      // O malote E o lacre (D3): lista por lacre + valor + status (sem codigo, sem saco). O status
      // cru vai para a celula; o CadastroTable pinta o chip (disponivel/em uso/devolvido).
      return listas.malotes.map((item) => ({
        id: item.id,
        lacre: item.numeroLacre ?? "",
        valor: dinheiro(item.valor ?? 0),
        status: item.status ?? ""
      }));
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
        ...listas.areas.map((item) => ({ id: item.id, nome: item.nome, tipo: "Area", tipoAreaSetor: "area" })),
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
      empresas: "Empresas disponiveis no sistema.",
      contas: "Contas usadas nos lancamentos financeiros.",
      formas_pagamento: "Formas de pagamento usadas nas vendas.",
      grupos: "Hierarquia de grupos de despesas, mercadorias e retiradas.",
      unidades: "Unidades de medida usadas nos produtos.",
      patrimonio: "Grupos (sigla) e itens de patrimonio. O grupo classifica maquinario na discriminacao.",
      turnos: "Turnos de trabalho (ex.: Manha 06:00-14:00). Pre-selecionam o turno na abertura do caixa.",
      areas_setores: "Areas e setores organizacionais.",
      usuarios: "Usuarios e acessos do sistema.",
      permissoes: "Permissoes por cargo, setor ou usuario.",
      malotes: "Cada malote e o seu lacre.",
      colaboradores: "Cadastro de colaboradores.",
      fornecedores: "Cadastro de fornecedores.",
      clientes: "Cadastro de clientes.",
      produtos: "Cadastro de produtos.",
      pdv: "Pontos de venda vinculados a uma conta de caixa."
    };
    return descricoes[tela] ?? "Cadastro operacional.";
  }

  function colunasCadastro(tela: string) {
    const colunas: Record<string, string[]> = {
      empresas: ["Nome", "CNPJ"],
      contas: ["Nome"],
      formas_pagamento: ["Nome"],
      pdv: ["Nome", "Conta", "Ativo"],
      grupos: ["Nome", "Tipo"],
      unidades: ["Nome", "Sigla"],
      patrimonio: ["Tipo", "Sigla", "Nome", "Marca", "Setor"],
      turnos: ["Nome", "Inicio", "Fim", "Ativo"],
      areas_setores: ["Nome", "Tipo"],
      usuarios: ["Nome", "Email", "Role", "Cargos"],
      permissoes: ["Tipo", "Alvo", "Regras"],
      malotes: ["Lacre", "Valor", "Status"],
      colaboradores: ["Nome", "CPF", "Cargo", "Setor"],
      fornecedores: ["Nome", "Documento"],
      clientes: ["Nome", "Documento"],
      produtos: ["Codigo", "Nome", "Marca", "Unidade", "Preco atual"]
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

  function permissoesDaSecao(secao: (typeof secoesPermissoes)[number]) {
    const usadas = new Set(Object.keys(params.formCadastro.value.regras));
    return permissoes
      .filter((permissao) => {
        if (secao.prefixos.length) return secao.prefixos.some((prefixo) => permissao.startsWith(prefixo));
        return !secoesPermissoes.some(
          (outra) => outra.prefixos.length && outra.prefixos.some((prefixo) => permissao.startsWith(prefixo))
        );
      })
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
