# Contexto do Projeto — 10/07/2026

> Documento de contexto consolidado (equipe sênior: backend + frontend + infra/QA + arquitetura).
> Foco: estado real do sistema hoje, o que foi feito, e o **mapa completo de integrações**
> necessárias para o sistema funcionar como um todo — o próximo grande passo.
> Complementa (não substitui) `HANDOFF-CONTEXTO-COMPLETO.md`, `backlog.md` e os ADRs.

---

## 1. O que é o projeto

ERP unificado da padaria (Cicluz / "Sistema Inteligente Pralis"): caixa, lançamentos
financeiros (entradas/despesas/mercadorias/retiradas/transferências), cadastros,
catálogo rico de produtos (herdado do Pralis), pedidos de reposição, permissões por
cargo/setor/usuário, multiempresa e integração com o PDV legado (CREARE/Compilart).
O sistema antigo "Pralis produtos" será **absorvido** por este ERP (unificação — ver
`UNIFICACAO.md`): o módulo de produtos daqui já é o modelo rico do Pralis portado.

## 2. Stack e arquitetura (resumo)

- **Monorepo npm workspaces:** `api` (Fastify 5 + Drizzle + better-auth) · `web-vue`
  (Nuxt 4 SPA + Vuetify) · `shared` (contratos zod + regras puras, isomórfico) · `db`
  (schema/migrations/seed/bootstrap) · `tests` (Vitest + Testcontainers) ·
  `integracoes-scripts` (ingestão CREARE).
- **Padrões inegociáveis (verificados por script no gate):** controller → service →
  repository; contratos zod só no `shared`; SQL só no repository; domínio em
  português sem acento no código; dinheiro `numeric` no banco; backend autoritativo
  (ADR-002 — preço recalculado no servidor); migrations só com ordem explícita.
- **Banco:** Postgres 16, UUID v7, 8 migrations (0000→0007), triggers `atualizado_em`.
- **Qualidade:** `npm run check` (texto+arquitetura+typecheck), `lint` (+security),
  `lint:deps` (dependency-cruiser), 147 testes (34 arquivos integração + 3 unit,
  Testcontainers), teste anti-drift de migrations, husky pre-commit.

## 3. Produção — NO AR desde 09/07/2026 🚀

| Item     | Valor                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front    | `https://sistema.cicluzieai.com.br`                                                                                                                   |
| API      | `https://api-sistema.cicluzieai.com.br` (`/health` OK)                                                                                                |
| Infra    | Coolify (mesmo servidor do Pralis, `187.77.54.180`), projeto `Pralis > production`, recurso `sistema-pralis`                                          |
| Deploy   | Docker Compose (`infra/docker-compose.coolify.yml`) a partir do GitHub `ErasoumZe/SISTEMA_INTELIGENTE_PRALIS`, branch `main`, **auto-deploy no push** |
| Serviços | `migrate` (one-shot: migrations + bootstrap) → `api` (healthy) → `web-vue` (nginx)                                                                    |
| Banco    | PostgreSQL 18 gerenciado no Coolify (host interno `a11v7hunxbykgyjpa9lodzaz`), sem porta pública                                                      |
| DNS      | Cloudflare, registros A DNS-only (como o Pralis produtos)                                                                                             |
| Admin    | `rodrigo@cicluz.com.br` (`usuario_admin`), senha = env `ADMIN_SENHA` (resetada a cada deploy)                                                         |

**Bootstrap de produção** (`db/bootstrap-prod.ts`, roda em todo deploy, idempotente):
catálogo de 199 permissões + primeira empresa + admin completo (usuário better-auth,
e-mail verificado, senha = `ADMIN_SENHA`, perfil `usuario_admin`, vínculo de empresa,
colaborador mínimo). Sem dados fake — o seed de dev (`db/seed.ts`) NUNCA roda em prod.

**O que foi corrigido no caminho do go-live (09/07):**

1. Build quebrado (`capturarErro` recebia `unknown`) — destravou o `tsc` de produção.
2. `context: ..` → `context: .` no compose (Coolify usa a raiz do repo como project-directory).
3. Bootstrap: admin nascia sem `emailVerified` (prod exige) e sem reset de senha → login falhava.
4. Bootstrap: admin sem linha em `colaboradores` → "Perfil de usuario nao configurado".

