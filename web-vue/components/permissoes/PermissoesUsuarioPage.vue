<script setup lang="ts">
import type { Permissao } from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import PermissoesUsuarioSecao from "~/components/permissoes/PermissoesUsuarioSecao.vue";
import {
  regrasDiretasCompletas,
  secoesDoUsuario,
  type RegraDiretaUsuario
} from "~/utils/permissoes-usuario";
import { mensagemErro } from "~/utils/domain";
import { agruparTelasMenu } from "~/utils/menu";
import { usePermissoes } from "~/composables/usePermissoes";

type DadosPermissoes = {
  permissoes: Opcao[];
  usuarios: Opcao[];
};
type ResumoUsuario = {
  usuarioId: string;
  nome: string;
  email: string;
  role: string;
  permissoesEfetivas: Permissao[];
};

const props = defineProps<{ empresaId: string; usuarioInicial?: string }>();
const { apiGet, apiPost } = useApi();

const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const busca = ref("");
const usuarioId = ref(props.usuarioInicial ?? "");
const usuarioOrigemId = ref("");
const dialogoCopiar = ref(false);
const dialogoConfirmar = ref(false);
const usuarios = ref<Opcao[]>([]);
const nomes = ref(new Map<string, string>());
const resumo = ref<ResumoUsuario | null>(null);
const regras = ref<RegraDiretaUsuario>(regrasDiretasCompletas([]));
const regrasIniciais = ref(JSON.stringify(regras.value));

const usuarioSelecionado = computed(() =>
  usuarios.value.find((usuario) => (usuario.usuarioId ?? usuario.id) === usuarioId.value) ?? null
);
const opcoesUsuarios = computed(() =>
  usuarios.value.map((usuario) => ({
    title: usuario.nome ?? usuario.email ?? usuario.usuarioId ?? usuario.id,
    value: usuario.usuarioId ?? usuario.id,
    subtitle: usuario.email ?? ""
  }))
);
const administradorTotal = computed(() => resumo.value?.role === "usuario_admin");
const alterado = computed(() => JSON.stringify(regras.value) !== regrasIniciais.value);
const permissoesPermitidas = computed(() =>
  Object.entries(regras.value)
    .filter(([, permitido]) => permitido)
    .map(([codigo]) => codigo as Permissao)
);
const secoes = computed(() => secoesDoUsuario(regras.value, nomes.value, busca.value));
const menuPrevisto = computed(() => agruparTelasMenu(usePermissoes(permissoesPermitidas, true).telasPermitidas.value));
const totalPermitidas = computed(() => permissoesPermitidas.value.length);
const cores = ["entradas", "transferencias", "despesas", "mercadorias", "retiradas", "resultado"] as const;

function corSecao(indice: number) {
  return cores[indice % cores.length] ?? "resultado";
}

function alternar(codigo: string, permitido: boolean) {
  regras.value = { ...regras.value, [codigo]: permitido } as RegraDiretaUsuario;
}

