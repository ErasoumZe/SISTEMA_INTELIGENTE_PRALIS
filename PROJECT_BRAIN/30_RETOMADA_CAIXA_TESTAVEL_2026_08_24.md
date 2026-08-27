# 30 — Retomada do Caixa testável (24/08/2026)

> Este documento substitui, para a execução corrente, os planos antigos que misturavam várias
> correções na mesma branch. A issue-mestra continua sendo a **#136**. Cada linha abaixo deve virar
> uma entrega vertical: uma issue, uma branch, um escritor, testes e revisão antes de publicar.
> Os corpos deduplicados para publicação estão no documento `31`.

## 1. Objetivo

Entregar um Caixa local **testável de ponta a ponta**, com os defeitos financeiros e funcionais já
comprovados corrigidos. Só depois será feita nova auditoria CT-00–CT-19; dúvidas descobertas nessa
auditoria viram issues próprias, sem reabrir silenciosamente uma entrega já encerrada.

## 2. Estado real de retomada

- Branch ativa: `fix/caixa-saldo-insuficiente`.
- HEAD de referência no momento da publicação: `e2b3eafe9514da5fb6d943e1e5d7151b967db8ed`.
- Base: `origin/main` em `5127525071d655d31cf316324d3549fc24c69c45`.
- A branch está à frente da referência, com árvore limpa, e nenhum commit foi reescrito.
- ✅ **REMOTO COMPROVADO (24/08).** `git fetch origin --prune` rodou com sucesso: `origin/main` está
  **exatamente** em `5127525071d655d31cf316324d3549fc24c69c45`, o mesmo hash acima —
  **divergência zero**. `git rev-list --left-right --count origin/main...HEAD` devolve `0 N`: a
  branch só adiciona, o remoto não andou. Não existe branch remota `fix/caixa-saldo-insuficiente`
  (este trabalho nunca foi enviado) e não há migration `0032+` em ref remota nenhuma. Não houve
  rebase, merge nem reset. **A afirmação anterior de credencial indisponível está obsoleta e foi
  removida daqui.**
- A porta R-165 está implementada e as suítes focadas estavam verdes, mas a branch não pode ser
  publicada ainda: venda CREARE nasce sem destino financeiro (`conta_origem_id = null`) e, por isso,
  a receita não compõe saldo disponível de nenhuma conta.
- Não foram executados no estado final: `npm test` completo, Playwright focado e três revisores.
  Playwright, aliás, **não existe neste repositório** — instalá-lo é escopo próprio (ver `32` §14).

## 3. Decisões fechadas para a implementação

Valem as regras R-166 a R-172 registradas no documento `19` — **e, desde 24/08, também as R-173 a
R-177**, aprovadas pelo José no gate da #152 (consolidação em `32` §18):

1. Histórico negativo fica preservado; zero `UPDATE`, backfill ou regularização automática.
2. Venda futura guarda empresa, forma, adquirente/provedor, conta de recebível e conta bancária final.
3. Sem mapeamento, a venda é preservada e nasce uma pendência financeira; o valor não vira saldo
   disponível e não existe fallback silencioso para Dinheiro, Outro ou conta do PDV.
4. Disponibilidade ocorre por evento real: dinheiro físico imediatamente; Pix direto após confirmação
   bancária; Pix de maquininha e débito após liquidação; crédito por parcela liquidada; voucher após
   pagamento do emissor; cliente após boleto/Pix quitado.
5. Divergência tem tolerância zero: preserva a venda, abre conciliação, bloqueia só a parcela
   divergente e exige causa, evidência e ajuste auditável.
6. Transferência pendente no fechamento nunca desaparece: se não saiu fisicamente, confirmar,
   cancelar ou reprogramar antes do fechamento; se saiu, usar fluxo especial auditado.
7. Contas, adquirentes, taxas e vigências são cadastro administrativo — nunca nomes hardcoded.

## 4. Fila vertical até o Caixa testável

> ⚠️ **ORDEM ALTERADA EM 24/08 (R-174).** A **#41 passou para a frente da #152**. A primeira
> ingestão concorrente da mesma venda ainda cria duas linhas em `vendas` — hoje invisível para o
> saldo da conta, mas com o roteamento da #152 passaria a creditar o valor **duas vezes**. As duas
> issues não se misturam: a #41 não conhece roteamento, a #152 não mexe em idempotência de
> ingestão. Consequência prática: a **#41 leva a migration `0032`** e a da #152 passa a ser a
> `0033`. A D-06/R-007 entra **depois** de roteamento e liquidação, como vertical separada.
>
> Ordem vigente: **#41 → #152 → #101 → #76/#98 → #153 → #154**.

### P0-ZERO — #41 — idempotência da venda integrada

**Branch nova, a partir de `origin/main`.** Fecha a janela em que duas ingestões simultâneas do
mesmo `idVenda` criam duas vendas:

- índice único **parcial** conforme a R-175 — chave `(empresa_id, identificador_externo)`, predicado
  `integracao_chave_id is not null and identificador_externo is not null`. `integracao_chave_id`
  fica **fora** da chave de propósito: dentro dela, uma troca de credencial permitiria duplicar;
