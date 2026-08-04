# Prompt — Identidade visual Cicluz + correções dos prints (30/07)

> Vigente. Rode **depois** de commitar o S6/S7 que está no working tree.
> Leia o `AGENTS.md` antes. As 5 regras do Definition of Done valem aqui também.

---

## Contexto em 3 linhas

O sistema ainda se chama **Padaria Pralis** na tela: logo, tokens CSS (`--pralis-*`), nome no
login e na sidebar. A marca correta do produto é **CICLUZ Gestão Profissional** — o sistema é um
produto da Cicluz que atende padarias, e Pralis é apenas **uma** das padarias clientes (aparece
no seletor de empresa da topbar, não na marca).

Junto disso vão quatro correções que o José achou testando local, uma delas **impede abrir caixa**.

---

## Bloco A · Os três subtítulos do "+ NOVO" (2 minutos)

`web-vue/utils/domain.ts`, `opcoesNovo`:

| id              | subtítulo hoje                    | subtítulo correto             |
| --------------- | --------------------------------- | ----------------------------- |
| entradas        | `Vendas e faturamento (integracao)` | `Vendas e faturamento`      |
| transferencias  | `Entre contas, cofre e caixas`    | `Entre contas`                |
| saidas          | `Despesa, mercadoria ou retirada` | **mantém como está**          |

Motivo: "(integração)" é detalhe de implementação — o operador não precisa saber de onde vem a
venda. "cofre e caixas" é redundante: cofre e caixa **são** contas.

Se algum teste afirmar o texto antigo, atualize o teste.

---

## Bloco B · Pralis → Cicluz

### B0 · PARE antes de começar

Os arquivos de logo da Cicluz precisam existir em `web-vue/public/cicluz/`. Confira:

```
web-vue/public/cicluz/logo-cicluz.png           (marca completa: símbolo + CICLUZ + Gestão Profissional)
web-vue/public/cicluz/logo-cicluz-branca.png    (mesma marca, para fundo escuro)
web-vue/public/cicluz/cicluz-simbolo.png        (só a flor — sidebar recolhida e favicon)
web-vue/public/cicluz/cicluz-simbolo.svg        (vetor do símbolo, se existir)
```

**São PNG, não SVG** — o material de origem que a Cicluz tem é PNG. Eles chegam já tratados:
fundo transparente, recortados, na resolução certa e com a variante para tema escuro. **Você não
precisa (e não deve) processar imagem.**

> **Estado em 30/07 — já resolvido, não refaça.** Os arquivos entraram no commit `3ea387e` com
> três defeitos: (1) os nomes estavam **trocados** — o `cicluz-simbolo.png` era a marca completa
> e o `logo-cicluz.png` era só o símbolo; (2) `logo-cicluz-branca.png` era **byte a byte igual**
> ao normal, ou seja, a variante para tema escuro não existia; (3) nenhum tinha fundo
> transparente, e havia uma moldura cinza de captura de tela nas bordas.
>
> Corrigido: nomes acertados, fundo recortado, moldura aparada, variante branca gerada de verdade
> (wordmark claro, símbolo colorido intacto) e favicon criado. Os originais ficaram em
> `public/cicluz/_orig/`. **Use os nomes como estão na tabela acima.**

**Se os arquivos não existirem, PARE e avise o José.** Não desenhe substituto, não renomeie o
logo antigo, não improvise com ícone do MDI, não gere um SVG "parecido".

Use `<img>` com `width`/`height` explícitos para a proporção não pular durante o carregamento.

### B1 · Decisões já tomadas pelo José (30/07) — não reabra

| Ponto              | Decisão                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| **Cor primária**   | **continua `#6515dd`** (roxo atual). O logo é um espectro completo e não vira primária de UI. |
| **Secundária**     | continua `#35128c`                                                                |
| **Cores de categoria** | **intocadas** (entradas amarelo, transferências laranja, mercadorias verde, retiradas azul — vieram das abas da planilha). O espectro do logo passa a justificá-las. |
| **Texto da marca** | logo Cicluz + **"Gestão Profissional"**. Sem "Padaria", sem "Pralis".            |

