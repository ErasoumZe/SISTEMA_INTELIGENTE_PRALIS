// Atualizacao local das listas de opcoes apos salvar um cadastro (mapeamento tela->item + upsert
// nas listas reativas), extraida do AppWorkspace via INJECAO DE DEPENDENCIA (ADR-005). O componente
// injeta getters do estado (opcoes/empresas/empresaId) e o callback de permissoes; a factory muta
// os arrays recebidos (mesma referencia reativa), entao testa-se com listas fake sem runtime Nuxt.
import type { CadastroForm, Opcao, Opcoes } from "~/types/padaria";
import { documentoEhCpf } from "~/utils/formatacao";

// Upsert por id: substitui mesclando se existir, senao insere no topo (mesmo comportamento do
// componente original — item recem-salvo aparece primeiro na lista).
export function upsertOpcao(lista: Opcao[], item: Opcao) {
  const indice = lista.findIndex((opcao) => opcao.id === item.id);
  if (indice >= 0) lista.splice(indice, 1, { ...lista[indice], ...item });
  else lista.unshift(item);
}

export function removerOpcao(lista: Opcao[], id: string) {
  const indice = lista.findIndex((opcao) => opcao.id === id);
  if (indice >= 0) lista.splice(indice, 1);
}

export function listaGrupoCadastro(opcoes: Opcoes, tipoGrupo: CadastroForm["tipoGrupo"]) {
  if (tipoGrupo === "mercadoria") return opcoes.gruposMercadorias;
  if (tipoGrupo === "retirada") return opcoes.gruposRetiradas;
  if (tipoGrupo === "vendas") return opcoes.gruposVendas;
  return opcoes.gruposDespesas;
}

export type DepsCadastroLocal = {
  empresaId: () => string;
  opcoes: () => Opcoes;
  empresas: () => Opcao[];
  onPermissoesSalvas: () => void;
};

