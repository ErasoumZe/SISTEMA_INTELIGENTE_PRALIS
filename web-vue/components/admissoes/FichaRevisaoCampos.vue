<script setup lang="ts">
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
type Formato = "texto" | "data" | "cep" | "telefone" | "simNao";
type Campo = { chave: Chave; rotulo: string; formato?: Formato };
type Secao = { id: string; titulo: string; campos: Campo[] };

defineProps<{ campos: Campos }>();

const SECOES: Secao[] = [
  {
    id: "identificacao",
    titulo: "Identificação",
    campos: [
      { chave: "nascimento", rotulo: "Data de nascimento", formato: "data" },
      { chave: "sexo", rotulo: "Sexo" },
      { chave: "estadoCivil", rotulo: "Estado civil" },
      { chave: "racaCor", rotulo: "Raça/cor" },
      { chave: "nacionalidade", rotulo: "Nacionalidade" },
      { chave: "nacionalidadeEspecifica", rotulo: "Nacionalidade (estrangeira)" },
      { chave: "naturalidade", rotulo: "Naturalidade" },
      { chave: "naturalidadeUf", rotulo: "UF onde nasceu" },
      { chave: "grauInstrucao", rotulo: "Escolaridade" },
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
      { chave: "uf", rotulo: "UF" },
      { chave: "municipioIbge", rotulo: "Código IBGE do município" }
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
    // E5 (Questor). Deficiência/reabilitação não aparecem: não são coletadas antes da Q11.
    id: "trabalho",
    titulo: "Histórico de trabalho",
    campos: [
      { chave: "primeiroEmprego", rotulo: "Primeiro emprego com carteira assinada", formato: "simNao" },
      { chave: "recebeSeguroDesemprego", rotulo: "Recebendo seguro-desemprego", formato: "simNao" }
    ]
  }
];

/** `null` e "nao informado" — a celula mostra isso em vez de inventar um traco. */
function exibir(valor: string | boolean | null | undefined, formato: Formato = "texto"): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "boolean" || formato === "simNao") return valor === true ? "Sim" : "Não";
  if (formato === "data") return formatarDataSomenteDia(valor);
  if (formato === "cep") return mascararCep(valor);
  if (formato === "telefone") return mascararWhatsapp(valor);
  return valor;
}
</script>

<template>
  <section v-for="secao in SECOES" :key="secao.id" class="bloco" :aria-labelledby="`revisao-${secao.id}`">
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