Ou seja: **esta entrega troca marca e nomenclatura, não repagina o sistema.** Se você se pegar
mexendo em cor de botão, parou de fazer o que foi pedido.

### B2 · Assets

- Trocar a referência em `AppShell.vue:156` (`/pralis/logo-pralis.svg` → `/cicluz/logo-cicluz.png`),
  com `alt="Cicluz Gestão Profissional"`.
- **Tema escuro:** a sidebar tem toggle de tema. O wordmark é cinza-grafite e **some** no escuro —
  troque para `logo-cicluz-branca.png` quando o tema for escuro. Se hoje o logo é um `<img>` fixo,
  isso é um `<img>` condicional ao tema do Vuetify, não `filter: invert()` (inverter destrói o
  espectro do símbolo).
- Sidebar **recolhida**: usar `cicluz-simbolo.png`. O comportamento atual (o próprio logo é o
  botão que recolhe/expande) fica como está — não crie um segundo botão.
- Favicon e `<title>` da aba: hoje não há nada configurado no `nuxt.config.ts`/`app.vue`.
  Adicione: favicon = símbolo Cicluz, title = `Cicluz Gestão Profissional`.
- **Apague** `web-vue/public/pralis/` inteiro (6 arquivos). Regra-mãe: caminho antigo removido,
  não escondido. Se sobrar alguma referência, o build acusa — é justamente o que queremos.

### B3 · Tokens CSS

`web-vue/assets/main.css` tem um bloco de tokens fixos `--pralis-*` (linhas ~591-610) usados na
casca clara do admin. Renomeie o prefixo para `--marca-*` (neutro: se a marca mudar de novo,
o token não mente) e reaponte os valores:

| Token hoje                      | Valor hoje | Vira                                    | Valor        |
| ------------------------------- | ---------- | --------------------------------------- | ------------ |
| `--pralis-orange`               | `#f37435`  | `--marca-acento`                        | `#6515dd`    |
| `--pralis-orange-strong`        | `#e2632a`  | `--marca-acento-forte`                  | `#35128c`    |
| `--pralis-orange-soft`          | `#fdeee5`  | `--marca-acento-suave`                  | `#efe9fd`    |
| `--pralis-gold`                 | `#b8860b`  | `--marca-destaque`                      | `#b8860b` *(mantém — é usado como cor de alerta/destaque, não de marca)* |
| `--pralis-ink`                  | `#2f2320`  | `--marca-tinta`                         | `#2b2b2f`    |
| `--pralis-ink-soft`             | `#6f635c`  | `--marca-tinta-suave`                   | `#6b6b73`    |
| `--pralis-surface`              | `#ffffff`  | `--marca-superficie`                    | `#ffffff`    |
| `--pralis-canvas`               | `#f7f5f2`  | `--marca-fundo`                         | `#f6f6f8`    |
| `--pralis-line`                 | `#ece7e1`  | `--marca-linha`                         | `#e8e8ec`    |
| `--pralis-line-soft`            | `#f1ede8`  | `--marca-linha-suave`                   | `#f0f0f4`    |
| `--pralis-shadow`               | sombra marrom | `--marca-sombra`                     | `0 10px 30px rgba(43, 43, 47, 0.06)` |

Os neutros de hoje são **quentes/amarronzados** (identidade de padaria). Os novos são neutros
frios, coerentes com o cinza-grafite do wordmark CICLUZ. É uma mudança sutil e proposital.

**Confira o contraste** de `--marca-tinta` e `--marca-tinta-suave` sobre `--marca-fundo`
(AA, ≥4.5:1 para texto normal). Se algum par reprovar, ajuste o token e **me diga qual mudou**.

### B4 · Textos e comentários

