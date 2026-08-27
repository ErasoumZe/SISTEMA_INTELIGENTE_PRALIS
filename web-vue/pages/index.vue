<script setup lang="ts">
import type { CaixaStatus } from "~/types/padaria";
import type { Notificacao } from "@padaria/shared/notificacoes";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import AppCabecalhoTela from "~/components/app/AppCabecalhoTela.vue";
import AppBlocosRelatorio from "~/components/app/AppBlocosRelatorio.vue";
import AppAtalhosTelas from "~/components/app/AppAtalhosTelas.vue";

/**
 * Traduz o que o painel JA tem em mao para o formato dos blocos. Nao busca nada: se o dado nao
 * chegou, sai `null` — que o bloco mostra como travessao, nunca como zero.
 *
 * `caixaStatus` e por EMPRESA e so e carregado para quem tem `caixa_operar` (AppWorkspace:1006).
 * Entao o numero aqui e "caixas abertos da empresa ativa", e vem `null` para quem gerencia sem
 * operar. As quatro caixas das duas empresas exigiriam duas chamadas ou rota nova: e Etapa 3.
 */
function dadosDosBlocos(caixaStatus: CaixaStatus | null | undefined, notificacoes: Notificacao[] | undefined) {
  return {
    caixasAbertos: caixaStatus ? (caixaStatus.caixaAberto ? 1 : 0) : null,
    pendencias: notificacoes ? notificacoes.filter((item) => !item.verificado).length : null
  };
}
</script>

<template>
  <!-- O slot padrao do AppWorkspace ja entrega o `pageContext`; daqui saem so as tres chaves que
       os atalhos consomem, sem recalcular permissao nenhuma. -->
  <AppWorkspace v-slot="ctx" tipo-pagina="inicio">
    <section class="inicio-painel">
      <!-- O cartao de hero (logo grande + "Bem-vindo ao Painel" numa caixa com luz de fundo) SAIU.
           Tres motivos, nesta ordem:
           1. a logo ja vive na sidebar — era a marca duas vezes na mesma tela, e o item 2 do DoD
              proibe segundo caminho para o mesmo ato;
           2. com os blocos preenchendo a tela o cartao virou ocupacao de espaco sem funcao: em
              390px ele empurrava o conteudo real para baixo da dobra;
           3. depois do VIS-10 as 27 telas abrem com o MESMO cabecalho. A home tinha um formato
              proprio, e um lugar destoando e o que faz o conjunto parecer inacabado.
           O TEXTO nao foi inventado nem trocado: "Bem-vindo ao Painel" e o mesmo `<h1>` que estava
           no hero, agora no cabecalho comum.
           Consequencia assumida: o conserto do VIS-13 (logo certa por tema) morre junto com o
           elemento que ele consertava. Estava certo enquanto o hero existiu. -->
      <AppCabecalhoTela titulo="Bem-vindo ao Painel" />

      <!-- Faixa de relatorios ACIMA dos atalhos. Sem nenhuma das quatro permissoes ela nao existe,
           nem o titulo. O `temPermissao` que desce e o MESMO do workspace. -->
      <AppBlocosRelatorio
        :tem-permissao="ctx.temPermissao"
        :dados="dadosDosBlocos(ctx.caixaStatus, ctx.notificacoesPainel)"
      />

      <AppAtalhosTelas
        :telas="ctx.telasMenu"
        :desabilitadas="ctx.telasMenuDesabilitadas"
        :motivos="ctx.motivosTelasMenuDesabilitadas"
      />
    </section>
  </AppWorkspace>
</template>
