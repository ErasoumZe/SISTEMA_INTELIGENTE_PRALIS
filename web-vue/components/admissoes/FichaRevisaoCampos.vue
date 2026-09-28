<script setup lang="ts">
import { computed } from "vue";
import type { FichaRevisaoDto } from "@padaria/shared";
import { formatarDataSomenteDia, mascararCep, mascararWhatsapp } from "~/utils/formatacao";

/**
 * ADM-003 V5 — os campos da ficha, em LEITURA, agrupados como o candidato os preencheu.
 *
 * Os rotulos sao os da tela do candidato (`pages/admissao.vue`), sem o asterisco: aqui nada e
 * obrigatorio, e sim lido. Campo vazio diz "Não informado" — um traco parece defeito de tela, e o
 * DP precisa distinguir "o candidato nao respondeu" de "a tela nao carregou".
 *
 * Nao ha CPF em nenhum bloco. O CPF do candidato mora no processo, e a unica leitura dele e a
 * revelacao auditada do detalhe do processo.
 */
type Campos = FichaRevisaoDto["campos"];
type Chave = keyof Campos;
type Formato = "texto" | "data" | "cep" | "telefone";
type Campo = { chave: Chave; rotulo: string; formato?: Formato };
type Secao = { id: string; titulo: string; campos: Campo[] };

const props = withDefaults(
  defineProps<{
    campos: Campos;
    /** Quando informado, mostra somente os blocos da aba atual do perfil. */
    secoes?: string[];
  }>(),
  { secoes: () => [] }
);

const SECOES: Secao[] = [
  {
    id: "identificacao",
    titulo: "Identificação",
    campos: [
      { chave: "nascimento", rotulo: "Data de nascimento", formato: "data" },
      { chave: "sexo", rotulo: "Sexo" },
      { chave: "estadoCivil", rotulo: "Estado civil" },
      { chave: "racaCor", rotulo: "Raça/cor" },
      { chave: "grauInstrucao", rotulo: "Grau de instrução" },
      { chave: "nacionalidade", rotulo: "Nacionalidade" },
      { chave: "naturalidade", rotulo: "Naturalidade" },
      { chave: "nomeMae", rotulo: "Nome da mãe" },
      { chave: "nomePai", rotulo: "Nome do pai" },
      { chave: "nomeSocial", rotulo: "Nome social" }
    ]
  },
  {
    id: "endereco",
    titulo: "Endereço",
    campos: [
      { chave: "cep", rotulo: "CEP", formato: "cep" },
      { chave: "logradouro", rotulo: "Logradouro" },
      { chave: "numero", rotulo: "Número" },
      { chave: "complemento", rotulo: "Complemento" },
      { chave: "bairro", rotulo: "Bairro" },
      { chave: "municipio", rotulo: "Município" },
      { chave: "uf", rotulo: "UF" }
    ]
  },
  {
    id: "contato",
    titulo: "Contato",
    campos: [
      { chave: "telefone", rotulo: "Telefone", formato: "telefone" },
      { chave: "email", rotulo: "E-mail" }
    ]
  },
  {
    id: "documentos",
    titulo: "Documentos",
    campos: [
      { chave: "rgNumero", rotulo: "RG — número" },
      { chave: "rgOrgao", rotulo: "RG — órgão emissor" },
      { chave: "rgUf", rotulo: "RG — UF" },
      { chave: "rgEmissao", rotulo: "RG — data de emissão", formato: "data" },
      { chave: "tituloEleitor", rotulo: "Título de eleitor" },
      { chave: "tituloZona", rotulo: "Zona" },
      { chave: "tituloSecao", rotulo: "Seção" }
    ]
  },
  {
    id: "bancarios",
    titulo: "Dados bancários",
    campos: [
      { chave: "banco", rotulo: "Banco" },
      { chave: "agencia", rotulo: "Agência" },
      { chave: "conta", rotulo: "Conta" },
      { chave: "contaDigito", rotulo: "Dígito" },
      { chave: "contaTipo", rotulo: "Tipo de conta" }
    ]
  }
];

const secoesVisiveis = computed(() =>
  props.secoes.length ? SECOES.filter((secao) => props.secoes.includes(secao.id)) : SECOES
);

/** `null` e "nao informado" — a celula mostra isso em vez de inventar um traco. */
function exibir(valor: string | null | undefined, formato: Formato = "texto"): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (formato === "data") return formatarDataSomenteDia(valor);
  if (formato === "cep") return mascararCep(valor);
  if (formato === "telefone") return mascararWhatsapp(valor);
  return valor;
}
</script>

<template>
  <section v-for="secao in secoesVisiveis" :key="secao.id" class="bloco" :aria-labelledby="`revisao-${secao.id}`">
    <h2 :id="`revisao-${secao.id}`" class="bloco__titulo">{{ secao.titulo }}</h2>
    <dl class="bloco__campos">
      <div v-for="campo in secao.campos" :key="campo.chave" class="bloco__campo">
        <dt>{{ campo.rotulo }}</dt>
        <dd
          :class="{ 'bloco__nao-informado': exibir(campos[campo.chave], campo.formato) === null }"
          :data-campo="campo.chave"
        >
          {{ exibir(campos[campo.chave], campo.formato) ?? "Não informado" }}
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.bloco {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  min-width: 0;
}

.bloco__titulo {
  margin: 0;
  font-size: var(--cx-fs-title);
  font-weight: 600;
  color: var(--cx-ink);
}

/* 3 → 2 → 1 colunas (`67` §13.4: nunca 3 → 1 direto). */
.bloco__campos {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
}

.bloco__campo {
  min-width: 0;
}

.bloco__campo dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.bloco__campo dd {
  margin: 0;
  color: var(--cx-ink);
  overflow-wrap: anywhere;
}

.bloco__nao-informado {
  color: var(--cx-ink-soft);
  font-style: italic;
}

@media (max-width: 1024px) {
  .bloco__campos {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .bloco {
    padding: var(--cx-sp-4);
  }

  .bloco__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
