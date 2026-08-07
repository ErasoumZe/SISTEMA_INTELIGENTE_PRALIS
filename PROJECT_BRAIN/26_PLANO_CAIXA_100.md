# 26 · Plano para fechar o Caixa 100% — acesso, permissões e fluxo

> Escrito em 05/08/2026, a partir de investigação de causa raiz no código. Substitui o palpite pela
> evidência: onde o backlog `25` supôs, este documento prova ou refuta com `arquivo:linha`.
>
> **Objetivo:** o fluxo do caixa funcionando de ponta a ponta na padaria, com as pessoas certas
> tendo acesso e conseguindo recuperar a própria senha.

---

## §0 · Correção de rota — o que eu tinha dito errado

**A transferência de retorno no fechamento ESTÁ implementada.** A C-09 do `21` e a C-01 do `25`
afirmam o contrário, com base na fala do José na reunião. O código refuta:

- serviço `api/src/caixa/caixa.service.ts:610-666` · rota `caixa.controller.ts:89-102`
- front `web-vue/utils/caixa-acoes.ts:62-79` → botão em `CaixaResumoPage.vue:270-274`
- testes em `caixa-retorno-sangria.test.ts:148`, `caixa-fluxo-completo.test.ts:175`

E a regra **existe**, em `caixa.service.ts:545-605`:

| Saldo ao fechar | O que acontece hoje                                                          |
| --------------- | ---------------------------------------------------------------------------- |
| **> 0**         | **bloqueia** — `"Retorno ao cofre obrigatorio: ainda sobram R$ X"` (`:557`)  |
| **= 0**         | fecha normalmente (`:591`)                                                   |
| **< 0**         | fecha, exige observação, grava `quebras_caixa`, notifica Tesouraria (`:562`) |

Não existe "sobra maior que a prevista" porque **não existe sobra prevista**: qualquer saldo positivo
obriga retorno integral. A dúvida do José na reunião era legítima, mas o código já respondeu.

**O que falta de verdade** é outra coisa: retorno **parcial** é impossível na tela (o front sempre
manda o saldo inteiro, `CaixaResumoPage.vue:117-122`), **sangria durante o turno não tem UI nenhuma**
(o `tipo` é fixo em `"retorno"`, `caixa-acoes.ts:67`), e retorno e fechamento são dois POSTs
separados — se o operador lança o retorno e não fecha, o caixa fica aberto com saldo zero.

> **Ação:** rebaixar C-01/C-09 de "bloqueia o módulo" para as três tarefas concretas acima.

---

## §1 · As causas raiz dos três bugs de acesso

### B-01 · "E-mail já existe" em todo cadastro — **causa encontrada**

`api/src/usuarios/usuarios.service.ts:186-190`:

```ts
try {
  await auth.api.signUpEmail({ body: { name: nome, email, password: dados.senha } });
} catch {
  falharValidacao("Email ja cadastrado");
}
```

Um `catch` cego que converte **qualquer** falha do better-auth naquela frase. A mensagem não vem do
banco nem do better-auth — vem daí.

E o gatilho real em produção é **senha curta**, por causa de três limites divergentes no mesmo fluxo:

| Camada                      | Mínimo     | Onde                              |
| --------------------------- | ---------- | --------------------------------- |
| Formulário Vue              | **nenhum** | `WorkspaceDialogs.vue:705-707`    |
| Zod do domínio              | **6**      | `shared/src/usuarios/index.ts:25` |
| better-auth em dev/teste    | **8**      | `api/src/auth/config.ts:33`       |
| better-auth em **produção** | **10**     | `api/src/auth/config.ts:33`       |

Toda senha de 6 a 9 caracteres passa pelo Zod, é rejeitada com `PASSWORD_TOO_SHORT` e vira
**"Email ja cadastrado"** — com e-mail inédito. Isso explica o "sempre falha".

O mesmo erro está em `db/bootstrap-prod.ts:48`, que valida mínimo 6.

> **Confirmação em 2 minutos:** crie um usuário em produção com senha de **12+ caracteres**. Se
> funcionar, está provado.

### B-02 · O link do e-mail volta para o login — **mecanismo provado, valor a confirmar**