**Env de produção (Coolify):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`,
`WEB_ORIGIN`, `NUXT_PUBLIC_API_URL` (build arg — mudar exige rebuild), `ADMIN_EMAIL`,
`ADMIN_SENHA`, `ADMIN_NOME`, `EMPRESA_NOME`. Opcional: `SENTRY_DSN` (hoje não setado).

## 4. O que está PRONTO (funcional)

**Backend (28 controllers registrados em `api/src/app.ts`):** saúde, auth/sessão/perfil,
tema/aparência, vendas (+comprovantes +produtos-mais-vendidos), despesas, mercadorias,
retiradas, transferências, **caixa** (abrir/editar/fechar/acertar/histórico — módulo mais
maduro, fórmula única em `shared/src/caixa/regras.ts`), empresas, contas, formas de
pagamento, PDVs, fornecedores, clientes, colaboradores (cargos/jornadas/faltas), grupos,
unidades de medida, áreas/setores, **produtos** (catálogo rico Pralis: custo/margem/preço
auto, fiscal, transformação, promoções, conversões), usuários, permissões, malotes,
**integrações** (ingestão CREARE por API key), **pedidos v1** (manual + geração automática
por estoque min/max + aprovação). Guard global **default-deny** + permissão fina por rota.

**Frontend:** telas ricas (caixa, fechamento, operações financeiras, contas a pagar,
relatórios de vendas/produtos, pedidos, integrações) + cadastros genéricos
(`CadastroTablePage`) para todos os cadastros. Login/reset. Tema por empresa.

**Segurança/permissões:** better-auth (cookie, e-mail+senha), 199 permissões no shared
(fonte única), resolução setor→cargo→usuário, `usuario_admin` = todas as permissões.

**Dados:** 141 produtos do Pralis importados (empresa TNP; empresas Lisboa e Hora criadas).

## 5. O que NÃO existe ainda (lacunas ranqueadas)

1. **Estoque/inventário (BK-01)** — a maior lacuna estrutural. Não há tabela de saldo nem
   movimentação. Bloqueia: baixa por venda, entrada por mercadoria/pedido, perdas/sobras,
   tela `estoque_produtos`, reposição de verdade.
2. **~15 telas fantasma** (menu/permissão existem, página é placeholder): promoções,
   perdas*sobras, estoque_produtos, relatorio_dre, folha_ponto, notas_fiscais,
   relatorio_fiscal, fiscal_produtos, patrimonio, ficha_tecnica, ingredientes,
   avaliacao*\*, relatorio_faltas/advertencias.
3. **Pedidos v2:** edição de itens em rascunho (PUT já existe no back), execução da
   recorrência (hoje só armazenada), **recebimento com baixa/entrada de estoque** (depende do BK-01).
4. **Financeiro próprio** (contas a pagar tem tela, mas baixa segue política provisória — ADR-004).
5. **CREARE automatizado** (QA-02): hoje a ingestão é manual/one-shot (ver §7).
6. **E-mail transacional:** inexistente (ver risco R1 abaixo).

## 6. ⚠️ Riscos latentes de PRODUÇÃO (descobertos nesta análise)

- **R1 — Novos usuários não conseguem logar em produção.** `usuarios.service.ts:148` cria
  usuário via `signUpEmail` sem marcar e-mail verificado; produção tem
  `requireEmailVerification: true` (`api/src/auth/config.ts:31`) e **nenhum** envio de
  e-mail configurado (reset lança erro em prod). Resultado: qualquer usuário criado pela
  tela de Usuários ficará bloqueado no login — o mesmo bug que travou o admin no go-live.
  _Fix curto:_ marcar `emailVerified` na criação por admin (é um fluxo confiável) OU
  configurar provedor de e-mail (Resend, como o Pralis) e enviar verificação. Decidir.
- **R2 — Senha do admin fora da política.** Prod exige `minPasswordLength: 10`; a senha
  atual do admin tem 9 (loga normalmente — o tamanho só é validado no cadastro). Trocar
  `ADMIN_SENHA` por uma 10+ e redeployar quando conveniente.
- **R3 — Observabilidade desligada.** Sem `SENTRY_DSN`, erros 500 de produção não são
  rastreados (só log do container). Setar o DSN é 1 env + redeploy.
- **R4 — Backup não agendado.** Scripts prontos (`docs/OPERACAO-BACKUP.md`), mas nenhum
  cron ativo. Configurar backup automático do Postgres do Coolify + (ideal) dump lógico
  agendado com retenção.
- **R5 — Vendas integradas com `caixa_id = null` ficam invisíveis no fechamento** (ver §7.1).

---

## 7. INTEGRAÇÕES — o mapa completo (próximo grande passo)

### 7.1 O que JÁ existe: ingestão de vendas do CREARE (inbound, manual)

**Arquitetura atual:** `CREARE (MySQL "gerente" na loja) → script Node → POST API do ERP`.

- **Endpoint:** `POST /api/integracoes` — único endpoint sem sessão; autentica por
  header `x-api-key: <chave>` (ou `Bearer`), rate-limit 30/min. Chaves são geradas na
  tela Integrações (`POST /api/integracoes/chaves`), armazenadas com hash sha256 e
  comparadas com `timingSafeEqual`.
- **Payload:** agregado `Venda / ItensVenda[] / PagamentosVenda[] / DadosIntegracao`
  (contrato zod em `shared/src/integracoes/index.ts`).
- **Idempotência dupla:** `identificadorExterno = idVenda` + `hashConteudo = sha256(JSON canônico)`.
  Reenvio idêntico → `sem_novidade`; hash diferente → **atualiza** a venda (recria itens/pagamentos);
  novo → cria. Tudo em transação, com trilha em `integracoes_registros` + `integracoes_historico`.
- **Vínculos automáticos** (`integracoes_campos_config`, default criar+vincular = true):
  PDV (por código/nome; cria conta+PDV), cliente (documento/nome), produto
  (código/descrição), forma de pagamento (descrição). Sem match e sem permissão de
  criar → vínculo **pendente** (resolvível na aba "Sem conversão" da tela).
- **Caixa da venda:** resolvido pelo período — o fechamento de caixa do mesmo
  empresa+PDV cujo intervalo de abertura/fechamento contém `dataHoraVenda`. Sem PDV
  vinculado ou fora de período → `caixa_id = null` → **a venda NÃO entra no resumo do
  caixa** (`caixa.repository.ts:280`). Regra conhecida e testada
  (`tests/integration/caixa/caixa-venda-integrada.test.ts`).
- **Script de ingestão** (`integracoes-scripts/`): lê o MySQL do CREARE (tabelas
  `venda_balcao`, `item_venda_balcao`, `formapgto_venda_balcao`, `dispositivo`,
  `cliente`, `produto`, `codigo_produto`, `forma_pagamento`), monta payloads e envia.
  Hoje é **manual, one-shot, só "último dia com dados"** e em modo teste (reescreve
  idVenda/data). Env: `SERVIDOR/PORTA/BANCO/USUARIO/SENHA_CREARE_COMPILART`,
  `PADARIA_API_URL`, `PADARIA_INTEGRACAO_CODIGO`.

**Limitações mapeadas (corrigir na industrialização):**

1. Status `erro` existe no schema mas **nunca é gravado** — falha vira HTTP 500 sem trilha.
2. Re-vínculo **não retroage**: resolver uma pendência não religa vendas já gravadas com FK null.
3. Matching por `ilike` de texto (produto/forma pgto) é frágil; forma de pagamento ignora o id externo.
4. Agregação do histórico é feita em memória (não escala).
5. Chave de integração fica em texto claro no banco/tela (o hash existe, mas o segredo não é write-only).

### 7.2 Integração #1 — CREARE vendas EM PRODUÇÃO (prioridade máxima)

É a integração que faz o ERP receber o movimento real da loja. O backend está pronto;
o que falta é **operacionalizar o coletor**. Plano concreto:

1. **Gerar a chave de produção:** logar como admin em `sistema.cicluzieai.com.br` →
   Integrações → criar chave "Vendas do PDV". Guardar o código.
2. **Transformar o script de teste em agente de produção** (novo modo no
   `integracoes-scripts` ou pequeno serviço dedicado):
   - Remover o "modo teste" (não reescrever idVenda/data — enviar o `ID_VENDA_BALCAO` real).
   - **Janela incremental** em vez de "último dia": guardar cursor (última `DTHR_VENDABALCAO`
     processada) e varrer `[cursor - margem, agora]` a cada execução — a idempotência do
     servidor absorve reenvios.
   - **Scheduling:** loop com intervalo (ex.: a cada 2–5 min) ou cron do Windows/host da loja.
   - **Retry com backoff** para falhas de rede; log estruturado (arquivo) com contadores
     criado/atualizado/sem_novidade/erro; alerta simples se X falhas seguidas.
   - Config por env: MySQL local do CREARE + `PADARIA_API_URL=https://api-sistema.cicluzieai.com.br`
     - chave. O agente roda **na máquina da loja** (onde o MySQL do CREARE é acessível);
       a API está na internet, então só é preciso saída HTTPS.
