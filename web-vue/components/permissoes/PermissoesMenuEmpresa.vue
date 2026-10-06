<script setup lang="ts">
import {
  coresMenuGrupo,
  idsMenuConfiguraveis,
  type CorMenuGrupo,
  type CorRgbMenu,
  type EstruturaMenuEmpresa,
  type IdMenuConfiguravel
} from "@padaria/shared";
import { CATEGORIAS_MENU } from "~/utils/menu";
import { estruturaEfetiva, estruturaPadrao, type EstruturaMenu } from "~/utils/menu-estrutura";
import { itemPorTela, mensagemErro } from "~/utils/domain";
import { cssRgb } from "~/utils/menu-cor-rgb";

const props = defineProps<{ empresaId: string; podeEditar: boolean }>();
const { apiGet, apiPut } = useApi();

const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const menuEmpresaAtual = useState<EstruturaMenuEmpresa | null>("estrutura-menu-empresa");
const estrutura = ref<EstruturaMenu>(estruturaPadrao());
const estruturaInicial = ref(JSON.stringify(estrutura.value));
const itemParaAdicionar = reactive<Record<string, IdMenuConfiguravel | "">>({});
const gruposRecolhidos = reactive<Record<string, boolean>>({});
const filhosLancamentos = new Set<IdMenuConfiguravel>(["despesas", "mercadorias", "retiradas"]);
const opcoesCor = [
  { value: "neutro", title: "Neutro" },
  { value: "entradas", title: "Amarelo" },
  { value: "transferencias", title: "Laranja" },
  { value: "despesas", title: "Vermelho" },
  { value: "mercadorias", title: "Verde" },
  { value: "retiradas", title: "Azul" },
  { value: "resultado", title: "Roxo" }
] satisfies { value: CorMenuGrupo; title: string }[];

const catalogo = computed(() =>
  idsMenuConfiguraveis.map((id) => {
    const categoria = CATEGORIAS_MENU.find((item) => item.id === id);
    const tela = itemPorTela[id];
    const tituloCategoria = categoria?.id === "lancamentos" ? "Lançamentos (Despesas, Mercadorias e Retiradas)" : categoria?.titulo;
    return { id, titulo: tituloCategoria ?? tela?.titulo ?? id, icone: categoria?.icone ?? tela?.icone ?? "mdi-view-grid-outline" };
  })
);
const alterado = computed(() => JSON.stringify(estrutura.value) !== estruturaInicial.value);
const idsUsados = computed(() => new Set(estrutura.value.secoes.flatMap((secao) => secao.ids)));
const idsOcultos = computed(() => new Set(estrutura.value.idsOcultos));
const itensSemSecao = computed(() => catalogo.value.filter((item) => !idsUsados.value.has(item.id)));
const itensIncluiveis = computed(() => {
  const usaLancamentos = idsUsados.value.has("lancamentos");
  const usaFilhoDeLancamentos = [...filhosLancamentos].some((id) => idsUsados.value.has(id));
  return itensSemSecao.value.filter((item) => {
    if (item.id === "lancamentos") return !usaFilhoDeLancamentos;
    if (filhosLancamentos.has(item.id)) return !usaLancamentos;
    return true;
  });
});

