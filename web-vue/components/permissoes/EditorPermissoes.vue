<script setup lang="ts">
import {
  permissoesAcessoTotal,
  resolverPermissoesEfetivas,
  type Permissao,
  type RegrasPermissoes
} from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { permissaoPertenceASecao, secoesPermissoes } from "~/utils/domain";
import { regrasGravadasDoAlvo } from "~/utils/permissoes-payload";
import PermissoesGrade from "~/components/permissoes/PermissoesGrade.vue";
import PermissoesMenuOperacional from "~/components/permissoes/PermissoesMenuOperacional.vue";

const {
  opcoesEmpresa,
  cadastroEditandoId,
  formCadastro,
  permissoesDaSecao,
  estadoRegraPermissao,
  definirRegraPermissao
} = useWorkspaceContext();

const secoesOperacionais = ["Despesas", "Mercadorias", "Retiradas", "Transferências", "Vendas"];
const usuarioDireto = computed(
  () => formCadastro.value.tipoPermissao === "usuario" && cadastroEditandoId.value.startsWith("usuario:")
);
const usuarioSelecionado = computed(() =>
  opcoesEmpresa.value.usuarios.find((usuario) => (usuario.usuarioId ?? usuario.id) === formCadastro.value.usuarioId)
);
const usuarioAdministrador = computed(() => usuarioSelecionado.value?.role === "usuario_admin");
const buscaPermissao = ref("");
const paineisAbertos = ref<string[]>([]);

const permissoesEfetivas = computed<Permissao[]>(() => {
  if (!usuarioDireto.value) return [];
  if (usuarioAdministrador.value) return [...permissoesAcessoTotal];

  // O servidor calcula a heranca sobre o perfil completo do usuario. Reconstituir pela empresa
  // ativa mostrava um resumo incompleto para usuarios vinculados a mais de uma unidade.
  const herdadas: RegrasPermissoes = Object.fromEntries(
    (usuarioSelecionado.value?.permissoesHerdadas ?? []).map((permissao) => [permissao, true])
  );

  return resolverPermissoesEfetivas([[herdadas], [formCadastro.value.regras as RegrasPermissoes]]);
});

const modulosVisiveis = computed(() =>
  secoesPermissoes
    .filter(
      (secao) =>
        secao.titulo !== "Outras" &&
        permissoesEfetivas.value.some((permissao) => permissaoPertenceASecao(permissao, secao))
    )
    .map((secao) => secao.titulo)
);

const nomesAcoes = [
  ["visualizar_valor", "Ver valores"],
  ["visualizar_pago", "Ver pagamentos"],
  ["editar_valor", "Editar valores"],
  ["editar_pago", "Editar pagamentos"],
  ["excluir_valor", "Excluir valores"],
  ["excluir_pago", "Excluir pagamentos"],
  ["visualizar", "Visualizar"],
  ["discriminar", "Discriminar"],
  ["conferir", "Conferir"],
  ["gerenciar", "Gerenciar"],
  ["restaurar", "Restaurar"],
  ["aprovar", "Aprovar"],
  ["cancelar", "Cancelar"],
  ["importar", "Importar"],
  ["exportar", "Exportar"],
  ["editar", "Editar"],
  ["excluir", "Excluir"],
  ["criar", "Criar"],
  ["operar", "Operar"]
] as const;

function rotuloRegra(codigo: string) {
  const catalogo = opcoesEmpresa.value.permissoes.find((item) => item.codigo === codigo);
  if (catalogo?.nome && !catalogo.nome.includes("_")) return catalogo.nome;
  const acao = nomesAcoes.find(([sufixo]) => codigo.endsWith(`_${sufixo}`));
  const recurso = codigo
    .replace(/^cadastro_/, "")
    .replace(acao ? new RegExp(`_${acao[0]}$`) : /$/, "")
    .replaceAll("_", " ");
  const nomeRecurso = recurso.charAt(0).toUpperCase() + recurso.slice(1);
  return acao ? `${nomeRecurso} — ${acao[1]}` : nomeRecurso;
}

const secoesDetalhadas = computed(() => {
  const busca = buscaPermissao.value.trim().toLocaleLowerCase("pt-BR");
  return secoesPermissoes
    .filter((secao) => !secoesOperacionais.includes(secao.titulo))
    .map((secao) => ({
      titulo: secao.titulo,
      permissoes: permissoesDaSecao(secao).filter((permissao) => {
        if (!busca) return true;
        return `${rotuloRegra(permissao)} ${permissao}`.toLocaleLowerCase("pt-BR").includes(busca);
      })
    }))
    .filter((secao) => secao.permissoes.length > 0);
});

function totalExcecoes(permissoes: string[]) {
  return permissoes.filter((permissao) => estadoRegraPermissao(permissao) !== "herdar").length;
}

watch(buscaPermissao, (busca) => {
  paineisAbertos.value = busca.trim() ? secoesDetalhadas.value.map((secao) => secao.titulo) : [];
});

watch(
  [
    () => formCadastro.value.tipoPermissao,
    () => formCadastro.value.cargoId,
    () => formCadastro.value.setorId,
    () => formCadastro.value.usuarioId
  ],
  () => {
    formCadastro.value.regras = regrasGravadasDoAlvo(formCadastro.value, opcoesEmpresa.value);
  }
);
</script>

