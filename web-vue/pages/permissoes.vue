<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import PermissoesMenuEmpresa from "~/components/permissoes/PermissoesMenuEmpresa.vue";
import PermissoesUsuarioPage from "~/components/permissoes/PermissoesUsuarioPage.vue";

const route = useRoute();
const usuarioInicial = computed(() => (typeof route.query.usuario === "string" ? route.query.usuario : ""));
const aba = ref("pessoas");
</script>

<template>
  <AppWorkspace tela-inicial="permissoes" tipo-pagina="cadastro" v-slot="ctx">
    <AppCabecalhoTela :titulo="ctx.telaAtual?.titulo ?? 'Permissões'" />
    <v-tabs v-model="aba" class="mb-5" color="primary" align-tabs="start">
      <v-tab value="pessoas" prepend-icon="mdi-account-key-outline">Acessos por pessoa</v-tab>
      <v-tab value="menu" prepend-icon="mdi-menu-open">Montar menu</v-tab>
    </v-tabs>
    <v-window v-model="aba">
      <v-window-item value="pessoas">
        <PermissoesUsuarioPage :empresa-id="ctx.empresaId" :usuario-inicial="usuarioInicial" />
      </v-window-item>
      <v-window-item value="menu">
        <PermissoesMenuEmpresa :empresa-id="ctx.empresaId" :pode-editar="ctx.temPermissao('cadastro_permissoes_editar')" />
      </v-window-item>
    </v-window>
  </AppWorkspace>
</template>