3. **No servidor (hardening curto):** gravar status `erro` no histórico (try/catch no
   service registrando a falha antes de responder 500) e, opcionalmente, um endpoint de
   backfill/reprocesso.
4. **Operação:** acompanhar pela aba Histórico + resolver pendências na aba "Sem conversão"
   nas primeiras semanas (produto/forma de pagamento novos do PDV).
5. **Decisão de negócio pendente:** o que fazer com vendas `caixa_id = null` (fora de
   período de caixa) — relatório próprio? entrada retroativa? Hoje ficam só em Vendas.

### 7.3 Integração #2 — Pralis produtos: CUTOVER, não sync

O catálogo rico do Pralis **já foi migrado** (141 produtos, importador idempotente
`api/src/scripts/importar-pralis.ts`, staging→executar). O plano da unificação
(`UNIFICACAO.md` Fase D) é **desligar o Pralis isolado**, não sincronizá-lo:

1. Rodar a importação final contra o banco de produção (mesmo importador, com `--executar`).
2. Decidir a réplica de catálogo TNP→Lisboa (feature exportar/importar entre empresas já existe).
3. Migrar/re-cadastrar os usuários do Pralis (decisão: reset de senha vs importar hashes).
4. Cutover: aposentar `produtos.cicluzieai.com.br` quando o módulo de produtos daqui
   estiver validado pelos usuários. **Não construir sync contínuo** — o ERP vira a fonte única.

