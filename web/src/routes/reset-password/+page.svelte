<script lang="ts">
  import { page } from "$app/stores";
  import { apiUrl } from "$lib/config";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";

  let password = "";
  let loading = false;
  let message = "";
  let error = "";

  $: token = $page.url.searchParams.get("token") ?? "";

  async function resetPassword() {
    loading = true;
    message = "";
    error = "";

    const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        newPassword: password,
        token
      })
    });

    if (response.ok) {
      message = "Senha alterada. Voce ja pode entrar.";
      password = "";
    } else {
      error = "Token invalido ou expirado.";
    }

    loading = false;
  }
</script>

<main class="grid min-h-screen place-items-center bg-background p-4">
  <Card.Root class="w-full max-w-md shadow-sm">
    <Card.Header>
      <Card.Title>Nova senha</Card.Title>
      <Card.Description>Defina uma nova senha para sua conta.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); resetPassword(); }}>
        <div class="grid gap-2">
          <Label for="password">Nova senha</Label>
          <Input id="password" bind:value={password} autocomplete="new-password" name="password" type="password" minlength={8} required />
        </div>
        {#if !token}
          <Alert variant="destructive"><AlertDescription>Token ausente.</AlertDescription></Alert>
        {/if}
        {#if message}
          <Alert><AlertDescription>{message}</AlertDescription></Alert>
          <Button variant="ghost" href="/login">Entrar</Button>
        {/if}
        {#if error}
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        {/if}
        <Button type="submit" disabled={loading || !token}>{loading ? "Salvando..." : "Salvar senha"}</Button>
      </form>
    </Card.Content>
  </Card.Root>
</main>
