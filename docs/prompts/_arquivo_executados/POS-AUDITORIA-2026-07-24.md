# Prompt pós-auditoria (24/07) — tarefas 1, 3, 5 · SEM MERGE

> Base: `docs/relatorios/AUDITORIA-COMPLETA-2026-07-24.md` (§8).
> **REGRA ABSOLUTA DESTA RODADA: NÃO MERGEAR NADA.** Não fazer push para `main`, não fechar PR, não
> mergear branch nenhuma. Trabalhar em branch própria e deixar tudo pronto para revisão. O José
> mergeia quando ele decidir.
> Tarefa 2 (mergear as telas) foi **pulada de propósito**. Tarefas 4, 6 e 7 são de documentação e
> estão sendo feitas em paralelo — não fazer aqui.

---

```
Você vai executar 3 tarefas da auditoria de 24/07. NÃO MERGEIE NADA (nem para main, nem entre
branches). Trabalhe em UMA branch nova sem acento: chore/pos-auditoria-24-07. Um commit por tarefa.
lint + check + testes verdes ao final. Push da branch apenas (sem abrir/mergear PR).

═══ TAREFA 1 · Limpar o conceito de DÉFICIT (regra revogada) ═══

Leia PROJECT_BRAIN/12_DECISAO_FUNDO_SIMPLES.md e PROJECT_BRAIN/02 (R8-v2).
DECISÃO DE NEGÓCIO (José, 24/07): "agora é fundo mesmo" — a R8 (caixa nasce em déficit / dívida
com o cofre) foi REVOGADA. O malote/transferência do cofre é FUNDO DE TROCO: entra como valor
positivo, o caixa NÃO deve nada, e no fechamento tudo volta ao cofre (retorno automático) com o
caixa ZERADO.

NÃO TOCAR em saldoCaixaCentavos (ADR-001) — a fórmula canônica continua sendo a verdade e não muda.

Remover o conceito de dívida/déficit:
1. shared/src/caixa/regras.ts — remover a função saldoProprioCentavos.
2. shared/src/caixa/index.ts — remover dividaCofre/saldoProprio dos contratos de resumo/status.
3. api/src/caixa/* — parar de calcular, gravar e expor dividaCofre. A abertura credita o valor
   como entrada normal (transferência cofre→caixa) e pronto.
4. db/src/schema/app.schema.ts — MANTER a coluna fechamentos_caixa.divida_cofre (NÃO remover em
   produção: risco sem ganho), mas parar de escrever nela e comentar no schema que é LEGADO da R8
   revogada em 24/07.
5. web-vue — remover qualquer "déficit a quitar" / saldo próprio da UI.
6. Testes — substituir os casos de déficit por casos de fundo:
   - tests/unit/caixa-regras.test.ts
   - tests/integration/caixa/caixa-abertura-malote.test.ts
   - tests/integration/caixa/caixa-retorno-sangria.test.ts
   Cenário-alvo: abrir com fundo 490 → saldo 490; vender 300 em dinheiro → 790; fechar → retorno
   automático de 790 ao cofre e caixa ZERADO.
Se encontrar algum ponto onde a remoção mudaria o comportamento de um caixa JÁ FECHADO, PARE e me
avise antes de prosseguir.
Commit: "refactor(caixa): remove o conceito de deficit (R8 revogada — malote e fundo)"

═══ TAREFA 3 · Limpar branches penduradas ═══

Há 6 branches não mergeadas, várias já superadas por trabalho que entrou na main.
PRIMEIRO: liste cada uma com (a) quantos commits à frente/atrás da main, (b) os arquivos que toca,
(c) um veredito seu: SUPERADA (o conteúdo já está na main por outro caminho) ou AINDA RELEVANTE.
Candidatas a SUPERADA segundo a auditoria:
  - feat/cockpit-caixa-dre            (o cockpit foi refeito e revertido depois)
  - fix/malotes-excluir-e-codigo-lacre (superada pelo #23 malote=lacre)
  - feat/design-tokens-tema-fonte      (superada pelo #22 tokens na main)
A verificar (conteúdo desconhecido):
  - origin/fix/importacao-nfe-e-alerta-integracao
  - origin/docs-projeto
PARE e me mostre a lista com os vereditos. NÃO delete nada sem minha aprovação — em especial
branches remotas (origin/*), que são destrutivas.
Commit: nenhum nesta tarefa até eu aprovar.

═══ TAREFA 5 · Redesenhar o cockpit A PARTIR DA TELA REAL ═══

Contexto (lição do revert): o cockpit "fiel ao mockup" foi implementado e revertido no mesmo dia
por ficar "ruim no contexto real". O mockup foi desenhado sem os dados e a densidade reais.
Portanto: NÃO copie o mockup literalmente. Parta da tela /caixa que existe hoje e aplique o mockup
como DIREÇÃO (hierarquia e cor por categoria), preservando o que já funciona.

Regras:
- Usar os tokens --cat-* já na main (entradas #B7791F, transferências #C2410C, despesas #C0392B,
  mercadorias #15803D, retiradas #1D4ED8, resultado #6D28D9).
- SEM o card "Déficit a quitar" (regra revogada — Tarefa 1).
- Manter tudo que já funciona hoje: status do caixa, ALTERAR HORARIO, AUTORIZACOES, fechamento,
  totais vindos da API (não recalcular nada no front).
- A cor entra como acento (barra/ícone/chip e o total da categoria), não como fundo de bloco.
- Antes de codar, descreva em 5 linhas como vai ficar e por que não vai repetir o problema do
  revert. Se achar que o cockpit não cabe na tela com os dados reais, PARE e me proponha a
  alternativa (ex.: seções colapsadas por padrão, ou resumo + expandir).
Commit: "feat(caixa): cockpit por categoria a partir da tela real (sem deficit)"

═══ FIM ═══
Rodar lint + check + testes. Push APENAS da branch chore/pos-auditoria-24-07.
NÃO mergear, NÃO abrir PR para main sem eu pedir.
Resumo final: o que foi removido na T1, a lista de vereditos da T3 (aguardando minha aprovação), e
como ficou o cockpit na T5.
```

---

## O que NÃO vai neste prompt (estou fazendo em paralelo)

| Tarefa | Quem | Por quê |
|---|---|---|
| **2 · mergear as telas** | ninguém agora | pulada a pedido do José — só quando ele mandar |
| **4 · documentar o modelo de lacre único** | eu | é decisão de arquitetura, vai no brain |
| **6 · especificar o menu por setor** | eu | maior mudança do Xmind V2; precisa virar spec antes de virar código |
| **7 · ler as telas à mão do Rodrigo** | eu | tenho o PDF original do Xmind e as ferramentas de render em alta resolução |
