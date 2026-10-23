import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

/**
 * O esqueleto das telas de Compras (Cotacao por fornecedor, Pedidos finalizados): sessao, empresa escolhida,
 * permissoes do menu e a mensagem passageira. `carregarDados` roda ao abrir e ao trocar de empresa.
 */
export function useTelaCompras(semPermissao: string, carregarDados: () => Promise<void>) {
  const router = useRouter();
  const { apiGet, carregarSessao } = useApi();
  const sessao = ref<AuthSession | null>(null);
  const empresas = ref<Opcao[]>([]);
  const empresaId = ref("");
  const caixaStatus = ref<CaixaStatus | null>(null);
  const carregando = ref(true);
  const erro = ref("");
  const snackbar = reactive({ show: false, text: "", color: "success" });
  const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
  const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
    permissoesUsuario,
    () => Boolean(caixaStatus.value?.caixaAberto)
  );

  function notificar(text: string, color = "success") {
    snackbar.text = text;
    snackbar.color = color;
    snackbar.show = true;
  }
  async function trocarEmpresa(id: string) {
    empresaId.value = id;
    await carregarDados();
  }

  onMounted(async () => {
    try {
      sessao.value = await carregarSessao();
      if (!sessao.value) return void (await router.push("/login"));
      if (!temPermissao("pedidos_visualizar")) return void (erro.value = semPermissao);
      empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
      empresaId.value =
        sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
      await carregarDados();
    } catch (causa) {
      erro.value = mensagemErro(causa);
    } finally {
      carregando.value = false;
    }
  });

  return {
    sessao,
    empresas,
    empresaId,
    caixaStatus,
    carregando,
    erro,
    snackbar,
    temPermissao,
    telasPermitidas,
    telasDesabilitadasMenu,
    motivosTelasDesabilitadas,
    notificar,
    trocarEmpresa
  };
}
