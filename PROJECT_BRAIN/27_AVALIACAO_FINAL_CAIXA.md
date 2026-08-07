# 27 · Avaliação final — reconciliação das três leituras

> 05/08/2026. Terceira e última passagem sobre o Caixa, reconciliando: a análise do Codex, a minha
> (`26`) e a consolidação que o ChatGPT produziu a partir das duas mais 38 fontes.
>
> **Este documento existe porque eu errei duas vezes.** As correções estão no §1. O plano final,
> no §4. Onde as três leituras concordam, está provado; onde divergem, digo quem está certo e por quê.

---

## §1 · Onde eu estava errado

Verifiquei cada correção contra o código antes de aceitar. As duas procedem.

### 1.1 · Transferências JÁ travam o operador na conta do PDV

Eu afirmei em `26` (C-06) que `exigirContaDoCaixaNoLancamento` não era chamada em
`api/src/transferencias/` e que a "4ª saída" estava desprotegida. **Errado — procurei o símbolo
errado.** A trava existe, escrita inline com outro mecanismo:

- **Criação** — `transferencias.service.ts:90-98`: resolve `podeLancarSemCaixa(perfil)`, busca o caixa
  e exige `contaOrigemId === caixa.pdvContaId || contaDestinoId === caixa.pdvContaId`. Cobre **origem
  ou destino**, deliberadamente (comentário em `lancamentos.dominio.ts:185-186`).
- **Edição** — `transferencias.service.ts:222-224`, precedida por `validarEdicaoNoCaixaAberto`.
- **Abertura, suprimento, sangria e retorno** nem passam por `criarTransferencia`: são criadas pelo
  módulo de caixa (`caixa.service.ts:609-664`), onde as contas **não vêm do cliente** —
  `contaCaixaId: caixa.pdvContaId` e o cofre resolvido no servidor. Seguras por construção.

**O que sobra de verdade:** **zero cobertura de teste.** As duas mensagens de recusa não aparecem em
nenhuma asserção de `tests/`. Regra de segurança sem teste é regra que morre no próximo refactor.

E há um provável **bug funcional** ao lado: a checagem da edição (`:222`) **não** está guardada por
`transferenciaLivre`, então ela também prende Tesouraria e Gerência — que ainda precisam de caixa
aberto próprio para editar. Retaguarda provavelmente não consegue editar transferência de retaguarda.

### 1.2 · Notificações não estão desprotegidas

Eu disse que faltava guard (`26`, C-12). **Errado.** `/api/notificacoes` **não** está na allowlist de
`app.ts:55-62`, logo o hook global de default-deny (`:153-158`) roda antes do handler. E o escopo vem
do **perfil autenticado, nunca do request**: `notificacoes.service.ts:8,19` passam `perfil.usuarioId`,
e o SQL filtra por `destinatario_usuario_id` tanto no SELECT (`repository.ts:15-21`) quanto no UPDATE
(`:61-68`).

Testei a hipótese de IDOR lendo o código: enviar o id de notificação de outra pessoa casa o predicado
de `id` mas falha em `destinatario_usuario_id` → `UPDATE` afeta 0 linhas → 404. Não há leitura nem
escrita cruzada, e o 404 nem vaza existência. **Nenhuma ação necessária.**

---

## §2 · O que o ChatGPT achou que nós dois perdemos

### 2.1 · 🔴 O deploy redefine a senha do admin — **CONFIRMADO, e é o achado mais grave desta rodada**

`db/bootstrap-prod.ts:141-146` atualiza o hash da senha do admin a partir de `ADMIN_SENHA`
**sem condicional nenhuma** — está fora do `if (!usuario)` que termina em `:128`. O próprio comentário
do código assume: _"Garante (idempotente) que a senha do admin = ADMIN_SENHA em TODA execucao"_ e
_"um simples redeploy sempre reseta a senha do admin"_.

E o serviço `migrate` do `docker-compose.coolify.yml` chama `bootstrap:prod` em **todo** deploy, antes
de a API subir.

Agravante: o mesmo bloco reimpõe `role: "usuario_admin"` no perfil (`:148-154`). Se alguém rebaixar
esse usuário pela tela, o próximo deploy o repromove a acesso total.

