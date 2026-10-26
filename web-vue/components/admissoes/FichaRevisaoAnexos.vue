<script setup lang="ts">
import type { AnexoAdmissaoDto } from "@padaria/shared";

const props = defineProps<{ processoId: string; anexos: AnexoAdmissaoDto[] }>();
const { apiUrl } = useApi();
const baixando = ref<string | null>(null);
const erro = ref("");

const rotulos: Record<string, string> = {
  rg: "RG",
  cpf: "CPF",
  titulo_eleitor: "Título de eleitor",
  certidao_nascimento_casamento: "Certidão de nascimento/casamento",
  comprovante_residencia: "Comprovante de residência",
  foto_3x4: "Foto 3x4",
  ctps_digital: "CTPS digital",
  pis_pasep_nit: "PIS/PASEP/NIT",
  certificado_reservista: "Certificado reservista",
  comprovante_escolaridade: "Comprovante de escolaridade",
  certificados_profissionais: "Certificados profissionais",
  aso_admissional: "ASO admissional"
};

function tamanho(tamanhoBytes: number): string {
  return tamanhoBytes < 1024 * 1024
    ? `${Math.max(1, Math.round(tamanhoBytes / 1024))} KB`
    : `${(tamanhoBytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function abrir(anexo: AnexoAdmissaoDto) {
  baixando.value = anexo.id;
  erro.value = "";
  // A janela nasce durante o clique; assim o navegador não a bloqueia quando o fetch terminar.
  const janela = window.open("about:blank", "_blank");
  if (janela) janela.opener = null;
  try {
    const resposta = await fetch(`${apiUrl}/api/admissoes/processos/${props.processoId}/ficha/anexos/${anexo.id}`, {
      credentials: "include"
    });
    if (!resposta.ok) {
      janela?.close();
      if (resposta.status === 401 || resposta.status === 403)
        throw new Error("Sua sessão não permite abrir este anexo.");
      if (resposta.status === 404) throw new Error("Este arquivo não está mais disponível no armazenamento.");
      throw new Error("Não foi possível abrir o anexo agora.");
    }
    const url = URL.createObjectURL(await resposta.blob());
    const destino = janela ?? window.open(url, "_blank");
    if (!destino) throw new Error("O navegador bloqueou a abertura do anexo. Permita pop-ups para este site.");
    if (janela) janela.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível abrir o anexo.";
  } finally {
    baixando.value = null;
  }
}
</script>

<template>
  <section class="anexos" aria-labelledby="ficha-anexos-titulo">
    <div class="anexos__cabecalho">
      <h2 id="ficha-anexos-titulo">Documentos anexados</h2>
      <span>{{ anexos.length }} enviado(s)</span>
    </div>
    <p v-if="erro" class="anexos__erro">{{ erro }}</p>
    <p v-if="!anexos.length" class="anexos__vazio">Nenhum documento foi anexado.</p>
    <ul v-else class="anexos__lista">
      <li v-for="anexo in anexos" :key="anexo.id" class="anexos__item">
        <div>
          <strong>{{ rotulos[anexo.tipo] ?? anexo.tipo }}</strong>
          <span>{{ anexo.nomeOriginal }} · {{ tamanho(anexo.tamanhoBytes) }}</span>
        </div>
        <button type="button" :disabled="baixando === anexo.id" @click="abrir(anexo)">
          {{ baixando === anexo.id ? "Abrindo…" : "Abrir anexo" }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.anexos {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
}

.anexos__cabecalho,
.anexos__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}

.anexos__cabecalho h2,
.anexos__cabecalho span,
.anexos__item strong,
.anexos__item span,
.anexos__vazio,
.anexos__erro {
  margin: 0;
}

.anexos__cabecalho span,
.anexos__item span {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.anexos__lista {
  display: grid;
  gap: var(--cx-sp-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.anexos__item {
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-r-md);
}

.anexos__item div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.anexos__item button {
  flex: 0 0 auto;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 0;
  border-radius: var(--cx-r-md);
  color: var(--cx-on-brand);
  background: var(--cx-brand);
  cursor: pointer;
}

.anexos__erro {
  color: var(--cx-danger);
}

@media (max-width: 600px) {
  .anexos__item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
