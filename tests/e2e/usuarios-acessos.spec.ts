import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { entrar, LARGURAS, USUARIOS } from "./apoio.js";

const API_URL = process.env["E2E_API_URL"] ?? "http://localhost:4100";
const PERMISSAO_LIBERADA = "cadastro_fornecedores_visualizar";

type CenarioPermissoes = {
  empresaId: string;
  usuarioId: string;
  regrasOriginais: Record<string, boolean>;
};

type RespostaApi<T> = { data: T };

async function salvarRegras(api: APIRequestContext, usuarioId: string, regras: Record<string, boolean>) {
  const resposta = await api.put(`/api/permissoes/usuario:${encodeURIComponent(usuarioId)}`, {
    data: { tipoPermissao: "usuario", usuarioId, regras }
  });
  expect(resposta.status(), await resposta.text()).toBe(204);
}

async function prepararCenarioIsolado(api: APIRequestContext): Promise<CenarioPermissoes> {
  const login = await api.post("/api/auth/sign-in/email", {
    data: { email: USUARIOS.admin.email, password: USUARIOS.admin.senha }
  });
  expect(login.status(), await login.text()).toBe(200);

  const me = await api.get("/api/me");
  expect(me.status(), await me.text()).toBe(200);
  const perfil = (await me.json()) as RespostaApi<{
    perfil?: { empresaId?: string; empresaIds?: string[] };
  }>;
  const empresaId = perfil.data.perfil?.empresaId ?? perfil.data.perfil?.empresaIds?.[0] ?? "";
  expect(empresaId, "empresa ativa do Diretor nao encontrada").not.toBe("");

  const listagem = await api.get(`/api/permissoes?empresaId=${encodeURIComponent(empresaId)}`);
  expect(listagem.status(), await listagem.text()).toBe(200);
  const dados = (await listagem.json()) as RespostaApi<{
    usuarios: Array<{ usuarioId: string; email: string }>;
    usuariosPermissoes: Array<{ usuarioId: string; regras: Record<string, boolean> }>;
  }>;
  const alvo = dados.data.usuarios.find((usuario) => usuario.email === USUARIOS.tesouraria.email);
  expect(alvo, `usuario E2E ${USUARIOS.tesouraria.email} nao encontrado`).toBeTruthy();
  const usuarioId = alvo?.usuarioId ?? "";
  const regrasOriginais = {
    ...(dados.data.usuariosPermissoes.find((item) => item.usuarioId === usuarioId)?.regras ?? {})
  };

  // A base explicita torna a prova independente do estado deixado por uma execucao anterior. O
  // teste altera SOMENTE a permissao de Fornecedores pela tela; as negacoes tambem comprovam que
  // o save preserva regras que o editor nao esta ajustando.
  await salvarRegras(api, usuarioId, {
    ...regrasOriginais,
    [PERMISSAO_LIBERADA]: false,
    menu_fornecedores_mostrar: false,
    cadastro_usuarios_visualizar: false,
    menu_usuarios_mostrar: false
  });

  return { empresaId, usuarioId, regrasOriginais };
}

async function sairPelaInterface(page: Page) {
  await page.locator(".topbar-user").click();
  await page.getByText("Sair", { exact: true }).click();
  await page.waitForURL("**/login", { timeout: 30_000 });
}

async function abrirGrupoConfiguracao(page: Page) {
  const grupo = page.getByRole("navigation", { name: "Menu principal" }).getByRole("button", {
    name: "Configuração",
    exact: true
  });
  if ((await grupo.getAttribute("aria-expanded")) !== "true") await grupo.click();
}

test("diretor gerencia o acesso individual pela propria lista de usuarios", async ({ page }) => {
  await entrar(page, USUARIOS.admin);
  await page.goto("/usuarios");
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();

  const linhaTesouraria = page.getByRole("row").filter({ hasText: "Tesouraria" }).first();
  await expect(linhaTesouraria).toContainText("Usuário comum");
  await linhaTesouraria.getByRole("button", { name: "Acessos" }).click();

  await expect(page.getByText("Configurar acessos", { exact: true })).toBeVisible();
  await expect(page.getByText(/combina setor, cargos ativos e exceções individuais/i)).toBeVisible();
  await expect(page.getByText(/permissões efetivas/i)).toBeVisible();

  for (const tamanho of LARGURAS) {
    await page.setViewportSize({ width: tamanho.largura, height: tamanho.altura });
    const larguraDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(larguraDocumento, `sem rolagem horizontal em ${tamanho.nome}`).toBeLessThanOrEqual(tamanho.largura);
  }

  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/permissoes");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByLabel("Aplicar regras por").press("ArrowDown");
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(2);
  await expect(page.getByRole("option", { name: "Usuário", exact: true })).toHaveCount(0);
});

