<script setup lang="ts">
import type { FichaPublicaDto } from "@padaria/shared";
import { CABECALHO_DO_CONVITE, tokenDoFragmento } from "~/utils/convite-token";

/**
 * ADM-003 V3 — a ficha do candidato.
 *
 * A UNICA tela do sistema aberta a quem nao tem conta. Por isso ela nao monta `AppWorkspace`, nao
 * tem menu, nao le sessao e nao aparece em `itemPorTela` — se aparecesse, viraria item de menu.
 *
 * O token vive em memoria e so nesta aba. Ele e lido do fragmento e apagado da barra de enderecos
 * logo em seguida: link compartilhado por engano, print de tela e historico do navegador deixam de
 * carregar o segredo. Nao vai para `localStorage`, nao vai para a URL e nao vai para o console.
 */

const { apiUrl } = useApi();

const token = ref("");
const ficha = ref<FichaPublicaDto | null>(null);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const aviso = ref("");
const aceite = ref(false);

// `fetch` direto, como as outras telas publicas do repositorio ja fazem: `credentials: "omit"` e o
// ponto — mandar cookie de sessao numa rota de token faria o DP conseguir o que o candidato deveria,
// e mascararia falha de token em teste.
async function chamar<T>(metodo: string, rota: string, corpo?: unknown): Promise<T | null> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: metodo,
    credentials: "omit",
    headers: {
      [CABECALHO_DO_CONVITE]: token.value,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  if (resposta.status === 204) return null;
  const corpoResposta = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const titulo = (corpoResposta as { title?: string } | null)?.title;
    throw new Error(titulo ?? "Nao foi possivel falar com o servidor.");
  }
  return (corpoResposta as { data: T }).data;
}

const formulario = reactive<Record<string, string>>({});

const CAMPOS = [
  { chave: "nascimento", rotulo: "Data de nascimento *", tipo: "date" },
  { chave: "sexo", rotulo: "Sexo *", tipo: "text" },
  { chave: "estadoCivil", rotulo: "Estado civil *", tipo: "text" },
  { chave: "racaCor", rotulo: "Raça/cor *", tipo: "text" },
  { chave: "grauInstrucao", rotulo: "Grau de instrução *", tipo: "text" },
  { chave: "nacionalidade", rotulo: "Nacionalidade *", tipo: "text" },
  { chave: "naturalidade", rotulo: "Naturalidade *", tipo: "text" },
  { chave: "nomeMae", rotulo: "Nome da mãe *", tipo: "text" },
  { chave: "nomePai", rotulo: "Nome do pai", tipo: "text" },
  { chave: "nomeSocial", rotulo: "Nome social", tipo: "text" },
  { chave: "cep", rotulo: "CEP *", tipo: "text" },
  { chave: "logradouro", rotulo: "Logradouro *", tipo: "text" },
  { chave: "numero", rotulo: "Número *", tipo: "text" },
  { chave: "complemento", rotulo: "Complemento", tipo: "text" },
  { chave: "bairro", rotulo: "Bairro *", tipo: "text" },
  { chave: "municipio", rotulo: "Município *", tipo: "text" },
  { chave: "uf", rotulo: "UF *", tipo: "text" },
  { chave: "telefone", rotulo: "Telefone *", tipo: "text" },
  { chave: "email", rotulo: "E-mail", tipo: "email" },
  { chave: "rgNumero", rotulo: "RG — número *", tipo: "text" },
  { chave: "rgOrgao", rotulo: "RG — órgão emissor *", tipo: "text" },
  { chave: "rgUf", rotulo: "RG — UF *", tipo: "text" },
  { chave: "rgEmissao", rotulo: "RG — data de emissão *", tipo: "date" },
  { chave: "tituloEleitor", rotulo: "Título de eleitor", tipo: "text" },
  { chave: "tituloZona", rotulo: "Zona", tipo: "text" },
  { chave: "tituloSecao", rotulo: "Seção", tipo: "text" },
  { chave: "banco", rotulo: "Banco", tipo: "text" },
  { chave: "agencia", rotulo: "Agência", tipo: "text" },
  { chave: "conta", rotulo: "Conta", tipo: "text" },
  { chave: "contaDigito", rotulo: "Dígito", tipo: "text" },
  { chave: "contaTipo", rotulo: "Tipo de conta", tipo: "text" }
] as const;

function preencher(dados: FichaPublicaDto) {
  for (const { chave } of CAMPOS) {
    formulario[chave] = (dados.campos as Record<string, string | null>)[chave] ?? "";
  }
}

const somenteLeitura = computed(() => ficha.value?.situacao === "enviada" || ficha.value?.situacao === "aprovada");

function corpoDaFicha() {
  const campos: Record<string, string> = {};
  for (const { chave } of CAMPOS) {
    const valor = formulario[chave]?.trim() ?? "";
    if (valor) campos[chave] = valor;
  }
  return campos;
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const dados = await chamar<FichaPublicaDto>("GET", "/api/admissao/ficha");
    if (dados) {
      ficha.value = dados;
      preencher(dados);
      aceite.value = dados.avisoAceitoEm !== null;
    }
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel abrir o formulario.";
  } finally {
    carregando.value = false;
  }
}

async function salvarRascunho() {
  if (!ficha.value || salvando.value) return;
  salvando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    await chamar("PUT", "/api/admissao/ficha", { versao: ficha.value.versao, ...corpoDaFicha() });
    aviso.value = "Rascunho salvo. Você pode voltar depois pelo mesmo link.";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar.";
  } finally {
    salvando.value = false;
  }
}