- `pages/login.vue`, `pages/index.vue`, `components/workspace/WorkspaceDialogs.vue`,
  `composables/useApi.ts`: trocar toda menção a "Pralis"/"Padaria Pralis" pela marca Cicluz.
- `utils/tema.ts`: o mecanismo de migração de cor de fábrica (`primariasDeFabrica`,
  `secundariasDeFabrica`) **fica** — é o que impede empresa personalizada de perder a cor. Só
  atualize o comentário que fala em "laranja Pralis" para dizer o que ele realmente faz.
- `utils/tema.test.ts`: ajuste os nomes dos testes, não a lógica.

---

## Bloco C · Acentuação da UI (isto é produto, não estilo)

Convencionamos escrever **código e commits sem acento**. Isso vazou para o **texto que o usuário
lê**, e o sistema hoje mostra, num produto brasileiro:

> "Nao ha caixa aberto" · "Historico de caixas" · "Transferencias" · "Saidas" · "Observacao do
> fechamento" · "ACOES" · "Tela indisponivel para este perfil." · "Algumas listas nao carregaram
> por falta de permissao" · "Contas usadas nos lancamentos financeiros."

**Regra que passa a valer:** identificador, nome de arquivo, commit e comentário continuam sem
acento. **String que aparece na tela é português correto, com acento.**

O que fazer:

1. Varra os textos visíveis: `label`, `title`, `placeholder`, `v-card-title`, `subtitulo`,
   mensagens de erro/aviso da API que chegam à tela, títulos de menu em `utils/domain.ts`,
   cabeçalhos de tabela.
2. Corrija a acentuação.
3. **Não** toque em: nomes de variável/função/tipo, chaves de objeto, ids de tela/permissão,
   nomes de rota, valores de enum gravados no banco. Trocar um id quebra dados.
