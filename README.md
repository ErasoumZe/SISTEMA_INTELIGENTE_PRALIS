# Padaria v2

Monorepo inicial com API Fastify/TypeScript, Web Vue/Nuxt, pacote compartilhado, testes e Postgres efemero em containers.

## Instalacao

```bash
cp .env.example .env
npm install
```

## Desenvolvimento rapido

Use este comando no dia a dia. Ele sobe o Postgres em um Compose separado, prepara dependencias em volumes Docker, roda setup/seed pelo container da API, inicia a API em container e inicia o Web Vue no host com hot reload.

```powershell
npm.cmd run dev
```

- Web: http://localhost:5174
- API: http://localhost:4100

O preparo de desenvolvimento executa `drizzle-kit push --force` em modo dev e aplica o seed dentro do container da API. O script so imprime `Ambiente pronto` depois do healthcheck da API e de confirmar que o Web no host responde.

Para rodar API e Web no host explicitamente, mantendo apenas o Postgres em container:

```powershell
npm.cmd run dev:local
```

Para uma validacao automatizada que sobe, espera healthchecks e encerra API/Web:

```powershell
npm.cmd run dev -- --once
```

O `npm run check` faz apenas validacoes/typecheck. Ele nao executa build nem gera `dist`.

## Docker e Compose

O ambiente dev e separado em dois projetos Compose:

- `padaria-db-dev`: Postgres e volume persistente de desenvolvimento.
- `padaria-dev`: API em desenvolvimento. O Web Vue roda no host no fluxo `npm run dev`.

Subir apenas o banco dev:

```powershell
npm.cmd run db:dev:up
```

Parar o banco dev preservando dados:

```powershell
npm.cmd run db:dev:down
```

Parar API/Web e remover containers, redes e volumes locais de dev/prod:

```powershell
npm.cmd run dev:destroy
```

## Coolify

O arquivo recomendado para publicacao e `infra/docker-compose.coolify.yml`. Ele define:

- `migrate`: roda migrations antes da API.
- `api`: Fastify em container Node, com healthcheck em `/health`.
- `web-vue`: Nuxt gerado como SPA estatica e servido por Nginx unprivileged.

Diferente do desenvolvimento local, no Coolify o Web tambem e orquestrado pelo Docker Compose.

Variaveis obrigatorias no Coolify:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `AUTH_BASE_URL`
- `WEB_ORIGIN`
- `NUXT_PUBLIC_API_URL`

Validar o compose Coolify com valores ficticios seguros:

```powershell
npm.cmd run compose:coolify:check
```

Se quiser operar Postgres em Compose separado fora do Coolify:

```powershell
set POSTGRES_PASSWORD=troque-esta-senha
npm.cmd run db:prod:up
```

Em Coolify, prefira usar o banco gerenciado/externo e apontar `DATABASE_URL` para ele.

## Builds de producao

Subir o compose produtivo generico localmente, com variaveis reais configuradas:

```powershell
npm.cmd run compose:prod
```

Gerar a Web Vue estatica:

```powershell
npm.cmd run generate --workspace @padaria/web-vue
```

Build completo dos workspaces:

```powershell
npm.cmd run build
```

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
- Caixa: entradas, transferencias, despesas, mercadorias, retiradas, operar caixa, fechamento com diferenca e relatorio de produtos mais vendidos.
- Tesouraria: cadastro de malotes e transferencias.
- Gerencia: movimentacoes, operar/gerenciar caixas, fechamento, relatorio de produtos, promocoes, faltas/atestados, advertencias/suspensoes, pedidos, perdas/sobras, estoque, DRE e clientes.
- Compras: pedidos, mercadorias, fornecedores e produtos.
- DP: despesas, colaboradores e folha ponto.
- RH: avaliacao de qualidade e avaliacao de colaboradores.
- Fiscal: relatorio fiscal e cadastro fiscal de produtos.
- Diretor de Operacoes: DRE, patrimonio, ficha tecnica e ingredientes.
- Financeiro: crediario, notas fiscais, contas a pagar, movimentacoes, DRE, grupos de vendas, PDV e formas de pagamento.

## Caixa operacional

O caixa agora e aberto e fechado por usuario e PDV. O seed cria o cadastro `PDV 01`, vinculado a conta `Caixa loja`.

- `/api/caixa/status?empresaId=...`: retorna o caixa aberto do usuario e o resumo por `caixaId`.
- `/api/caixa/abrir`: exige `operar_caixa`, PDV ativo com conta vinculada e bloqueia periodo ja aberto/fechado para o mesmo PDV.
- `/api/caixa/:caixaId/abertura`: edita abertura com token, registra auditoria em `edicoes_caixa` e troca o token.
- `/api/caixa/:caixaId/acertar-saldo`: quando o saldo do caixa e positivo, cria despesa `Diferenca de caixa`, item em `itens_despesas` e debito `FECHAMENTO_CAIXA` em `debitos_colaboradores`.
- `/api/caixa/:caixaId/fechar`: fecha somente quando o saldo calculado nao exige acerto.
- `/api/caixa/historico?empresaId=...`: exige `gerenciar_caixas` e retorna o historico com token de edicao.

Movimentacoes novas gravam `caixa_id`. Transferencias vinculadas ao caixa precisam envolver a conta do PDV aberto. As telas de transferencias, despesas, mercadorias, retiradas, fechamento e relatorio de produtos ficam bloqueadas no front sem caixa aberto; entradas continuam visiveis para consulta, mas criar entrada tambem exige caixa aberto.

## Isolamento por empresa

O isolamento multiempresa e logico, por `empresa_id` e vinculos em `usuarios_empresas`. O role `usuario_admin` recebe todas as permissoes, mas nao recebe acesso global a empresas; ele continua limitado as empresas vinculadas ao usuario.

Rotas de listagem, criacao, edicao por ID, tema/aparencia, malotes, lacres, permissoes e movimentacoes validam o escopo de empresa na API. Tema/aparencia e salvo por empresa e tela.

## MCP sugeridos

Esta sessao nao tinha MCPs ativos. Para habilitar em uma proxima sessao do Codex, adicione ao `~/.codex/config.toml`:

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"

[mcp_servers.postgres]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-postgres", "postgresql://padaria:padaria@localhost:5432/padaria"]
```

Para Fastify, a opcao mais util hoje e o Context7 com a documentacao do Fastify. MCPs de Fastify encontrados sao voltados a expor apps Fastify como MCP, nao a servir documentacao do framework.