O link é montado pelo better-auth a partir de **`AUTH_BASE_URL`**, não de `WEB_ORIGIN`:

```
{AUTH_BASE_URL}/api/auth/reset-password/<token>?callbackURL=<WEB_ORIGIN>/reset-password
```

Se `AUTH_BASE_URL` estiver apontando para o domínio do **Web** (erro fácil — a documentação do
better-auth chama isso de "a URL da sua aplicação"), a cadeia é:

1. o Nginx do SPA devolve `index.html` para **qualquer** path (`web-vue/nginx.conf:12`);
2. o Vue Router não tem rota `/api/auth/reset-password/:token`;
3. `middleware/auth.global.ts:13` não encontra o path na allowlist;
4. chama `/api/me`, não há sessão, e faz `navigateTo("/login")` (`:18`).

Sintoma idêntico ao relatado. E explica por que **os dois links falham igual**: eles são a
**mesma URL** — `api/src/auth/email.ts:24` (botão) e `:26` (fallback em texto).

O que **não** é a causa (verificado e descartado): a rota `/reset-password` do front existe e está na
allowlist; `/api/auth/*` está na allowlist do default-deny do backend; o proxy preserva o 302; o
token não é consumido pelo GET.

### B-03 · Admin não troca senha — **não existe, confirmado**

Duas pontas ausentes:

- **Front:** `WorkspaceDialogs.vue:705` — `v-if="cadastroTela === 'usuarios' && !cadastroEditandoId"`.
  O campo Senha **some no modo edição**.
- **Back:** o ramo de edição (`usuarios.service.ts:161-183`) **não lê `dados.senha`**. Mesmo que o
  front enviasse, o PUT descartaria em silêncio.

Não há rota de definir senha em lugar nenhum da API. O plugin `admin` do better-auth (que tem
`setUserPassword`) existe na 1.6.20 instalada, mas **não está habilitado** — `config.ts` não tem
chave `plugins`.

Já existe um caminho pronto e mais barato, usado em `db/bootstrap-prod.ts:141-146`: hashear com
`(await auth.$context).password.hash()` e atualizar a linha de `account` com `providerId: "credential"`.
Zero migration.

### 🔴 Dois achados de segurança que ninguém tinha visto

**S-A · Sequestro silencioso de conta.** Em produção, `requireEmailVerification: true` faz o
better-auth **não lançar erro** ao receber e-mail duplicado — ele devolve uma resposta sintética e não
grava nada. O serviço então segue para `usuarios.service.ts:192-206`, encontra o usuário
**pré-existente** e **sobrescreve o perfil, as empresas e o vínculo de colaborador dele**. Cadastrar
alguém com o e-mail de outra pessoa reescreve a conta dela. Hoje isso fica latente atrás do B-01.

**S-B · Órfãos por falta de transação.** O `signUpEmail` (`:187`) roda **fora** do
`executarEmTransacao` (`:195`). Se a segunda metade falhar, ficam linhas em `user` e `account` sem
`perfis_usuarios` — invisíveis na tela, porque a listagem parte de `perfis_usuarios`. E o upsert do
perfil só trata conflito de `usuario_id`, não do UNIQUE de `perfis_usuarios.email`.

### E-mail: nada sai de produção hoje

`RESEND_API_KEY` e `EMAIL_FROM` **não constam** do bloco `environment` do serviço `api` em
`infra/docker-compose.coolify.yml:48-61` — ao contrário de `NOTAS_FISCAIS_*`, que estão lá. Sem elas,
`api/src/auth/email.ts:33-45` não envia nada: só `console.info` e um outbox em memória. E
`api/src/env.ts:56` apenas **avisa** no boot; o sistema sobe assim mesmo.

Pior: as chamadas de envio rodam em background e o better-auth **engole a exceção**. Chave inválida ou
domínio não verificado não geram erro visível — o e-mail simplesmente não chega e a API responde 200.

> **Conclusão:** a recuperação de senha não pode funcionar em produção hoje, independentemente do
> B-02. O e-mail nunca sai.

### Por que os testes estão verdes

