<script setup lang="ts">
/**
 * Leitura de codigo de barras pela CAMERA. O leitor laser USB continua funcionando sozinho — ele
 * digita direto no campo, como um teclado; este dialogo e o caminho de quem cadastra no celular.
 *
 * A camera e parada em TODOS os caminhos de saida (ler, cancelar, fechar pelo backdrop, sair da
 * pagina, desmontar). Camera esquecida ligada acende a luz do aparelho e come bateria.
 */
import { BrowserMultiFormatReader } from "@zxing/browser";

const aberto = defineModel<boolean>("aberto", { default: false });
const emit = defineEmits<{ lido: [codigo: string] }>();

const video = ref<HTMLVideoElement | null>(null);
const erro = ref("");
let controles: { stop: () => void } | null = null;
/** Trava contra leitura repetida: o zxing entrega o mesmo codigo varias vezes por segundo. */
let jaLeu = false;

async function iniciar() {
  erro.value = "";
  jaLeu = false;
  await nextTick();
  if (!video.value) return;
  try {
    const leitor = new BrowserMultiFormatReader();
    controles = await leitor.decodeFromConstraints(
      // Camera TRASEIRA quando existir; no desktop o navegador cai na unica disponivel.
      { video: { facingMode: "environment" } },
      video.value,
      (resultado) => {
        if (!resultado || jaLeu) return;
        jaLeu = true;
        emit("lido", resultado.getText());
        fechar();
      }
    );
  } catch (falha) {
    erro.value =
      falha instanceof DOMException && falha.name === "NotFoundError"
        ? "Nenhuma câmera encontrada neste aparelho. Use o leitor USB ou digite o código."
        : "Não foi possível acessar a câmera. Permita o acesso e tente de novo.";
  }
}

function parar() {
  controles?.stop();
  controles = null;
}

function fechar() {
  parar();
  aberto.value = false;
}

watch(aberto, (ligado) => (ligado ? void iniciar() : parar()));

// Navegar para outra rota nao dispara `onBeforeUnmount` do dialogo em todos os casos, entao a
// camera tambem e parada na troca de rota. `beforeEach` devolve a funcao que REMOVE o guard: sem
// chamar isso, cada montagem do formulario deixaria mais um guard global pendurado no router.
const removerGuardaDeRota = useRouter().beforeEach((_para, _de, seguir) => {
  parar();
  seguir();
});

onBeforeUnmount(() => {
  parar();
  removerGuardaDeRota();
});
</script>

<template>
  <v-dialog v-model="aberto" max-width="460" scrollable @after-leave="parar">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-barcode-scan" />
        <span class="text-subtitle-1 font-weight-bold">Ler código de barras</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar leitor" @click="fechar" />
      </v-card-title>
      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-3">{{ erro }}</v-alert>
        <div class="scanner">
          <video ref="video" class="scanner__video" muted autoplay playsinline></video>
          <div class="scanner__moldura" aria-hidden="true"></div>
        </div>
        <p class="scanner__dica">Aponte a câmera para o código de barras. Nada é enviado sem você confirmar.</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.scanner {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--cx-r-md);
  background: #000;
}
.scanner__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scanner__moldura {
  position: absolute;
  inset: 18% 12%;
  border: 2px solid var(--cx-brand);
  border-radius: var(--cx-r-sm);
  box-shadow: 0 0 0 999px rgb(0 0 0 / 25%);
}
.scanner__dica {
  margin: var(--cx-sp-2) 0 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
  text-align: center;
}
</style>
