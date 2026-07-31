# SPRINT FINAL — 30/07/2026

> Substitui o `SPRINT-LANCAMENTOS-2026-07-29.md`, que fica **encerrado** (S1, S3, S4, S5, S6
> entregues · **S2 nunca feito** · S7 parcial · S8 não começou).
>
> Construído perguntando ao José regra por regra em 30/07. Toda decisão está registrada no
> `PROJECT_BRAIN/19_REGISTRO_DE_REGRAS.md` §1-B, com a fala dele. **Nada aqui é interpretação.**

## A regra de ouro deste sprint

> **Regra e fluxo primeiro. Visual depois.**
> Palavras do José: *"tela já temos, alguns detalhes ainda a organizar mas é menos coisa, preciso
> de regra e fluxo funcionando sem bug e nem erro, nem conflito com backend e regras antigas."*

Cada bloco cita ids `R-nnn`. Ao fechar um bloco, **atualize o status no `19` e a tabela do `20`
no mesmo commit** — documento que se atualiza depois já nasce mentindo.

## Fora de escopo (decidido, não esquecido)

- **Menu lateral pelo Xmind (R-097)** — o José tirou do sprint em 30/07. O menu atual funciona;
  simplificar é melhoria, não correção.
- **E-mail de notificação** — a notificação é **sininho dentro do sistema**, sem infra de e-mail.

---

# BLOCO 1 · S2 — os campos que aparecem e não salvam

**A maior lacuna do projeto.** 9 dos 17 campos da FOTO 2 não chegam ao banco. Detalhe completo em
`docs/prompts/S2-CAMPOS-DO-LANCAMENTO-2026-07-30.md` — **leia antes de perguntar qualquer coisa.**

Regras: **R-041** (juros R$ ou %) · **R-042** (valor total) · **R-044** (data doc fiscal) ·
**R-045** (nº doc fiscal) · **R-046** (tipo de credor) · **R-047** (sócio/gestor + cadastro) ·
**R-049** (2ª foto).