function novoId() {
  return `secao-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function grupoRecolhido(id: string) {
  return gruposRecolhidos[id] ?? false;
}

function alternarGrupo(id: string) {
  gruposRecolhidos[id] = !grupoRecolhido(id);
}

function nomeItem(id: IdMenuConfiguravel) {
  return catalogo.value.find((item) => item.id === id)?.titulo ?? id;
}

function atualizarSecao(id: string, mudar: (secao: EstruturaMenu["secoes"][number]) => EstruturaMenu["secoes"][number]) {
  estrutura.value = { ...estrutura.value, secoes: estrutura.value.secoes.map((secao) => (secao.id === id ? mudar(secao) : secao)) };
}

function adicionarSecao() {
  estrutura.value = {
    ...estrutura.value,
    secoes: [...estrutura.value.secoes, { id: novoId(), titulo: "Novo grupo", ids: [] }]
  };
}

function removerSecao(id: string) {
  estrutura.value = { ...estrutura.value, secoes: estrutura.value.secoes.filter((secao) => secao.id !== id) };
}

function moverSecao(id: string, direcao: -1 | 1) {
  const indice = estrutura.value.secoes.findIndex((secao) => secao.id === id);
  const destino = indice + direcao;
  if (indice < 0 || destino < 0 || destino >= estrutura.value.secoes.length) return;
  const secoes = [...estrutura.value.secoes];
  [secoes[indice], secoes[destino]] = [secoes[destino]!, secoes[indice]!];
  estrutura.value = { ...estrutura.value, secoes };
}

function adicionarItem(secaoId: string) {
  const id = itemParaAdicionar[secaoId];
  if (!id || idsUsados.value.has(id)) return;
  atualizarSecao(secaoId, (secao) => ({ ...secao, ids: [...secao.ids, id] }));
  itemParaAdicionar[secaoId] = "";
}

function removerItem(secaoId: string, itemId: IdMenuConfiguravel) {
  atualizarSecao(secaoId, (secao) => ({ ...secao, ids: secao.ids.filter((id) => id !== itemId) }));
}

function alternarVisibilidade(itemId: IdMenuConfiguravel) {
  const ocultos = new Set(estrutura.value.idsOcultos);
  if (ocultos.has(itemId)) ocultos.delete(itemId);
  else ocultos.add(itemId);
  estrutura.value = { ...estrutura.value, idsOcultos: [...ocultos] };
}

function moverItem(secaoId: string, itemId: IdMenuConfiguravel, direcao: -1 | 1) {
  atualizarSecao(secaoId, (secao) => {
    const indice = secao.ids.indexOf(itemId);
    const destino = indice + direcao;
    if (indice < 0 || destino < 0 || destino >= secao.ids.length) return secao;
    const ids = [...secao.ids];
    [ids[indice], ids[destino]] = [ids[destino]!, ids[indice]!];
    return { ...secao, ids };
  });
}

function moverItemParaGrupo(origemId: string, destinoId: string, itemId: IdMenuConfiguravel) {
  if (!destinoId || origemId === destinoId) return;
  estrutura.value = {
    ...estrutura.value,
    secoes: estrutura.value.secoes.map((secao) => {
      if (secao.id === origemId) return { ...secao, ids: secao.ids.filter((id) => id !== itemId) };
      if (secao.id === destinoId) return { ...secao, ids: [...secao.ids, itemId] };
      return secao;
    })
  };
}

function atualizarCorSecao(secaoId: string, valor: unknown) {
  const cor = typeof valor === "string" && coresMenuGrupo.includes(valor as CorMenuGrupo) ? valor as CorMenuGrupo : "neutro";
  atualizarSecao(secaoId, (secao) => ({ ...secao, cor }));
}

function removerCorRgb(secaoId: string) {
  atualizarSecao(secaoId, ({ corRgb: _corRgb, ...secao }) => secao);
}

function hexDaCorRgb(corRgb: CorRgbMenu | undefined) {
  if (!corRgb) return "#7C3AED";
  return `#${[corRgb.r, corRgb.g, corRgb.b].map((canal) => canal.toString(16).padStart(2, "0")).join("")}`;
}

function atualizarCorSelecionada(secaoId: string, valor: unknown) {
  if (typeof valor !== "string") return;
  const correspondencia = /^#?([\da-f]{6})$/i.exec(valor.trim());
  if (!correspondencia) return;
  const hexadecimal = correspondencia[1]!;
  atualizarSecao(secaoId, (secao) => ({
    ...secao,
    corRgb: {
      r: Number.parseInt(hexadecimal.slice(0, 2), 16),
      g: Number.parseInt(hexadecimal.slice(2, 4), 16),
      b: Number.parseInt(hexadecimal.slice(4, 6), 16)
    }
  }));
}

function estiloPreviaRgb(corRgb: CorRgbMenu | undefined) {
  return corRgb ? { backgroundColor: cssRgb(corRgb) } : undefined;
}

function estiloGrupo(secao: EstruturaMenu["secoes"][number]) {
  if (secao.corRgb) return { "--menu-grupo-cor": cssRgb(secao.corRgb) };
  return secao.cor && secao.cor !== "neutro" ? { "--menu-grupo-cor": `var(--cat-${secao.cor}-tinta)` } : undefined;
}