async function carregarUsuario(id = usuarioId.value) {
  if (!id) return;
  carregando.value = true;
  erro.value = "";
  try {
    const dados = await apiGet<ResumoUsuario>(`/api/permissoes/usuarios/${encodeURIComponent(id)}/efetivas`);
    if (id !== usuarioId.value) return;
    resumo.value = dados;
    regras.value = regrasDiretasCompletas(dados.permissoesEfetivas);
    regrasIniciais.value = JSON.stringify(regras.value);
  } catch (falha) {
    erro.value = mensagemErro(falha);
    resumo.value = null;
  } finally {
    carregando.value = false;
  }
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const query = props.empresaId ? `?empresaId=${encodeURIComponent(props.empresaId)}` : "";
    const dados = await apiGet<DadosPermissoes>(`/api/permissoes${query}`);
    usuarios.value = dados.usuarios;
    nomes.value = new Map(
      dados.permissoes.map((permissao) => [permissao.codigo ?? permissao.id, permissao.nome ?? permissao.codigo ?? permissao.id])
    );
    if (!usuarioId.value) usuarioId.value = usuarios.value[0]?.usuarioId ?? usuarios.value[0]?.id ?? "";
    await carregarUsuario();
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function trocarUsuario(id: string) {
  if (!id || id === usuarioId.value) return;
  usuarioId.value = id;
  usuarioOrigemId.value = "";
  await carregarUsuario(id);
}

async function copiarAcessos() {
  if (!usuarioOrigemId.value || usuarioOrigemId.value === usuarioId.value) return;
  carregando.value = true;
  erro.value = "";
  try {
    const origem = await apiGet<ResumoUsuario>(
      `/api/permissoes/usuarios/${encodeURIComponent(usuarioOrigemId.value)}/efetivas`
    );
    regras.value = regrasDiretasCompletas(origem.permissoesEfetivas);
    dialogoCopiar.value = false;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function salvar() {
  if (!usuarioId.value || administradorTotal.value) return;
  salvando.value = true;
  erro.value = "";
  try {
    await apiPost("/api/permissoes", { tipoPermissao: "usuario", usuarioId: usuarioId.value, regras: regras.value });
    regrasIniciais.value = JSON.stringify(regras.value);
    dialogoConfirmar.value = false;
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    salvando.value = false;
  }
}

watch(
  () => props.usuarioInicial,
  (id) => {
    if (id && id !== usuarioId.value) void trocarUsuario(id);
  }
);

onMounted(() => void carregar());
</script>

<template>
  <section class="permissoes-usuario" aria-labelledby="permissoes-usuario-titulo">
    <header class="permissoes-usuario__cabecalho">
      <div>
        <span>Controle de acesso</span>
        <h2 id="permissoes-usuario-titulo">Permissões por pessoa</h2>
        <p>Escolha uma pessoa e defina, de forma direta, o que ela pode visualizar e fazer.</p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-content-copy" :disabled="!usuarioSelecionado || administradorTotal" @click="dialogoCopiar = true">
        Copiar acessos
      </v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" class="mt-4">{{ erro }}</v-alert>

    <div class="permissoes-usuario__seletor mt-4">
      <v-autocomplete
        :model-value="usuarioId"
        :items="opcoesUsuarios"
        item-title="title"
        item-value="value"
        label="Pessoa que terá os acessos"
        prepend-inner-icon="mdi-account-search-outline"
        :loading="carregando"
        @update:model-value="trocarUsuario(String($event || ''))"
      />
      <div class="permissoes-usuario__resumo">
        <v-icon icon="mdi-account-key-outline" size="28" />
        <div>
          <strong>{{ resumo?.nome ?? usuarioSelecionado?.nome ?? "Selecione uma pessoa" }}</strong>
          <span>{{ resumo?.email ?? usuarioSelecionado?.email ?? "" }}</span>
        </div>
        <v-chip color="success" variant="flat" size="small">{{ totalPermitidas }} permitidos</v-chip>
      </div>
    </div>

    <v-alert v-if="administradorTotal" type="info" variant="tonal" class="mt-4">
      Este é o administrador total do sistema. Seus acessos ficam completos e não podem ser reduzidos nesta tela.
    </v-alert>

    <template v-else-if="usuarioSelecionado && resumo">
      <section class="permissoes-usuario__visao mt-4" aria-label="Prévia do acesso">
        <div>
          <v-icon icon="mdi-shield-account-outline" size="22" />
          <span>Perfil individual</span>
          <strong>{{ totalPermitidas }} ações permitidas</strong>
        </div>
        <div>
          <v-icon icon="mdi-menu-open" size="22" />
          <span>Menu visível</span>
          <strong>{{ menuPrevisto.length }} grupos disponíveis</strong>
        </div>
        <div class="permissoes-usuario__menu-previsto">
          <v-chip v-for="grupo in menuPrevisto" :key="grupo.titulo" size="small" variant="outlined">{{ grupo.titulo }}</v-chip>
          <span v-if="!menuPrevisto.length">Nenhum item de menu liberado.</span>
        </div>
      </section>

      <v-text-field
        v-model="busca"
        class="mt-5"
        label="Buscar ação ou tela"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
      />

      <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-4" />
      <v-expansion-panels class="mt-4" multiple variant="accordion">
        <v-expansion-panel
          v-for="(secao, indice) in secoes"
          :key="secao.titulo"
          :value="secao.titulo"
          :class="`permissoes-usuario__painel permissoes-usuario__painel--${corSecao(indice)}`"
        >
          <v-expansion-panel-title>
            <div class="d-flex align-center justify-space-between w-100 ga-3">
              <strong>{{ secao.titulo }}</strong>
              <v-chip size="x-small" color="primary" variant="tonal">
                {{ secao.itens.filter((item) => item.permitido).length }}/{{ secao.itens.length }} permitidos
              </v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <PermissoesUsuarioSecao
              :itens="secao.itens"
              :cor="corSecao(indice)"
              @alternar="alternar"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-alert v-if="!secoes.length" type="info" variant="tonal" class="mt-4">
        Nenhum acesso encontrado com essa busca.
      </v-alert>
    </template>

    <v-alert v-else-if="!carregando" type="info" variant="tonal" class="mt-4">
      Selecione uma pessoa para configurar seus acessos.
    </v-alert>

    <footer v-if="usuarioSelecionado && !administradorTotal" class="permissoes-usuario__rodape mt-5">
      <span v-if="alterado">Alterações ainda não salvas.</span>
      <span v-else>Perfil salvo.</span>
      <v-btn color="success" prepend-icon="mdi-content-save-outline" :disabled="!alterado" :loading="salvando" @click="dialogoConfirmar = true">
        Salvar acessos
      </v-btn>
    </footer>

    <v-dialog v-model="dialogoCopiar" max-width="520">
      <v-card>
        <v-card-title>Copiar acessos</v-card-title>
        <v-card-text>
          <p class="mb-4">Os acessos atuais desta pessoa serão substituídos pelo perfil escolhido.</p>
          <v-autocomplete
            v-model="usuarioOrigemId"
            :items="opcoesUsuarios.filter((usuario) => usuario.value !== usuarioId)"
            item-title="title"
            item-value="value"
            label="Copiar de"
            prepend-inner-icon="mdi-account-arrow-right-outline"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoCopiar = false">Cancelar</v-btn>
          <v-btn color="primary" :disabled="!usuarioOrigemId" :loading="carregando" @click="copiarAcessos">Copiar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogoConfirmar" max-width="520">
      <v-card>
        <v-card-title>Salvar acessos desta pessoa?</v-card-title>
        <v-card-text>
          A pessoa passará a ter exatamente os acessos marcados como permitidos. As regras operacionais, como caixa fechado, continuam sendo verificadas pelo sistema.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogoConfirmar = false">Voltar</v-btn>
          <v-btn color="success" :loading="salvando" @click="salvar">Confirmar e salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.permissoes-usuario { max-width: 1160px; margin: 0 auto; padding-bottom: 24px; }
.permissoes-usuario__cabecalho, .permissoes-usuario__seletor, .permissoes-usuario__rodape { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.permissoes-usuario__cabecalho > div > span { color: var(--cx-brand-text); font-size: .75rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
.permissoes-usuario h2 { margin: 2px 0 0; }
.permissoes-usuario__cabecalho p { margin: 6px 0 0; color: var(--cx-ink-soft); }
.permissoes-usuario__seletor > :first-child { flex: 1 1 360px; }
.permissoes-usuario__resumo { display: flex; align-items: center; gap: 10px; min-width: min(100%, 320px); padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--cx-positive) 40%, var(--cx-line)); border-radius: 12px; background: color-mix(in srgb, var(--cx-positive) 14%, var(--cx-surface)); }
.permissoes-usuario__resumo :deep(.v-icon) { color: var(--cx-positive); }
.permissoes-usuario__resumo div { min-width: 0; flex: 1; }
.permissoes-usuario__resumo strong, .permissoes-usuario__resumo span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.permissoes-usuario__resumo span { margin-top: 2px; color: var(--cx-ink-soft); font-size: .78rem; }
.permissoes-usuario__visao { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.permissoes-usuario__visao > div { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2px 10px; padding: 14px; border-radius: 12px; background: color-mix(in srgb, var(--cx-brand) 14%, var(--cx-surface)); }
.permissoes-usuario__visao :deep(.v-icon) { grid-row: span 2; color: var(--cx-brand-text); }
.permissoes-usuario__visao span { color: var(--cx-ink-soft); font-size: .78rem; }
.permissoes-usuario__menu-previsto { grid-column: 1 / -1; display: flex !important; grid-template-columns: none !important; flex-wrap: wrap; min-height: 48px; background: color-mix(in srgb, var(--cat-retiradas-base) 14%, var(--cx-surface)) !important; }
.permissoes-usuario__painel { border: 1px solid var(--cx-line); border-radius: 12px; overflow: hidden; }
.permissoes-usuario__painel :deep(.v-expansion-panel-title) { min-height: 58px; }
.permissoes-usuario__painel--entradas :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-entradas-base) 15%, var(--cx-surface)); }
.permissoes-usuario__painel--transferencias :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-transferencias-base) 15%, var(--cx-surface)); }
.permissoes-usuario__painel--despesas :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-despesas-base) 15%, var(--cx-surface)); }
.permissoes-usuario__painel--mercadorias :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-mercadorias-base) 15%, var(--cx-surface)); }
.permissoes-usuario__painel--retiradas :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-retiradas-base) 15%, var(--cx-surface)); }
.permissoes-usuario__painel--resultado :deep(.v-expansion-panel-title) { background: color-mix(in srgb, var(--cat-resultado-base) 15%, var(--cx-surface)); }
.permissoes-usuario__rodape { position: sticky; bottom: 12px; align-items: center; padding: 12px 16px; border: 1px solid var(--cx-line); border-radius: 12px; background: var(--cx-surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--cx-ink) 18%, transparent); }
.permissoes-usuario__rodape span { color: var(--cx-ink-soft); font-size: .88rem; }
@media (max-width: 760px) {
  .permissoes-usuario__cabecalho, .permissoes-usuario__seletor, .permissoes-usuario__rodape { flex-direction: column; }
  .permissoes-usuario__cabecalho > :deep(.v-btn), .permissoes-usuario__seletor > *, .permissoes-usuario__rodape > :deep(.v-btn) { width: 100%; }
  .permissoes-usuario__visao { grid-template-columns: 1fr; }
  .permissoes-usuario__menu-previsto { grid-column: auto; }
  .permissoes-usuario__rodape { bottom: 0; border-inline: 0; border-radius: 0; }
}
</style>