<template>
  <template v-if="usuarioDireto">
    <v-col cols="12">
      <v-sheet class="pa-4 rounded-lg acesso-resumo" border>
        <div class="d-flex flex-wrap align-center ga-2 mb-2">
          <v-icon color="primary">mdi-account-key</v-icon>
          <strong>{{ usuarioSelecionado?.nome ?? usuarioSelecionado?.email ?? "Usuário" }}</strong>
          <v-chip size="small" color="primary" variant="tonal">
            {{ usuarioAdministrador ? "Administrador total" : `${permissoesEfetivas.length} permissões efetivas` }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-3">
          O acesso abaixo combina setor, cargos ativos e exceções individuais. Alterações nesta tela valem apenas para
          esta pessoa.
        </p>
        <div class="d-flex flex-wrap ga-2">
          <v-chip v-for="modulo in modulosVisiveis" :key="modulo" size="small" variant="outlined">{{ modulo }}</v-chip>
          <span v-if="!modulosVisiveis.length" class="text-body-2 text-medium-emphasis">Nenhum módulo liberado.</span>
        </div>
      </v-sheet>
    </v-col>
    <v-col v-if="usuarioAdministrador" cols="12">
      <v-alert type="info" variant="tonal">
        Administradores totais já recebem todos os acessos. Exceções individuais não alteram esse perfil.
      </v-alert>
    </v-col>
  </template>

  <template v-else>
    <v-col cols="12" md="4">
      <v-select
        v-model="formCadastro.tipoPermissao"
        :items="[
          { title: 'Cargo', value: 'cargo' },
          { title: 'Setor', value: 'setor' }
        ]"
        item-title="title"
        item-value="value"
        label="Aplicar regras por"
      />
    </v-col>
    <v-col v-if="formCadastro.tipoPermissao === 'cargo'" cols="12" md="8">
      <v-select
        v-model="formCadastro.cargoId"
        :items="opcoesEmpresa.cargos"
        item-title="nome"
        item-value="id"
        label="Cargo"
      />
    </v-col>
    <v-col v-if="formCadastro.tipoPermissao === 'setor'" cols="12" md="8">
      <v-select
        v-model="formCadastro.setorId"
        :items="opcoesEmpresa.setores"
        item-title="nome"
        item-value="id"
        label="Setor"
      />
    </v-col>
  </template>

  <template v-if="!usuarioAdministrador">
    <v-col cols="12">
      <div class="text-body-2 font-weight-bold mb-1">Operações principais</div>
      <div class="text-caption text-medium-emphasis mb-3">
        Clique em cada ação para alternar entre herdado, permitido e negado.
      </div>
      <PermissoesGrade />
    </v-col>

    <v-col cols="12">
      <div class="text-body-2 font-weight-bold mb-1">Comportamento do menu operacional</div>
      <div class="text-caption text-medium-emphasis mb-3">
        Defina se cada módulo aparece, fica desabilitado ou exige um caixa aberto. Clique no estado para alternar.
      </div>
      <PermissoesMenuOperacional />
    </v-col>

    <v-col cols="12">
      <div class="text-body-2 font-weight-bold mb-1">Outros acessos</div>
      <div class="text-caption text-medium-emphasis mb-3">
        Abra somente o módulo que deseja ajustar. Herdar mantém o acesso definido pelo setor ou cargo.
      </div>
      <v-text-field
        v-model="buscaPermissao"
        label="Buscar acesso"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        clearable
        hide-details
        class="mb-3"
      />
      <v-expansion-panels v-model="paineisAbertos" multiple variant="accordion">
        <v-expansion-panel v-for="secao in secoesDetalhadas" :key="secao.titulo" :value="secao.titulo">
          <v-expansion-panel-title>
            <span>{{ secao.titulo }}</span>
            <v-chip v-if="totalExcecoes(secao.permissoes)" size="x-small" color="primary" class="ml-2">
              {{ totalExcecoes(secao.permissoes) }} ajuste(s)
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row dense>
              <v-col v-for="permissao in secao.permissoes" :key="permissao" cols="12">
                <div class="permission-rule-row">
                  <span class="permission-rule-label">{{ rotuloRegra(permissao) }}</span>
                  <v-btn-toggle
                    :model-value="estadoRegraPermissao(permissao)"
                    density="compact"
                    divided
                    mandatory
                    @update:model-value="definirRegraPermissao(permissao, String($event || 'herdar'))"
                  >
                    <v-btn value="herdar">Herdar</v-btn>
                    <v-btn value="permitir">Permitir</v-btn>
                    <v-btn value="negar">Negar</v-btn>
                  </v-btn-toggle>
                </div>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-alert v-if="buscaPermissao && !secoesDetalhadas.length" type="info" variant="tonal" class="mt-3">
        Nenhum acesso encontrado para “{{ buscaPermissao }}”.
      </v-alert>
    </v-col>
  </template>
</template>

<style scoped>
.acesso-resumo,
.acesso-secao {
  background: rgb(var(--v-theme-surface));
}

.permission-rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
}

.permission-rule-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (width <= 768px) {
  .permission-rule-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .permission-rule-row :deep(.v-btn) {
    min-height: 40px;
  }
}
</style>