4. Onde a mensagem nasce no backend e chega literal na tela (ex.: "Abra um caixa antes de
   registrar este lancamento"), corrija na origem.

Se a varredura passar de ~150 strings, **entregue por camada** (menu → telas de caixa → telas de
lançamento → mensagens de API) e me diga onde parou. Meia varredura silenciosa é pior que
nenhuma: fica metade acentuada e metade não, e ninguém sabe o que já foi feito.

---

## Bloco D · Bugs encontrados testando local

### D1 · 🔴 Regra antiga bloqueia o fluxo novo de transferência

> **Correção de escopo (30/07):** eu havia escrito aqui "não é possível abrir caixa". **Está
> errado e a produção está bem.** A abertura tem caminho próprio (formulário ABRIR CAIXA com
> Transf. Entrada / N° Lacre), que cria a transferência por dentro — a padaria abre caixa todo
> dia. O que quebra é o modal **avulso** de Transferência (FOTO 1) usado antes de haver caixa.
> Continua sendo prioridade, mas é **regra antiga conflitante**, não sistema parado.

**Reprodução:** tela de Caixa sem caixa aberto → abrir o modal de Transferência para lançar a
transferência do cofre para o caixa (a que gera o lacre da abertura) → Salvar →
**"Abra um caixa antes de registrar este lancamento"**.

**Por que é um impasse lógico:** pela FOTO 5 do Rodrigo (`PROJECT_BRAIN/14`), o caixa é aberto
**pelo N° de lacre da transferência de entrada**. Então: para abrir o caixa você precisa da
transferência; para fazer a transferência você precisa do caixa aberto. **Ninguém consegue
começar o dia.**

**Onde olhar:** `api/src/transferencias/transferencias.service.ts:47` chama
`obterCaixaParaLancamento`, que desemboca no erro em `api/src/caixa/caixa.service.ts:882`.

**Antes de corrigir, meça e me traga:**

- a transferência **sempre** exigiu caixa aberto, ou isso entrou junto com alguma entrega recente?
- existe bypass para papéis de gestão? O print foi feito como **Diretor Geral**, que pela
  `PROJECT_BRAIN/17 §4` lança **sem** caixa aberto — então ou o bypass não existe no caminho da
  transferência, ou não está pegando.
- não achei `menu_transferencias_somente_caixa_aberto` na referência de permissões; confirme.

**A regra correta:** transferência **entre contas** não é lançamento de caixa. Ela move dinheiro
de conta para conta e é justamente o que **habilita** a abertura. Não pode exigir caixa aberto —
para ninguém. Se você discordar disso, **fale antes de implementar**, com o argumento.

Teste de integração obrigatório: *"transferência cofre→caixa é aceita sem nenhum caixa aberto"*.

### D2 · Diálogos nativos do navegador ("localhost:5174 diz")

`window.confirm` em 4 pontos de `AppWorkspace.vue` (linhas ~1367, 1430, 1508, 1591). O usuário vê
a caixa cinza do Chrome com a URL — parece site quebrado, não sistema.

Substitua por um **único** componente de confirmação Vuetify (um só, reutilizado — não quatro
diálogos parecidos), com título, corpo e os botões rotulados pela ação real
("Cadastrar mesmo assim" / "Cancelar"), não "OK/Cancel".

O `confirmar:` na linha ~1508 é injetado como dependência — troque a implementação ali e os
consumidores nem percebem.

### D3 · "Erro interno" ao fechar o caixa

Fechamento com diferença de R$ 1.000,00 → confirma a atribuição ao usuário → toast **"Erro
interno"** (500 sem mensagem). Reproduza, ache a exceção real, corrija, e faça o erro chegar à
tela **dizendo o que aconteceu**. Teste cobrindo o fechamento com diferença positiva.

### D4 · "+ NOVO → Entradas" leva a uma tela que nega acesso

O item **Entradas** aparece no "+ NOVO", navega para `/entradas`, e a tela responde
**"Tela indisponivel para este perfil."**

É a duplicidade de regra clássica: o menu usa uma condição, a tela usa outra. Uniformize —
**se o perfil não pode ver a tela, o item não aparece no "+ NOVO"**. Um convite que termina em
recusa é pior que a ausência do convite.

### D5 · Tela de Contas: FUNDO e SALDO ATUAL não batem com o S4

No print: conta "teste 3" com **FUNDO R$ 0,00** e **SALDO ATUAL "-"** (traço, sem valor). Pela
`PROJECT_BRAIN/17 §2`, saldo = fundo + entradas − saídas, derivado. Verifique:

- o fundo digitado no cadastro está sendo **gravado** em `contas.saldo_inicial`?
- o saldo derivado está sendo **calculado e devolvido** na listagem, ou só no detalhe?
- se a conta não tem movimento, o correto é mostrar **R$ 0,00** (ou o próprio fundo), não `-`.
  Traço é "não sei"; zero é informação.

Também apareceu **"Algumas listas nao carregaram por falta de permissao (Contas). A tela continua
utilizavel."** logo antes de a lista ficar vazia — como **Diretor Geral**. Investigue: ou o DG
não tem a permissão de Contas (e deveria), ou a chamada está indo sem escopo de empresa.

---

## O que NÃO está neste prompt

Não faça agora — cada um vira entrega própria:

- simplificação do menu lateral pelo Xmind do Rodrigo;
- auditoria do que o sprint S1–S8 realmente entregou;
- teste do fluxo completo (abertura com lacre → lançamentos → retorno → fechamento);
- limpeza das regras antigas conflitantes.

---

## Fechamento

- Commits separados por bloco (A, B, C, D1…D5) — se algo precisar voltar, volta sozinho.
- `lint` + `check` + testes verdes no fim.
- Responsividade em 1440/1024/768/390 nas telas tocadas.
- **NÃO MERGEIE.** O José testa local e decide o deploy.
- No resumo: o que ficou pronto, **o que não ficou**, e o que precisa de decisão dele.
