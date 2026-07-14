# Passo a passo — depois de terminar as fases (go-live e operação)

> Guia prático, em ordem. Cada etapa tem um critério de "pronto" — só avance quando cumprir.
> Complementa: PLANO-EXECUCAO-CLAUDE-CODE.md (implementação) e os PDFs de análise de 10/07.

---

## ETAPA 1 — Conferir que a produção está de pé (nuvem)

1. Abrir a URL do sistema em produção e fazer login com o admin criado pelo bootstrap.
2. Conferir o healthcheck da API (`/health` deve responder OK).
3. Verificar no Coolify que os 3 serviços (migrate, api, web) estão verdes.
4. Forçar um erro de teste e conferir se apareceu no Sentry.
5. Conferir que o backup diário rodou e que o arquivo chegou no destino externo (S3/B2/R2).
6. Testar "esqueci minha senha" com um e-mail real — o e-mail deve chegar.

**Pronto quando:** login funciona, erro aparece no Sentry, backup de ontem existe fora do servidor,
e-mail de reset chega.

---

## ETAPA 2 — Cadastros e usuários reais

1. Conferir as empresas (TNP, Lisboa, Hora) e corrigir dados (CNPJ certo em cada uma).
2. Criar os usuários reais da equipe (gerente, caixa, compras, financeiro...), cada um com
   seu e-mail verdadeiro e cargo/permissões corretos.
3. Cada pessoa faz o primeiro login e troca a senha.
4. Desativar/remover os usuários de seed (diretor@email.com etc.) — em produção não podem existir.
5. Conferir PDVs cadastrados: um por caixa físico de cada loja, cada um vinculado à conta certa.
6. Testar com um usuário restrito (ex.: caixa) que ele NÃO enxerga telas que não deveria.

**Pronto quando:** todo mundo loga com conta própria, seeds desativados, permissões conferidas.

---

## ETAPA 3 — Ligar a integração CREARE (uma loja por vez — começar pela TNP ou Lisboa)

### No sistema (pode ser de qualquer lugar)

1. Tela **Integrações → Chaves**: criar a chave da loja (tipo "Vendas do PDV", empresa certa).
   Copiar o código — ele só aparece uma vez.
2. Tela **Integrações → Dicionário**: deixar "criar automaticamente" e "vincular automaticamente"
   LIGADOS para produto, cliente, PDV e forma de pagamento (primeira carga fica mais fácil).

### No PC da padaria (o que enxerga o banco do CREARE)

3. Instalar Node.js e copiar a pasta `integracoes-scripts`.
4. Preencher o `.env` de produção: servidor/porta/banco/usuário/senha do MySQL do CREARE,
   `PADARIA_API_URL` (URL da API na nuvem) e a chave criada no passo 1.
5. Rodar o teste de fumaça (`npm run dev:teste_integracao`): deve imprimir vendas
   criadas/atualizadas sem erro. Se falhar, é rede/credencial — resolver antes de seguir.
6. Rodar a sincronização em modo produção (uma vez, manual).
7. Instalar como serviço (NSSM ou Agendador de Tarefas, conforme o README da Fase 1),
   rodando a cada 10 minutos, iniciando junto com o Windows.

**Pronto quando:** o serviço roda sozinho e a tela Integrações → Histórico mostra vendas chegando.

---

## ETAPA 4 — Homologação (comparar 1 dia inteiro com o CREARE)

1. Escolher um dia cheio de vendas já sincronizado.
2. Tela **Integrações → Histórico**: anotar recebidas/criadas/erros do dia. Erros devem ser 0.
3. Tela **Integrações → Sem conversão**: resolver TODOS os pendentes (apontar cada produto/forma
   de pagamento externa para o cadastro certo). No primeiro dia é normal ter vários.
4. **Relatório de vendas** do dia no sistema × fechamento do mesmo dia no CREARE
   (ou o relatório que a gerência confere hoje): o total tem que bater centavo a centavo.
5. Conferir por forma de pagamento (dinheiro, cartão, PIX) — é onde aparecem erros de de-para.
6. Divergiu? Investigar na ordem: pendências não resolvidas → venda cancelada contada errada →
   venda fora do período do caixa. Corrigir e comparar de novo.
7. Repetir a comparação por 3 dias seguidos batendo.

**Pronto quando:** 3 dias seguidos com total idêntico ao CREARE e zero pendências novas.

---

## ETAPA 5 — Replicar para as outras lojas

1. Repetir Etapas 3 e 4 para a segunda padaria (chave própria, PC próprio).
2. Para a HORA (restaurante): mesmo roteiro, mas com o conector Firebird/SIAC (Fase 3).
3. Só declarar "integração concluída" quando as 3 lojas passarem pela homologação.

---

## ETAPA 6 — Virada oficial (cutover)

1. Definir e comunicar a data: "a partir do dia X, o número oficial de vendas é o do sistema".
2. A partir dessa data, gerentes lançam despesas/mercadorias/retiradas SOMENTE no sistema
   (a planilha antiga vira consulta, não recebe lançamento novo).
3. Manter o bot antigo das planilhas rodando por 2–4 semanas em paralelo, como rede de
   segurança para comparação. Depois, desligar o bot — e então **rotacionar todas as
   credenciais do legado** (senhas de banco, token Make, chave Google), se ainda não fez.
4. Guardar um export final das planilhas como arquivo morto.

---

## ETAPA 7 — Rotina de operação (o "para sempre")

**Todo dia (2 min, de manhã):**

- Integrações → Histórico: ontem entrou venda em todas as lojas? Dia útil com 0 = agente
  parado ou internet da loja caída (se implementou o alerta por e-mail, ele avisa sozinho).
- Pendências "Sem conversão": resolver o que apareceu (produto novo no PDV, etc.).

**Toda semana:**

- Conferir 1 dia aleatório contra o CREARE (amostragem).
- Olhar o Sentry: erros novos?
- Conferir que os backups da semana existem no destino externo.

**Todo mês:**

- Testar um RESTORE do backup em ambiente local (backup que nunca foi restaurado não é backup).
- Revisar usuários e permissões (alguém saiu da empresa?).
- Atualizar dependências com vulnerabilidade (`npm run audit:deps`).

**Quando der problema:**

- Venda não apareceu → Histórico primeiro; se 0 recebidas, o problema é na loja (agente/rede);
  se recebidas com erro, ver a mensagem do erro no histórico.
- Sistema fora do ar → Coolify (status dos serviços) → logs da API → Sentry.
- Perdeu dados → restore do backup (docs/OPERACAO-BACKUP.md).