- `ON CONFLICT` no insert da venda integrada, sem violar as invariantes de lock da R-164/R-165;
- contagem read-only de duplicatas apresentada **antes** de aplicar — a leitura em produção é do
  José;
- SQL, rollback e testes mostrados antes; a execução para antes de aplicar (TECH-01).

### P0-A — #152 — concluir saldo insuficiente + roteamento futuro do CREARE

**Branch atual.** Implementar o mínimo vertical que torna a R-165 compatível com venda integrada:

- mapear forma/adquirente para conta de recebível e conta final por empresa;
- venda com mapeamento gera o recebível correto sem fingir que ele já é dinheiro disponível;
- venda sem mapeamento é preservada e abre pendência financeira explícita;
- dinheiro continua vinculado à conta do PDV/turno aberto;
- nenhuma linha histórica é reescrita;
- se schema/migration for necessário, gerar localmente o próximo identificador realmente livre,
  mostrar SQL, rollback e impacto e **parar antes de aplicar**, conforme TECH-01 e R-156;
- fechar mutations, revisores, gates, teste visual focado, PR e CI; merge/deploy continuam separados.

### P0-B — #101 — transferência pendente × fechamento

Implementar CF-01 em branch própria depois de P0-A:

- dinheiro não saiu: fechamento bloqueado até confirmar/cancelar/reprogramar;
- dinheiro saiu: fechamento comum bloqueado e fluxo especial registra origem, destino, lacre/documento,
  valor em trânsito, responsável e motivo;
- nunca deixar transferência eterna, invisível ou convertida em `caixa_id = null`.

### P1-A — discriminação CT-05/06/08

Unificar e corrigir as issues existentes #76 e #98:

- descrição, grupo, quantidade, valor unitário e total persistem e reabrem;
- valor unitário não altera indevidamente o valor raiz;
- soma completa fecha a pendência; diferença exige justificativa;
- Despesa e Mercadoria usam um único contrato de discriminação.

### P1-B — #153 — persistência da empresa

Provar e corrigir o caso em que empresa criada/selecionada some após reload ou novo login. Cobrir
criação, vínculo, seleção persistida e isolamento Padaria Principal × Empresa B.

### P1-C — caminho único de Retorno/Sangria

Remover o bloco antigo `Programar entrega ao cofre` de todas as telas. O único caminho será no modal
`+ Nova transferência`, com `Retorno / Sangria`, lacre/documento e retornos obrigatórios quando
marcado, permitindo múltiplos lacres e exibindo Saída − Entrada = Saldo.

### P2 — #154 — ambiente DEV reproduzível

Corrigir senha/seed local e fixtures para que CT-00–CT-19 possam começar do zero sem edição manual
no banco e sem criar estados financeiros fisicamente impossíveis.

### QA final — nova auditoria local

Somente depois das verticais acima: reset do banco DEV autorizado, roteiro CT-00–CT-19, dois perfis
quando necessário, persistência no banco, screenshots, 1440/1024/768/390, relatório e classificação
P0–P3. Playwright automatiza o determinístico; conferência humana cobre compreensão e UX.

## 5. P0 de go-live que não deve ser misturado nas correções visuais

- ~~#41: idempotência da venda integrada~~ — **promovida para o início da fila em 24/08 (R-174)**;
  continua sendo entrega separada, agora executada **antes** da #152. Ver §4.
- #42: prova determinística de concorrência da integração.
- #43: integridade/hash de datas da integração, após confirmar o estado atual da issue.
- Correção pós-fechamento append-only (Q3): OS e migration próprias; nunca editar o original.
- Aplicar migration, deploy e qualquer regularização histórica continuam fora de autorização.

## 6. Gates por entrega

1. Confirmar `AGENTS.md`, branch, HEAD, base remota e árvore limpa.
2. Ler código real e reproduzir RED pelo fio da API/tela.
3. Implementar uma única vertical; remover o caminho antigo quando houver.
4. Testes focados, mutations proporcionais e três revisores read-only para P0/P1.
5. `git diff --check`, Prettier nos alterados, `lint`, `lint:deps`, `check`, build afetado.
6. `npm test` completo uma vez no estado final, com exit code real e teto documentado.
7. Teste visual focado e relatório autônomo.
8. Push, PR, CI, merge e deploy são gates distintos. Mudança de HEAD invalida a revisão anterior.

## 7. Autoridade e responsabilidades

- Marco coordena a arquitetura, a fila, o aceite técnico e a execução da própria branch.
- Claude principal é o único escritor; agentes/Codex revisam em modo read-only.
- Rodrigo/José confirmam regra de negócio quando a especificação não cobrir.
- A governança vigente do `AGENTS.md` continua valendo: José decide merge e deploy; migration em
  produção, histórico, segredos e fórmulas financeiras exigem autorização própria.

## 8. Condição de saída

“Caixa testável” significa: P0-A, P0-B, P1-A, P1-B, P1-C e DEV concluídos em suas próprias PRs,
CI verde, sem caminho antigo, e CT-00–CT-19 executável. Não significa go-live nem autoriza produção.
