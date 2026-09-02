<script setup lang="ts">
import {
  cpfValido,
  finalidadesSugeridas,
  parentescosSugeridos,
  type DependentesDto,
  type FichaPublicaDto
} from "@padaria/shared";
import { CABECALHO_DO_CONVITE, tokenDoFragmento } from "~/utils/convite-token";

/**
 * ADM-003 V3/V4 — a ficha do candidato.
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

// --- Dependentes (V4) ---------------------------------------------------------------------------
//
// A declaracao tem TRES estados, e a tela precisa mostrar os tres: `null` e "ainda nao respondeu",
// e nao "tem dependentes". Quem apaga o ultimo dependente volta para `null` de proposito — apagar
// nao e declarar, e o servidor devolve esse `null` para a pessoa responder de novo, conscientemente.
//
// O valor local so vai para o servidor junto com o rascunho ou com o envio. As rotas de dependente,
// essas sim, devolvem a declaracao ja gravada, e o que elas devolvem manda: cadastrar alguem
// desmarca "nao tenho" no servidor, e a tela precisa refletir isso sem discutir.

type LinhaDependente = {
  chave: string;
  /** `null` enquanto a linha existe so na tela. */
  id: string | null;
  nomeCompleto: string;
  nascimento: string;
  parentesco: string;
  cpf: string;
  finalidades: string[];
  /** Assinatura do que o servidor tem. Vazia numa linha nova, que por isso ja nasce por gravar. */
  gravado: string;
};

const PARENTESCOS = [...parentescosSugeridos];
const FINALIDADES = [...finalidadesSugeridas];

const declaracao = ref<boolean | null>(null);
const dependentes = ref<LinhaDependente[]>([]);
const salvandoDependente = ref("");
const botaoAdicionar = ref<{ $el?: HTMLElement } | null>(null);

let sequencia = 0;

function assinatura(linha: LinhaDependente): string {
  return JSON.stringify([
    linha.nomeCompleto.trim(),
    linha.nascimento,
    linha.parentesco.trim(),
    linha.cpf.trim(),
    [...linha.finalidades].sort()
  ]);
}

function porGravar(linha: LinhaDependente): boolean {
  return assinatura(linha) !== linha.gravado;
}

/** O erro que a pessoa ve ANTES de o servidor responder. O servidor e o banco repetem a conta. */
function erroDoCpf(linha: LinhaDependente): string {
  const valor = linha.cpf.trim();
  if (valor === "") return "";
  return cpfValido(valor) ? "" : "CPF inválido — confira os números.";
}

function erroDaLinha(linha: LinhaDependente): string {
  if (linha.nomeCompleto.trim() === "") return "Informe o nome do dependente.";
  if (!linha.nascimento) return "Informe a data de nascimento.";
  if (linha.parentesco.trim() === "") return "Informe o parentesco.";
  return erroDoCpf(linha);
}

function aplicarDependentes(dados: DependentesDto) {
  if (ficha.value) ficha.value.versao = dados.versao;
  declaracao.value = dados.semDependentes;
  dependentes.value = dados.itens.map((item) => {
    const linha: LinhaDependente = {
      chave: item.id,
      id: item.id,
      nomeCompleto: item.nomeCompleto,
      nascimento: item.nascimento,
      parentesco: item.parentesco,
      cpf: item.cpf ?? "",
      finalidades: [...item.finalidades],
      gravado: ""
    };
    linha.gravado = assinatura(linha);
    return linha;
  });
}

function adicionarDependente() {
  sequencia += 1;
  dependentes.value.push({
    chave: `nova-${sequencia}`,
    id: null,
    nomeCompleto: "",
    nascimento: "",
    parentesco: "",
    cpf: "",
    finalidades: [],
    gravado: ""
  });
  // Marcar "tenho dependentes" e a consequencia obvia de comecar a cadastrar um; o servidor grava
  // isso sozinho no primeiro POST, e antecipar aqui evita a tela piscar entre os dois estados.
  declaracao.value = false;
}

async function salvarDependente(linha: LinhaDependente) {
  if (salvandoDependente.value || erroDaLinha(linha)) return;
  salvandoDependente.value = linha.chave;
  erro.value = "";
  aviso.value = "";
  try {
    const corpo = {
      nomeCompleto: linha.nomeCompleto.trim(),
      nascimento: linha.nascimento,
      parentesco: linha.parentesco.trim(),
      cpf: linha.cpf.trim(),
      finalidades: linha.finalidades
    };
    const dados = linha.id
      ? await chamar<DependentesDto>("PUT", `/api/admissao/dependentes/${linha.id}`, corpo)
      : await chamar<DependentesDto>("POST", "/api/admissao/dependentes", corpo);
    if (dados) aplicarDependentes(dados);
    aviso.value = "Dependente salvo.";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar o dependente.";
  } finally {
    salvandoDependente.value = "";
  }
}

