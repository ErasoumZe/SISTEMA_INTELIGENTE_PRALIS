import type { Permissao } from "@padaria/shared";
import { temPermissao as possuiPermissao } from "@padaria/shared";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { ItemMenu } from "~/types/padaria";
import {
  itemPorTela,
  motivoTelaDesabilitada,
  telaDependeCaixaAberto,
  telaDesabilitadaNoMenu,
  telaVisivelNoMenu,
  temAcessoTela
} from "~/utils/domain";

export function usePermissoes(
  permissoesUsuario: MaybeRefOrGetter<readonly Permissao[]>,
  caixaAberto: MaybeRefOrGetter<boolean>
) {
  const permissoesAtuais = computed(() => toValue(permissoesUsuario));
  const caixaEstaAberto = computed(() => toValue(caixaAberto));

  function temPermissao(permissao: Permissao) {
    return possuiPermissao(permissoesAtuais.value, permissao);
  }

  function podeAcessarTela(item: ItemMenu) {
    return temAcessoTela(permissoesAtuais.value, item);
  }

  function telaVisivel(item: ItemMenu) {
    return telaVisivelNoMenu(permissoesAtuais.value, item, caixaEstaAberto.value);
  }

  function dependeCaixaAberto(item: ItemMenu) {
    return telaDependeCaixaAberto(permissoesAtuais.value, item);
  }

  function telaDesabilitada(item: ItemMenu) {
    return telaDesabilitadaNoMenu(permissoesAtuais.value, item, caixaEstaAberto.value);
  }

  function motivoTelaDesabilitadaAtual(item: ItemMenu) {
    return motivoTelaDesabilitada(permissoesAtuais.value, item, caixaEstaAberto.value);
  }

  const telasPermitidas = computed(() => Object.values(itemPorTela).filter(telaVisivel));
  const telasDesabilitadasMenu = computed(() => telasPermitidas.value.filter(telaDesabilitada).map((item) => item.id));
  const motivosTelasDesabilitadas = computed(() =>
    Object.fromEntries(
      telasPermitidas.value.filter(telaDesabilitada).map((item) => [item.id, motivoTelaDesabilitadaAtual(item)])
    )
  );

  return {
    permissoesAtuais,
    temPermissao,
    podeAcessarTela,
    dependeCaixaAberto,
    telaVisivel,
    telaDesabilitada,
    motivoTelaDesabilitadaAtual,
    telasPermitidas,
    telasDesabilitadasMenu,
    motivosTelasDesabilitadas
  };
}