### 7.4 Integração #3 — Estoque como HUB (pré-requisito interno, BK-01)

Sem estoque, a malha de integrações não fecha o ciclo. Desenho sugerido (a validar
com o negócio antes de qualquer migration):

- Tabela de **movimentações** (produto, empresa, tipo: venda|compra|ajuste|perda|sobra|
  transformacao, quantidade ±, origem com FK polimórfica leve, data) + saldo materializado
  ou calculado.
- **Fontes que movimentam:** venda integrada CREARE (baixa), mercadorias/recebimento de
  pedido (entrada), perdas/sobras (ajuste), transformação/produção (consome insumo → produz).
- Destrava: pedidos-recebimento, telas estoque_produtos e perdas_sobras, reposição real.
- É o item que mais exige **decisões de negócio** (quando baixa? venda integrada
  retroativa? unidade de medida da baixa vs conversões?) — fazer SPEC antes.

### 7.5 Integração #4 — Preço: ERP → CREARE (outbound, decisão aberta)

Hoje o preço do ERP é referência de catálogo; o PDV CREARE tem preços próprios
(`backlog.md:86`). Se o negócio quiser o ERP como fonte de verdade de preço, será a
primeira integração **de saída** (provavelmente escrita direta no MySQL do CREARE pelo
mesmo agente da loja, ou export). Não iniciar sem decisão explícita — tem risco
operacional no PDV.

### 7.6 Integração #5 — E-mail transacional (curta e urgente — resolve R1)