> **A planilha confirma o desenho.** As abas `(TNP) GRUPO DESPESAS` e `(TNP) GRUPO RETIRADAS` têm
> a coluna **F = `CONTABIL`** (`DOC/F` / `DOC/NF`) e a coluna **H = `FORNECEDOR / COLABORADOR``**.
> Documento fiscal e credor tipado existem na operação da padaria desde sempre.

**Fecha com o gate:** o check do repositório passa a **falhar o build** se achar `data-pendente`
em `web-vue/`. É a assinatura física do defeito que matou 9 regras aqui.

---

# BLOCO 2 · Fluxo do dia — as regras que conflitam

## 2.1 · Transferência não exige caixa aberto (R-032)

Hoje `transferencias.service.ts:47` exige caixa aberto **de todo mundo** — e é a transferência que
gera o lacre para abrir o caixa. Impasse lógico.

> **Decisão do José:** **tesouraria, gerência, financeiro, diretor geral e admin** transferem sem
> caixa aberto. O cargo **Caixa** continua precisando. Mesma lógica de R-073/R-074.

Teste obrigatório: *"tesoureiro transfere cofre→caixa sem nenhum caixa aberto"* e
*"caixa sem caixa aberto recebe 403"*.

## 2.2 · Abertura sem lacre é permitida (R-033)

> **Decisão:** pode abrir zerado e o fundo chega depois. Não trava o operador na correria da manhã.

Isso **já é o comportamento atual** — a regra passa a ser explícita para ninguém "consertar" depois.

## 2.3 · Retorno ao cofre antes de fechar (R-008)

> **Decisão:** a **pessoa lança** a transferência de retorno; o sistema **não cria sozinho**. E o
> sistema **recusa fechar se sobrar saldo**.

Verifique o que existe hoje antes de escrever: pode ser que a recusa já exista.

## 2.4 · Quebra de caixa — o fluxo inteiro (R-015 a R-019) 🆕

**Nada disto existe hoje**, e a R-015 é justamente a que devolve **"Erro interno"** na tela.
Comece reproduzindo esse 500 e achando a exceção real.

| Id | O que construir |
|---|---|
| **R-015** | Diferença vira **dívida (falta) ou crédito (sobra) do usuário do caixa** |
| **R-016** | Com quebra, a **observação é obrigatória** — sem ela **não fecha**. Sem quebra, segue opcional |
| **R-017** | A quebra **notifica o tesoureiro**, com **nome do usuário e valor** |
| **R-018** | A notificação tem estado **verificado / não verificado**, com botão. O tesoureiro apura com o usuário e marca |
| **R-019** | Vale também para **divergência de valor em transferência**, não só no fechamento |

**Canal (decisão do José):** **sininho dentro do sistema** — ícone com contador na topbar + tela
listando as pendências com o botão. Sem e-mail, sem infra nova.

> **Cuidado de modelagem:** "dívida do usuário" é um saldo **por pessoa**, não por conta. Não
> tente reaproveitar `contas` para isso. Se a modelagem ficar ambígua, **PARE e pergunte** —
> é dinheiro, e o AGENTS manda parar antes de mexer em fórmula de dinheiro.

---

# BLOCO 3 · Discriminação — ligar a tela ao backend que já existe

`R-054` (3 níveis de desconto) e `R-057` (mostrar ONDE diverge) estão **prontos e testados no
servidor**, e a tela nunca os alimenta:

- `descontoGeralTipo/Valor` e `descontoTotalTipo/Valor` nunca são enviados
  (`web-vue/utils/operacoes.ts:300-328`, `AppWorkspace.vue:1117-1121`);
- a API devolve `linhaProvavel` no 422 e **nenhum arquivo de `web-vue/` lê esse campo**.

Ou seja: o rateio do D4 só roda em teste, nunca por gente. É backend-only — metade de entrega.

---

# BLOCO 4 · Recorrência — completar

| Id | O que fazer |
|---|---|
| **R-059** | **Volta o `ano`** na lista de frequências |
| **R-060** | O teto **passa a depender da frequência**: anual/trimestral por **número de repetições**; diária/semanal seguem em 12 meses. Sem isso, anual geraria 1 lançamento — ou seja, nada |
| **R-063** | **Botão para cancelar a série inteira.** Apaga só as **futuras não pagas**; passadas e pagas nunca são tocadas |

Motivo do R-063, na prática: hoje dá para criar 12 aluguéis de R$ 3.000 quando o certo era R$ 300,
e não existe como desfazer em bloco.

---

# BLOCO 5 · Duplicidades e permissões

## 5.1 · Fechar caixa em duas telas (R-091)

> **Decisão do José:** fica o fechamento **dentro de `/caixa`** (o do "Gerenciar caixa").
> **Morrem** `pages/fechamento.vue` e `components/caixa/FechamentoCaixaPage.vue`.

Antes de apagar: confira se a tela que morre tem algum campo que a que fica não tem. Se tiver,
**migre o campo** — não perca função junto com o arquivo.

## 5.2 · As outras duas duplicidades (`18` D-02)

- Modal genérico morto em `WorkspaceDialogs.vue` (inalcançável, superado por `OperacaoLancamentoModal`).
- **Logout em 3 lugares** (`R-090`): `AppWorkspace.logout()`, `pages/integracoes.vue`,
  `pages/pedidos.vue`. O José já pediu isso 3 vezes desde 27/07.

## 5.3 · Permissões (R-076, R-077)

> **Confirmado pelo José, 30/07:** Lançar → cargos de gestão + Caixa (com caixa aberto) ·
> **Efetuar → gerência** · **Pagar → financeiro** · **Conferir → financeiro, gerência e
> tesouraria** · **Admin faz tudo** (R-070).

Compare com o catálogo atual e **reporte as divergências antes de mudar**. Permissão errada
trava operação de gente real.

---

# BLOCO 6 · S7 — seeding, agora com o mapa certo

> ⚠️ **O mapa de colunas do `17` §3 estava ERRADO e foi corrigido em 30/07.** Ele fora montado
> lendo só a `GRUPOSREF`, que alimenta dropdowns. Os dados estão em **abas por empresa**.
> **Releia o `17` §3 antes de escrever uma linha.**

**Arquivo:** `CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx` (a operacional, 43 MB).
Não é a `CENTRAL PRODUTOS` — e a cópia dela **sem** o sufixo `(1)` está corrompida (`#REF!`).

