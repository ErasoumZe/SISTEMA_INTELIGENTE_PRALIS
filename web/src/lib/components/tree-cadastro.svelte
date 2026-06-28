<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { FolderTree, Pencil, Plus } from "@lucide/svelte";

  type TreeItem = {
    id: string;
    nome: string;
    detalhe?: string;
    nivel: number;
    item: Record<string, string | undefined>;
  };

  let {
    titulo,
    descricao,
    itens,
	    acao,
	    aoAcionar,
	    aoImportar,
	    aoExportar,
	    aoEditar,
	    aoCriarFilho
  }: {
    titulo: string;
    descricao: string;
    itens: TreeItem[];
	    acao: string;
	    aoAcionar: () => void;
	    aoImportar?: () => void;
	    aoExportar?: (item: Record<string, string | undefined>) => void;
	    aoEditar: (item: Record<string, string | undefined>) => void;
    aoCriarFilho: (item: Record<string, string | undefined>) => void;
  } = $props();
</script>

<Card.Root class="shadow-sm">
  <Card.Header class="flex-row items-center justify-between">
    <div>
      <Card.Title>{titulo}</Card.Title>
      <Card.Description>{descricao}</Card.Description>
    </div>
	    <div class="flex items-center gap-2">
	      {#if aoImportar}
	        <Button size="sm" variant="outline" onclick={aoImportar}>Importar</Button>
	      {/if}
	      <Button size="sm" onclick={aoAcionar}>
	        <Plus class="size-4" />
	        {acao}
	      </Button>
	    </div>
  </Card.Header>
  <Card.Content>
    <div class="grid gap-2">
      {#each itens as item}
        <div class="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2" style={`margin-left: ${Math.min(item.nivel, 8) * 1.25}rem`}>
          <div class="flex min-w-0 items-center gap-2">
            <FolderTree class="size-4 shrink-0 text-primary" />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold">{item.nome}</p>
              {#if item.detalhe}<p class="truncate text-xs text-muted-foreground">{item.detalhe}</p>{/if}
            </div>
          </div>
	          <div class="flex items-center gap-1">
	            {#if aoExportar}
	              <Button variant="ghost" size="sm" onclick={() => aoExportar?.(item.item)} title="Exportar">Exportar</Button>
	            {/if}
	            <Button variant="ghost" size="sm" onclick={() => aoCriarFilho(item.item)} title="Criar filho">
              <Plus class="size-4" />
              Subitem
            </Button>
            <Button variant="ghost" size="sm" onclick={() => aoEditar(item.item)} title="Editar">
              <Pencil class="size-4" />
              Editar
            </Button>
          </div>
        </div>
      {:else}
        <div class="rounded-lg border bg-muted/40 p-8 text-center text-sm text-muted-foreground">Nenhum registro cadastrado.</div>
      {/each}
    </div>
  </Card.Content>
</Card.Root>