async function removerDependente(linha: LinhaDependente) {
  if (salvandoDependente.value) return;
  // Linha que nunca foi gravada some sem ida ao servidor: nao ha o que apagar la.
  if (!linha.id) {
    dependentes.value = dependentes.value.filter((atual) => atual.chave !== linha.chave);
    await devolverOFoco();
    return;
  }
  salvandoDependente.value = linha.chave;
  erro.value = "";
  aviso.value = "";
  try {
    const dados = await chamar<DependentesDto>("DELETE", `/api/admissao/dependentes/${linha.id}`);
    if (dados) aplicarDependentes(dados);
    aviso.value = "Dependente removido.";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover o dependente.";
  } finally {
    salvandoDependente.value = "";
    await devolverOFoco();
  }
}

/**
 * Depois de remover, o foco do teclado ficaria num botao que deixou de existir — e o navegador o
 * devolve para o `body`, jogando quem usa teclado ou leitor de tela para o comeco da pagina.
 */
async function devolverOFoco() {
  await nextTick();
  botaoAdicionar.value?.$el?.focus();
}

async function carregarDependentes() {
  const dados = await chamar<DependentesDto>("GET", "/api/admissao/dependentes");
  if (dados) aplicarDependentes(dados);
}

const temDependentesGravados = computed(() => dependentes.value.some((linha) => linha.id !== null));
const dependentesPorGravar = computed(() => dependentes.value.some(porGravar));
const podeEnviar = computed(() => aceite.value && declaracao.value !== null && !dependentesPorGravar.value);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const dados = await chamar<FichaPublicaDto>("GET", "/api/admissao/ficha");
    if (dados) {
      ficha.value = dados;
      preencher(dados);
      aceite.value = dados.avisoAceitoEm !== null;
      declaracao.value = dados.semDependentes;
      await carregarDependentes();
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
    await chamar("PUT", "/api/admissao/ficha", {
      versao: ficha.value.versao,
      semDependentes: declaracao.value,
      ...corpoDaFicha()
    });
    aviso.value = "Rascunho salvo. Você pode voltar depois pelo mesmo link.";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar.";
  } finally {
    salvando.value = false;
  }
}