**Consequências práticas, nesta ordem:**

1. **Trocar a senha do admin pela interface não adianta.** O próximo merge na `main` a reverte. Quem
   trocar vai acreditar que trocou.
2. A senha de produção virou uma **variável estática de painel**. Quem tem acesso ao Coolify tem a
   senha do admin, permanentemente.
3. **Isto muda a resposta ao vazamento da senha no print.** Se `ADMIN_SENHA` no Coolify for a mesma
   senha que apareceu na captura de tela, rotacioná-la no sistema **não resolve** — tem que ser
   rotacionada **no Coolify**.

### 2.2 · Cadastro público aberto — **fato CONFIRMADO, criticidade REFUTADA**

`/api/auth/*` está na allowlist (`app.ts:57`) e o proxy repassa GET e POST para o better-auth
(`auth.controller.ts:25-33`). Não existe `disableSignUp` em lugar nenhum, e o default do better-auth
é signup **habilitado** (`sign-up.mjs:143`). Um `POST /api/auth/sign-up/email` anônimo da internet
cria linhas em `user` e `account`.

**Mas o usuário nasce órfão e não acessa nada:** sem `perfis_usuarios`, o guard devolve
**403 `PROFILE_NOT_CONFIGURED`** em toda rota de domínio (`guards.ts:33-36`). Não é escalonamento de
privilégio. Há rate limit de 20/min na rota. **Severidade média, não crítica.**

O dano real é outro, e mais concreto que o descrito: um atacante que pré-cadastre
`novofuncionario@empresa.com` **bloqueia a admissão legítima** daquele e-mail — porque o cadastro pelo
admin vai bater no `catch` e responder "Email ja cadastrado". É negação de serviço de onboarding, mais
um oráculo de enumeração de e-mails. Correção: `disableSignUp: true` em `config.ts:30`.

### 2.3 · "Transação única" era ingenuidade minha

O documento tem razão: pedir que o `signUpEmail` rode "na mesma transação" pode não ser possível — o
better-auth controla a própria transação. O pedido correto é **efeito idempotente**: pré-check com
lock, provisionamento controlado, compensação em caso de falha e um job de reconciliação de órfãos.
A A-04 do `26` fica reescrita nesses termos.

---

## §3 · Onde eu mantenho a posição

**Sobre o e-mail em produção.** O documento rebaixa para "falha provável, não confirmada", porque o
Coolify poderia injetar variáveis fora do compose. A ressalva é justa como método, mas o mecanismo do
Docker Compose é específico: **o contêiner só recebe o que está listado em `environment:`**, e
`RESEND_API_KEY` e `EMAIL_FROM` não estão lá — ao contrário de `NOTAS_FISCAIS_*`, que estão. Somando
a isso que `env.ts:56` apenas **avisa** e o better-auth **engole a exceção do envio**, a hipótese é
forte. Continua sendo hipótese, e continua custando 1 minuto para virar fato:

```powershell
docker exec <container-da-api> printenv | Select-String "RESEND|EMAIL_FROM|AUTH_BASE_URL|WEB_ORIGIN"
```

**Sobre a estrutura do plano.** Aqui o documento é melhor que o meu `26` e eu adoto: **ondas com gate
objetivo** em vez de blocos, e a ordem determinada por dependência e risco financeiro, não por
milestone. Uma onda só libera a seguinte quando o gate passa.

---

## §4 · O plano final

### Onda 0 · Verdade operacional — **só o José, ~30 min, antes de qualquer código**

| Id   | O que fazer                                                                                                        | Por quê                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| V-01 | Ler no Coolify `AUTH_BASE_URL`, `WEB_ORIGIN`, e conferir no contêiner se `RESEND_API_KEY`/`EMAIL_FROM` chegam      | decide se o B-02 é uma coisa, duas, ou nenhuma         |
| V-02 | Disparar um "esqueci minha senha" real e guardar: o e-mail chegou? qual host tem o link? aparece no log do Resend? | prova o B-02 com evidência, não com dedução            |
| V-03 | Rodar as 3 consultas de órfãos de identidade (`26` §2)                                                             | dimensiona o estrago antes de limpar                   |
| V-04 | Criar um usuário com senha de **12+ caracteres**                                                                   | confirma o B-01 em 2 minutos                           |
| V-05 | **Rotacionar `ADMIN_SENHA` no Coolify** (não pela interface do sistema)                                            | a senha vazou no print, e trocar pela tela não adianta |
| V-06 | Reescrever a issue **#101** — ela descreve trabalho já implementado                                                | evita a equipe refazer o que existe                    |