export function criarAtualizadorCadastroLocal(deps: DepsCadastroLocal) {
  // Retorna true se atualizou a lista local; false quando o chamador deve recarregar da API
  // (produtos: muitos campos/satelites; usuario que criou colaborador novo; tela nao mapeada).
  function atualizarCadastroLocal(tela: string, form: CadastroForm, id: string | undefined): boolean {
    if (!id) return false;
    const opcoes = deps.opcoes();
    const empresaAtual = deps.empresaId();
    const empresaDoItem = tela === "empresas" ? undefined : empresaAtual;
    const itemBase: Opcao = { id, ...(empresaDoItem ? { empresaId: empresaDoItem } : {}) };

    if (tela === "empresas") {
      const item = { ...itemBase, nome: form.nome, cnpj: form.cnpj || null };
      upsertOpcao(deps.empresas(), item);
      upsertOpcao(opcoes.empresas, item);
      return true;
    }

    if (tela === "contas") {
      // Fundo, saldo derivado e vínculos vêm do endpoint agregado. Atualizar só id/nome aqui
      // descartava saldoInicial/usuariosIds do cache; a edição seguinte reabria 0/[] e então
      // sobrescrevia no banco dados que tinham sido salvos corretamente no primeiro PUT.
      return false;
    }

    if (tela === "formas_pagamento") {
      upsertOpcao(opcoes.formasPagamento, { ...itemBase, nome: form.nome });
      return true;
    }

    if (tela === "pdv") {
      upsertOpcao(opcoes.pdvs, { ...itemBase, nome: form.nome, contaId: form.contaId, ativo: form.ativo });
      return true;
    }

    if (tela === "fornecedores") {
      upsertOpcao(opcoes.fornecedores, { ...itemBase, nome: form.nome, documento: form.documento || undefined });
      return true;
    }

    if (tela === "clientes") {
      upsertOpcao(opcoes.clientes, {
        ...itemBase,
        nome: form.nome,
        documento: form.documento || undefined,
        dataNascimento: documentoEhCpf(form.documento) ? form.dataNascimento || undefined : undefined,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        cep: form.cep || undefined,
        rua: form.rua || undefined,
        numero: form.numero || undefined,
        complemento: form.complemento || undefined,
        bairro: form.bairro || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined
      });
      return true;
    }

    if (tela === "produtos") {
      // Produto tem muitos campos (comercial, como se compra, e satelites fiscal/transformacao/promocao).
      // Em vez de espelhar tudo aqui (fragil e fonte de bug: campos editados "somem" ao reabrir),
      // retorna false para recarregar da API e refletir exatamente o que foi gravado.
      return false;
    }

    if (tela === "colaboradores") {
      const cargo = opcoes.cargos.find((opcao) => opcao.id === form.cargoId);
      const setor = opcoes.setores.find((opcao) => opcao.id === form.setorId);
      upsertOpcao(opcoes.colaboradores, {
        ...itemBase,
        nome: form.nome,
        cpf: form.cpf || undefined,
        setorId: form.setorId || null,
        descricao: setor?.nome ?? setor?.descricao,
        cargoId: form.cargoId,
        cargoIds: [form.cargoId],
        cargoNome: cargo?.nome,
        cargos: cargo?.nome ? [cargo.nome] : []
      });
      return true;
    }

    if (tela === "unidades") {
      upsertOpcao(opcoes.unidadesMedida, { ...itemBase, nome: form.nome, sigla: form.sigla });
      return true;
    }

    if (tela === "grupos") {
      [opcoes.gruposDespesas, opcoes.gruposMercadorias, opcoes.gruposRetiradas, opcoes.gruposVendas].forEach((lista) =>
        removerOpcao(lista, id)
      );
      upsertOpcao(listaGrupoCadastro(opcoes, form.tipoGrupo), {
        ...itemBase,
        nome: form.nome,
        tipoGrupo: form.tipoGrupo,
        grupoPaiId: form.grupoPaiId || null
      });
      return true;
    }

    if (tela === "areas_setores") {
      removerOpcao(opcoes.areas, id);
      removerOpcao(opcoes.setores, id);
      if (form.tipoAreaSetor === "setor") {
        upsertOpcao(opcoes.setores, {
          ...itemBase,
          nome: form.nome,
          tipoAreaSetor: "setor",
          areaId: form.areaId || null,
          setorPaiId: form.setorPaiId || null
        });
      } else {
        upsertOpcao(opcoes.areas, { ...itemBase, nome: form.nome, tipoAreaSetor: "area" });
      }
      return true;
    }

    if (tela === "usuarios") {
      if (form.novoColaborador) return false;
      const empresaIds = form.empresaIds.length ? form.empresaIds : [empresaAtual].filter(Boolean);
      const usuarioAtual = opcoes.usuarios.find((opcao) => (opcao.usuarioId ?? opcao.id) === id);
      const colaboradorAnterior = opcoes.colaboradores.find((opcao) => opcao.id === usuarioAtual?.colaboradorId);
      const colaborador = opcoes.colaboradores.find((opcao) => opcao.id === form.colaboradorId);
      if (colaboradorAnterior && colaboradorAnterior.id !== colaborador?.id) colaboradorAnterior.usuarioId = undefined;
      upsertOpcao(opcoes.usuarios, {
        ...itemBase,
        usuarioId: id,
        empresaIds,
        empresaId: empresaIds[0] ?? empresaAtual,
        nome: form.nome,
        email: form.email,
        colaboradorId: form.colaboradorId,
        setorId: colaborador?.setorId ?? null,
        cargos: colaborador?.cargos ?? (colaborador?.cargoNome ? [colaborador.cargoNome] : [])
      });
      if (colaborador) colaborador.usuarioId = id;
      return true;
    }

    if (tela === "permissoes") {
      deps.onPermissoesSalvas();
      return true;
    }

    return false;
  }

  return { atualizarCadastroLocal };
}
