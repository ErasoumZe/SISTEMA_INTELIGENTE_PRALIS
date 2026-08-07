# CX-T01 · Checklist de go-live do Caixa

Nenhum item pode ser presumido. Cada caixa recebe evidência, link de PR, log ou captura.

## Código e CI

- [ ] Todas as OS obrigatórias incorporadas à `origin/main`.
- [ ] Nenhuma branch de correção necessária ficou sem merge.
- [ ] CI: lint, typecheck, unit, front, build e integração verdes.
- [ ] `lint:deps` verde.
- [ ] Arquivos tocados passam no Prettier; dívida CRLF tratada sem contaminar a release.
- [ ] `integracoes-scripts` validado no CI.
- [ ] Diff final e lista de migrations revisados.

## Dinheiro

- [ ] Pagamento único, dividido em 2 e dividido em 3 conciliados.
- [ ] Reenvio idêntico não duplica; reenvio alterado substitui corretamente.
- [ ] Concorrência do mesmo identificador produz uma venda.
- [ ] Datas entram no hash e venda corrigida migra para o Caixa correto.
- [ ] Venda tardia deixa histórico e detalhe iguais.
- [ ] Juros e desconto aparecem corretamente em Caixa e conta.
- [ ] Dinheiro, cartão e PIX não geram diferença falsa.
- [ ] Venda órfã aparece em relatório e alerta.
- [ ] Revinculação humana sobrevive ou deixa auditoria explícita.

## Abertura, transferência e fechamento

- [ ] Um único caminho de abertura.
- [ ] Lacre `%`, `_`, `\\`, duplicado e case-insensitive são recusados corretamente.
- [ ] Edição de transferência mantém lacre e tabela coerentes.
- [ ] Transferência sem fundo é recusada.
- [ ] Retorno normal, déficit e sobra maior seguem a decisão registrada.
- [ ] Múltiplos destinos exigem prazo conforme R-138.
- [ ] Divergência registra observação e notifica os destinatários definidos.
- [ ] Caminho antigo de Malotes foi removido.

## Pessoas, permissões e empresa

- [ ] Admin cria usuário de Caixa e ele faz o primeiro login.
- [ ] Recuperação de senha funciona ponta a ponta.
- [ ] Ator de A não lê nem altera usuário/colaborador de B.
- [ ] `cadastro_usuarios_editar` não concede admin indevidamente.
- [ ] Caixa vê somente a conta do PDV, já preenchida.
- [ ] Operador vê apenas a própria quebra; somente Tesouraria resolve.
- [ ] Venda integrada não pode ser editada silenciosamente.

## Operação e infraestrutura

- [ ] Backup automático executou.
- [ ] Restore foi provado em banco isolado.
- [ ] Migrations passaram sobre dump anonimizado.
- [ ] Lock sobrevive a ciclo longo.
- [ ] Agente e reprocesso não estouram rate limit juntos.
- [ ] Logs têm paginação, índice e retenção aprovada.
- [ ] PDV desconhecido não cria conta silenciosamente.
- [ ] PDVs/contas de teste foram inativados ou tratados com registro.
- [ ] `/health` e alerta de silêncio da integração funcionam.

## Interface e aceite humano

- [ ] Playwright: abrir → lançar → fechar.
- [ ] Playwright: pagamento dividido e isolamento por empresa.
- [ ] 1440, 1024, 768 e 390 sem scroll horizontal.
- [ ] Estados vazio, carregando, erro e sem permissão são claros.
- [ ] Sem botão, rota ou modal duplicado.
- [ ] José/Rodrigo homologaram os números de pelo menos um dia real.

## Deploy

- [ ] Janela de deploy definida.
- [ ] Backup confirmado imediatamente antes.
- [ ] SQL/migrations aprovados.
- [ ] Plano de rollback testável e responsável nomeado.
- [ ] Smoke test pós-deploy: login, abrir, venda, saída, transferência, fechar e histórico.
- [ ] Conciliação pós-deploy comparada ao CREARE.

## Cobertura transversal

- [ ] Front, `lint:deps`, `format:check`, `audit:deps` e `integracoes-scripts` tem gates
      inequivocos.
- [ ] Engines, `.env.example` e documentacao de fuso estao saneados.
- [ ] Valores com separador de milhar nao sao interpretados de forma ambigua.
- [ ] Agendador de transferencias tem instancia unica e sobrevive ao ciclo da API.
- [ ] `request-id` chega aos logs/Sentry sem segredo ou dado pessoal.
- [ ] A fonte oficial entre `importar-pralis` e `seed-planilha` foi registrada.
