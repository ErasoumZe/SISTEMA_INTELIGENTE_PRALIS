# Caixa — etapa exclusiva de fechamento

## Entrega

- A tela aberta de Caixa deixa de renderizar o formulário inteiro de fechamento.
- O atalho `Fechar caixa` navega para `/caixa?etapa=fechamento`.
- `Voltar ao caixa` remove somente o parâmetro `etapa`; os campos já digitados permanecem no estado reativo do pai.
- A confirmação final continua no mesmo `CaixaFechamentoConfirmacaoDialog` e chama o mesmo evento `fecharCaixa`.

## Regras preservadas

- Validação de lacre, responsáveis, composição de espécie/moedas, divergência e folha obrigatória.
- Bloqueio por planejamento de retorno e entrega pendente, inclusive o botão focável com motivo acessível.
- Anexos, confirmação de revisão, payload e endpoint de fechamento.
- Não foram modificadas permissões, fórmulas monetárias, APIs, migrations ou dados históricos.

## Arquivos

- `web-vue/components/caixa/CaixaFechamentoEtapas.vue`: interface responsiva da etapa e emissão dos mesmos eventos.
- `web-vue/components/caixa/CaixaResumoPage.vue`: roteamento por query e remoção do formulário inline antigo.
- `tests/e2e/caixa-fechamento-travado.spec.ts` e `tests/e2e/caixa-fatia3-visual.spec.ts`: as verificações de trava agora acessam a etapa de fechamento.

## Validação

- `npm run check --workspace @padaria/web-vue`
- O E2E direcionado foi atualizado para a nova rota. A execução local não chegou às asserções da tela porque o usuário
  de fixture já possui um Caixa aberto no servidor de desenvolvimento compartilhado (`Usuário do caixa já possui um caixa aberto`).
  Não houve alteração de dados para forçar a limpeza desse Caixa de outra sessão.
