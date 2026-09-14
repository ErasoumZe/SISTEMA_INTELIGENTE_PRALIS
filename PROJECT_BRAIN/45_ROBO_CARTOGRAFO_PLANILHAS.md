# 45 — Robô Cartógrafo das Planilhas PraLis (análise técnica)

> Aberto em 25/08/2026. **Análise somente leitura. Nada foi implementado, instalado ou commitado.**
> Documento de origem: `PROJECT_BRAIN/panilhas/Relatorio-Engenharia-Reversa-Google-Sheets-PraLis.md.md`.
> Este documento avalia **a viabilidade no repositório real** — não repete a pesquisa do relatório.

> **Nota de 14/09/2026, posterior ao texto abaixo.** Este documento nasceu como `32` e foi
> renumerado para `45`: a `main` gravou um `32` próprio do Caixa enquanto esta branch estava
> parada atrás dela. Veja a nota de numeração no `00`.
>
> A tabela da §1 é o retrato de **25/08** e fica como está, porque é o registro do momento. Só o
> `HEAD` avançou muito desde o `ee7f808`.
>
> **A pasta `panilhas/` continua solta, e continua de propósito.** O relatório dentro dela foi
> varrido por CPF, e-mail, telefone e CNPJ — **zero ocorrências** —, mas ele é documento de origem
> externa, trazido de fora do projeto. Versionar isso é escolha de Marco: o que entra no histórico
> do git não sai. É a R-3 deste mesmo documento aplicada a ele próprio.
>
> **Pendência de higiene, não corrigida aqui:** a pasta se chama `panilhas/` — falta o `l` — e o
> arquivo dentro dela termina em `.md.md`. Renomear é trivial, mas o §11 deste documento propõe
> `PROJECT_BRAIN/planilhas/` (grafia correta) como destino do corpus sanitizado, então as duas
> pastas conviveriam com nomes quase iguais e significados diferentes. Resolver isso é decisão de
> quem for executar o piloto, não efeito colateral de um commit de organização.

## 1. Estado do repositório

| Verificação | Resultado |
| --- | --- |
| Diretório | `D:\Cicluz-CadastroColaborador\Sistema` |
| Branch | `feat/admissoes-testes-tnp` |
| HEAD | `ee7f808b866002ff8cbec7808aec7aee39120ee4` |
| `main` / `origin/main` | `5e7dd723…` — **intactas** |
| `git status` | limpo, exceto `?? PROJECT_BRAIN/panilhas/` (a pasta trazida por Marco) |
| Stash | vazio |

## 2. Três achados que mudam a proposta do relatório

### A-1 · `docs/` está no `.gitignore` — o corpus proposto ficaria invisível

O relatório propõe gravar o acervo em `docs/planilhas/`. Verificado:

```
$ git check-ignore -v docs/planilhas/inventory.json
.gitignore:25:docs/     docs/planilhas/inventory.json
```

Os 32 arquivos hoje em `docs/` continuam rastreados porque **entraram antes** da regra — `.gitignore` só afeta arquivo novo. Qualquer arquivo novo ali precisaria de `git add -f`, ou some em silêncio.

Isso derruba o objetivo declarado ("arquivos estáveis e **versionados** para o Codex"). **O corpus não pode morar em `docs/`.**

### A-2 · `credentials.json` e `token.json` NÃO estão cobertos hoje

```
$ git check-ignore -v tools/sheets-cartographer/.env
.gitignore:7:.env       tools/sheets-cartographer/.env      → coberto

$ git check-ignore -v tools/sheets-cartographer/credentials.json
(sem correspondência)                                        → NÃO coberto
$ git check-ignore -v tools/sheets-cartographer/token.json
(sem correspondência)                                        → NÃO coberto
```

`.env` já é pego pela linha 7 em qualquer subpasta. Os dois arquivos de OAuth **não são**. Um `git add -A` distraído publica o refresh token da conta `sistema@cicluz.com.br` no GitHub. Regra explícita é obrigatória **antes** da primeira linha de código.

