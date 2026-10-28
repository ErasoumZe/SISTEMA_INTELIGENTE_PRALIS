/**
 * Aviso que sobrevive a navegacao (o "flash" do cadastro paralelo): quem salva e volta para a
 * listagem ainda ve "Produto salvo". O snackbar mora no `app.vue`, acima do `NuxtPage`, e por isso
 * nao some na troca de rota. A chave usa o prefixo do workspace: o logout limpa junto.
 */
export interface AvisoAoNavegar {
  texto: string;
  tipo: "success" | "warning";
}

export function useAvisoAoNavegar() {
  const aviso = useState<AvisoAoNavegar | null>("padaria.workspace.aviso-ao-navegar", () => null);

  function avisar(texto: string, tipo: AvisoAoNavegar["tipo"] = "success") {
    aviso.value = { texto, tipo };
  }

  function limpar() {
    aviso.value = null;
  }

  return { aviso, avisar, limpar };
}
