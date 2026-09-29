<script setup lang="ts">
import type { AuthSession, ClinicaOcupacionalDto } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ empresaId: string }>();
const { apiGet, apiPost, apiPut } = useApi();
const sessao = useState<AuthSession | null>("padaria.workspace.sessao");
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeCriar = computed(() => temPermissao(permissoes.value, "admissoes_clinicas_ocupacionais_criar"));
const podeEditar = computed(() => temPermissao(permissoes.value, "admissoes_clinicas_ocupacionais_editar"));
const podeVisualizar = computed(() => temPermissao(permissoes.value, "admissoes_clinicas_ocupacionais_visualizar"));

type FormClinica = {
  nome: string; cnpj: string; email: string; whatsapp: string; contatoNome: string; observacoes: string; ativo: boolean;
};
type FormUnidade = {
  nome: string; email: string; whatsapp: string; cep: string; logradouro: string; numero: string;
  complemento: string; bairro: string; municipio: string; uf: string; ativo: boolean;
};
const vazioClinica = (): FormClinica => ({ nome: "", cnpj: "", email: "", whatsapp: "", contatoNome: "", observacoes: "", ativo: true });
const vazioUnidade = (): FormUnidade => ({ nome: "", email: "", whatsapp: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "", ativo: true });

const linhas = ref<ClinicaOcupacionalDto[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const dialogoClinica = ref(false);
const dialogoUnidade = ref(false);
const clinicaEditando = ref<ClinicaOcupacionalDto | null>(null);
const unidadeEditando = ref<ClinicaOcupacionalDto["unidades"][number] | null>(null);
const clinicaDaUnidade = ref<ClinicaOcupacionalDto | null>(null);
const formClinica = reactive<FormClinica>(vazioClinica());
const formUnidade = reactive<FormUnidade>(vazioUnidade());
const snackbar = reactive({ show: false, text: "", color: "success" });

function limparNumeros(valor: string) { return valor.replace(/\D/gu, ""); }
function nulo(texto: string) { const valor = texto.trim(); return valor || null; }
function notificar(text: string, color = "success") { snackbar.text = text; snackbar.color = color; snackbar.show = true; }

async function carregar() {
  if (!props.empresaId || !podeVisualizar.value) return;
  carregando.value = true; erro.value = "";
  try { linhas.value = await apiGet<ClinicaOcupacionalDto[]>(`/api/clinicas-ocupacionais?empresaId=${encodeURIComponent(props.empresaId)}`); }
  catch (causa) { erro.value = mensagemErro(causa); }
  finally { carregando.value = false; }
}

function abrirClinica(clinica: ClinicaOcupacionalDto | null) {
  clinicaEditando.value = clinica;
  Object.assign(formClinica, clinica ? {
    nome: clinica.nome, cnpj: clinica.cnpj ?? "", email: clinica.email ?? "", whatsapp: clinica.whatsapp ?? "",
    contatoNome: clinica.contatoNome ?? "", observacoes: clinica.observacoes ?? "", ativo: clinica.ativo
  } : vazioClinica());
  dialogoClinica.value = true;
}

function abrirUnidade(clinica: ClinicaOcupacionalDto, unidade: ClinicaOcupacionalDto["unidades"][number] | null) {
  clinicaDaUnidade.value = clinica; unidadeEditando.value = unidade;
  Object.assign(formUnidade, unidade ? {
    nome: unidade.nome, email: unidade.email ?? "", whatsapp: unidade.whatsapp ?? "", cep: unidade.cep ?? "",
    logradouro: unidade.logradouro ?? "", numero: unidade.numero ?? "", complemento: unidade.complemento ?? "",
    bairro: unidade.bairro ?? "", municipio: unidade.municipio ?? "", uf: unidade.uf ?? "", ativo: unidade.ativo
  } : vazioUnidade());
  dialogoUnidade.value = true;
}

async function salvarClinica() {
  if (salvando.value) return;
  salvando.value = true;
  try {
    const corpo = { empresaId: props.empresaId, nome: formClinica.nome, cnpj: nulo(limparNumeros(formClinica.cnpj)),
      email: nulo(formClinica.email), whatsapp: nulo(limparNumeros(formClinica.whatsapp)), contatoNome: nulo(formClinica.contatoNome),
      observacoes: nulo(formClinica.observacoes), ativo: formClinica.ativo };
    if (clinicaEditando.value) await apiPut(`/api/clinicas-ocupacionais/${clinicaEditando.value.id}`, corpo);
    else await apiPost("/api/clinicas-ocupacionais", corpo);
    dialogoClinica.value = false; notificar(clinicaEditando.value ? "Clínica atualizada." : "Clínica cadastrada."); await carregar();
  } catch (causa) { notificar(mensagemErro(causa), "error"); } finally { salvando.value = false; }
}

async function salvarUnidade() {
  const clinica = clinicaDaUnidade.value;
  if (!clinica || salvando.value) return;
  salvando.value = true;
  try {
    const corpo = { empresaId: props.empresaId, nome: formUnidade.nome, email: nulo(formUnidade.email),
      whatsapp: nulo(limparNumeros(formUnidade.whatsapp)), cep: nulo(limparNumeros(formUnidade.cep)),
      logradouro: nulo(formUnidade.logradouro), numero: nulo(formUnidade.numero), complemento: nulo(formUnidade.complemento),
      bairro: nulo(formUnidade.bairro), municipio: nulo(formUnidade.municipio), uf: nulo(formUnidade.uf.toUpperCase()), ativo: formUnidade.ativo };
    if (unidadeEditando.value) await apiPut(`/api/clinicas-ocupacionais/${clinica.id}/unidades/${unidadeEditando.value.id}`, corpo);
    else await apiPost(`/api/clinicas-ocupacionais/${clinica.id}/unidades`, corpo);
    dialogoUnidade.value = false; notificar(unidadeEditando.value ? "Unidade atualizada." : "Unidade cadastrada."); await carregar();
  } catch (causa) { notificar(mensagemErro(causa), "error"); } finally { salvando.value = false; }
}

watch(() => props.empresaId, () => void carregar(), { immediate: true });
</script>

<template>
  <section class="clinicas">
    <header class="clinicas__cabecalho">
      <div>
        <p class="clinicas__sobretitulo">Cadastros base do DP</p>
        <h1>Clínicas ocupacionais</h1>
        <p>Cadastre contatos e unidades para usar no encaminhamento de exame. Clínicas em uso não são apagadas: podem ser desativadas.</p>
      </div>
      <v-btn v-if="podeCriar" color="primary" prepend-icon="mdi-hospital-building" @click="abrirClinica(null)">Nova clínica</v-btn>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate class="mb-4" />
    <v-alert v-if="!carregando && !linhas.length" type="info" variant="tonal">Nenhuma clínica cadastrada nesta empresa.</v-alert>

    <div class="clinicas__lista">
      <v-card v-for="clinica in linhas" :key="clinica.id" variant="outlined" class="clinica-card">
        <v-card-title class="clinica-card__titulo">
          <div><h2>{{ clinica.nome }}</h2><p>{{ clinica.contatoNome || "Sem responsável cadastrado" }}</p></div>
          <v-chip size="small" :color="clinica.ativo ? 'success' : undefined" variant="tonal">{{ clinica.ativo ? "Ativa" : "Inativa" }}</v-chip>
        </v-card-title>
        <v-card-text>
          <p class="clinica-card__contato">{{ clinica.email || "Sem e-mail" }} · {{ clinica.whatsapp || "Sem WhatsApp" }}</p>
          <p v-if="clinica.observacoes" class="clinica-card__obs">{{ clinica.observacoes }}</p>
          <div class="clinica-card__unidades">
            <strong>Unidades</strong>
            <p v-if="!clinica.unidades.length">Nenhuma unidade cadastrada.</p>
            <v-list v-else density="compact" class="pa-0">
              <v-list-item v-for="unidade in clinica.unidades" :key="unidade.id" :title="unidade.nome" :subtitle="[unidade.logradouro, unidade.numero, unidade.municipio, unidade.uf].filter(Boolean).join(', ') || 'Endereço não cadastrado'">
                <template #append><v-chip size="x-small" :color="unidade.ativo ? 'success' : undefined" variant="tonal">{{ unidade.ativo ? "Ativa" : "Inativa" }}</v-chip></template>
                <template v-if="podeEditar" #prepend><v-btn icon="mdi-pencil" size="x-small" variant="text" :aria-label="`Editar unidade ${unidade.nome}`" @click="abrirUnidade(clinica, unidade)" /></template>
              </v-list-item>
            </v-list>
          </div>
        </v-card-text>
        <v-card-actions v-if="podeCriar || podeEditar" class="clinica-card__acoes">
          <v-btn v-if="podeEditar" variant="text" @click="abrirClinica(clinica)">Editar clínica</v-btn>
          <v-btn v-if="podeCriar" variant="tonal" prepend-icon="mdi-map-marker-plus-outline" @click="abrirUnidade(clinica, null)">Nova unidade</v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </section>

  <v-dialog v-model="dialogoClinica" max-width="680" persistent>
    <v-card><v-card-title>{{ clinicaEditando ? "Editar clínica" : "Nova clínica" }}</v-card-title><v-card-text class="form-grid">
      <v-text-field v-model="formClinica.nome" label="Nome da clínica" autofocus required /><v-text-field v-model="formClinica.cnpj" label="CNPJ" inputmode="numeric" />
      <v-text-field v-model="formClinica.contatoNome" label="Responsável / contato" /><v-text-field v-model="formClinica.whatsapp" label="WhatsApp" inputmode="tel" />
      <v-text-field v-model="formClinica.email" label="E-mail" type="email" class="form-grid__inteiro" /><v-textarea v-model="formClinica.observacoes" label="Instruções para o DP" class="form-grid__inteiro" rows="3" />
      <v-switch v-if="clinicaEditando" v-model="formClinica.ativo" label="Clínica ativa" color="success" hide-details />
    </v-card-text><v-card-actions><v-spacer /><v-btn variant="text" :disabled="salvando" @click="dialogoClinica = false">Cancelar</v-btn><v-btn color="primary" :loading="salvando" @click="salvarClinica">Salvar</v-btn></v-card-actions></v-card>
  </v-dialog>

  <v-dialog v-model="dialogoUnidade" max-width="760" persistent>
    <v-card><v-card-title>{{ unidadeEditando ? "Editar unidade" : "Nova unidade" }}</v-card-title><v-card-subtitle>{{ clinicaDaUnidade?.nome }}</v-card-subtitle><v-card-text class="form-grid">
      <v-text-field v-model="formUnidade.nome" label="Nome da unidade" autofocus required /><v-text-field v-model="formUnidade.whatsapp" label="WhatsApp" inputmode="tel" />
      <v-text-field v-model="formUnidade.email" label="E-mail" type="email" /><v-text-field v-model="formUnidade.cep" label="CEP" inputmode="numeric" />
      <v-text-field v-model="formUnidade.logradouro" label="Logradouro" /><v-text-field v-model="formUnidade.numero" label="Número" />
      <v-text-field v-model="formUnidade.complemento" label="Complemento" /><v-text-field v-model="formUnidade.bairro" label="Bairro" />
      <v-text-field v-model="formUnidade.municipio" label="Cidade" /><v-text-field v-model="formUnidade.uf" label="UF" maxlength="2" />
      <v-switch v-if="unidadeEditando" v-model="formUnidade.ativo" label="Unidade ativa" color="success" hide-details />
    </v-card-text><v-card-actions><v-spacer /><v-btn variant="text" :disabled="salvando" @click="dialogoUnidade = false">Cancelar</v-btn><v-btn color="primary" :loading="salvando" @click="salvarUnidade">Salvar</v-btn></v-card-actions></v-card>
  </v-dialog>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.clinicas { max-width: 1180px; margin: 0 auto; padding: var(--cx-sp-5); }
.clinicas__cabecalho { display:flex; flex-wrap:wrap; justify-content:space-between; gap:var(--cx-sp-4); margin-bottom:var(--cx-sp-5); }
.clinicas__sobretitulo { margin:0 0 4px; color:var(--cx-brand-text); font-size:var(--cx-fs-micro); font-weight:700; letter-spacing:var(--cx-tracking-wide); text-transform:uppercase; }
.clinicas h1 { font-size:var(--cx-fs-title); }.clinicas__cabecalho p:not(.clinicas__sobretitulo) { margin:6px 0 0; color:var(--cx-ink-soft); max-width:66ch; }
.clinicas__lista { display:grid; gap:var(--cx-sp-3); grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); }
.clinica-card { display:flex; flex-direction:column; }.clinica-card__titulo { display:flex; justify-content:space-between; align-items:flex-start; gap:var(--cx-sp-2); white-space:normal; }.clinica-card__titulo h2 { font-size:var(--cx-fs-lead); }.clinica-card__titulo p,.clinica-card__contato,.clinica-card__obs,.clinica-card__unidades p { margin:4px 0 0; color:var(--cx-ink-soft); font-size:var(--cx-fs-caption); }.clinica-card__obs { white-space:pre-wrap; }.clinica-card__unidades { margin-top:var(--cx-sp-4); }.clinica-card__acoes { margin-top:auto; flex-wrap:wrap; }
.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--cx-sp-2) var(--cx-sp-3); }.form-grid__inteiro { grid-column:1/-1; }
@media (max-width:600px) { .clinicas { padding:var(--cx-sp-3); }.clinicas__cabecalho .v-btn { width:100%; }.clinicas__lista,.form-grid { grid-template-columns:1fr; }.form-grid__inteiro { grid-column:auto; } }
</style>
