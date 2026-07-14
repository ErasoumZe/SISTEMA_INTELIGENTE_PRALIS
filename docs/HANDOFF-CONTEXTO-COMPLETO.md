# Handoff — Contexto completo do trabalho (02-03/07/2026)

**Proposito:** documento de continuidade para qualquer sessao/modelo (ex.: Opus 4.8) retomar o
trabalho sem perder contexto. Leia este arquivo + `docs/CLAUDE_CONTEXT_ORCHESTRATION.md` +
`docs/adr/*` antes de qualquer tarefa. A memoria persistente do Claude Code
(`~/.claude/projects/.../memory/`) tem um resumo espelhado em `diagnostico-tecnico-jul-2026.md`.

## 1. O que e o projeto

ERP multiempresa para rede de padarias (marca **Pralis**; empresas **TNP**, **Lisboa** e **Hora**
— Hora e restaurante, por ora sem vinculos de usuario = inativa). Monorepo npm workspaces:
`api` (Fastify 5 + Drizzle/Postgres 16 + better-auth), `web-vue` (Nuxt 4 SPA + Vuetify),
`shared` (contratos zod + regras puras), `db` (schema/migrations/seed), `tests` (Vitest +
Testcontainers), `integracoes-scripts` (ingestao de vendas do PDV legado CREARE via MySQL).
Modulo mais maduro: **Caixa** (por PDV+usuario). Branch de trabalho:
`analise-e-documentação-+-teste-de-permissões`. Commits locais — **push libera o CI** (GitHub
Actions, primeiro run pendente).

## 2. Linha do tempo do que foi feito (commits na ordem)

### Diagnostico (02/07 manha)

Auditoria completa de 7 frentes → `docs/DIAGNOSTICO-TECNICO-2026-07-02.md` (21 secoes, riscos
classificados, roadmap Fases 0-5). Achados criticos da epoca: migrations de prod vazias, duas
formulas de saldo divergentes + float, uploads sem volume, sem CI, lint com 4.896 falsos erros.

### Sprint 1 — estabilizacao (concluida)

- `35f980c` **T1 migrations**: journal criado (0000 uuid/pgcrypto, 0001 baseline 56 tabelas,
  0002 triggers atualizado_em em 21 tabelas); `api:prod:migrate` invertido (drizzle ANTES do
  better-auth); teste `tests/integration/migracoes/` provisiona banco vazio so com `migrate` e
  faz diff estrutural vs `push` (detector permanente de drift).
- `782f34c` **T4 concorrencia**: unique parcial `fechamentos_caixa_pdv_aberto_unico_idx`
  (migration 0003) + traducao 23505 + teste de corrida.
- `8c2abd9` gitignore `.claude/` (agents/skills instalados localmente, fora do git).
- `ef233eb` **T3 uploads/imagem**: volume `padaria_api_storage` em `/app/storage` + `chown node`;
  E consertou a imagem prod que NAO BUILDAVA (`npm ci --omit=dev --ignore-scripts` por causa do
  drizzle-kit devOptional; `COPY --from /app` inteiro por causa de node_modules aninhados de
  workspace). Validado com boot real + escrita no volume com cap_drop ALL.
- `8ca451a` **T5 qualidade**: lint 4.896→0 (`lint` builda shared/db antes; alias
  `DadosExternos` no shared para fronteiras — NUNCA usar `unknown` explicito fora dele);
  husky+lint-staged ativos; `.github/workflows/ci.yml`; timeout do test.mjs 120s→600s.
- `59b9b4a`+`de87c80`+`ed6a560` **T2 caixa unico**: fluxo legado `/api/fechamento-caixa/*`
  REMOVIDO (ADR-001; formula errada, acerto sem debito, reintroduzia bug de saldo); formula
  oficial UNICA em centavos em `shared/src/caixa/regras.ts` (`saldoCaixaCentavos` — INCLUI
  mercadorias como extensao recomendada, pendente confirmacao formal do Luis);
  `somaConfereCentavos` substituiu arredondar float; `centavosParaDecimalBanco` grava numeric.

### Pos-sprint / Fase 2 seguranca (concluida exceto producao)

- `1009c3d` `npm test` roda unit + integracao.
- `a99f8ff` guard central de erros: `mensagemDominioOuRelancar` em 23 controllers — falha
  tecnica/ErroDominio sobe ao handler global (log+500/status proprio); Error puro segue
  mapeamento local por mensagem.
