# Dependências e paralelismo

## Caminho crítico

```text
CX-M01 ───────────────┐
CX-Z01 → CX-Z03 → CX-Z04 → CX-Z05 → CX-Z06 → CX-Z08 → CX-Z10 → CX-Z13
CX-Z02 ────────────────────────────────────────────────┘
                                                      ↓
CX-M11 → CX-M12 → CX-T01 (go-live)
```

O caminho crítico é banco/integração/fechamento. Marco mantém uma segunda linha independente em
usuários e front até o momento em que os E2E precisam do backend final.

## Janelas seguras

| Janela        | Marco               | José              | Motivo de não conflito                                    |
| ------------- | ------------------- | ----------------- | --------------------------------------------------------- |
| agora         | `CX-M01`            | `CX-Z01`/`CX-Z02` | código de teste local × produção somente-leitura/decisões |
| fundação      | `CX-M02`–`CX-M05`   | `CX-Z03`/`CX-Z04` | usuários/auth × infra/migrations                          |
| ingestão      | `CX-M06`/`CX-M07`   | `CX-Z05`–`CX-Z07` | componentes de operação × integração                      |
| fechamento    | `CX-M08`            | `CX-Z08`–`CX-Z10` | tela de pendência × cálculo/caixa                         |
| transferência | `CX-M10`            | `CX-Z11`–`CX-Z14` | remoção do legado só após backend final                   |
| operação      | preparação `CX-M11` | `CX-Z15`–`CX-Z20` | E2E só finaliza depois das APIs                           |

## Bloqueios que não podem ser contornados

- `CX-Z05` não começa sem a contagem de duplicatas e o caminho de migration seguro.
- `CX-Z06` não publica sem plano para o primeiro ciclo de hashes invalidados.
- `CX-Z07` não roda junto com o agente antes da `CX-Z15`.
- `CX-Z09` não muda histórico sem impacto e decisão.
- `CX-Z10` e `CX-Z13` não começam sem as decisões do fechamento.
- `CX-M09` espera a fórmula e a notificação finais.
- `CX-M10` espera o fluxo de Transferências final para remover Malotes.
- `CX-M11` só vira gate após as ondas de dinheiro e transferência.
- `CX-Z21` e `CX-Z22` precisam terminar antes do go-live, mas podem andar em janela sem
  conflito com as correcoes financeiras.
- `CX-T01` não aceita “teste vermelho preexistente” sem decisão explícita e issue com dono.

## Ordem de merge

1. A PR mais antiga termina e fica verde.
2. Codex revisa diff, relatório e CI.
3. José autoriza/realiza o merge.
4. A outra pessoa executa `git fetch origin --prune`.
5. Se a branch aberta ficou atrás, atualiza a base sem tocar na `main` local e repete os testes afetados.
6. Só então começa a próxima OS da fila.

## Regra para achado novo

1. Classificar: bloqueia Caixa, segurança/dinheiro, ou pós-Caixa.
2. Se for bloqueador dentro do escopo atual, corrigir antes de liberar a mesma PR.
3. Se for independente, registrar nova OS com dependência e dono; não aumentar silenciosamente a PR.
4. Takeover, vazamento cross-tenant, duplicação de dinheiro e perda de venda sempre são bloqueadores.