### A-3 · Já existe ferramenta de planilha em TypeScript neste repo

| Arquivo | Linhas | O que faz |
| --- | ---: | --- |
| `scripts/seed-planilha.ts` | 917 | XLSX → Postgres, dry-run por padrão, idempotente |
| `db/planilha-xlsx.ts` | 170 | leitor `.xlsx` próprio, **sem dependência externa** |
| `db/planilha-inspecionar.ts` | 121 | inspeção de planilha local |

O cabeçalho de `db/planilha-xlsx.ts` registra uma decisão que vale para o robô:

> *"a candidata natural (exceljs) traz 20 vulnerabilidades transitivas — o `npm audit` do repositório sai de 23 para 43 — e isto aqui é um script de SEEDING (…). Trocar a superfície de ataque do projeto inteiro por conveniência num script não paga."*

**Não é duplicidade** — o robô lê o Google Sheets **vivo** por API (fórmulas, validações, proteções, scripts), enquanto o existente lê `.xlsx` **morto** para semear o banco. Mas a fronteira precisa estar escrita, ou vira o "segundo caminho" que o `AGENTS.md` §4.1 proíbe:

> **`db/planilha-xlsx.ts` lê arquivo baixado, para semear. O Cartógrafo lê a planilha viva, para documentar. O Cartógrafo NUNCA escreve no banco de produção.**

## 3. Onde o robô deve morar

### Avaliação de `tools/sheets-cartographer` — **aprovado, com ajustes**

`tools/` não existe. Os workspaces são `api, db, integracoes-scripts, web-vue, shared, tests`.

O precedente real de "robô" é **`integracoes-scripts`** (agente do PDV CREARE): processo separado, `.env` próprio, estado de runtime em `.estado/` (gitignored), gate próprio (`node --check` + `node --test`), e **excluído do ESLint** — o `eslint.config.mjs` diz, com todas as letras, que é "um workspace JS puro (sem TS), com gate proprio".

| Opção | Veredito |
| --- | --- |
| `scripts/` | ❌ é para script de manutenção de repositório, executado por dev. O robô tem OAuth, token, estado e produz acervo. |
| Dentro de `api/` ou `db/` | ❌ arrastaria dependência de OAuth para o runtime do ERP. |
| Clone do padrão `integracoes-scripts` (JS puro) | ⚠️ funciona, mas contraria a recomendação de TypeScript e abre mão dos tipos justamente onde o payload do Google é complexo. |
| **`tools/sheets-cartographer` como workspace npm, TypeScript** | ✅ **recomendado** |

**Por que `tools/` no plural:** o Cartógrafo não será a única ferramenta desse tipo (virão o extrator de Apps Script e o comparador de homologação). Uma pasta genérica evita uma nova pasta de topo por ferramenta.

**O que adicionar como workspace custa:** editar `workspaces` no `package.json` da raiz e decidir se entra em `npm run lint` e `npm run check`. Recomendo **entrar nos dois** — é TypeScript, e ficar fora repetiria a exceção que `integracoes-scripts` só tem por ser JS legado.

## 4. Padrões existentes que o robô precisa respeitar

