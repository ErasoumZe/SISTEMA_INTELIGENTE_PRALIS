<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import { ChevronLeft, ChevronRight, Plus } from "@lucide/svelte";

  let {
    titulo,
    descricao,
    colunas,
    linhas,
    acao,
	    aoAcionar,
	    aoImportar,
	    aoEditar,
	    aoExportar,
	    acoesExtras = [],
    acaoCarregando = false,
    editarCarregandoId = ""
  }: {
    titulo: string;
    descricao: string;
    colunas: string[];
    linhas: Array<Record<string, string | undefined>>;
	    acao: string;
	    aoAcionar?: () => void;
	    aoImportar?: () => void;
	    aoEditar?: (linha: Record<string, string | undefined>) => void;
	    aoExportar?: (linha: Record<string, string | undefined>) => void;
	    acoesExtras?: Array<{ label: string; handler: (linha: Record<string, string | undefined>) => void }>;
    acaoCarregando?: boolean;
    editarCarregandoId?: string;
  } = $props();

  let pagina = $state(1);
  const itensPorPagina = 10;

  const totalPaginas = $derived(Math.max(1, Math.ceil(linhas.length / itensPorPagina)));
  const linhasPaginadas = $derived(linhas.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina));
  const inicio = $derived(linhas.length ? (pagina - 1) * itensPorPagina + 1 : 0);
  const fim = $derived(Math.min(pagina * itensPorPagina, linhas.length));

  $effect(() => {
    if (pagina > totalPaginas) pagina = totalPaginas;
  });

  function valorLinha(linha: Record<string, string | undefined>, indice: number) {
    const chave = colunas[indice]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "_");
    return (chave ? linha[chave] : undefined) || "-";
  }
</script>

<Card.Root class="shadow-sm">
  <Card.Header class="flex-row items-center justify-between">
    <div>
      <Card.Title>{titulo}</Card.Title>
      <Card.Description>{descricao}</Card.Description>
    </div>
	    <div class="flex items-center gap-2">
	      {#if aoImportar}
	        <Button size="sm" variant="outline" onclick={aoImportar} disabled={acaoCarregando}>Importar</Button>
	      {/if}
	      {#if aoAcionar}
	        <Button size="sm" onclick={aoAcionar} disabled={acaoCarregando}>
	          <Plus class="size-4" />
	          {acaoCarregando ? "Aguarde..." : acao}
	        </Button>
	      {/if}
	    </div>
  </Card.Header>
  <Card.Content>
    <Table.Root>
      <Table.Header>
        <Table.Row>
          {#each colunas as coluna}
            <Table.Head>{coluna}</Table.Head>
          {/each}
	          {#if aoEditar || aoExportar || acoesExtras.length}
	            <Table.Head class="text-right">Acoes</Table.Head>
	          {/if}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each linhasPaginadas as linha}
          <Table.Row>
            {#each colunas as _, indice}
              <Table.Cell>{valorLinha(linha, indice)}</Table.Cell>
            {/each}
	            {#if aoEditar || aoExportar || acoesExtras.length}
	              <Table.Cell class="text-right">
	                <div class="flex justify-end gap-2">
	                  {#each acoesExtras as acaoExtra}
	                    <Button variant="ghost" size="sm" onclick={() => acaoExtra.handler(linha)}>{acaoExtra.label}</Button>
	                  {/each}
	                  {#if aoExportar}
	                    <Button variant="ghost" size="sm" onclick={() => aoExportar?.(linha)}>Exportar</Button>
	                  {/if}
	                  {#if aoEditar}
	                    <Button variant="ghost" size="sm" onclick={() => aoEditar?.(linha)} disabled={editarCarregandoId === linha.id}>
	                      {editarCarregandoId === linha.id ? "Carregando..." : "Editar"}
	                    </Button>
	                  {/if}
	                </div>
	              </Table.Cell>
	            {/if}
          </Table.Row>
        {:else}
          <Table.Row>
	            <Table.Cell colspan={colunas.length + (aoEditar || aoExportar || acoesExtras.length ? 1 : 0)} class="h-28 text-center text-muted-foreground">
              Nenhum registro cadastrado.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
    {#if linhas.length > itensPorPagina}
      <div class="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Mostrando {inicio}-{fim} de {linhas.length}</span>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" onclick={() => (pagina = Math.max(1, pagina - 1))} disabled={pagina === 1}>
            <ChevronLeft class="size-4" />
            Anterior
          </Button>
          <span class="min-w-16 text-center font-semibold text-foreground">{pagina} / {totalPaginas}</span>
          <Button variant="outline" size="sm" onclick={() => (pagina = Math.min(totalPaginas, pagina + 1))} disabled={pagina === totalPaginas}>
            Proxima
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