1. `tests/integration/autenticacao/reset-senha.test.ts:65-74` lê o **token** do outbox e faz POST
   direto. **Nunca abre a `url` do e-mail** — justamente o passo que está quebrado.
2. `tests/setup/ambiente.ts:3` força `NODE_ENV=test`, então `minPasswordLength` é 8 e nunca 10, e o
   better-auth desliga o origin check em teste.
3. `tests/integration/usuarios/usuarios.test.ts:31` usa senha de 15 caracteres — longa demais para
   expor o bug.

---

## §2 · O plano

Três blocos, em ordem. O Bloco 0 é seu e leva 15 minutos; sem ele o resto é chute.

### Bloco 0 · Verificar antes de codar — **José**

| Id  | O que fazer                                                                        | Critério                                                                            |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| V-1 | Ler no painel do Coolify os valores de `AUTH_BASE_URL` e `WEB_ORIGIN`              | `AUTH_BASE_URL` tem que ser o host da **API**. Se for o do Web, o B-02 está provado |
| V-2 | Rodar as 3 consultas de órfãos (abaixo) no banco de produção                       | saber quantos `user` sem perfil, perfis sem `user` e e-mails colidindo existem      |
| V-3 | Tentar criar um usuário em produção com senha de **12+ caracteres**                | se funcionar, o B-01 está provado                                                   |
| V-4 | Conferir se existe conta no Resend e se `emails.cicluzieai.com.br` está verificado | saber se o trabalho é configurar ou criar do zero                                   |

```sql
-- V-2a · usuários de auth sem perfil de domínio
SELECT u.id, u.email, u."createdAt" FROM "user" u
LEFT JOIN perfis_usuarios p ON p.usuario_id = u.id
WHERE p.usuario_id IS NULL ORDER BY u."createdAt" DESC;

-- V-2b · perfis apontando para user inexistente
SELECT p.usuario_id, p.email FROM perfis_usuarios p
LEFT JOIN "user" u ON u.id = p.usuario_id WHERE u.id IS NULL;

-- V-2c · e-mails colidindo entre as duas tabelas com ids diferentes
SELECT p.email FROM perfis_usuarios p
JOIN "user" u ON lower(u.email) = lower(p.email) WHERE u.id <> p.usuario_id;
```

### Bloco 1 · Acesso funcionando — **A-01 a A-14**

| Id   | Prio | Dono    | Tarefa                                                                                                                           | Depende |
| ---- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A-01 | P0   | Kaylane | Tirar o `catch` cego de `usuarios.service.ts:188`: propagar o erro real do better-auth, com log                                  | —       |
| A-02 | P0   | José    | Unificar o mínimo de senha em **10** — Zod (`shared/src/usuarios/index.ts:25`), `bootstrap-prod.ts:48` e a tela                  | —       |
| A-03 | P1   | Marco   | Validação de senha no formulário, com regra visível e mensagem clara                                                             | A-02    |
| A-04 | P0   | José    | Trazer o `signUpEmail` para dentro da transação e tratar o conflito de `perfis_usuarios.email`                                   | —       |
| A-05 | P0   | José    | 🔴 **Bloquear o sequestro de conta**: recusar criação quando o e-mail já existir, em vez de sobrescrever o perfil alheio         | A-04    |
| A-06 | P1   | José    | Limpar os órfãos encontrados em V-2 (contagem e amostra antes — R-112)                                                           | V-2     |
| A-07 | P0   | José    | Corrigir `AUTH_BASE_URL` para o host da API e validar o link do e-mail ponta a ponta                                             | V-1     |
| A-08 | P0   | José    | Passar `RESEND_API_KEY` e `EMAIL_FROM` no `environment` do serviço `api` em `docker-compose.coolify.yml`                         | —       |
| A-09 | P0   | José    | **Resend + Cloudflare**: verificar o domínio no Resend e publicar os registros DNS no Cloudflare (detalhe no §3)                 | V-4     |
| A-10 | P1   | Kaylane | Fazer o boot **falhar** em produção sem `RESEND_API_KEY`/`EMAIL_FROM`, em vez de só avisar (`env.ts:56`)                         | A-08    |
| A-11 | P1   | Kaylane | Passar `callbackURL` no `signUpEmail`: hoje o link de verificação aponta para a raiz da API                                      | A-07    |
| A-12 | P0   | Kaylane | Teste que **segue a `url` do e-mail**, não o token: o teste atual pula exatamente o passo quebrado                               | A-07    |
| A-13 | P1   | José    | **Troca de senha pelo admin** (B-03): `PUT /api/usuarios/:id/senha`, permissão própria, trilha e invalidação das sessões do alvo | A-02    |
| A-14 | P3   | Marco   | Template de e-mail com a identidade Cicluz — hoje usa `#c0521d`, a cor antiga (`email.ts:21,24`)                                 | —       |