**TypeScript.** `tsconfig.base.json` é agressivamente estrito: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`, `useUnknownInCatchVariables`. Payload do Google é cheio de campo opcional e índice — **`noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` vão doer**. Melhor validar a resposta da API com **Zod** (já no repo) na fronteira, em vez de confiar em tipo de biblioteca.

**Testes.** `vitest.config.ts` da raiz usa `projects` com `include` fixo em `./tests/unit/**` e `./tests/integration/**`. `web-vue` tem `vitest.config.ts` próprio. O robô deve seguir o modelo do `web-vue`: **config próprio no workspace**, testando parsing de fórmula e montagem de payload **com fixtures sintéticas**, sem rede.

**Documentação.** Série numerada do `PROJECT_BRAIN` (este é o **32**; próximo livre passa a **33**).

**Gates.** `npm run quality` = `lint + lint:deps + format:check + check + test + audit:deps`. O `audit:deps` roda com `--audit-level=moderate` — ver risco R-2.

## 5. Estrutura de pastas proposta

```text
tools/sheets-cartographer/
├── package.json                 # @padaria/sheets-cartographer, private
├── tsconfig.json                # extends ../../tsconfig.base.json
├── vitest.config.ts             # testes puros, sem rede
├── README.md                    # como autorizar e rodar
├── .gitignore                   # credentials.json, token.json, .saida/
├── .env.example                 # sem segredo, só nomes de variável
├── src/
│   ├── auth/
│   │   ├── oauth-cliente.ts     # fluxo loopback + refresh
│   │   └── escopos.ts           # scopes mínimos, um lugar só
│   ├── drive/inventario.ts      # Etapa A
│   ├── sheets/
│   │   ├── retrato.ts           # Etapa B (spreadsheets.get com field mask)
│   │   └── celulas.ts           # valores, fórmulas, validações
│   ├── analise/dependencias.ts  # Etapa D (IMPORTRANGE, QUERY, ...)
│   ├── saida/{json,csv,markdown}.ts
│   ├── sanitizacao/pii.ts       # obrigatório antes de qualquer arquivo versionado
│   └── cli.ts
├── test/                        # fixtures SINTÉTICAS
└── .saida/                      # LOCAL, gitignored — retrato bruto
```

**Duas áreas de saída, e a distinção é a regra central:**

| Área | Conteúdo | Git |
| --- | --- | --- |
| `tools/sheets-cartographer/.saida/` | retrato **bruto**: células, valores reais, PII | **nunca** |
| `PROJECT_BRAIN/planilhas/` | corpus **sanitizado**: estrutura, fórmulas, dicionário, regras, dúvidas | **sim** |

`PROJECT_BRAIN/` já é versionado e é onde a equipe procura verdade. `docs/` está fora (A-1).

## 6. Bibliotecas necessárias — **nenhuma instalada**

| Pacote | Papel | Nota |
| --- | --- | --- |
| `google-auth-library` | OAuth2, loopback, refresh | **preferida** — é só o cliente de auth |
| `googleapis` | metapacote com todas as APIs | ⚠️ pesado; ver R-2 |
| `zod` | validar resposta na fronteira | **já existe** no repo |
| `dotenv` | `.env` | já usado; Node 22 também tem `--env-file` |
| `@google/clasp` | baixar Apps Script | **etapa separada**, é CLI |

**Recomendação:** começar com `google-auth-library` + `fetch` nativo (Node 22) contra os endpoints REST, em vez de `googleapis`. Motivo em R-2.

## 7. Fluxo OAuth com `sistema@cicluz.com.br`

Aplicação do tipo **Desktop / Installed App**, com redirect **loopback** (`http://127.0.0.1:<porta>`). O fluxo OOB foi descontinuado pelo Google; loopback é o caminho suportado.

```text
1. Marco cria projeto no Google Cloud Console (conta sistema@cicluz.com.br)
2. Habilita: Drive API, Sheets API   (Apps Script API só na etapa separada)
3. Cria credencial OAuth "Desktop app" → baixa credentials.json
4. credentials.json vai para tools/sheets-cartographer/ (fora do Git)
5. `npm run cartografo:autorizar`
     → abre o navegador
     → login com sistema@cicluz.com.br
     → tela de consentimento lista os scopes SOMENTE LEITURA
     → callback no loopback devolve o code
6. Robô troca code por refresh_token → grava token.json (fora do Git)
7. Execuções seguintes usam o refresh_token; sem navegador
```

**Alternativa considerada e NÃO recomendada agora:** Service Account com *domain-wide delegation*. Exige admin do Workspace, permite personificar qualquer usuário do domínio e some com a trilha de "quem leu". Para um piloto de leitura com uma conta, OAuth de usuário é mais restrito e mais auditável. **Decisão de Marco.**

## 8. Scopes mínimos de leitura

| Etapa | Scope | Para quê |
| --- | --- | --- |
| A — inventário | `drive.metadata.readonly` | nome, pasta, dono, data, permissões — **sem conteúdo** |
| B — retrato | `spreadsheets.readonly` | abas, células, fórmulas, validações, proteções |
| C — scripts *(separada)* | `script.projects.readonly` | código `.gs`, manifesto |

**Nenhum scope de escrita. Nunca `drive` amplo, nunca `spreadsheets` sem `.readonly`.**

Dois pontos **a confirmar no piloto**, não afirmar de antemão:

1. se `drive.metadata.readonly` basta para listar `permissions`, ou se exigirá `drive.readonly` (mais amplo — só escalar com autorização explícita);
2. se a Apps Script API exige, além do scope, habilitação por usuário na conta.

## 9. Segredos fora do Git

`.env` **já** é coberto pela linha 7 do `.gitignore` em qualquer subpasta. Os dois arquivos de OAuth **não são** (A-2). Adicionar à raiz, antes de qualquer código:

```gitignore
# Robô Cartógrafo — credenciais OAuth da conta sistema@cicluz.com.br.
# credentials.json e token.json contêm client_secret e refresh_token.
tools/**/credentials.json
tools/**/token.json
tools/**/.saida/
```

Complementos:

- `.env.example` versionado com **nomes** de variável e valor vazio — padrão já usado em `integracoes-scripts/.env.*.example`;
- `token.json` com permissão restrita no disco;
- nenhum ID de planilha real, e-mail, CPF ou nome em mensagem de commit, log ou prompt de IA;
- credencial encontrada **dentro** de Apps Script: registrar como "integração existente", **revogar**, nunca copiar para o repositório — regra do relatório §9;
- log do robô nunca imprime conteúdo de célula; imprime contagem e ID.

## 10. Teste inicial — uma planilha, por ID

Objetivo: provar autenticação e leitura, **sem trazer PII**.

```text
Passo 1  autorizar (uma vez, navegador)
Passo 2  spreadsheets.get com field mask ENXUTA e includeGridData=false
         fields: spreadsheetId,properties(title,locale,timeZone),
                 sheets(properties(sheetId,title,index,hidden,gridProperties))
         → devolve SÓ a estrutura. Zero célula. Zero PII.
