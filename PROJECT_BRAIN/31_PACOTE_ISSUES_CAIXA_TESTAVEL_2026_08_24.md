# 31 — Pacote de issues do Caixa testável (24/08/2026)

> Publicado em 24/08/2026 no repositório `ErasoumZe/SISTEMA_INTELIGENTE_PRALIS`, após autorização
> explícita do Marco. As issues existentes foram atualizadas em vez de duplicadas.

## 1. Ordem oficial

| Ordem   | Prioridade | Ação no GitHub                  | Entrega                                                             |
| ------- | ---------- | ------------------------------- | ------------------------------------------------------------------- |
| 1       | P0         | criada #152                     | Saldo insuficiente + roteamento futuro do CREARE                    |
| 2       | P0         | #101 reaberta e atualizada      | Transferência pendente × fechamento + caminho único Retorno/Sangria |
| 3       | P1         | #76 e #98 atualizadas           | Discriminação CT-05/06/08                                           |
| 4       | P1         | criada #153                     | Persistência da empresa após reload/login                           |
| 5       | P2         | criada #154                     | Seed DEV reproduzível                                               |
| 6       | release    | #89 e #92 atualizadas           | Playwright + auditoria humana CT-00–CT-19                           |
| go-live | P0         | manter separadas #41, #42 e #43 | Idempotência, concorrência e hash da integração                     |

## 2. Issue #152 — P0 saldo/CREARE

**Título:** `[P0] Saldo insuficiente com roteamento financeiro futuro do CREARE`

**Labels:** `P0`, `dono: marco`, `onda: 3-dinheiro`

**Objetivo:** concluir a branch `fix/caixa-saldo-insuficiente` sem recusar venda CREARE legítima por
ausência de destino financeiro.

**Contrato:** R-166 a R-170. Preservar histórico; corrigir somente o futuro; roteamento por empresa,
forma e adquirente; sem mapa gera pendência e não saldo; disponibilidade apenas no evento real;
divergência tem tolerância zero.

**Aceite:** venda preservada, nenhuma conta arbitrária, saldo insuficiente e concorrência verdes,
isolamento por empresa, reenvio idempotente, zero alteração histórica, gates completos, Playwright e
três revisores sem P0/P1. Migration, se necessária, deve ser mostrada e autorizada antes de aplicar.

## 3. Reabrir #101 — P0 fechamento/transferências

Atualizar o escopo da #101 para incorporar R-171:

- dinheiro ainda não saiu: bloquear fechamento até confirmar, cancelar ou reprogramar;
- dinheiro já saiu: bloquear o fechamento comum e concluir por fluxo especial auditado;
- registrar origem, destino, valor, lacre/documento, responsável, horário e motivo;
- remover `Programar entrega ao cofre` quando o modal único `+ Nova transferência` o substituir;
- `Retorno / Sangria` exige lacre inicial, um ou mais lacres/valores de retorno e comprovante;
- nenhuma transferência pode desaparecer, ficar eterna ou virar `caixa_id = null` silenciosamente;
- dupla submissão não duplica movimento e uma interrupção pode ser retomada.

## 4. Issues existentes — discriminação

Usar #76 como experiência/caminho único e #98 como persistência dos itens. O aceite conjunto exige
descrição, grupo, quantidade, unitário e total persistidos; reabertura fiel; soma completa encerra a
pendência; diferença exige justificativa; valor do item não altera indevidamente o valor raiz.

## 5. Issue #153 — P1 persistência da empresa

**Título:** `[P1] Empresa criada ou selecionada desaparece após reload ou novo login`

**Aceite:** criar Empresa B pela UI; vincular usuário; trocar empresa; recarregar; sair/entrar; manter
cadastro e seleção autorizada; impedir leitura/escrita cruzada com a Padaria Principal; testes de API,
integração e navegador.

## 6. Issue #154 — P2 ambiente DEV

**Título:** `[P2] Seed DEV reproduzível para o roteiro CT-00–CT-19`

**Aceite:** `dev:local` prepara usuários, senhas válidas, contas e fundos fisicamente coerentes sem
SQL manual; nunca toca seed de produção; reset local e nova execução produzem o mesmo estado.

## 7. Fechamento da fila

- #89 cobre a automação dos fluxos que movem dinheiro e deve crescer até o conjunto determinístico
  do CT-00–CT-19.
- #92 permanece como auditoria humana de responsividade e compreensão.
- #136 aponta para este documento e para a ordem acima, preservando a fila anterior em seção
  histórica recolhida.
- Cada issue termina em branch/PR própria. Marco coordena arquitetura e aceite técnico; a governança
  vigente preserva merge/deploy como decisão separada de José.

## 8. Registro da publicação

- #152: criada, aberta, labels `P0`, `dono: marco`, `area: dinheiro`, `onda: 3-dinheiro`.
- #101: reaberta como P0; contrato R-171 e remoção do caminho antigo incorporados.
- #76 e #98: atualizadas para P1 e separadas entre experiência/caminho único e persistência.
- #153: criada e aberta para persistência multiempresa após reload/login.
- #154: criada e aberta para seed DEV reproduzível.
- #89 e #92: ampliadas para prova automatizada e auditoria humana CT-00–CT-19.
- #136: atualizada; #152 é a próxima tarefa oficial.
- #41, #42 e #43: preservadas como P0 de go-live, sem mistura com a branch corrente.