test("excecao individual salva passa a valer no novo login sem liberar outra rota", async ({ page }) => {
  test.setTimeout(180_000);
  const api = await request.newContext({ baseURL: API_URL });
  let cenario: CenarioPermissoes | null = null;

  try {
    cenario = await prepararCenarioIsolado(api);

    await entrar(page, USUARIOS.admin);
    await page.goto("/usuarios");
    const linhaTesouraria = page.getByRole("row").filter({ hasText: USUARIOS.tesouraria.email }).first();
    await expect(linhaTesouraria).toBeVisible();
    await linhaTesouraria.getByRole("button", { name: "Acessos" }).click();

    await page.getByRole("textbox", { name: "Buscar acesso", exact: true }).fill(PERMISSAO_LIBERADA);
    const linhaPermissao = page.locator(".permission-rule-row").filter({ hasText: "Fornecedores" });
    await expect(linhaPermissao).toHaveCount(1);
    await linhaPermissao.getByRole("button", { name: "Permitir", exact: true }).click();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Cadastro atualizado com sucesso.", { exact: true })).toBeVisible();
    await expect(page.getByText("Configurar acessos", { exact: true })).toHaveCount(0);

    // O perfil e calculado no login. Sair pela interface tambem limpa o estado Nuxt do Diretor,
    // impedindo um falso positivo em que o alvo herdaria o menu mantido no cliente.
    await sairPelaInterface(page);
    await entrar(page, USUARIOS.tesouraria);
    await abrirGrupoConfiguracao(page);

    const menu = page.getByRole("navigation", { name: "Menu principal" });
    await expect(menu.getByRole("link", { name: "Fornecedores", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Usuários", exact: true })).toHaveCount(0);

    await menu.getByRole("link", { name: "Fornecedores", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fornecedores", exact: true })).toBeVisible();

    const statusRotas = await page.evaluate(
      async ({ apiUrl, empresaId }) => {
        const [permitida, negada] = await Promise.all([
          fetch(`${apiUrl}/api/fornecedores?empresaId=${encodeURIComponent(empresaId)}`, {
            credentials: "include"
          }),
          fetch(`${apiUrl}/api/usuarios?empresaId=${encodeURIComponent(empresaId)}`, {
            credentials: "include"
          })
        ]);
        return { permitida: permitida.status, negada: negada.status };
      },
      { apiUrl: API_URL, empresaId: cenario.empresaId }
    );
    expect(statusRotas).toEqual({ permitida: 200, negada: 403 });

    await page.goto("/usuarios");
    await expect(page.getByText("Sem permissão para acessar esta página.", { exact: true })).toBeVisible();
  } finally {
    if (cenario) await salvarRegras(api, cenario.usuarioId, cenario.regrasOriginais);
    await api.dispose();
  }
});

test("usuario comum recem-criado segue direto para configurar acessos", async ({ page }) => {
  test.setTimeout(120_000);
  const usuarioId = `e2e-usuario-guiado-${Date.now()}`;
  const email = `${usuarioId}@teste.local`;
  let payloadCriacao: Record<string, unknown> | null = null;
  let usuarioCriado = false;

  // A API nao possui DELETE de usuario. Interceptar somente o POST evita deixar conta ficticia no
  // banco real de desenvolvimento; as leituras seguintes preservam o contrato atual e acrescentam
  // apenas o usuario retornado por esse POST simulado.
  await page.route("**/api/usuarios", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payloadCriacao = route.request().postDataJSON() as Record<string, unknown>;
    usuarioCriado = true;
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { id: usuarioId } })
    });
  });
  await page.route("**/api/permissoes**", async (route) => {
    if (!usuarioCriado || route.request().method() !== "GET") return route.continue();
    const url = new URL(route.request().url());
    if (url.pathname === `/api/permissoes/usuarios/${usuarioId}/efetivas`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            usuarioId,
            nome: "Usuario E2E guiado",
            email,
            role: "usuario_comum",
            permissoesHerdadas: [],
            permissoesEfetivas: []
          }
        })
      });
    }
    if (url.pathname !== "/api/permissoes") return route.continue();

    const resposta = await route.fetch();
    const corpo = (await resposta.json()) as RespostaApi<{
      usuarios: Array<Record<string, unknown>>;
      usuariosPermissoes: Array<Record<string, unknown>>;
    }>;
    const referencia = corpo.data.usuarios[0] ?? {};
    corpo.data.usuarios.push({
      id: usuarioId,
      usuarioId,
      nome: "Usuario E2E guiado",
      email,
      role: "usuario_comum",
      empresaId: referencia["empresaId"],
      empresaIds: referencia["empresaIds"]
    });
    return route.fulfill({ response: resposta, json: corpo });
  });

  await entrar(page, USUARIOS.admin);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Usuario E2E guiado");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Senha", exact: true }).fill("12345678");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect(page.getByText("Usuário criado. Agora configure os acessos.", { exact: true })).toBeVisible();
  await expect(page.getByText("Configurar acessos", { exact: true })).toBeVisible();
  await expect(page.getByText("Usuario E2E guiado", { exact: true })).toBeVisible();
  expect(payloadCriacao).toMatchObject({
    nome: "Usuario E2E guiado",
    email,
    role: "usuario_comum"
  });

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
});