async function enviar() {
  if (!ficha.value || salvando.value || declaracao.value === null) return;
  salvando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    await chamar("POST", "/api/admissao/ficha/enviar", {
      versao: ficha.value.versao,
      semDependentes: declaracao.value,
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

          <section class="dep">
            <h2>Dependentes</h2>
            <!-- A coluna guardada e `sem_dependentes`, entao "tenho" e false e "nao tenho" e true.
                 A inversao mora aqui, num lugar so, em vez de virar um segundo campo na tela. -->
            <v-radio-group
              v-model="declaracao"
              :disabled="somenteLeitura"
              density="compact"
              hide-details="auto"
              label="Você tem dependentes a informar?"
            >
              <v-radio :value="false" label="Sim, tenho dependentes" />
              <v-radio
                :value="true"
                :disabled="somenteLeitura || temDependentesGravados"
                label="Não tenho dependentes"
              />
            </v-radio-group>

            <p v-if="temDependentesGravados" class="ficha__nota">
              Para declarar que não tem dependentes, remova antes os que já estão cadastrados.
            </p>

            <template v-if="declaracao === false">
              <TransitionGroup name="dep-lista" tag="div" class="dep__lista">
                <fieldset v-for="(linha, indice) in dependentes" :key="linha.chave" class="dep__item">
                  <legend class="dep__legenda">Dependente {{ indice + 1 }}</legend>

                  <div class="dep__campos">
                    <v-text-field
                      v-model="linha.nomeCompleto"
                      label="Nome completo *"
                      :disabled="somenteLeitura"
                      density="comfortable"
                      hide-details="auto"
                    />
                    <v-text-field
                      v-model="linha.nascimento"
                      label="Data de nascimento *"
                      type="date"
                      :disabled="somenteLeitura"
                      density="comfortable"
                      hide-details="auto"
                    />
                    <v-select
                      v-model="linha.parentesco"
                      :items="PARENTESCOS"
                      label="Parentesco *"
                      :disabled="somenteLeitura"
                      density="comfortable"
                      hide-details="auto"
                    />
                    <v-text-field
                      v-model="linha.cpf"
                      label="CPF (se tiver)"
                      inputmode="numeric"
                      :disabled="somenteLeitura"
                      :error-messages="erroDoCpf(linha)"
                      density="comfortable"
                      hide-details="auto"
                    />
                    <v-select
                      v-model="linha.finalidades"
                      :items="FINALIDADES"
                      label="Para que este dependente é informado"
                      multiple
                      chips
                      :disabled="somenteLeitura"
                      density="comfortable"
                      hide-details="auto"
                      class="dep__campo-largo"
                    />
                  </div>

                  <footer v-if="!somenteLeitura" class="dep__acoes">
                    <v-btn
                      type="button"
                      variant="text"
                      color="error"
                      :disabled="salvandoDependente !== ''"
                      :aria-label="`Remover dependente ${indice + 1}`"
                      @click="removerDependente(linha)"
                    >
                      Remover
                    </v-btn>
                    <v-btn
                      type="button"
                      variant="tonal"
                      :loading="salvandoDependente === linha.chave"
                      :disabled="!porGravar(linha) || erroDaLinha(linha) !== ''"
                      :aria-label="`Salvar dependente ${indice + 1}`"
                      @click="salvarDependente(linha)"
                    >
                      {{ linha.id ? "Salvar alterações" : "Salvar dependente" }}
                    </v-btn>
                  </footer>
                </fieldset>
              </TransitionGroup>

              <v-btn
                v-if="!somenteLeitura"
                ref="botaoAdicionar"
                type="button"
                variant="outlined"
                class="dep__adicionar"
                @click="adicionarDependente"
              >
                Adicionar dependente
              </v-btn>

              <p v-if="dependentes.length === 0" class="ficha__nota">
                Você marcou que tem dependentes. Cadastre pelo menos um antes de enviar a ficha.
              </p>
            </template>

            <p v-else-if="declaracao === true" class="ficha__nota">
              Você declarou que não há dependentes a informar. Se isso mudar, volte por este mesmo link.
            </p>
          </section>

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

          <footer v-if="!somenteLeitura" class="ficha__acoes">
            <p v-if="dependentesPorGravar" class="ficha__nota">
              Há dependente com alterações não salvas. Salve-o antes de enviar a ficha.
            </p>
            <p v-else-if="declaracao === null" class="ficha__nota">
              Responda se você tem dependentes antes de enviar.
            </p>
            <div class="ficha__botoes">
              <v-btn type="button" variant="text" :disabled="salvando" @click="salvarRascunho">
                Salvar rascunho
              </v-btn>
              <v-btn color="primary" variant="flat" type="submit" :loading="salvando" :disabled="!podeEnviar">
                Enviar ficha
              </v-btn>
            </div>
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
  display: grid;
  gap: var(--cx-sp-2);
  justify-items: end;
}

.ficha__botoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}

/* --- Dependentes ------------------------------------------------------------------------------ */

.dep {
  display: grid;
  gap: var(--cx-sp-3);
}

.dep__lista {
  display: grid;
  gap: var(--cx-sp-3);
  /* Ancora para o item que sai: sem isto o 'position: absolute' da saida escaparia do cartao. */
  position: relative;
}

/* `fieldset` de verdade, com `legend`: os campos se repetem por dependente, e sem o agrupamento um
   leitor de tela anuncia cinco vezes "Nome completo" sem dizer de quem. */
.dep__item {
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  padding: var(--cx-sp-4);
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 0;
}

.dep__legenda {
  padding-inline: var(--cx-sp-2);
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.dep__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}

.dep__campo-largo {
  grid-column: 1 / -1;
}

.dep__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}

.dep__adicionar {
  justify-self: start;
}

/* Entrada e saida assimetricas: quem chega desliza para o lugar, quem sai apenas recolhe — sem
   promessa de movimento onde ja nao ha nada para olhar. So `opacity` e `transform`, que o
   compositor resolve sem relayout. */
.dep-lista-enter-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
}

.dep-lista-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
  position: absolute;
}

.dep-lista-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.dep-lista-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.dep-lista-move {
  transition: transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dep-lista-enter-active,
  .dep-lista-leave-active,
  .dep-lista-move {
    transition: none;
  }
}

@media (max-width: 768px) {
  .ficha__campos,
  .ficha__conferencia,
  .dep__campos {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