Necessária para: verificação de e-mail de novos usuários e reset de senha em produção.
Caminho de menor atrito: **Resend** (o Pralis já usa — reaproveitar conta/aprendizado),
configurar `sendVerificationEmail`/`sendResetPassword` no better-auth + envs no Coolify.
Alternativa mínima imediata: criação por admin marca `emailVerified = true` (1 update no
service, igual ao bootstrap) — resolve o bloqueio sem e-mail, adiando o provedor.

### 7.7 Integração #6 — Observabilidade e backup (operação)

- **Sentry:** criar projeto, setar `SENTRY_DSN` no Coolify, redeploy (código já pronto, no-op sem DSN).
- **Backup:** ativar backup do Postgres no Coolify (aba Backups do recurso do banco) +
  agendar dump lógico (`npm run db:backup`) com retenção e cópia externa. Testar restore.

### 7.8 Futuras (não iniciar agora)

NF-e/fiscal (campos fiscais dos produtos já existem; emissor não), WhatsApp (campo no
cliente existe), DRE/relatórios gerenciais, folha de ponto — todas dependem de decisões
de negócio e de as bases acima estarem estáveis.

---

## 8. Roteiro sugerido (priorizado)

| #   | Entrega                                                                                   | Por quê primeiro                                      | Esforço       |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- |
| 1   | **Hotfix R1** (usuário criado por admin nasce verificado)                                 | Sem isso, ninguém além do admin loga em prod          | Pequeno       |
| 2   | **Sentry + backup agendado** (R3/R4)                                                      | Rede de segurança antes de aumentar o uso             | Pequeno       |
| 3   | **CREARE produção** (§7.2: chave + agente com cursor/retry/log + status erro no servidor) | É A integração; traz o movimento real pro ERP         | Médio         |
| 4   | **Importação final Pralis em prod + decisão TNP→Lisboa** (§7.3)                           | Consolida o catálogo na fonte única                   | Pequeno/Médio |
| 5   | **SPEC de Estoque (BK-01)** com o negócio → implementar                                   | Hub que fecha o ciclo (vendas baixam, pedidos entram) | Grande        |
| 6   | **Pedidos v2** (recebimento + recorrência)                                                | Depende do estoque                                    | Médio         |
| 7   | **Cutover do Pralis isolado**                                                             | Fim da unificação                                     | Médio         |

Regras do processo (inalteradas): specs antes de features grandes (`/spec`), migrations
só com ordem explícita, nunca commitar/push sem OK do Zé, gate verde antes de merge.

## 9. Decisões de negócio abertas (bloqueiam itens acima)

1. Vendas integradas sem caixa (fora de período): onde aparecem? (§7.2)
2. Verificação de e-mail: marcar verificado na criação por admin ou configurar Resend? (R1)
3. Réplica de catálogo TNP→Lisboa: automática ou manual? (§7.3)
4. Preço: ERP empurra para o CREARE ou PDV continua autônomo? (§7.5)
5. Estoque: regras de baixa/entrada (momento, retroatividade, conversões de unidade) (§7.4)
6. Migração de usuários do Pralis: reset de senha vs importar hashes (§7.3)
7. Mercadorias na fórmula de saldo do caixa + política `computar`/`dataPagamento` (ADR-001/004, com Luís)

## 10. Referências rápidas

- Integrações: `api/src/integracoes/*`, `shared/src/integracoes/index.ts`,
  `integracoes-scripts/*`, `web-vue/pages/integracoes.vue`, tabelas `integracoes_*`
  em `db/src/schema/app.schema.ts:531+`, teste `tests/integration/caixa/caixa-venda-integrada.test.ts`.
- Deploy: `infra/docker-compose.coolify.yml`, `api/Dockerfile.prod`,
  `web-vue/Dockerfile.prod`, `db/bootstrap-prod.ts`, `docs/OPERACAO-BACKUP.md`.
- História/planos: `docs/HANDOFF-CONTEXTO-COMPLETO.md` (ler ao retomar),
  `docs/UNIFICACAO.md`, `docs/backlog.md`, `docs/adr/ADR-001..005`,
  `docs/spec/SPEC_2026_07_07_pedidos-v1.md`.