- `3b27bc4` gate de producao no env.ts (NODE_ENV enum; recusa boot com secret/db default).
- `13e9d3f` **default-deny global** (toda rota exige sessao, allowlist: /health, /api/auth/\*,
  /api/me, /api/sessao, /api/integracoes; OPTIONS liberado); escopo de empresa no WHERE
  (produtos/formas-pagamento/empresas); migration 0004 com 16 indices; redact no pino.
- **PENDENTE de proposito (fim da Fase 4/decisao do Ze):** backup/restore do banco e
  Sentry/observabilidade (dependem de onde vive o banco prod / conta Sentry).

### Fase 3 — finalizacao do caixa (item 1 concluido)

- `3f2ea3c` **edicao real de operacoes**: GET `/api/<tipo>/:id` (detalhe com filhos, tipos
  `<X>DetalheDto` no shared) + PUT nos 5 tipos (permissao `*_editar`, so lancamento do caixa
  aberto do usuario, empresa imutavel, filhos e debitos DESPESA/RETIRADA substituidos em
  transacao, transferencia nao troca malote/lacre, mercadoria recalcula computar). Front:
  Editar carrega detalhe e preenche o form; PUT ao salvar; titulo Editar/Nova.
- **RESTANTE da Fase 3:** sobra/diferenca negativa + sangria/suprimento/conferencia cega
  (DECISOES de negocio); matriz e2e cargo×operacao de caixa; middleware de auth no Nuxt;
  quebrar AppWorkspace.vue (1.8k linhas).

### Auditoria arquitetural + ADR-002 (decidida e implementada)

- `docs/ARQUITETURA-OFICIAL-INTELIGENCIA.md`: Pralis verificado no codigo — servidor
  autoritativo em seguranca/governanca/identidade, MAS formula de preco rodava so no cliente
  (nunca persistida). v2 estava pior (persistia preco do cliente). **DECISAO OFICIAL (Ze):**
  ADR-002 — "cliente envia intencoes; toda decisao persistida e do servidor; shared define,
  servidor executa, cliente faz preview".
- `b9f0874` **M1+M2**: `salvarProduto` recalcula precoVenda no servidor quando auto=true
  (cliente enviando 999,99 → banco grava 6,50 — testado); `resolverComputarLancamento` e
  `resolverDataPagamentoLancamento` em lancamentos.dominio — `computar:false` e `dataPagamento`
  exigem `caixas_gerenciar` (fecha desvio de caixa e burla de contas a pagar; politica
  provisoria ate o modulo Financeiro ter permissao propria de baixa — ADR-004).
- ADRs em `docs/adr/`: 001 (caixa unico por caixaId), 002 (backend autoritativo),
  003 (shared isomorfico = preview no cliente, autoridade no servidor; split por sigilo
  REJEITADO), 004 (campos sensiveis).

### Fase 4 — unificacao de produtos (em andamento, quase concluida)

- `8b6e95d` CHECKs `produtos.status/tipo` no banco + DROP da tabela orfa `itens_vendas`
  (migration 0005; journal = 6).
- `c6598bb` **preco vigente com promocao derivado no SERVIDOR** na listagem
  (`precoVendaAtual` via `calcularPrecoVendaComPromocao`; coluna "Preco atual" no front).
- `a2bc5ee` **M4**: preview monetario do front em centavos (`shared/dinheiro`; aceita virgula;
  prefixo R$). `valorUnitario`/`quantidade` seguem Number (3-4 casas, nao sao dinheiro 2dp).
- `41c3014` **M3**: novo `@padaria/shared/cadastros` (CadastroForm + `cadastroPayload` +
  builders fiscal/transformacao/promocoes/preco) — serializacao form→payload saiu do front;
  `web-vue/utils/domain.ts` e `types/padaria.ts` viraram fachadas re-export (`*FormDeLinha`
  ficou no front, e estado de UI).
- `6341011` **importador Pralis** (`api/src/scripts/importar-pralis.ts`; script npm
  `importar:pralis` no workspace api): staging (relatorio em docs/) + `--executar`
  (idempotente). EXECUTADO no dev: TNP renomeada (era "Padaria Principal"), Lisboa e Hora
  criadas (Hora sem vinculos), 13 grupos + 5 unidades garantidos, **141 produtos inseridos,
  9 duplicados da fonte pulados, 0 erros**; re-execucao 0/150/0; 33 precos automaticos
  recalculados pelo servidor. Decisoes aplicadas: Pralis = fonte de verdade; migrar tudo
  preservando status; selects de grupo/unidade ja puxam dos cadastros reais.
