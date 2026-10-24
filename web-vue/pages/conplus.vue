<script setup lang="ts">
const rota = useRoute();
if (rota.path === "/conplus") await navigateTo("/conplus/folha-05", { redirectCode: 301 });
</script>
<template><NuxtPage /></template>