### Bloco 2 · Permissões corretas por cargo — **P-01 a P-06**

| Id   | Prio | Dono    | Tarefa                                                                                                  | Depende    |
| ---- | ---- | ------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| P-01 | P0   | José    | Escalada por `cadastro_usuarios_editar` → `role: usuario_admin` (backlog S-01)                          | —          |
| P-02 | P0   | Marco   | Salvar permissão pela tela apaga as permissões de telas ocultas (backlog S-06)                          | —          |
| P-03 | P0   | José    | **Decidir C-07**: a Gerência opera caixa ou só supervisiona? Trava a auditoria inteira                  | —          |
| P-04 | P1   | José    | **Criar os usuários reais**: tesouraria, financeiro, comprador, gerência — com cargo e vínculo de conta | Bloco 1    |
| P-05 | P1   | Kaylane | Testes de permissão, blocos 1 e 2 do backlog (S-11, S-12)                                               | P-01, P-02 |
| P-06 | P3   | Kaylane | Cargo "Operador de caixa" nasce sem padrão em `referencia-permissoes.ts`                                | —          |

> **P-04 é o teste de fogo do Bloco 1.** Enquanto criar usuário e recuperar senha não funcionarem,
> não há como montar o elenco real de cargos — e sem elenco não dá para validar permissão nenhuma.

### Bloco 3 · Caixa 100% — **C-01 a C-14**

| Id   | Prio | Dono    | Tarefa                                                                                                                                                    | Onde                                                                               |
| ---- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| C-01 | P0   | José    | **D-09 · juros e desconto entram no total do caixa.** Hoje despesa de R$50 + 10% tira 50 e não 55: a diferença vira quebra falsa no operador **todo dia** | `caixa.repository.ts:795,799,803,823,826,829` e `contas.repository.ts:128,129,131` |
| C-02 | P1   | José    | Teste de caracterização do total do caixa **antes** de mexer na fórmula — hoje a mudança não quebra teste nenhum                                          | `tests/integration/caixa/`                                                         |
| C-03 | P1   | Kaylane | Quebra: rota de leitura do operador (R-124), filtrando pelo `usuarioId` do perfil autenticado, **nunca** da query                                         | não existe                                                                         |
| C-04 | P1   | Kaylane | Quebra: notificar **o operador que a gerou** (R-125) — hoje só a Tesouraria                                                                               | `caixa.service.ts:575-577`                                                         |
| C-05 | P1   | José    | Quebra: fluxo de resolução pela Tesouraria (R-126) + migration separando **justificada** de **quitada** (hoje só um booleano)                             | `app.schema.ts:1696-1718`                                                          |
| C-06 | P1   | José    | **4ª saída sem trava R-121**: `exigirContaDoCaixaNoLancamento` não é chamada em transferências                                                            | `api/src/transferencias/`                                                          |
| C-07 | P1   | Marco   | Furo na trava de conta: o aviso "nenhuma conta vinculada" é avaliado **antes** da conta travada, e o operador nunca a vê                                  | `OperacaoLancamentoCredor.vue:61,69`                                               |
| C-08 | P2   | Marco   | Perfil misto: quem tem `caixa_operar` **e** `caixas_gerenciar` recebe o select livre mesmo operando caixa                                                 | `AppWorkspace.vue:265-267`                                                         |
| C-09 | P2   | Marco   | **Colaborador vaza na aba Mercadoria** — causa raiz: trocar de aba sem fechar o modal preserva o credor da Despesa. E quebra o salvar, com erro de UUID   | `useOperacaoLancamento.ts:186-201`                                                 |
| C-10 | P2   | Marco   | **Sangria durante o turno não tem UI** — o backend aceita, o front nunca envia                                                                            | `caixa-acoes.ts:67`                                                                |
| C-11 | P2   | Marco   | **Retorno parcial**: campo de valor editável (depende da decisão D-4 abaixo)                                                                              | `CaixaResumoPage.vue:117-122`                                                      |
| C-12 | P2   | Kaylane | Rotas de notificações **sem guard de permissão**                                                                                                          | `notificacoes.controller.ts:8,17`                                                  |
| C-13 | P2   | Marco   | Tela de pendências não lê `item.tipo` — quebra, alerta e transferência aparecem iguais                                                                    | `NotificacoesPendentesPage.vue:19-22`                                              |
| C-14 | P1   | José    | **D-10 · contas sem operador**: importadas sem vínculo em `contas_usuarios`, e pela R-071 a Tesouraria abre a tela com Origem e Destino vazios            | `scripts/seed-planilha.ts`                                                         |

