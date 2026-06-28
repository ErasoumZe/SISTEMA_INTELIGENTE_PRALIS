<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiUrl } from "$lib/config";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";

  let email = "diretor@padaria.local";
  let password = "diretor123456";
  let loading = false;
  let error = "";

  async function login() {
    loading = true;
    error = "";

    const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        rememberMe: true
      })
    });

    if (response.ok) {
      await goto("/");
    } else {
      error = "Email ou senha invalidos.";
    }

    loading = false;
  }
</script>

<main class="grid min-h-screen place-items-center bg-background p-4">
  <Card.Root class="w-full max-w-md shadow-sm">
    <Card.Header>
      <Card.Title>Entrar</Card.Title>
      <Card.Description>Acesse o painel financeiro da padaria.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); login(); }}>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" bind:value={email} autocomplete="email" name="email" type="email" required />
        </div>
        <div class="grid gap-2">
          <Label for="password">Senha</Label>
          <Input id="password" bind:value={password} autocomplete="current-password" name="password" type="password" required />
        </div>
        {#if error}
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        {/if}
        <Button type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
        <Button variant="ghost" href="/forgot-password">Esqueci minha senha</Button>
      </form>
    </Card.Content>
  </Card.Root>
</main>