function restaurarPadrao() {
  estrutura.value = estruturaPadrao();
}

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    const salva = await apiGet<EstruturaMenuEmpresa | null>(
      `/api/menu-empresa?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    estrutura.value = estruturaEfetiva(salva);
    estruturaInicial.value = JSON.stringify(estrutura.value);
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function salvar() {
  if (!props.podeEditar) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPut("/api/menu-empresa", { empresaId: props.empresaId, estrutura: estrutura.value });
    estruturaInicial.value = JSON.stringify(estrutura.value);
    menuEmpresaAtual.value = estrutura.value;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    salvando.value = false;
  }
}

watch(() => props.empresaId, () => void carregar(), { immediate: true });
</script>

<template>
  <section class="menu-empresa" aria-labelledby="menu-empresa-titulo">
    <header class="menu-empresa__cabecalho">
      <div>
        <span>Menu da empresa</span>
        <h2 id="menu-empresa-titulo">Monte o menu lateral</h2>
        <p>Organize os grupos e a ordem das telas. A permissão de cada pessoa continua sendo respeitada.</p>
      </div>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-restore" :disabled="!podeEditar" @click="restaurarPadrao">
        Restaurar padrão
      </v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>
    <v-alert v-if="!podeEditar" type="info" variant="tonal" class="mt-4">
      Você pode consultar a estrutura. Para alterá-la, é necessária a permissão de editar acessos.
    </v-alert>

    <v-progress-linear v-if="carregando" class="mt-4" indeterminate color="primary" />

    <div class="menu-empresa__grupos mt-5">
      <article v-for="(secao, indice) in estrutura.secoes" :key="secao.id" class="menu-empresa__grupo" :class="{ 'menu-empresa__grupo--recolhido': grupoRecolhido(secao.id) }" :style="estiloGrupo(secao)">
        <header>
          <v-icon icon="mdi-folder-outline" color="primary" />
          <v-text-field
            :model-value="secao.titulo"
            label="Nome do grupo"
            density="compact"
            hide-details
            :readonly="!podeEditar"
            @update:model-value="atualizarSecao(secao.id, (atual) => ({ ...atual, titulo: String($event).slice(0, 48) }))"
          />
          <div class="menu-empresa__acoes">
            <v-btn :icon="grupoRecolhido(secao.id) ? 'mdi-chevron-down' : 'mdi-chevron-up'" variant="text" size="small" :aria-label="`${grupoRecolhido(secao.id) ? 'Mostrar' : 'Ocultar'} opções de ${secao.titulo}`" @click="alternarGrupo(secao.id)" />
            <v-btn icon="mdi-arrow-up" variant="text" size="small" :disabled="!podeEditar || indice === 0" :aria-label="`Subir ${secao.titulo}`" @click="moverSecao(secao.id, -1)" />
            <v-btn icon="mdi-arrow-down" variant="text" size="small" :disabled="!podeEditar || indice === estrutura.secoes.length - 1" :aria-label="`Descer ${secao.titulo}`" @click="moverSecao(secao.id, 1)" />
            <v-btn icon="mdi-delete-outline" variant="text" color="error" size="small" :disabled="!podeEditar" :aria-label="`Remover ${secao.titulo}`" @click="removerSecao(secao.id)" />
          </div>
        </header>

        <div v-show="!grupoRecolhido(secao.id)" class="menu-empresa__conteudo-grupo">
        <div v-if="secao.ids.length" class="menu-empresa__itens">
          <div v-for="(itemId, itemIndice) in secao.ids" :key="itemId" class="menu-empresa__item" :class="{ 'menu-empresa__item--oculto': idsOcultos.has(itemId) }">
            <v-icon :icon="catalogo.find((item) => item.id === itemId)?.icone ?? 'mdi-view-grid-outline'" size="18" />
            <span>{{ nomeItem(itemId) }}</span>
            <div>
              <v-btn
                :icon="idsOcultos.has(itemId) ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                variant="text"
                size="x-small"
                :color="idsOcultos.has(itemId) ? 'warning' : undefined"
                :disabled="!podeEditar"
                :aria-label="`${idsOcultos.has(itemId) ? 'Exibir' : 'Ocultar'} ${nomeItem(itemId)} no menu lateral`"
                @click="alternarVisibilidade(itemId)"
              />
              <v-btn icon="mdi-chevron-up" variant="text" size="x-small" :disabled="!podeEditar || itemIndice === 0" :aria-label="`Subir ${nomeItem(itemId)}`" @click="moverItem(secao.id, itemId, -1)" />
              <v-btn icon="mdi-chevron-down" variant="text" size="x-small" :disabled="!podeEditar || itemIndice === secao.ids.length - 1" :aria-label="`Descer ${nomeItem(itemId)}`" @click="moverItem(secao.id, itemId, 1)" />
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <v-btn v-bind="menuProps" icon="mdi-folder-move-outline" variant="text" size="x-small" color="primary" :disabled="!podeEditar || estrutura.secoes.length < 2" :aria-label="`Mover ${nomeItem(itemId)} para outro grupo`" />
              </template>
              <v-list density="compact" min-width="220">
                <v-list-subheader>Mover para grupo</v-list-subheader>
                <v-list-item v-for="destino in estrutura.secoes.filter((grupo) => grupo.id !== secao.id)" :key="destino.id" :title="destino.titulo" prepend-icon="mdi-folder-outline" @click="moverItemParaGrupo(secao.id, destino.id, itemId)" />
              </v-list>
            </v-menu>
            <v-btn icon="mdi-close" variant="text" size="x-small" color="error" :disabled="!podeEditar" :aria-label="`Retirar ${nomeItem(itemId)} do menu`" @click="removerItem(secao.id, itemId)" />
            </div>
          </div>
        </div>
        <p v-else class="menu-empresa__vazio">Sem telas neste grupo.</p>

        <div v-if="podeEditar" class="menu-empresa__adicionar">
          <v-select
            v-model="itemParaAdicionar[secao.id]"
            :items="itensIncluiveis"
            item-title="titulo"
            item-value="id"
            :label="`Telas fora de todos os grupos (${itensIncluiveis.length})`"
            density="compact"
            hide-details
            :disabled="!itensIncluiveis.length"
          />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" :disabled="!itemParaAdicionar[secao.id]" @click="adicionarItem(secao.id)">
            Incluir
          </v-btn>
        </div>
        <p class="menu-empresa__ajuda">Use o olho para mostrar ou ocultar uma tela no menu. Ocultar não remove acesso: a rota e as permissões continuam iguais.</p>
        <v-select
          :model-value="secao.cor ?? 'neutro'"
          :items="opcoesCor"
          item-title="title"
          item-value="value"
          label="Cor do cabeçalho do grupo"
          prepend-inner-icon="mdi-palette-outline"
          density="compact"
          hide-details
          class="menu-empresa__cor"
          :readonly="!podeEditar"
          @update:model-value="atualizarCorSecao(secao.id, $event)"
        />
        <div class="menu-empresa__cor-personalizada">
          <div class="menu-empresa__cor-legenda">
            <span class="menu-empresa__rgb-amostra" :style="estiloPreviaRgb(secao.corRgb)" aria-hidden="true" />
            <span>{{ secao.corRgb ? "Cor personalizada ativa" : "Usando a cor pronta acima" }}</span>
          </div>
          <v-menu :close-on-content-click="false" location="bottom start">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" variant="outlined" prepend-icon="mdi-palette-outline" :disabled="!podeEditar">
                Escolher cor na paleta
              </v-btn>
            </template>
            <v-card class="pa-2" min-width="280">
              <v-color-picker :model-value="hexDaCorRgb(secao.corRgb)" mode="hexa" hide-inputs show-swatches @update:model-value="atualizarCorSelecionada(secao.id, $event)" />
              <v-btn block variant="text" color="primary" :disabled="!secao.corRgb" @click="removerCorRgb(secao.id)">
                Usar cor da paleta do sistema
              </v-btn>
            </v-card>
          </v-menu>
        </div>
        <p class="menu-empresa__ajuda">A cor aparece somente no título do grupo, aberto ou fechado; os nomes das telas não mudam.</p>
        </div>
      </article>
    </div>

    <v-btn v-if="podeEditar" class="mt-4" variant="outlined" prepend-icon="mdi-folder-plus-outline" @click="adicionarSecao">
      Novo grupo
    </v-btn>

    <v-alert v-if="itensSemSecao.length" type="warning" variant="tonal" class="mt-4">
      {{ itensSemSecao.length }} tela(s) ainda estão fora de um grupo e aparecerão em “Geral” até serem organizadas.
    </v-alert>

    <footer v-if="podeEditar" class="menu-empresa__rodape mt-5">
      <span>{{ alterado ? "Alterações ainda não salvas." : "Estrutura salva." }}</span>
      <v-btn color="success" prepend-icon="mdi-content-save-outline" :disabled="!alterado" :loading="salvando" @click="salvar">
        Salvar menu
      </v-btn>
    </footer>
  </section>
</template>

<style scoped>
.menu-empresa { max-width: 1160px; margin: 0 auto; padding-bottom: 24px; }
.menu-empresa__cabecalho, .menu-empresa__rodape { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.menu-empresa__cabecalho > div > span { color: var(--cx-brand-text); font-size: .75rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
.menu-empresa h2 { margin: 2px 0 0; }
.menu-empresa__cabecalho p, .menu-empresa__vazio { margin: 6px 0 0; color: var(--cx-ink-soft); }
.menu-empresa__grupos { display: grid; gap: 14px; }
.menu-empresa__grupo { padding: 16px; border: 1px solid color-mix(in srgb, var(--menu-grupo-cor, var(--cx-brand)) 30%, var(--cx-line)); border-radius: 14px; background: color-mix(in srgb, var(--menu-grupo-cor, var(--cx-brand)) 9%, var(--cx-surface)); transition: background var(--cx-dur-2) var(--cx-ease), border-color var(--cx-dur-2) var(--cx-ease); }
.menu-empresa__grupo--recolhido { padding-bottom: 12px; }
.menu-empresa__grupo > header { display: grid; grid-template-columns: auto minmax(180px, 1fr) auto; align-items: center; gap: 10px; }
.menu-empresa__acoes { display: flex; }
.menu-empresa__itens { display: grid; gap: 6px; margin-top: 14px; }
.menu-empresa__item { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 6px 10px; border-radius: 9px; background: var(--cx-surface); }
.menu-empresa__item--oculto { opacity: .64; border: 1px dashed var(--cx-line); }
.menu-empresa__item > span { flex: 1; font-size: .9rem; font-weight: 700; }
.menu-empresa__adicionar { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.menu-empresa__adicionar :deep(.v-input) { flex: 1; }
.menu-empresa__ajuda { margin: 10px 0 0; color: var(--cx-ink-soft); font-size: .78rem; line-height: 1.4; }
.menu-empresa__cor { max-width: 340px; margin-top: 12px; }
.menu-empresa__cor-personalizada { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.menu-empresa__cor-legenda { display: flex; align-items: center; gap: 8px; color: var(--cx-ink-soft); font-size: .82rem; }
.menu-empresa__rgb-amostra { width: 20px; height: 20px; border: 1px solid var(--cx-line); border-radius: 50%; background: linear-gradient(135deg, var(--cx-surface), var(--cx-line)); }
.menu-empresa__rodape { position: sticky; bottom: 12px; align-items: center; padding: 12px 16px; border: 1px solid var(--cx-line); border-radius: 12px; background: var(--cx-surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--cx-ink) 18%, transparent); }
.menu-empresa__rodape span { color: var(--cx-ink-soft); font-size: .88rem; }
@media (max-width: 640px) {
  .menu-empresa__cabecalho, .menu-empresa__rodape, .menu-empresa__adicionar { flex-direction: column; }
  .menu-empresa__cabecalho > :deep(.v-btn), .menu-empresa__adicionar > *, .menu-empresa__rodape > :deep(.v-btn), .menu-empresa__cor { width: 100%; max-width: none; }
  .menu-empresa__cor-personalizada { align-items: stretch; }
  .menu-empresa__grupo > header { grid-template-columns: auto minmax(0, 1fr); }
  .menu-empresa__acoes { grid-column: 1 / -1; justify-content: flex-end; }
  .menu-empresa__rodape { bottom: 0; border-inline: 0; border-radius: 0; }
}
</style>