Passo 3  imprimir: nº de abas, nomes, ocultas, dimensões, fuso
Passo 4  segunda chamada, UMA aba, intervalo limitado (ex.: A1:Z50),
         valueRenderOption=FORMULA → provar que a fórmula vem
Passo 5  gravar em .saida/ (gitignored) e um resumo sanitizado no terminal
```

**Critério de sucesso:** o passo 2 responde 200 e lista as abas corretas. Se falhar, é escopo, consentimento ou API não habilitada — três causas distinguíveis pela mensagem.

**A planilha do piloto é a de Cadastro de Colaboradores** (§10 do relatório): está sendo criada agora, tem dono conhecido e escopo fechado — e é o mesmo domínio da ADM-001, já mapeado no `PROJECT_BRAIN/31`.

## 11. Arquivos que o robô gera

**Versionados, em `PROJECT_BRAIN/planilhas/` (sanitizados):**

| Arquivo | Conteúdo |
| --- | --- |
| `inventario.json` | IDs, nomes, pastas, donos, datas — **sem conteúdo de célula** |
| `mapa-dependencias.json` | quem lê/alimenta quem (`IMPORTRANGE`, `QUERY`, `openById`) |
| `dicionario-de-dados.csv` | campo, tipo, origem, obrigatoriedade, valores permitidos |
| `catalogo-de-regras.md` + `.csv` | regra, fórmula de origem, responsável, confiança |
| `duvidas.md` | o que o robô **não** resolveu — `INDIRECT`, referência dinâmica, cor sem significado claro |
| `casos-de-teste.csv` | entrada → saída esperada, para homologação |
| `planilhas/<spreadsheet-id>/estrutura.json` | abas, dimensões, validações, proteções |
| `planilhas/<spreadsheet-id>/formulas.csv` | endereço + fórmula (fórmula é regra, não dado pessoal) |

**Nunca versionados, em `.saida/`:** `celulas.ndjson` (valores reais) e o retrato bruto.

**Identidade:** sempre `spreadsheetId` + `sheetId` (numérico, permanente) + endereço A1. **Nunca número de linha como identidade** — inserir uma linha renumera tudo. Nome de aba também muda; `sheetId` não.

## 12. Limitações conhecidas

| Limitação | Efeito |
| --- | --- |
| **Gatilhos instaláveis pertencem a quem os criou** | a conta de auditoria pode não enxergá-los. Exige levantar com cada dono. |
| **Apps Script vinculado** | não aparece como arquivo comum no Drive; precisa da Apps Script API, habilitada e autorizada. |
| **Planilha sem acesso** | some do inventário em silêncio. O robô deve **registrar a lacuna**, não pular. |
| **`IMPORTRANGE`** | precisa de autorização entre arquivos; sem ela devolve erro em vez de dado. |
| **`INDIRECT` e referência dinâmica** | não resolvível estaticamente → vai para `duvidas.md`. |
| **Script que escolhe arquivo em runtime** | idem. |
| **Quotas do Sheets API** | leitura por minuto/usuário é limitada; exige backoff e *field mask*, não varredura cega. |
| **Planilha grande** | `includeGridData=true` sem máscara pode estourar memória e quota. |
| **Regra humana** | "quando X, a pessoa decide Y" não é extraível. Só entrevista. |
| **Conector Google Drive do claude.ai** | está **desconectado / sem autorização** nesta sessão. Não serve como caminho de leitura, e de todo modo o robô terá OAuth próprio. |

## 13. Riscos

| # | Risco | Grau | Mitigação |
| --- | --- | --- | --- |
| R-1 | Vazamento de `credentials.json` / `token.json` | **P0** | regra de `.gitignore` **antes** do código (§9) |
| R-2 | `googleapis` empurra o `npm audit` do monorepo | **P1** | medir o delta antes de adotar; preferir `google-auth-library` + `fetch`. Precedente explícito em `db/planilha-xlsx.ts` |
| R-3 | PII real vazando para arquivo versionado ou prompt de IA | **P0** | separar `.saida/` (bruto) de `PROJECT_BRAIN/planilhas/` (sanitizado); sanitização obrigatória no caminho de escrita |
| R-4 | Corpus gravado em `docs/` e ignorado em silêncio | **P1** | resolvido por A-1: usar `PROJECT_BRAIN/planilhas/` |
| R-5 | Robô virar segundo caminho de `seed-planilha.ts` | **P1** | fronteira escrita (A-3); Cartógrafo **nunca** escreve no banco |
| R-6 | Escrita acidental na planilha | **P0** | só scopes `.readonly`; nenhum método de escrita importado |
| R-7 | Conclusão errada por fórmula não resolvida | **P1** | `duvidas.md` é entregável obrigatório, não opcional |
| R-8 | Quota estourada em varredura ampla | **P2** | field mask, intervalos, backoff, uma planilha por vez no piloto |

## 14. Critérios de aceite do piloto

1. `git check-ignore` confirma que `credentials.json`, `token.json` e `.saida/` estão cobertos.
2. Autorização feita com `sistema@cicluz.com.br`, com **apenas** scopes `.readonly` na tela de consentimento.
3. Leitura de **uma** planilha por ID devolve estrutura correta (abas conferidas a olho).
4. Fórmulas chegam como fórmula (`valueRenderOption=FORMULA`), não como valor calculado.
5. Nenhum CPF, nome, telefone ou endereço real em arquivo versionado, log ou mensagem de commit.
6. `npm run lint` e `npm run check` continuam verdes com o workspace novo.
7. Delta do `npm audit` medido e aceito por Marco.
8. Zero escrita: nenhuma alteração na planilha, no Drive, no banco ou no ERP.

## 15. Plano em etapas pequenas

| Etapa | Entrega | Autorização |
| --- | --- | --- |
| **E0** | regras de `.gitignore` + `PROJECT_BRAIN/planilhas/.gitkeep` | Marco |
| **E1** | esqueleto do workspace (package.json, tsconfig, README, `.env.example`) — **sem dependência** | Marco |
| **E2** | Marco cria projeto no Cloud Console, habilita Drive+Sheets, baixa `credentials.json` | Marco (fora do repo) |
| **E3** | instalar `google-auth-library` + medir `npm audit` | Marco |
| **E4** | comando `autorizar` — só prova o OAuth, não lê planilha | Marco |
| **E5** | leitura de **uma** planilha (§10), saída em `.saida/` | Marco |
| **E6** | inventário do Drive na pasta do piloto | Marco |
| **E7** | extrator de fórmulas + mapa de dependências + `duvidas.md` | Marco |
| **E8** | sanitização + primeiro corpus em `PROJECT_BRAIN/planilhas/` | Marco |
| **E9** | Apps Script (API + `clasp`) — **projeto separado** | Marco |

Uma etapa por turno, commit próprio, `git status` limpo entre elas.

## 16. Dúvidas e bloqueios

**Bloqueiam E2 em diante:**

1. **Service Account × OAuth de usuário** (§7) — recomendo OAuth de usuário; confirmar.
2. **Quem é dono da planilha do piloto** e quais contas têm Apps Script vinculado.
3. **ID da planilha de Cadastro de Colaboradores** — deve chegar por canal privado, **não** no chat nem em commit.
4. **Autorização para `googleapis`** caso o delta de `npm audit` seja relevante (R-2).

**Não bloqueiam o piloto:**

5. escalar de `drive.metadata.readonly` para `drive.readonly` se `permissions` exigir;
6. política de retenção do `.saida/` bruto;
7. Power BI / NocoDB / MCP oficial do Sheets — o relatório os coloca como conferência e prova de conceito; ficam fora do piloto.

**Higiene documental (não bloqueia):** a pasta trazida chama-se `panilhas` (falta o "l") e o arquivo termina em `.md.md`. Corrijo para `PROJECT_BRAIN/planilhas/Relatorio-Engenharia-Reversa-Google-Sheets-PraLis.md` quando autorizado.

## 17. Próximo prompt recomendado

> **E0 + E1 — esqueleto do Cartógrafo, sem dependência e sem rede.**
>
> Na branch indicada por Marco, e somente nela:
> 1. acrescentar ao `.gitignore` da raiz as regras de `tools/**/credentials.json`, `tools/**/token.json` e `tools/**/.saida/`, e provar com `git check-ignore -v`;
> 2. criar `tools/sheets-cartographer/` com `package.json` (privado, sem dependências), `tsconfig.json` estendendo `tsconfig.base.json`, `README.md`, `.env.example` e `.gitignore`;
> 3. registrar o workspace no `package.json` da raiz e decidir a entrada em `lint`/`check`;
> 4. criar `PROJECT_BRAIN/planilhas/.gitkeep` como destino do corpus sanitizado;
> 5. **não** instalar nada, **não** chamar rede, **não** tocar em API, banco, ERP ou planilha;
> 6. rodar os checks que não dependem de `node_modules` e relatar.
>
> Parar e aguardar autorização antes de E2.

---

**Governança:** este documento é análise. Não autoriza instalação, criação de projeto no Google Cloud, acesso a planilha, commit, push ou alteração de ERP, banco, migrations ou deploy.