> **Fora deste bloco mas afeta o total do caixa:** a `D-02` do backlog (venda duplicada por falta de
> UNIQUE em `identificador_externo`) faz venda **contar em dobro no caixa**. Continua P0.

---

## §3 · Resend + Cloudflare — o que exatamente configurar

Não há vestígio de Cloudflare no repositório. O domínio de envio é **`emails.cicluzieai.com.br`**
(subdomínio dedicado, escolha correta: isola a reputação de envio do domínio principal).

**No Resend:** adicionar o domínio `emails.cicluzieai.com.br` e copiar os registros que ele gerar.

**No Cloudflare**, na zona `cicluzieai.com.br` — e com **proxy desligado (nuvem cinza)** em todos,
porque são registros de e-mail e não de tráfego HTTP:

| Tipo | Nome                       | Para quê                                                               |
| ---- | -------------------------- | ---------------------------------------------------------------------- |
| MX   | `send.emails`              | recebimento de retorno (bounce) do Resend                              |
| TXT  | `send.emails`              | SPF                                                                    |
| TXT  | `resend._domainkey.emails` | DKIM                                                                   |
| TXT  | `_dmarc.emails`            | DMARC — comece em `p=none` e só endureça depois de ver relatório limpo |

Depois: gerar a API key no Resend, colocá-la como **secret no Coolify** (nunca no repositório) e
garantir que ela chegue ao contêiner — que é a tarefa **A-08**, sem a qual nada disso vale.

**Verificação final:** disparar um "esqueci minha senha" real e conferir no painel do Resend que o
e-mail saiu com SPF e DKIM passando. Só então a A-07 pode ser dada como fechada.

> Se o app estiver atrás do Cloudflare com proxy ligado, confira também que `AUTH_BASE_URL` usa o
> host público e que o cookie de sessão sobrevive — better-auth exige `secure` e `SameSite`
> coerentes com o domínio final. **Não confirmado se há proxy hoje.**

---

## §4 · Decisões que travam trabalho

| Id  | Decisão                                                                                                                                                                | Trava      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D-1 | **C-01 é retroativo.** Corrigir a fórmula muda o saldo de todo caixa já fechado. Recalcular o histórico ou aplicar só daqui para frente?                               | C-01       |
| D-2 | **C-07 do backlog:** a Gerência opera caixa ou só supervisiona?                                                                                                        | P-03, P-05 |
| D-3 | **D-11:** Gerência, Financeiro e Tesouraria ficam presos à conta do caixa quando lançam dentro de um? Hoje são retaguarda em **uma** saída só, o que contraria a R-032 | C-06       |
| D-4 | **Retorno parcial é permitido?** O backend aceita; a tela força integral                                                                                               | C-11       |
| D-5 | **Quebra: quem quita e como?** Desconto em folha, acerto em dinheiro, perdão? Define o modelo de dados                                                                 | C-05       |
| D-6 | **Fechar com déficit continua permitido?** Hoje fecha e joga a quebra no operador — e com o C-01 aberto, parte dessas quebras é falsa                                  | C-01, C-05 |
