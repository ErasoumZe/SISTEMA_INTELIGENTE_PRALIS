# 34 — GOVERNANÇA ATUAL DO CAIXA (24/08/2026)

> **VIGENTE.** Este documento registra a transferência operacional do módulo Caixa para Marco. Ele
> muda responsabilidade e gates; não muda fórmula financeira, regra de negócio, dado histórico ou
> autoria de decisão anterior.

## 1. Responsabilidade atual

- **Marco é o único executor atual do Caixa.** Ele coordena prioridade, implementação, revisão,
  testes, documentação, push, PR e encerramento técnico.
- **José não executa mais trabalho do Caixa** e não é revisor, aprovador individual ou gate
  obrigatório. O Caixa foi transferido por ele para Marco.
- **Rodrigo continua sendo a fonte operacional** quando uma regra financeira ou de funcionamento
  da padaria ainda não estiver documentada.
- Claude principal continua sendo o único escritor de cada entrega. Agentes de revisão são
  somente leitura.

## 2. Branch, PR e merge

Marco pode decidir e executar o merge de uma entrega do Caixa somente quando todos os itens abaixo
forem verdadeiros:

1. trabalho feito em branch própria, nunca diretamente na `main`;
2. HEAD exato revisado; commit novo invalida a revisão anterior;
3. diff confrontado com a issue e com o `PROJECT_BRAIN` vigente;
4. gates proporcionais ao risco e CI verdes;
5. zero P0/P1 conhecido no escopo;
6. caminho antigo removido e zero duplicidade para o mesmo ato;
7. relatório registra branch, HEAD, CI, conflitos, merge commit e novo SHA de `origin/main`.

Push, abertura de PR, merge e deploy são atos distintos. Um não autoriza automaticamente o outro.

## 3. Autorizações que continuam separadas

Esta autonomia de execução e merge **não autoriza automaticamente**:

- deploy em produção;
- aplicação de migration em produção;
- `UPDATE`, backfill, exclusão ou regularização de dados históricos;
- leitura, exposição ou rotação de segredos;
- mudança de fórmula financeira;
- acesso ao CREARE ou a dados reais fora de uma sessão explicitamente autorizada.

Migration continua exigindo apresentação do SQL antes de ser gerada/aplicada conforme o gate do
`AGENTS.md`. Uma regra operacional ou financeira não coberta pela spec deve parar para confirmação
do Rodrigo, registrada neste brain antes da implementação.

## 4. Preservação histórica

As decisões anteriores atribuídas a José permanecem registradas com a autoria e a data originais.
Esta mudança não as revoga nem reescreve o passado; apenas elimina José do fluxo obrigatório atual.
Uma regra anterior só deixa de valer por revogação explícita e registrada.

## 5. Fonte e vigência

Fonte: declaração explícita de Marco em 24/08/2026 de que José transferiu o Caixa e não executará
mais nenhuma etapa. Vigência imediata a partir desse registro.