**Gate 0:** causas de runtime comprovadas, dados medidos, backlog refletindo o código de hoje.

### Onda 1 · Acesso — P0

| Ordem | Issue        | Tarefa                                                                                                                       |
| ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | **NOVO**     | `disableSignUp: true` — uma linha, fecha o cadastro público e o DoS de onboarding                                            |
| 2     | **NOVO**     | **Bootstrap para de redefinir a senha e o role do admin a cada deploy.** Criação inicial e rotação viram caminhos explícitos |
| 3     | #70          | Tirar o `catch` cego; unificar a senha mínima em 10 (Zod, tela, bootstrap); preservar o código de erro real                  |
| 4     | #70          | Recusar e-mail existente **sem tocar na conta alheia** — hoje sobrescreve perfil, empresas e vínculo                         |
| 5     | #70          | Provisionamento idempotente com compensação e job de reconciliação de órfãos (não "uma transação")                           |
| 6     | #71          | Corrigir `AUTH_BASE_URL`, injetar Resend no compose, endurecer o reset (expiração, uso único, revogar sessões)               |
| 7     | **EMAIL-01** | Domínio no Resend + DNS no Cloudflare, com os registros **que o Resend exibir** (não os que eu supus)                        |
| 8     | #72          | Troca administrativa de senha, com permissão própria, trilha e revogação de sessões                                          |
| 9     | —            | Teste que **segue a URL do e-mail**, com `NODE_ENV` e política de senha equivalentes a produção                              |

**Gate 1:** admin cria usuário uma única vez, e-mail repetido não altera conta existente, reset real
chega e invalida sessões, deploy não mexe em credencial.

### Onda 2 · Autorização por papel

Contrato único entre `shared`, API e Web · decisão do **C-07** (Gerência opera caixa?) · endpoints de
alto risco com permissão e escopo · a escalada por `cadastro_usuarios_editar` (#S-01) · o save que
apaga permissões ocultas (#S-06) · **criar os usuários reais de cada cargo** — que é o teste de fogo
da Onda 1.

**Gate 2:** matriz allow/deny provada por chamada direta à API, para cinco papéis e duas empresas.

### Onda 3 · Integridade do dinheiro

Ordem: contrato de pagamentos e rateio de juros/desconto → **UNIQUE em `identificador_externo`** e
idempotência da ingestão → venda órfã e venda atrasada → **juros e desconto no total do caixa (D-09)**
→ contas, lacres e confirmação de transferências.

**Gate 3:** reconciliação automatizada fecha — venda fiscal = recebimento por meio = movimento do
caixa, em centavos, sem duplicidade.

### Onda 4 · Fechamento operacional

#101 reescrita (retorno parcial, sangria na UI, retorno + fechamento retomável) · quebra: leitura pelo
operador, notificação a quem a gerou, resolução pela Tesouraria · pendências distinguindo tipo ·
**teste de regressão da trava do PDV em transferências**, que hoje não existe.

### Onda 5 · Prova de release

E2E multi-papel · restore ensaiado · request-id e logs · piloto de um dia na TNP com reconciliação e
decisão formal de go/no-go.

---

## §5 · O que nenhuma das três análises tem

Vale dizer com todas as letras: **as três leituras foram feitas só sobre o código.** Nenhuma tem
evidência de runtime. Não sabemos o valor de `AUTH_BASE_URL`, se o Resend está configurado, quantos
órfãos existem, nem o volume real de vendas por dia.

Enquanto a Onda 0 não for feita, três das cinco prioridades continuam apoiadas em dedução — boa
dedução, mas dedução. É por isso que ela vem antes de tudo e não pode ser delegada: exige acesso ao
Coolify e ao banco de produção.
