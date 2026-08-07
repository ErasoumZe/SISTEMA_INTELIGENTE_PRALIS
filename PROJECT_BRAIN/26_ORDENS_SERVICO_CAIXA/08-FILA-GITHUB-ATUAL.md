# Fila GitHub vigente — Marco e Ze — Caixa

Data: 07/08/2026

Base confirmada: `origin/main = bd4909c`

Issue-mestra: #136

Regra: este arquivo decide o que pode iniciar agora. Os arquivos 01 e 02 continuam como catalogo
detalhado, mas nao autorizam furar dependencias daqui.

## Ja incorporado — nao refazer

| Entrega                                  | Evidencia                    |
| ---------------------------------------- | ---------------------------- |
| escopo de permissoes                     | PR #137                      |
| Nuxt TS5023 documentado                  | PR #138                      |
| metadados de usuarios cross-tenant       | PR #139                      |
| pagamento dividido D-06                  | PR #140                      |
| criacao de usuario B-01                  | PR #141                      |
| base de reset, Resend e paginas publicas | commit `467f081`, ja na main |
| S-06 permissoes ocultas                  | ja incorporada               |

## Trabalho ativo — somente estes dois

| Dono  | Id        | Branch                                | Objetivo                                                                                     | Estado                                                |
| ----- | --------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Marco | `CX-M03A` | `fix/caixa-recuperacao-senha`         | provar o link real e completar somente as lacunas de recuperacao do proprio usuario          | em execucao                                           |
| Ze    | `CX-Z101` | `101-c-01-fechamento-retorno-sangria` | fechar issue #101: retorno, sangria, solicitacao/conferencia do cofre e fechamento retomavel | branch publicada; PR e gates precisam ser confirmados |

### Exclusividade de arquivos nesta janela

**Marco pode tocar:**

- `api/src/auth/email.ts`;
- `api/src/auth/config.ts` somente se a causa exigir e sem mudar regra do Ze;
- `web-vue/pages/forgot-password.vue`;
- `web-vue/pages/reset-password.vue`;
- `web-vue/middleware/auth.global.ts`;
- testes de autenticacao/reset.

**Ze pode tocar:**

- `api/src/caixa/**`;
- `api/src/transferencias/**`;
- `api/src/notificacoes/**`;
- migrations 0030/0031 e schemas relacionados;
- componentes de Caixa, Tesouraria, cofre e transferencias;
- testes desses fluxos.

**Congelado para coordenacao:**

- `shared/src/autenticacao/index.ts` pertence temporariamente a branch #101;
- `tests/setup/seed.ts` pertence temporariamente a branch #101;
- nenhuma outra branch cria migration enquanto #101 estiver aberta;
- Marco nao toca Caixa/transferencias; Ze nao toca reset de senha.

As duas PRs podem andar em paralelo. A primeira que mergear obriga a outra a atualizar a base e
repetir os testes afetados antes do merge.

## Ordem obrigatoria depois das duas entregas ativas

| Onda                              | Marco                                                               | Ze                                                                                      | Gate para avancar                                 |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1 — acesso seguro                 | `CX-M04A`: PUT de usuario, role e alvo cross-tenant                 | `CX-ZA1`: V-01/V-02/V-03 no Coolify, Resend e orfaos, somente leitura                   | runtime comprovado e nenhum takeover              |
| 2 — senha administrativa e deploy | `CX-M03B`: reset administrativo com alvo seguro, permissao e trilha | `CX-ZA2`: impedir bootstrap de redefinir admin e fechar cadastro publico                | acesso completo sem mexer em credencial no deploy |
| 3 — fronteira de empresa          | `CX-M05`: colaboradores GET/POST/PUT cross-tenant                   | `CX-ZD1`: duplicatas, UNIQUE e ingestao concorrente D-01/D-02/D-03                      | leitura/escrita por empresa e venda unica         |
| 4 — idempotencia e dinheiro       | `CX-M06/M07`: campos operacionais e descontos da discriminacao      | `CX-ZD2`: hash de datas, reprocesso, venda tardia, juros/desconto e formas de pagamento | reconciliacao em centavos                         |
| 5 — operacao do fechamento        | `CX-M08/M09`: pendencias e quebra do operador                       | reauditar lacres/transferencias restantes apos #101                                     | fluxo unico sem caminho antigo                    |
| 6 — aceite                        | `CX-M10/M11/M12`: remover legado, E2E e homologacao visual          | locks, rate limit, logs, backup/restore e deploy                                        | checklist CX-T01 completo                         |

## Detalhe das proximas OS

### CX-M04A — P0 — Marco

Fecha o takeover restante em `PUT /api/usuarios/:id`, impede ator de A editar conta de B e impede
`cadastro_usuarios_editar` de conceder admin sem autorizacao. Inclui testes de alvo, role,
propria empresa, outra empresa, admin e falha tecnica. Nao inclui reset de senha.

### CX-ZA1 — P0 — Ze — somente leitura

No Coolify, confirmar `AUTH_BASE_URL`, `WEB_ORIGIN`, chegada de `RESEND_API_KEY` e
`EMAIL_FROM`; disparar um reset real mascarado; contar orfaos de identidade. Nao mostrar
segredos, nao limpar dados e nao alterar configuracao nessa OS.

### CX-M03B — P1 — Marco

So depois da CX-M04A. Criar troca administrativa de senha com alvo dentro do escopo, permissao
aprovada, auditoria e revogacao de sessoes. Nunca reutilizar o PUT inseguro.

### CX-ZA2 — P0 — Ze

O bootstrap nao pode redefinir senha/role do admin a cada deploy. Fechar cadastro publico conforme
regra aprovada. Rotacao de credencial e operacao explicita, nunca efeito colateral do deploy.

### CX-M05 — P0 — Marco

Fechar leitura e escrita de colaboradores entre empresas, incluindo setor/cargo, sem quebrar a tela
de usuarios. Nenhum UUID da empresa B chega ao browser da empresa A.

### CX-ZD1 — P0 — Ze

Contar duplicatas reais antes; mostrar SQL; backup/restore provado; UNIQUE por empresa e identificador;
ingestao atomica; teste concorrente. Migration e limpeza exigem autorizacao separada.

## Regras de merge e conflito

1. Uma issue e uma branch ativa por pessoa.
2. Branch nasce de `origin/main` atual.
3. Ninguem toca arquivos exclusivos do outro.
4. Se um arquivo congelado for necessario, parar e coordenar antes da edicao.
5. Agentes paralelos sao somente leitura; agente principal e o unico escritor.
6. Agentes encerrados antes de lint/build/testes.
7. Testes especificos durante a edicao; suite completa uma vez no fechamento.
8. PR informa base, arquivos, RED/GREEN, exit codes, riscos e migrations.
9. CI totalmente verde; Codex revisa; Ze autoriza merge.
10. Depois de qualquer merge, a outra branch atualiza a base antes de continuar.
11. Migration, formula de dinheiro, dado historico ou producao exigem parada e aprovacao.
12. Achado novo recebe issue/dono/dependencia; nao aumenta silenciosamente a PR.

## Regra para o Codex de cada pessoa

Antes de gerar um prompt ou iniciar uma OS:

1. `git fetch origin --prune`;
2. conferir `origin/main`, PRs, branches do outro dono e este arquivo;
3. pesquisar se o trabalho ja existe em commits do Ze ou Marco;
4. classificar como feito, parcial, nao mergeado ou ausente;
5. declarar arquivos exclusivos e congelados;
6. somente entao autorizar implementacao.
