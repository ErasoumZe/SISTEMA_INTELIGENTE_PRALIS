<script lang="ts">
  import { apiUrl } from "$lib/config";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";

  let email = "diretor@padaria.local";
  let loading = false;
  let message = "";
  let error = "";

  async function requestReset() {
    loading = true;
    message = "";
    error = "";

    const response = await fetch(`${apiUrl}/api/auth/request-password-reset`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        redirectTo: `${window.location.origin}/reset-password`
      })
    });

    if (response.ok) {
      message = "Se o email existir, um link de recuperacao sera gerado no log da API.";
    } else {
      error = "Nao foi possivel solicitar a recuperacao agora.";
    }

    loading = false;
  }
</script>

<main class="grid min-h-screen place-items-center bg-background p-4">
  <Card.Root class="w-full max-w-md shadow-sm">
    <Card.Header>
      <Card.Title>Recuperar acesso</Card.Title>
      <Card.Description>Solicite um link de redefinicao de senha.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); requestReset(); }}>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" bind:value={email} autocomplete="email" name="email" type="email" required />
        </div>
        {#if message}
          <Alert><AlertDescription>{message}</AlertDescription></Alert>
        {/if}
        {#if error}
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        {/if}
        <Button type="submit" disabled={loading}>{loading ? "Enviando..." : "Enviar link"}</Button>
        <Button variant="ghost" href="/login">Voltar para login</Button>
      </form>
    </Card.Content>
  </Card.Root>
</main>
