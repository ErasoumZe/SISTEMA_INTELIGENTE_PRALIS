# 18 — Dívidas técnicas (registradas para não esquecer)

> Aberto em 30/07/2026. Cada dívida aqui foi **descoberta durante uma entrega**, decidida como
> "não agora" pelo José, e registrada para não se perder no prompt que morre.
> Regra do `PROJECT_BRAIN/16`: decisão que só existe num prompt é decisão perdida.

---

## D-01 · O caminho de migration NUNCA é exercitado em desenvolvimento

**Status:** aberto · **Prioridade:** alta · **Quando:** depois do sprint de Lançamentos (decisão do
José, 30/07) · **Descoberto em:** 30/07, ao aplicar a 0017.

### O que é

O banco de desenvolvimento é sincronizado por **`drizzle-kit push`** (`db:setup` / `setup:dev`),
que compara o schema TypeScript com o banco e aplica a diferença direto. A tabela de controle
`drizzle.__drizzle_migrations` está **vazia** — nenhuma migration foi jamais registrada lá.

Consequência imediata: `npm run db:migrate` no dev tenta aplicar **da 0000 em diante**, bate em
objeto que já existe e falha. Não é bug da migration; é o dev nunca ter sido um banco "migrado".

### Por que é risco, e não só inconveniente

Os arquivos em `db/migrations/` só são executados de verdade em dois lugares:

1. **Testcontainers**, no teste de paridade (`tests/integration/migracoes`), sempre a partir de um
   banco VAZIO;
2. **produção**.

Ou seja: **nenhum ambiente com dado real executa uma migration antes da produção.** Migration que
funciona em banco vazio e quebra em banco com dado — backfill que não cobre um caso, `SET NOT NULL`
sobre linha nula, `ADD CONSTRAINT` que aborta numa linha legada — só se revela **em produção, num
sistema que a padaria usa todo dia**.

O caso da 0017 mostra o padrão: o CHECK proposto originalmente (`num_nonnulls(...) = 1`) passaria
liso em banco vazio e abortaria em produção na primeira linha antiga sem grupo. Ali foi pego por
leitura; a próxima pode não ser.

### Sintoma colateral já observado

O dev fica **silenciosamente atrasado**. Em 30/07 ele estava no estado pré-0016: `grupos_patrimonio`
não existia, `despesas_itens` ainda tinha 6 colunas. Os testes passavam (Testcontainers monta do
schema), então nada acusou. Quem fosse clicar na tela de patrimônio no dev encontraria erro sem
entender por quê. Foi corrigido aplicando 0016, 0017 e 0018 por `psql`, cada uma em transação.

### O que fazer (quando chegar a hora)

1. **Baseline**: registrar em `drizzle.__drizzle_migrations` as migrations já refletidas no dev,
   sem reexecutá-las — o mesmo hash que o `migrate` calcularia, para ele continuar da próxima.
2. **Trocar o fluxo de dev** para `db:migrate`; aposentar `push` como forma de sincronizar
   (`push` continua útil só para os Testcontainers, que sempre partem do zero).
3. **Documentar em `AGENTS.md`** que dev roda migration como produção roda.
4. **Fechar o buraco de verdade:** um passo de CI que aplique as migrations sobre um dump
   ANONIMIZADO de produção, não sobre banco vazio. É esse passo que teria pego o `= 1`.

### Como saber que foi resolvido

```
-- deve listar TODAS as migrations, não zero linhas
select count(*) from drizzle.__drizzle_migrations;
```

e `npm run db:migrate` no dev termina sem erro, aplicando só o que falta.

---

## D-02 · Duplicidades do Item 5 ainda não resolvidas

**Status:** aberto · **Prioridade:** média · **Descoberto em:** 29/07 (varredura do Item 5).

Três caminhos duplicados achados e **não corrigidos**, aguardando decisão de qual morre:

1. **Fechar caixa em 2 lugares** — `CaixaResumoPage` (`/caixa`) e `FechamentoCaixaPage`
   (`/fechamento`) têm o mesmo fluxo acertar+fechar (mesmos emits `fecharCaixa`/`acertarSaldo`).
2. **Modal genérico morto** — `WorkspaceDialogs` mantém o form "Nova/Editar {entidade}" com markup
   de despesa/mercadoria/retirada/transferência **inalcançável** (o `v-if` externo exclui esses).
   Só serve para EDITAR venda. Superado por `OperacaoLancamentoModal`/`OperacaoTransferenciaModal`.
3. **Logout 3×** — `AppWorkspace.logout()`, `pages/integracoes.vue sair()` e `pages/pedidos.vue
sair()` reimplementam sign-out + redirect (essas duas páginas usam `AppShell` direto).

Cada um viola o item 2 do `16_DEFINITION_OF_DONE` ("zero duplicidade"). Não foram tocados porque
escolher qual caminho morre é decisão de produto, não de código.

---

## D-03 · `format:check` vermelho no repositório inteiro (CRLF)

**Status:** aberto · **Prioridade:** baixa (ruído, não defeito).

`npm run format:check` acusa o repositório inteiro por causa de CRLF do Windows, não por causa do
código. Validar arquivo a arquivo com `npx prettier --check --end-of-line auto <arquivos>`.
Resolver de verdade = decidir a política de fim de linha (`.gitattributes` com `* text=auto`) e
normalizar num commit próprio, separado de qualquer entrega.
