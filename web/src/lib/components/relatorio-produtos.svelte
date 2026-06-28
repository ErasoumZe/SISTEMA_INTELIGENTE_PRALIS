<script lang="ts">
  import { apiGet } from "$lib/api";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";

  let { empresaId }: { empresaId: string } = $props();

  let carregado = $state(false);
  let carregando = $state(false);
  let produtos = $state<Array<{ produto: string; quantidade: number; valorTotal: number }>>([]);

  function dinheiro(valor: number | string) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  async function carregar(idEmpresa = empresaId) {
    if (!idEmpresa || carregando) return;
    carregando = true;
    try {
      produtos = await apiGet(`/api/relatorios/produtos-mais-vendidos?empresaId=${idEmpresa}`);
      carregado = true;
    } finally {
      carregando = false;
    }
  }

  $effect(() => {
    const idEmpresa = empresaId;
    produtos = [];
    carregado = false;
    if (idEmpresa) void carregar(idEmpresa);
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Produtos mais vendidos</Card.Title>
    <Card.Description>Relatorio permitido para caixa e gerente.</Card.Description>
  </Card.Header>
  <Card.Content>
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Produto</Table.Head>
          <Table.Head>Quantidade</Table.Head>
          <Table.Head class="text-right">Valor</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each produtos as item}
          <Table.Row>
            <Table.Cell>{item.produto}</Table.Cell>
            <Table.Cell>{item.quantidade}</Table.Cell>
            <Table.Cell class="text-right">{dinheiro(item.valorTotal)}</Table.Cell>
          </Table.Row>
        {:else}
          <Table.Row>
            <Table.Cell colspan={3} class="text-center text-muted-foreground">{carregando ? "Carregando..." : "Nenhum produto encontrado."}</Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </Card.Content>
</Card.Root>