| Alvo | Aba | Coluna | Medido |
|---|---|---|---|
| Grupos de despesas | `(TNP) GRUPO DESPESAS` | **G**, distintos | **75** / 1.664 lançamentos |
| Grupos de retiradas | `(TNP) GRUPO RETIRADAS` | **G**, distintos | **3** / 17 lançamentos |
| Grupos de mercadorias | `(TNP) GRUPO MERCADORIAS` | **G**, distintos | a extrair |
| Contas | `(TNP) SALDOS CONTAS` | — | a extrair |
| Patrimônio | `(TNPLIHORA - EXP.) PATRIMONIO` | F/G/H/I/J | 32 linhas |
| Setores/Cargos | `(TNPLIHORA - EXP.) FOLHA PAGAMENTO` | G/I/N…V | 36 linhas |

**Decisões do José (30/07):**

1. **Quebrar em pai e filho.** `DES ⁠MANUT. EMPRESA - MAT. E PECAS MÁQ./EQUIP.` → pai
   `MANUT. EMPRESA` + filho `MAT. E PECAS MÁQ./EQUIP.`. Usa o `grupoPaiId` que já existe.
   Sem isso, relatório não soma por categoria.
2. **Importar os 75**, com os de baixo uso **inativos** — não aparecem no dropdown até alguém
   ativar. Nada se perde e a tela fica limpa.
3. **Investimento É retirada** (confirmado). Comprar freezer ou balança é retirada, não despesa.
   É por isso que a retirada se liga ao patrimônio.

**Dry-run primeiro, sempre.** Contagens e amostra na tela, José aprova, só então grava. Só TNP.

---

# BLOCO 7 · Identidade visual e acentuação

Só depois de tudo acima. Prompt pronto: `docs/prompts/IDENTIDADE-VISUAL-CICLUZ-2026-07-30.md`.
Os PNGs da marca já estão tratados em `web-vue/public/cicluz/` (nomes corrigidos, fundo
transparente, variante para tema escuro, favicon). Inclui **R-098** (Cicluz substitui Pralis),
**R-099** (primária `#6515dd` fica), **R-094** (subtítulos do "+ Novo"), **R-100** (texto de tela
com acento) e **R-101** (matar os `window.confirm` nativos).

---

# BLOCO 8 · QA vertical — o S8 que nunca aconteceu

Um dia inteiro de caixa, local, do começo ao fim:

1. Tesoureiro transfere do cofre para o caixa **sem caixa aberto** (R-032) → lacre gerado.
2. Operador abre o caixa pelo lacre. E, em outro PDV, abre **sem lacre** (R-033).
3. Lança despesa com **juros em %**, doc fiscal e **discriminação com desconto nos 3 níveis**;
   confirma que a divergência **bloqueia e aponta a linha** (R-057).
4. Lança mercadoria via NF-e com descrição vindo do EAN.
5. Lança **retirada com sócio/gestor** (R-047) e outra de **investimento** (R-034).
6. Cria **recorrência anual** (R-059/R-060) e depois **cancela a série** (R-063).
7. Lança a **transferência de retorno** e fecha o caixa (R-008).
8. Força uma **quebra**: confirma que sem observação **não fecha** (R-016), que o tesoureiro
   **recebe a notificação** com nome e valor (R-017), e que ele consegue marcar
   **verificado** (R-018).
9. Responsividade em **1440 / 1024 / 768 / 390**, sem scroll horizontal.
10. Varredura de duplicidade: nenhum caminho antigo sobrevivente nos fluxos tocados.

**NÃO MERGEIE.** O José testa local e decide o deploy.

---

## Aviso honesto sobre o tamanho

São 8 blocos, e o José escolheu entregar **tudo**. Com a cota semanal em 75% e reset em 2 dias,
isto **não cabe** até 31/07. A ordem acima está montada para que, se acabar tempo ou cota, o que
sobrar seja o menos crítico: o Bloco 7 é cosmético e o 6 é populacional — nenhum dos dois impede
a padaria de operar. Os blocos 1 a 5 são os que fazem o sistema cumprir o que o Rodrigo desenhou.

Se precisar cortar, corte de baixo para cima. **Não corte pela metade um bloco de cima.**
