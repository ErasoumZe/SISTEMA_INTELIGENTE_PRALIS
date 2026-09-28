<script setup lang="ts">
import {
  camposDaFichaPublica,
  gruposDaFichaPublica,
  normalizarCep,
  rotuloCampoFicha,
  type CampoFicha
} from "~/utils/ficha-campos";
import { mascararCep } from "~/utils/formatacao";

type FormularioFicha = Record<string, string>;
type EnderecoViaCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

const props = defineProps<{ formulario: FormularioFicha; somenteLeitura: boolean }>();

const buscandoCep = ref(false);
const erroCep = ref("");
const buscarCepPorEndereco = ref(false);
const opcoesCep = ref<EnderecoViaCep[]>([]);
let sequenciaBusca = 0;

const grupos = computed(() =>
  gruposDaFichaPublica.map((grupo) => ({
    ...grupo,
    campos: camposDaFichaPublica.filter((campo) => campo.grupo === grupo.id)
  }))
);

function aoAtualizarCep(valor: string) {
  props.formulario.cep = normalizarCep(valor);
}

function aplicarEndereco(endereco: EnderecoViaCep) {
  props.formulario.cep = normalizarCep(endereco.cep);
  props.formulario.logradouro = endereco.logradouro || props.formulario.logradouro || "";
  props.formulario.bairro = endereco.bairro || props.formulario.bairro || "";
  props.formulario.municipio = endereco.localidade || props.formulario.municipio || "";
  props.formulario.uf = endereco.uf || props.formulario.uf || "";
  opcoesCep.value = [];
  buscarCepPorEndereco.value = false;
}