- **RESTANTE da Fase 4:** replica do catalogo TNP→Lisboa (feature de exportar entre empresas
  ja existe — decisao de quando); reconciliacao com a planilha CENTRAL PRODUTOS (Pralis venceu
  como fonte; planilha so se o Ze apontar lacunas); itens de producao pendentes da Fase 2
  (backup + observabilidade) ficaram para o FINAL da Fase 4.

## 3. Regras vigentes (nao violar)

1. **ADR-002**: nenhum valor calculado/decidido no cliente e persistido; servidor recomputa.
   Checklist por feature na secao 11 de `ARQUITETURA-OFICIAL-INTELIGENCIA.md` (teste de payload
   hostil obrigatorio).
2. **Migrations somente com ordem explicita do Ze** (`drizzle-kit generate` no workspace db;
   journal em `db/migrations/meta/`; teste de migracoes ASSERTA O TOTAL de entradas — atualizar
   ao criar migration). Dev/testes usam `push --force` + SQL da 0002 pos-push.
3. Dominio em portugues, codigo SEM acentos (verificar-texto); camadas controller→service→
   repository sem SQL cru (verificar-arquitetura + dependency-cruiser); contratos no shared.
4. Dinheiro: `numeric` no banco; aritmetica em CENTAVOS via `shared/dinheiro`; formula de saldo
   so em `shared/src/caixa/regras.ts`. NUNCA recriar formula paralela.
5. `unknown` explicito proibido fora do alias `DadosExternos` (shared/api).
6. Nunca commitar/pushar sem autorizacao do Ze. Cada tarefa: validar com
   `npm run check` + `npm run lint` + `npm test` antes de dar por pronta.
7. `docs/`, `design-system/`, `PROJECT_BRAIN - Copia/`, `CADASTRO DE PRODUTOS/` e `.claude/`
   estao FORA do git (decisao do Ze). PROJECT_BRAIN = memoria historica de repo paralelo,
   NUNCA estado atual.

## 4. Como rodar/validar

- Dev completo: `npm.cmd run dev` (web :5174, api :4100; push+seed). So banco: `npm run db:dev:up`.
- Gates: `npm run check` (typecheck+arquitetura+texto) · `npm run lint` (builda shared/db antes)
  · `npm test` (unit + integracao Testcontainers, ~7-8 min) · `npm run knip`.
- Testes direcionados: `NODE_OPTIONS=--conditions=development npm run test:integration
--workspace @padaria/tests -- <padrao>`.
- Importador: `npm run importar:pralis --workspace @padaria/api` (staging) / `-- --executar`.
- Seed dev: usuarios `*@email.com` senha `123456`; admin = `diretor@email.com`.

## 5. Armadilhas conhecidas

- Suite integra ~430s; o script test.mjs mata em 600s (TEST_TIMEOUT_MS para estender).
- `npm run lint` exige dist de shared/db (o proprio script builda). IDE: usar Volar; erros
  do Vetur em .vue sao falsos — verdade e `nuxt typecheck`.
- Front importa `@padaria/shared` SO pela raiz (alias exato do Nuxt); subpaths so na api.
- pre-commit roda build:libs + lint-staged (bloqueia commit com lint vermelho).
- Bash tool: cuidado com escaping de `\uXXXX` (usar arquivos de script via Write).
- Testcontainers deixa residuos se abortar: `npm run test:destroy`.
- Dados dev: banco dev tem os 141 produtos importados + TNP/Lisboa/Hora (nao re-seedar sem
  saber que o seed recria "Padaria Principal"; o importador renomeia de novo ao executar).

## 6. Proximos passos sugeridos (ordem)

1. Push da branch → primeiro run do CI (validar workflow no GitHub).
2. Fase 4 fechamento: decidir replica TNP→Lisboa; confirmar com Luis mercadorias na formula
   de saldo (ADR-001) e a politica definitiva de computar/dataPagamento (ADR-004).
3. Pendencias de producao (fim da Fase 4): backup/restore + Sentry/redact ja feito no pino.
4. Fase 3 restante (sobra/negativa e matriz e2e cargo×caixa) — decisoes de negocio pendentes.
5. Fase 5 (modulos novos: Financeiro→Compras→Estoque→RH→Producao) — SO com regras de negocio
   definidas com a equipe; cada modulo nasce no padrao do Caixa com migration versionada.
