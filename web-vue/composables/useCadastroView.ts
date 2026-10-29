import { toValue, type MaybeRefOrGetter, type Ref } from "vue";
import type { Permissao } from "@padaria/shared";
import type { CadastroForm, Opcao, Opcoes, PermissoesPaginadas, TreeItem } from "~/types/padaria";
import { rotuloDiaSemanaCurto } from "~/utils/admissoes";
import { dinheiro, permissaoPertenceASecao, permissoes, permissoesOcultasNaTela } from "~/utils/domain";
import { mascararWhatsapp } from "~/utils/formatacao";
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
        cnpj: item.cnpj ? String(item.cnpj) : undefined,
        // Projetados porque o formulario de EDICAO e montado desta linha (`formCadastroDeLinha`): o
        // campo que nao chega aqui reabre com o default e o salvar seguinte grava esse default em
        // cima do valor correto. Sem isto, corrigir o nome da empresa zerava o prazo de cotacao e
        // devolvia o fuso para America/Sao_Paulo (fio-edicao-empresa.test.ts).
        matriculaPrefixo: item.matriculaPrefixo ?? undefined,
        fusoHorario: item.fusoHorario ?? undefined,
        comprasPrazoRespostaHoras:
          item.comprasPrazoRespostaHoras === null || item.comprasPrazoRespostaHoras === undefined
            ? undefined
            : String(item.comprasPrazoRespostaHoras)
      }));
    if (tela === "contas")
      return listas.contas.map((item) => ({
        id: item.id,
        nome: item.nome,
        // Fundo e Saldo atual vem de /api/contas/saldos (D8). O saldo NAO e coluna: e derivado dos
        // movimentos a cada carga — por isso nao ha "atualizar saldo" em lugar nenhum.
        //
        // #172 · As chaves EXIBIDAS sao as que `chaveColuna` deriva do rotulo da coluna, nao o nome
        // do campo da API. "Saldo atual" deriva `saldo_atual`; gravar `saldoAtual` aqui fazia a
        // celula cair no travessao com o numero certo ja carregado. `saldoInicial` cru continua
        // camelCase de proposito: e o campo do FORMULARIO de edicao, nao uma coluna da tabela.
        fundo: dinheiro(item.saldoInicial ?? 0),
        saldo_atual: dinheiro(item.saldoAtual ?? 0),
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
        ativo: item.ativo === false ? "Não" : "Sim",
        // R-229 · coluna exibida e campo do formulario de edicao.
        turnos_do_caixa: (item.turnosCaixa ?? []).map((turno) => (turno === "manha" ? "Manhã" : "Tarde")).join(", "),
        turnosCaixa: (item.turnosCaixa ?? []).join(",")
      }));
    if (tela === "fornecedores")
      return listas.fornecedores.map((item) => ({
        id: item.id,
        nome: item.nome,
        documento: item.documento,
        whatsapp: item.whatsapp ? mascararWhatsapp(item.whatsapp) : undefined,
        // Projetado para a edicao preservar a situacao: sem isto, editar o nome reabriria o form com
        // o default e o salvar seguinte reativaria um fornecedor inativo (R-219).
        ativo: item.situacao === "inativo" ? "Não" : "Sim"
      }));
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
        // Colunas da tabela: a chave e a que `chaveColuna` deriva do rotulo ("Apelido", "Número de série").
        // `nome`/`numeroSerie` continuam para o formulario de edicao.
        apelido: item.apelido ?? item.nome,
        numero_de_serie: item.numeroSerie,
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
    if (tela === "colaboradores")
      return listas.colaboradores.map((item) => ({
        id: item.id,
        nome: item.nome,
        vinculoAtivoId: item.vinculoAtivoId ?? undefined,
        // LinhaCadastro e a grade generica usam valores textuais. O dominio continua booleano
        // na API; esta e somente a serializacao de apresentacao da tela DP.
        temVinculoHistorico: item.temVinculoHistorico ? "sim" : "nao",
        matricula: item.matricula ?? "",
        funcaoNome: item.funcaoNome ?? ""
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
        // ADM-003 V1B. `etiqueta` e `dias` vazios significam TURNO INCOMPLETO — ele continua valido
        // no cadastro, mas nao pode ser escolhido numa admissao. A grade mostra isso para o DP saber
        // o que falta preencher, em vez de descobrir na hora de admitir.
        etiquetaTurno: item.etiqueta ?? "",
        etiqueta: item.etiqueta ?? "—",
        dias: item.diasSemana?.length ? item.diasSemana.map(rotuloDiaSemanaCurto).join(", ") : "—",
        diasSemanaTurno: (item.diasSemana ?? []).join(","),
        ativo: item.ativo === false ? "Não" : "Sim"
      }));
    if (tela === "usuarios")
      return listas.usuarios.map((item) => ({
        id: item.usuarioId ?? item.id,
        usuarioId: item.usuarioId ?? item.id,
        nome: item.nome,
        email: item.email,
        // Projetado pelo mesmo motivo do fuso da empresa: `cadastroPayload` manda
        // `form.whatsapp || null`, entao linha sem telefone = formulario vazio = PUT que apaga o
        // numero gravado (fio-edicao-usuario.test.ts).
        whatsapp: item.whatsapp,
        role: item.role,
        perfil:
          item.role === "usuario_admin"
            ? "Administrador total"
            : item.role === "admin"
              ? "Admin legado"
              : "Usuário comum",
        // `empresaIds` NAO e projetado de proposito. O `GET /api/usuarios` recorta esse campo ao
        // escopo da TELA (usuarios.service.ts, `recortarUsuariosPorEmpresas`), entao para um usuario
        // A+B visto na empresa A ele vale `["A"]` — e o contrato de isolamento exige que seja assim
        // (tests/integration/usuarios/metadados-cross-tenant.test.ts). Trazer esse valor truncado para
        // o formulario faria o salvar reenviar `["A"]` e a substituicao total apagaria a empresa B,
        // agora com a tela mostrando "empresa A marcada" e nenhum sinal de que algo se perdeu.
        //
        // Sem o campo, o formulario fica com a lista VAZIA e o payload OMITE `empresaIds`
        // (shared/src/cadastros/index.ts) — o servidor entao PRESERVA os vinculos gravados.
        colaboradorId: item.colaboradorId,
        // R-229 · posto do Caixa (PDV · turno): coluna exibida e valor "pdvId|turno" do formulario.
        posto_do_caixa:
          item.postoPdvId && item.postoTurnoCaixa
            ? `${listas.pdvs.find((pdv) => pdv.id === item.postoPdvId)?.nome ?? "PDV"} · ${
                item.postoTurnoCaixa === "manha" ? "Manhã" : "Tarde"
              }`
            : "",
        postoCaixa: item.postoPdvId && item.postoTurnoCaixa ? `${item.postoPdvId}|${item.postoTurnoCaixa}` : "",
        cargos: item.cargos?.join(", ") ?? "",
        setor: item.setorNome ?? item.descricao,
        setorId: item.setorId ?? undefined
      }));
    if (tela === "permissoes")
      return toValue(params.permissoesPagina)
        .itens.map(removerPermissoesOcultasDaLinha)
        .filter((linha): linha is LinhaCadastro => Boolean(linha) && linha?.tipoPermissao !== "usuario");
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
      permissoes: "Perfis de acesso compartilhados por cargo ou setor.",
      colaboradores: "Perfis de colaboradores efetivados e seus vínculos.",
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
      pdv: ["Nome", "Conta", "Turnos do caixa", "Ativo"],
      grupos: ["Nome", "Tipo"],
      unidades: ["Nome", "Sigla"],
      patrimonio: ["Tipo", "Sigla", "Nome", "Marca", "Setor"],
      turnos: ["Nome", "Etiqueta", "Dias", "Inicio", "Fim", "Ativo"],
      areas_setores: ["Nome", "Tipo"],
      usuarios: ["Nome", "Email", "Perfil", "Posto do caixa", "Setor", "Cargos"],
      permissoes: ["Tipo", "Alvo", "Regras"],
      colaboradores: ["Nome", "CPF", "Cargo", "Setor"],
      fornecedores: ["Nome", "Documento", "WhatsApp"],
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