async function enviar() {
  if (!ficha.value || salvando.value) return;
  salvando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    await chamar("POST", "/api/admissao/ficha/enviar", {
      versao: ficha.value.versao,
      semDependentes: true,
      avisoPrivacidadeVersao: ficha.value.avisoVersaoVigente,
      ...corpoDaFicha()
    });
    aviso.value = "Ficha enviada. O RH vai conferir e falar com você.";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível enviar.";
  } finally {
    salvando.value = false;
  }
}

onMounted(async () => {
  token.value = tokenDoFragmento(window.location.hash);
  // Tira o segredo da barra de endereços e do histórico, sem navegar.
  if (token.value) history.replaceState(null, "", window.location.pathname);
  if (!token.value) {
    erro.value = "Link inválido. Peça um novo ao RH.";
    carregando.value = false;
    return;
  }
  await carregar();
});
</script>

<template>
  <v-main class="min-h-screen panel-bg d-flex justify-center pa-4">
    <div class="ficha">
      <header class="ficha__cabecalho">
        <h1 class="ficha__titulo">Cadastro de admissão</h1>
        <p v-if="ficha" class="ficha__sub">
          {{ ficha.cabecalho.empresaNome }}
          <span v-if="ficha.cabecalho.nomeCompleto"> · {{ ficha.cabecalho.nomeCompleto }}</span>
        </p>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>
      <v-alert v-if="aviso" type="success" variant="tonal" density="compact" class="mb-4">{{ aviso }}</v-alert>

      <p v-if="carregando" class="ficha__estado">Carregando o formulário…</p>

      <template v-else-if="ficha">
        <v-alert
          v-if="ficha.situacao === 'devolvida' && ficha.revisaoPendencias"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          <strong>O RH pediu correções.</strong> {{ ficha.revisaoPendencias }}
        </v-alert>

        <v-alert v-if="somenteLeitura" type="info" variant="tonal" density="compact" class="mb-4">
          Sua ficha já foi enviada e está em análise. Não é possível editar agora.
        </v-alert>

        <section class="ficha__secao">
          <h2>Confira os dados do RH</h2>
          <dl class="ficha__conferencia">
            <div><dt>Função</dt><dd>{{ ficha.cabecalho.funcaoNome ?? "—" }}</dd></div>
            <div><dt>Turno</dt><dd>{{ ficha.cabecalho.turnoRotulo ?? "—" }}</dd></div>
            <div><dt>Data de admissão</dt><dd>{{ ficha.cabecalho.dataAdmissao ?? "—" }}</dd></div>
          </dl>
          <p class="ficha__nota">
            Se algo aqui estiver errado, fale com o RH antes de enviar — estes campos não são editados por você.
          </p>
        </section>

        <form class="ficha__secao" @submit.prevent="enviar">
          <h2>Seus dados</h2>
          <div class="ficha__campos">
            <v-text-field
              v-for="campo in CAMPOS"
              :key="campo.chave"
              v-model="formulario[campo.chave]"
              :label="campo.rotulo"
              :type="campo.tipo"
              :disabled="somenteLeitura"
              density="comfortable"
            />
          </div>

          <section class="ficha__aviso">
            <h2>Aviso de privacidade</h2>
            <pre class="ficha__aviso-texto">{{ ficha.avisoTexto }}</pre>
            <v-checkbox
              v-model="aceite"
              :disabled="somenteLeitura"
              density="compact"
              :label="`Li e aceito o aviso de privacidade (versão ${ficha.avisoVersaoVigente}).`"
            />
          </section>

          <p class="ficha__nota">
            Dependentes entram numa etapa seguinte, que ainda não está disponível. Ao enviar, você declara
            que não há dependentes a informar agora.
          </p>

          <footer v-if="!somenteLeitura" class="ficha__acoes">
            <v-btn variant="text" :disabled="salvando" @click="salvarRascunho">Salvar rascunho</v-btn>
            <v-btn color="primary" variant="flat" type="submit" :loading="salvando" :disabled="!aceite">
              Enviar ficha
            </v-btn>
          </footer>
        </form>
      </template>
    </div>
  </v-main>
</template>

<style scoped>
.ficha {
  width: 100%;
  max-width: 880px;
  display: grid;
  gap: var(--cx-sp-4);
  align-content: start;
}

.ficha__cabecalho {
  display: grid;
  gap: var(--cx-sp-1);
}

.ficha__titulo {
  margin: 0;
  font-size: var(--cx-fs-h1);
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}

.ficha__sub {
  margin: 0;
  color: var(--cx-ink-soft);
}

.ficha__estado {
  color: var(--cx-ink-soft);
}

.ficha__secao {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}

.ficha__secao h2 {
  margin: 0;
  font-size: var(--cx-fs-title);
  color: var(--cx-ink);
}

.ficha__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}

.ficha__conferencia {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
}

.ficha__conferencia dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.ficha__conferencia dd {
  margin: 0;
  color: var(--cx-ink);
}

.ficha__aviso {
  display: grid;
  gap: var(--cx-sp-2);
}

.ficha__aviso-texto {
  margin: 0;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  white-space: pre-wrap;
  font-family: inherit;
}

.ficha__nota {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.ficha__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}

@media (max-width: 768px) {
  .ficha__campos,
  .ficha__conferencia {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
