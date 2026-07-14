# Próximos passos — estado do sistema em 13/07/2026

> Diagnóstico direto: **o código das integrações está pronto e mergeado na main.
> Os dados não chegam porque nenhuma fonte foi CONECTADA em produção** — falta a
> parte operacional (chaves, secrets, agente instalado na loja). Este arquivo lista
> exatamente o que falta, em ordem.

---

## 1. O que já está PRONTO (mergeado na main até o PR #7)

- Fase 0: identidade visual por categoria + aparência; e-mail transacional via Resend
  (reset/verificação); seed de dev bloqueado em produção (FND-02); bootstrap de produção.
- Fase 1: agente CREARE completo em `integracoes-scripts/` (sincronizar.js com cursor
  incremental, retry, fila de falhas, loop com lock); falhas de ingestão gravadas no
  histórico de integrações.
- Fase 2: discriminação de mercadorias/despesas (migration 0008, fila, permissão,
  validação de soma, desconto por item) + módulo de importação de NF-e
  (`api/src/notas-fiscais/`, via webhook Make da contabilidade).
- CI verde (lint com heap maior, lockfile sincronizado, tipos do Nuxt no postinstall).

## 2. Por que os dados ainda NÃO aparecem no sistema

| Fonte                | O que falta                                                                                                                                                             | Onde             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Vendas do CREARE     | O agente NÃO está instalado/rodando no PC da padaria. Sem ele, nada envia vendas — o sistema só recebe, não busca.                                                      | PC da loja       |
| Vendas do CREARE     | Chave de integração não criada (tela Integrações → Chaves) e `.env` do agente não preenchido na loja                                                                    | App + PC da loja |
| NF-e (contabilidade) | Secrets `NOTAS_FISCAIS_URL` e `NOTAS_FISCAIS_TOKEN` no Coolify (valores estão no legado: `padaria_planilhas/bot/.env.producao.*`)                                       | Coolify          |
| NF-e                 | CNPJ não preenchido nas empresas (tela Empresas) → importação responde 422                                                                                              | App              |
| NF-e                 | Permissões `notas_fiscais_importar`/`_visualizar` não atribuídas a ninguém                                                                                              | App              |
| NF-e                 | Tela de revisão ainda NÃO commitada (está só na sua máquina — ver seção 4). Enquanto isso, a importação funciona via chamada manual (roteiro do Passo 5 do Claude Code) | Repo             |
| E-mail (Resend)      | Secret da API key do Resend no Coolify (mesmo motivo: env não repassada = e-mail não sai)                                                                               | Coolify          |
| Tudo                 | Confirmar que o Coolify REDEPLOYOU a main de hoje (merge #7 + "atualização docker compose") — sem redeploy, os containers rodam código velho sem as envs novas          | Coolify          |

**Resumo em uma frase:** o encanamento está construído; falta abrir os registros
(secrets/chaves) e ligar a bomba (agente na loja).

## 3. Ordem de execução (esta semana)

1. **Coolify:** setar secrets `NOTAS_FISCAIS_URL`, `NOTAS_FISCAIS_TOKEN`,
   `RESEND_API_KEY` (nomes exatos: conferir `.env.example`/compose) → **Redeploy**
   da main → conferir serviços verdes e `/health`.
2. **Teste rápido do e-mail:** "esqueci minha senha" com e-mail real → deve chegar.
3. **App:** preencher CNPJ das 3 empresas (tela Empresas); atribuir
   `notas_fiscais_importar`/`_visualizar` a quem vai operar (você/financeiro).
4. **NF-e — primeiro dado real no sistema (não depende da loja!):** rodar a
   importação de um período curto (2 dias) via console, conforme roteiro do Passo 5;
   conferir mercadorias `aguardando_aprovacao`; rodar de novo o mesmo período e
   confirmar `puladas` (idempotência). Isso já valida a metade "nuvem" sem sair de casa.
5. **Loja (TNP ou Lisboa) — ligar as vendas:** tela Integrações → criar a chave da
   empresa; no PC da padaria: instalar Node, copiar `integracoes-scripts`, preencher
   `.env` (MySQL do CREARE + URL da API + chave), rodar `dev:teste_integracao`
   (fumaça), depois o modo produção, e registrar como serviço do Windows
   (roteiro completo: docs/PASSO-A-PASSO-POS-FASES.md, Etapa 3).
6. **Homologar:** Integrações → Histórico com vendas chegando; comparar 1 dia
   contra o CREARE (Etapa 4 do passo a passo). 3 dias batendo = vendas resolvidas.
7. **Fechar a tela de NF-e:** terminar/commitar a tela de revisão (seção 4),
   PR pequeno, merge, redeploy.

## 4. Pendências de repositório (arrumar hoje, 10 min)

- **Trabalho não commitado na sua máquina:** `web-vue/pages/notas_fiscais.vue` +
  `web-vue/components/notas-fiscais/` (tela de revisão de NF-e, em andamento) e a
  pasta `design-system/`. Termine a tarefa no Claude Code e commite em branch própria.
- **A pasta `docs/` inteira NÃO está no git** (nunca foi commitada — só existe no seu
  PC). Isso inclui ADRs, backlog, specs e os planos. Se o disco falhar, perde tudo.
  → `git add docs/ && git commit -m "docs: documentação do projeto" && git push`
  (os PDFs de análise já estão no .gitignore; se não estiverem, ignore-os).
- **Lock do git:** existe um `.git/index.lock` órfão que pode bloquear commits.
  Se `git commit` reclamar de lock, feche VS Code/Claude Code e apague o arquivo
  `.git/index.lock`.
- **Higiene já feita em 13/07:** o `.git/config` e o `.git/HEAD` estavam corrompidos
  (linha truncada + byte nulo — provável escrita interrompida) e foram reparados;
  backup do config antigo em `.git/config.bak-corrompido`. Reforço: novas branches
  sem acento no nome.

## 5. Depois disso (já planejado, não começar antes do item 3 acabar)

- Replicar o agente para a 2ª padaria; conector Firebird da HORA (Fase 3).
- Spec de pedidos v2 (entrevista com o comprador) e módulo de negociação/cotação.
- Estoque (BK-01) → base para contagem com foto/IA e Curva ABC.
- Rotina permanente de operação: docs/PASSO-A-PASSO-POS-FASES.md, Etapa 7.
- Rotacionar credenciais do legado (MySQL das lojas, token Make, service account
  Google) quando o bot antigo for desligado — e a senha do MySQL/token já circularam
  em chats: antecipe a rotação se possível.
