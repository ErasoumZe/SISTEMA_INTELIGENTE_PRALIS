# 74 — Handoff mestre para continuidade no Claude Desktop

**Data:** 22/10/2026
**Base verificada:** `origin/main` e `main` no commit `42f795a28cd7b26f2b13e92d7a70a84ffd181407`
**Objetivo:** permitir que outro responsável retome o Pralis sem misturar worktrees, regras antigas, dados sensíveis ou fluxos duplicados.

> Este é um mapa de entrada, não substitui o código nem os documentos de regra. Quando houver divergência, prevalecem: **1) código, schema e testes do HEAD confirmado; 2) PROJECT_BRAIN vigente; 3) PR/issue do mesmo HEAD; 4) evidência operacional; 5) Segundo Cérebro/Obsidian; 6) chat.**

---

## 1. Identidade do projeto e links

| Item | Referência |
| --- | --- |
| Repositório GitHub | [ErasoumZe/SISTEMA_INTELIGENTE_PRALIS](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS) |
| Branch de integração | [`main`](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/tree/main) |
| Pull requests | [lista de PRs](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/pulls) |
| Issues | [lista de issues](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues) |
| Produção web | [sistema.cicluzieai.com.br](https://sistema.cicluzieai.com.br) |
| Painel de deploy | projeto já configurado no **Coolify** da empresa; a URL do painel e credenciais não são versionadas nem devem ser colocadas neste arquivo |
| Diretório canônico nesta máquina | `D:\Sistema Pralis - Principal` |
| Segundo Cérebro / cofre Obsidian | `D:\Pralis-Segundo-Cerebro` |

O diretório `D:\Sistema Pralis - Principal` é a única cópia autorizada para desenvolver. Pastas como `D:\Sistema Pralis - ago`, worktrees, cópias de entregas ou ramos antigos são **apenas evidência**. Nunca copiar uma pasta antiga por cima da `main`, nunca iniciar uma entrega a partir dela e nunca inferir que uma regra antiga ainda está vigente.

No momento deste handoff há uma pasta local não rastreada chamada `Ze - Compras/` no diretório canônico. Ela não pertence a este handoff, não foi lida nem alterada; deve ser preservada e tratada como material do usuário até ele decidir seu destino.

---

## 2. Como iniciar qualquer sessão de trabalho

1. Abra o terminal **na pasta canônica** e leia `AGENTS.md` integralmente.
2. Atualize e prove a base antes de interpretar qualquer anotação:

```powershell
Set-Location 'D:\Sistema Pralis - Principal'
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short
git log --oneline -15
```

3. Se a árvore não estiver limpa, identifique os arquivos e o autor antes de tocar em qualquer um. Arquivo não rastreado não é lixo por definição.
4. Leia `PROJECT_BRAIN/00_INDICE.md`, depois os documentos do módulo. Para Caixa, comece por `16`, `19`, `20`, `22`, `21`, `25`, `30`, `34`, `70`, `72` e `73` conforme o assunto.
5. Crie **uma branch curta por intenção vertical** a partir da `main` recém-confirmada. Exemplo:

```powershell
git switch -c fix/contas-ajuste-validacao-20261022
```

6. Somente o escritor principal altera os arquivos da entrega. Revisores/agentes fazem leitura independente; não devem editar os mesmos arquivos em paralelo.
7. Antes de publicar: revise o HEAD exato, `git diff --check`, rode os gates proporcionais e verifique UI em 1440, 1024, 768 e 390 px quando houver tela.

### Interrupções obrigatórias

Pare e mostre a evidência antes de: aplicar ou criar migration, mudar fórmula monetária, alterar dados históricos, executar limpeza de produção, usar segredo, alterar integração externa, enviar PII, fazer deploy ou decidir regra operacional sem fonte. Merge também não é autorização de deploy.

---

## 3. O que é o Pralis

É o ERP operacional da rede de padarias TNP/Cicluz. A aplicação precisa suportar a operação real de loja: Caixa/PDV, contas e transferências, lançamentos financeiros, compras e estoque, cadastros, permissões, relatórios e Departamento Pessoal.

Monorepo Node/TypeScript:

| Área | Papel | Onde começar |
| --- | --- | --- |
| `api/` | Fastify, rotas, serviços, autorização e repositórios | `api/src/app.ts`, domínios em `api/src/*` |
| `web-vue/` | Nuxt 4 + Vuetify, páginas, componentes e composables | `web-vue/pages`, `web-vue/components`, `web-vue/utils` |
| `db/` | Drizzle schema, migrations e bootstrap/seed | `db/src/schema`, `db/migrations` |
| `shared/` | Zod, contratos, permissões e regras puras compartilhadas | `shared/src` |
| `tests/` | unitários, integração com Testcontainers e e2e | `tests/unit`, `tests/integration`, `tests/e2e` |
| `integracoes-scripts/` | integração do PDV CREARE executada no servidor | diretório próprio; não confundir com agente instalado em computadores de PDV |
| `scripts/` | verificadores de arquitetura/texto/migrations, fixtures e operação local | `scripts/` |
| `infra/` | Docker Compose de desenvolvimento, produção e Coolify | `infra/docker-compose*.yml` |
| `PROJECT_BRAIN/` | decisão de produto, regra e histórico de execução | `00_INDICE.md` |
| `docs/` | prompts vivos e relatórios técnicos | `docs/prompts/000-LEIA-PRIMEIRO.md` |

Autorização é **default deny**: a API exige sessão por padrão; uma tela no menu não concede acesso. A permissão precisa ter paridade em menu, rota/navegação e API. O catálogo de permissões vive em `shared/src/autenticacao/index.ts`; o domínio de permissões está em `api/src/permissoes/`; o menu configurável está em `api/src/menu-empresa/` e `web-vue/components/permissoes/PermissoesMenuEmpresa.vue`.

---

## 4. Contrato de qualidade e modo de trabalhar

O contrato completo está em `AGENTS.md`, `PROJECT_BRAIN/16_DEFINITION_OF_DONE.md` e `PROJECT_BRAIN/70_DIRETRIZ_FONTE_UNICA_E_EXECUCAO_2026_10_19.md`. Em resumo:

- Uma entrega é vertical: interface + API/guarda + permissão + teste + remoção do caminho substituído.
- Não deixar duas rotas, modais, botões ou fluxos para o mesmo ato. “Esconder” não é remover.
- Componentes acima de aproximadamente 400 linhas devem ser decompostos antes de crescer.
- Commitar progresso; não guardar alterações relevantes apenas no diretório local.
- Não inventar endpoint, campo ou regra. Procurar contrato existente; se faltar, parar e pedir a decisão.
- Todo PR deve ter uma intenção clara e pequena. Não misturar visual, dados financeiros, DP e refactor sem vínculo.
- Marco é o responsável operacional atual por Caixa e só aprova merge após revisão do HEAD, gates verdes e zero P0/P1. Rodrigo é fonte de regra financeira/operacional ainda não documentada.

### Gates reais

O workflow `.github/workflows/ci.yml` executa duas verificações:

1. **Lint, typecheck, unit e build**: `npm ci`, `npm run lint`, `npm run check`, testes unitários, testes web-vue e `npm run build`.
2. **Testes de integração (Testcontainers)**: `npm ci` e `npm test`, serializado, com até 60 minutos.

Os comandos de fechamento estão no `package.json`:

```powershell
npm run lint
npm run check
npm run test
npm run build
npm run compose:coolify:check
```

Rode somente o necessário durante a edição e a validação completa no fechamento. `npm run check` também verifica texto, arquitetura e paridade de migrations.

---

## 5. Banco, migrations e produção

O schema está em `db/src/schema/`; migrations versionadas estão em `db/migrations/`, com journal e snapshots em `db/migrations/meta/`. Na data deste handoff existem **62 arquivos SQL, de `0000` a `0061`**. O número antigo “30 migrations” no `README.md` está desatualizado e não deve ser usado como evidência.

Produção cria/evolui schema somente por migration. A migration deve ter SQL mostrado, revisão de impacto, paridade entre SQL/journal/snapshot e autorização explícita antes de aplicação. Desenvolvimento e testes usam `drizzle-kit push --force`, o que não prova o caminho de migration de produção; o teste de integração de migrations existe justamente para isso.

### Estado importante de PDV/turno

A PR [#198](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/pull/198) foi integrada à `main` no commit de base deste handoff. Ela consolidou o vínculo do operador de Caixa com **um PDV e um turno**.

- Para Caixa, PDV e turno são um par: um sem o outro é inválido.
- O operador não escolhe livremente o posto na abertura; a API recusa outro PDV/turno, inclusive chamada direta.
- Gerência e Tesouraria são globais e não abrem Caixa como operador.
- O banco já possuía `turno_padrao_id`; a migration `0061_true_reptil.sql` acrescenta `pdv_padrao_id` e índice. Ela está versionada no código, mas **não há autorização implícita para aplicar em produção**.
- Antes de uso operacional, cadastrar e validar os oito operadores: PDV 1–4 × manhã/tarde.

O documento `73` é a decisão de negócio deste vínculo; este handoff corrige seu estado histórico: a PR foi integrada, mas deploy/migration/configuração dos usuários continuam atos separados.

---

## 6. Caixa: propósito, fluxo e regras que não podem ser improvisadas

### 6.1 Dois circuitos que não podem se misturar

**Dinheiro físico:** Cofre → transferência de abertura com lacre → Caixa/PDV → vendas em dinheiro e saídas físicas → sangria/retorno → Cofre → conferência da Tesouraria → fechamento/divergência.

**Recebíveis:** cartão, Pix, voucher e crediário → recebível → taxa/prazo → liquidação → banco/conciliação. Recebível não é dinheiro físico dentro da gaveta.

O saldo de uma conta é derivado: fundo inicial + entradas − saídas + ajustes auditáveis. Não se “edita” o saldo calculado. O documento `72` estabelece que somente Administrador total e Tesouraria podem criar ajuste imutável ou zeragem em lote, sempre com prévia, justificativa e trilha.

### 6.2 Fluxo operacional esperado

1. **Configuração**: PDV, turno, operador, supervisor, contas, lacres e maquininha precisam existir e ter permissão apropriada.
2. **Abertura**: o operador autenticado vê seu PDV/turno vinculado e bloqueado; informa/confere a transferência de abertura/lacre, responsáveis e terminal; a API decide com os dados autorizados.
3. **Operação**: vendas integradas do CREARE aparecem no turno conforme contrato de integração; movimentações (transferência, sangria, retorno, despesa, mercadoria, retirada) obedecem conta, permissão e estado do caixa.
4. **Fechamento**: inicia o fluxo único de fechamento; relatórios de vendas, cartão e movimentações são conferidos; transferência planejada pendente ainda bloqueia porque o dinheiro não saiu. Retorno/sangria já executado permanece auditável para Tesouraria, mas não cria bloqueio artificial.
5. **Tesouraria**: confere a entrega/transferência e registra divergência sem recalcular ou apagar o fato. Quem recebe entrega não deve “conferir a si mesmo”.
6. **Relatórios**: fechamento e pendências são leitura de fatos auditáveis, não caminhos alternativos para abrir/fechar ou apagar movimento.

### 6.3 Regras críticas

- Dinheiro usa centavos inteiros; dia de negócio é `America/Sao_Paulo`.
- “Transferência” é o termo de domínio; “malote” é apenas linguagem histórica/visual. Lacre é único e de uso único.
- Transferência pendente não some no fechamento. Cancelar uma saída divergente não devolve dinheiro artificialmente.
- Conferir valor menor que declarado produz quebra negativa auditável; valor maior precisa de consentimento/regra explícita, nunca criação automática de “quebra positiva”.
- Não criar conta genérica, fallback ou ajuste retroativo para fazer saldo “bater”.
- Não copiar fórmulas de dinheiro entre telas sem provar os filtros e o teste correspondente.

### 6.4 Mapa de código do Caixa

| Camada | Referências principais |
| --- | --- |
| API | `api/src/caixa/caixa.controller.ts`, `caixa.service.ts`, `caixa.repository.ts` |
| Fechamento/relatórios | `api/src/relatorios/relatorio-fechamento.*`, `web-vue/components/caixa/CaixaFechamento*.vue` |
| Tela e operação | `web-vue/pages/caixa.vue`, `web-vue/components/caixa/CaixaResumoPage.vue`, `CaixaResumoOperacao.vue`, `CaixaResumoMaloteAbertura.vue` |
| Transferência/retorno | `web-vue/composables/useCaixaRetornoSangria.ts`, `CaixaRetornoSangriaForm.vue` |
| Contratos/regras compartilhadas | `shared/src/caixa/`, `shared/src/autenticacao/` |
| Conta e vínculos | `api/src/contas/`, `api/src/contas-usuarios/`, `api/src/usuarios/` |
| Testes de maior valor | `tests/integration/caixa/`, `tests/integration/permissoes/caixa-*.test.ts`, `tests/unit/caixa-*.test.ts` |

As fontes de regra são, em especial, `17_REGRAS_LANCAMENTOS_FINAIS.md`, `19_REGISTRO_DE_REGRAS.md`, `28_ENTREGA_AO_COFRE_D1_D10_B1_B5.md`, `30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md`, `33_IDEMPOTENCIA_VENDA_INTEGRADA_41.md`, `34_GOVERNANCA_CAIXA_MARCO_2026_08_24.md`, `72_AJUSTE_SALDO_CONTAS_2026_10_20.md` e `73_VINCULO_OPERADOR_PDV_TURNO_2026_10_20.md`.

---

## 7. Demais áreas do sistema

| Área | Regra/estado a consultar antes de alterar |
| --- | --- |
| Usuários, cargos e permissões | `09_AUDITORIA_PERMISSOES.md`, `23_PERMISSOES_MODELO_E_AUDITORIA.md`, `71_AUDITORIA_MENU_E_PERMISSOES_2026_10_19.md`; API em `api/src/usuarios`, `api/src/permissoes`, `api/src/menu-empresa` |
| Contas e lançamentos | `17_REGRAS_LANCAMENTOS_FINAIS.md`, `19_REGISTRO_DE_REGRAS.md`, `72_AJUSTE_SALDO_CONTAS_2026_10_20.md`; não editar saldo derivado |
| Produtos, compras e estoque | `24_CADASTRO_DE_PRODUTOS.md`, `30_PRODUTOS_PRALIS_X_ERP.md`, `47` a `51`; há decisões de Compras explicitamente bloqueadas em `48` |
| Departamento Pessoal / admissões | `35` a `46`, na ordem de leitura explicada pelo índice; não apagar/renomear dados de colaborador sem regra e migration aprovada |
| IA de nota fiscal | R-192 no `17`; sugestão revisável, jamais salva/confirmada sozinha, sem chave/resposta/imagem em logs |
| CREARE | integração de vendas/PDV no servidor em `integracoes-scripts`; idempotência e roteamento têm fontes `32` e `33`. Não confundir com monitor de energia/online de cada computador do PDV |
| Interface e responsividade | `67_LINGUAGEM_VISUAL_CICLUZ.md`, `68_RELATORIO_MODERNIZACAO_VISUAL.md`, `69_PLANO_DESIGN_2026_08.md`; validar 1440/1024/768/390 |

### Departamento Pessoal e Questor/Conplus

Questor/Zen é o sistema técnico que recebe/troca dados; Conplus é a contabilidade, não um segundo sistema de destino. A auditoria documental foi registrada fora do repositório de código por conter contexto externo: `D:\Pralis-Segundo-Cerebro\11_INBOX_IA\2026-10-15-integracao-questor-admissoes.md` e material sanitizado em `D:\Pacotes-Documentacao\Questor-Conplus-Auditoria-2026-10-22.zip`.

Não há autorização para transmissão, importação real, exposição de PII ou integração direta até receber contrato de API/sandbox, autenticação, versão do layout, códigos de eventos e aprovação operacional. Arquivos `.nli`, `.txt` e `.csv` de exemplo não devem ser commitados nem republicados sem revisão de dados pessoais.

---

## 8. PROJECT_BRAIN e Obsidian (Segundo Cérebro)

`PROJECT_BRAIN/00_INDICE.md` é o catálogo completo dos documentos de produto. Ele contém históricos, documentos superados e regras vigentes: leia a indicação de status de cada arquivo; número não significa que seja a fonte mais nova. Os itens de maior prioridade para a continuidade são:

| Documento | Uso |
| --- | --- |
| `01_VISAO_E_FONTES.md` | precedência das fontes |
| `16_DEFINITION_OF_DONE.md` | o que é entrega pronta |
| `17_REGRAS_LANCAMENTOS_FINAIS.md` | lançamentos e regras financeiras consolidadas |
| `19_REGISTRO_DE_REGRAS.md` | fonte única de R-001 em diante e regras revogadas |
| `20_ESTADO_DA_ENTREGA.md` | estado de execução; conferir contra o HEAD pois partes são históricas |
| `23_PERMISSOES_MODELO_E_AUDITORIA.md` e `71_*` | modelo e auditoria de acesso/menu |
| `30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md` e `34_*` | fila e governança do Caixa |
| `35`–`46` | Departamento Pessoal/admissão |
| `47`–`51` | Compras/estoque e decisões bloqueadas |
| `67`–`69` | linguagem visual e responsividade |
| `70_*` | regra da fonte única e execução por PR pequena |
| `72_*` | ajuste auditável de saldo |
| `73_*` | vínculo operador–PDV–turno |

O vault Obsidian em `D:\Pralis-Segundo-Cerebro` **não é repositório nem fonte primária**. Ele serve para recuperar contexto e handoff. Ordem interna:

1. `00_INICIO.md` e `POLITICA_DO_COFRE.md` explicam como usar o vault.
2. `03_MODULOS/`, `06_DECISOES/` e `07_ROADMAP/` são notas curadas de contexto.
3. `11_INBOX_IA/` são checkpoints não promovidos; não autorizam alteração de regra.
4. `13_ESPELHOS_GERADOS/PROJECT_BRAIN/` é espelho gerado, somente leitura.

Para handoff ou checkpoint: criar nota sanitizada em `11_INBOX_IA` a partir de `TEMPLATE-CHECKPOINT-IA.md`, com data, agente, fonte, branch, HEAD, confirmado, hipótese, pendente e superado. Não incluir senha, chave, CPF, documento, banco, planilha crua ou log sensível.

Depois de commit e com o repositório limpo, sincronizar o espelho e validar:

```powershell
python 'D:\Pralis-Segundo-Cerebro\_AUTOMACAO\sincronizar_project_brain.py'
python 'D:\Pralis-Segundo-Cerebro\_AUTOMACAO\validar_cofre.py'
python 'D:\Pralis-Segundo-Cerebro\_AUTOMACAO\backup_cofre.py'
```

Nunca editar manualmente `13_ESPELHOS_GERADOS`.

---

## 9. GitHub, PR e Coolify: operação segura

### PR pequena

1. Crie/atualize a issue com contexto, regra aplicada, fora de escopo e critérios verificáveis.
2. Crie branch a partir de `origin/main` atualizada; uma intenção por branch.
3. Faça commits legíveis e revise `git diff` contra a base.
4. Execute os gates necessários, informe o que foi executado e o que não foi.
5. Faça push e abra PR para `main`. Aguarde os dois checks da CI.
6. Revise o SHA que passou. Não aprove PR pela aparência de uma execução anterior.
7. Só faça merge com gates verdes, zero P0/P1 e autorização/atribuição compatível com `AGENTS.md`.

### Deploy pelo Coolify

O arquivo de publicação é `infra/docker-compose.coolify.yml`. O Coolify acompanha a `main`; portanto, na configuração atual, **um push/merge em `main` pode disparar deploy automaticamente**. Não existe workflow GitHub de deploy separado.

O compose sobe, nesta ordem lógica:

1. serviço `migrate`: `api:prod:migrate`, bootstrap idempotente e seed de referência condicional;
2. `api`: Fastify com healthcheck `/health` e volume de uploads;
3. `web-vue`: Nuxt estático servido por Nginx.

Antes de qualquer deploy, rodar `npm run compose:coolify:check` localmente com os valores fictícios previstos pelo script; não abra nem copie `.env` ou segredos para chat/commit. Depois do deploy autorizado, confira no painel Coolify o log de `migrate`, a saúde da API, o log do `web-vue` e um smoke test no domínio oficial. Falha em `migrate` interrompe o deploy: não “pule” a migration nem rode SQL manual sem investigação e autorização.

Variáveis essenciais no painel são `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `WEB_ORIGIN` e `NUXT_PUBLIC_API_URL`. Valores reais ficam somente como secrets no Coolify.

---

## 10. Estado e pendências que exigem cuidado

- A `main` deste handoff está em `42f795a`, merge da PR #198; a partir dela nasce qualquer trabalho novo.
- A migration `0061_true_reptil.sql` é parte do código da PR #198, mas não deve ser aplicada em produção sem autorização explícita e revisão do SQL.
- O README tem referência histórica desatualizada de quantidade de migrations; use `db/migrations/` e `npm run check:migrations` para o estado real.
- Documentos antigos no índice podem mencionar executor, branch, número de tabela ou fila ultrapassados. Nunca os execute literalmente sem confrontar a `main`.
- As decisões de Compras em `48` são bloqueios explícitos, não lacunas a serem “completadas por bom senso”.
- A integração Questor/Conplus ainda não está autorizada para transmissão real.
- Nenhuma tarefa operacional deve alterar histórico de vendas, conta, fechamento, colaborador ou permissões em massa sem contagem, amostra, regra e confirmação.

---

## 11. Primeira resposta esperada de quem assumir

Antes de implementar, a pessoa/Claude deve responder de forma objetiva:

1. qual pasta canônica está usando;
2. branch, SHA local e SHA de `origin/main`;
3. se a árvore está limpa e quais mudanças locais preexistem;
4. quais documentos do PROJECT_BRAIN são aplicáveis ao pedido;
5. qual issue/branch pequena será usada;
6. quais são os riscos de migration, dinheiro, histórico, permissão, segredo, deploy ou PII;
7. como a entrega será validada e o que ficará explicitamente fora de escopo.

Se algum desses pontos não puder ser demonstrado, não é seguro começar a alterar o sistema.

---

## 12. Handoff resumido em uma frase

Trabalhe somente sobre a `main` atual do diretório canônico, em PRs pequenas e completas; preserve a trilha auditável do Caixa e das contas, trate `PROJECT_BRAIN` como regra de produto, use Obsidian apenas como contexto, e nunca transforme merge, nota antiga ou interface visível em autorização para migration, deploy, dado histórico, integração externa ou regra financeira nova.
