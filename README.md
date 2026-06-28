# Padaria v2

Monorepo inicial com API Fastify/TypeScript, Web SvelteKit estatico, pacote compartilhado, testes e Postgres efemero em containers.

## Instalacao

```bash
cp .env.example .env
npm install
```

## Desenvolvimento rapido

Use este comando no dia a dia. Ele sobe/reutiliza apenas o Postgres dev, prepara o banco localmente e depois roda API + Web Vue com hot reload.

```powershell
npm.cmd run dev
```

- Web: http://localhost:5174
- API: http://localhost:4100

O preparo de desenvolvimento executa `drizzle-kit push --force` em modo dev e aplica o seed. O `npm run dev` nao constroi imagem da API, nao roda build e nao remove containers antigos; para destruir o ambiente dev use `npm.cmd run dev:destroy`.

O `npm run check` faz apenas validacoes/typecheck. Ele nao executa build nem gera `dist`.

## Docker

O Docker Compose pode subir banco, API e Web. No desenvolvimento rapido, use `npm.cmd run dev` para manter as etapas separadas e visiveis.

```powershell
docker compose up -d
```

Subir tudo reconstruindo imagens:

```powershell
docker compose up -d --build
```

Preparar banco dev explicitamente:

```powershell
npm.cmd run api:dev:prepare
```

Subir producao com migracao separada da API:

```powershell
npm.cmd run compose:prod
```

Gerar a Web estatica:

```powershell
npm.cmd run build --workspace @padaria/web
```

Os arquivos finais ficam em `web/build` e podem ser publicados em CDN, Nginx, S3/Cloudflare Pages/Vercel ou outro servidor estatico. Configure `PUBLIC_API_URL` no build para apontar para a API.

Para testar localmente o build estatico:

```powershell
npm.cmd run preview --workspace @padaria/web
```

## Fechar ambiente

Fechar tudo e remover volumes/orfaos:

```powershell
docker compose down -v --remove-orphans
```

Fechar tudo, remover volumes/orfaos e apagar imagens locais criadas pelo Compose:

```powershell
docker compose down --rmi local -v --remove-orphans
```

O script do package usa o fechamento padrao:

```powershell
npm.cmd run compose:down
```

O Postgres de desenvolvimento usa `tmpfs`; os dados somem quando o Compose e removido.

## Credenciais seed

A senha padrao de todos os usuarios seedados e `123456`.

- Diretor geral: `diretor@email.com`
- Caixa: `caixa@email.com`
- Gerencia: `gerencia@email.com`
- Tesouraria: `tesouraria@email.com`
- Compras: `compras@email.com`
- DP: `dp@email.com`
- RH: `rh@email.com`
- Fiscal: `fiscal@email.com`
- Diretor de operacoes: `operacoes@email.com`
- Financeiro: `financeiro@email.com`

## Permissoes seed

Cada conta tem um role tecnico: `usuario_comum`, `usuario_admin` ou `admin`. O `admin` existe no modelo, mas ainda nao tem efeito especial. O `usuario_comum` depende apenas das permissoes efetivas. O `usuario_admin` recebe todas as permissoes efetivas e serve para o usuario inicial gerenciar o sistema.

As permissoes efetivas sao a soma de permissoes diretas do usuario, permissoes dos cargos ativos do colaborador vinculado e permissoes do setor. Para `usuario_admin`, todas as permissoes tambem entram nessa soma. O menu do Web Vue e filtrado apenas por permissoes efetivas. O usuario `diretor@email.com` e seedado como `usuario_admin` e com o cargo **Diretor Geral**.

- Diretor Geral: todas as permissoes.
- Caixa: entradas, transferencias, despesas, mercadorias, retiradas, fechamento com diferenca e relatorio de produtos mais vendidos.
- Tesouraria: cadastro de malotes e transferencias.
- Gerencia: movimentacoes, fechamento, relatorio de produtos, promocoes, faltas/atestados, advertencias/suspensoes, pedidos, perdas/sobras, estoque, DRE e clientes.
- Compras: pedidos, mercadorias, fornecedores e produtos.
- DP: despesas, colaboradores e folha ponto.
- RH: avaliacao de qualidade e avaliacao de colaboradores.
- Fiscal: relatorio fiscal e cadastro fiscal de produtos.
- Diretor de Operacoes: DRE, patrimonio, ficha tecnica e ingredientes.
- Financeiro: crediario, notas fiscais, contas a pagar, movimentacoes, DRE, grupos de vendas, PDV e formas de pagamento.

## Isolamento por empresa

O isolamento multiempresa e logico, por `empresa_id` e vinculos em `usuarios_empresas`. O role `usuario_admin` recebe todas as permissoes, mas nao recebe acesso global a empresas; ele continua limitado as empresas vinculadas ao usuario.

Rotas de listagem, criacao, edicao por ID, tema/aparencia, malotes, lacres, permissoes e movimentacoes validam o escopo de empresa na API. Tema/aparencia e salvo por empresa e tela.

## MCP sugeridos

Esta sessao nao tinha MCPs ativos. Para habilitar em uma proxima sessao do Codex, adicione ao `~/.codex/config.toml`:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"

[mcp_servers.svelte]
command = "npx"
args = ["-y", "@sveltejs/mcp"]

[mcp_servers.postgres]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-postgres", "postgresql://padaria:padaria@localhost:5432/padaria"]
```

Para Fastify, a opcao mais util hoje e o Context7 com a documentacao do Fastify. MCPs de Fastify encontrados sao voltados a expor apps Fastify como MCP, nao a servir documentacao do framework.