async function requisitarViaCep(rota: string): Promise<EnderecoViaCep[] | null> {
  const resposta = await fetch(`https://viacep.com.br/ws/${rota}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!resposta.ok) throw new Error("Não foi possível consultar o CEP agora.");
  const dados = (await resposta.json()) as EnderecoViaCep | EnderecoViaCep[];
  if (Array.isArray(dados)) return dados.filter((item) => !item.erro);
  return dados.erro ? [] : [dados];
}

async function preencherPorCep() {
  const cep = normalizarCep(props.formulario.cep);
  props.formulario.cep = cep;
  if (cep.length !== 8 || props.somenteLeitura) return;
  const tentativa = ++sequenciaBusca;
  buscandoCep.value = true;
  erroCep.value = "";
  try {
    const resultados = await requisitarViaCep(`${cep}/json/`);
    if (tentativa !== sequenciaBusca) return;
    const endereco = resultados?.[0];
    if (!endereco) {
      erroCep.value = "CEP não encontrado. Confira os números ou preencha o endereço manualmente.";
      return;
    }
    aplicarEndereco(endereco);
  } catch {
    if (tentativa === sequenciaBusca)
      erroCep.value = "Não foi possível consultar o CEP. Preencha o endereço manualmente.";
  } finally {
    if (tentativa === sequenciaBusca) buscandoCep.value = false;
  }
}

async function procurarCepPeloEndereco() {
  const uf = props.formulario.uf.trim().toUpperCase();
  const municipio = props.formulario.municipio.trim();
  const logradouro = props.formulario.logradouro.trim();
  if (!/^[A-Z]{2}$/.test(uf) || municipio.length < 3 || logradouro.length < 3) {
    erroCep.value = "Para encontrar o CEP, informe UF, município e pelo menos três letras do logradouro.";
    return;
  }
  const tentativa = ++sequenciaBusca;
  buscandoCep.value = true;
  erroCep.value = "";
  try {
    const rota = `${encodeURIComponent(uf)}/${encodeURIComponent(municipio)}/${encodeURIComponent(logradouro)}/json/`;
    const resultados = await requisitarViaCep(rota);
    if (tentativa !== sequenciaBusca) return;
    opcoesCep.value = (resultados ?? []).slice(0, 10);
    if (!opcoesCep.value.length)
      erroCep.value = "Nenhum CEP encontrado com esse endereço. Confira os dados ou preencha o CEP manualmente.";
  } catch {
    if (tentativa === sequenciaBusca)
      erroCep.value = "Não foi possível pesquisar o CEP agora. Tente novamente ou preencha manualmente.";
  } finally {
    if (tentativa === sequenciaBusca) buscandoCep.value = false;
  }
}

function inputmode(campo: CampoFicha) {
  return campo.chave === "cep" || campo.chave === "telefone" ? "numeric" : undefined;
}
</script>

<template>
  <section v-for="grupo in grupos" :key="grupo.id" class="dados" :aria-labelledby="`dados-${grupo.id}`">
    <header class="dados__cabecalho">
      <h2 :id="`dados-${grupo.id}`">{{ grupo.titulo }}</h2>
      <p v-if="grupo.descricao">{{ grupo.descricao }}</p>
    </header>

    <div class="dados__campos">
      <template v-for="campo in grupo.campos" :key="campo.chave">
        <div v-if="campo.chave === 'cep'" class="dados__cep dados__campo">
          <v-text-field
            :model-value="mascararCep(formulario.cep)"
            :label="rotuloCampoFicha(campo)"
            :disabled="somenteLeitura"
            :loading="buscandoCep"
            :error-messages="erroCep"
            :aria-required="campo.obrigatorio"
            inputmode="numeric"
            maxlength="9"
            density="comfortable"
            class="dados__obrigatorio"
            @update:model-value="aoAtualizarCep"
            @blur="preencherPorCep"
          />
          <div v-if="!somenteLeitura" class="dados__cep-acoes">
            <v-btn type="button" size="small" variant="text" :loading="buscandoCep" @click="preencherPorCep"
              >Buscar CEP</v-btn
            >
            <v-btn type="button" size="small" variant="text" @click="buscarCepPorEndereco = !buscarCepPorEndereco">
              Não sei meu CEP
            </v-btn>
          </div>
        </div>

        <v-select
          v-else-if="campo.opcoes"
          v-model="formulario[campo.chave]"
          :items="campo.opcoes"
          :label="rotuloCampoFicha(campo)"
          :disabled="somenteLeitura"
          :aria-required="campo.obrigatorio"
          density="comfortable"
          :class="{ dados__obrigatorio: campo.obrigatorio }"
        />

        <v-text-field
          v-else
          v-model="formulario[campo.chave]"
          :label="rotuloCampoFicha(campo)"
          :type="campo.tipo ?? 'text'"
          :inputmode="inputmode(campo)"
          :disabled="somenteLeitura"
          :aria-required="campo.obrigatorio"
          density="comfortable"
          :class="{ dados__obrigatorio: campo.obrigatorio }"
        />
      </template>
    </div>

    <div v-if="grupo.id === 'endereco' && buscarCepPorEndereco && !somenteLeitura" class="dados__buscar-cep">
      <p>Informe UF, município e logradouro acima; depois pesquise e escolha o CEP correto.</p>
      <v-btn type="button" variant="outlined" :loading="buscandoCep" @click="procurarCepPeloEndereco"
        >Encontrar CEP pelo endereço</v-btn
      >
      <v-list v-if="opcoesCep.length" class="dados__opcoes-cep" aria-label="CEPs encontrados">
        <v-list-item v-for="opcao in opcoesCep" :key="opcao.cep" @click="aplicarEndereco(opcao)">
          <v-list-item-title
            >{{ mascararCep(opcao.cep) }} · {{ opcao.logradouro || "Logradouro não informado" }}</v-list-item-title
          >
          <v-list-item-subtitle>{{ opcao.bairro }} · {{ opcao.localidade }}/{{ opcao.uf }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </div>
  </section>
</template>

<style scoped>
.dados {
  display: grid;
  gap: var(--cx-sp-3);
}
.dados__cabecalho {
  display: grid;
  gap: 2px;
}
.dados__cabecalho h2 {
  margin: 0;
  font-size: var(--cx-fs-title);
  color: var(--cx-ink);
}
.dados__cabecalho p {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.dados__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}
.dados__campo {
  min-width: 0;
}
.dados__cep {
  display: grid;
  gap: 0;
}
.dados__cep-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-1);
  margin-top: -10px;
}
.dados__buscar-cep {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
}
.dados__buscar-cep p {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.dados__opcoes-cep {
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
}
.dados__obrigatorio :deep(.v-label) {
  color: rgb(var(--v-theme-error));
  font-weight: 700;
}
@media (max-width: 768px) {
  .dados__campos {
    grid-template-columns: 1fr;
  }
}
</style>
