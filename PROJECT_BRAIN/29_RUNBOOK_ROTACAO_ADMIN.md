# 29 — Runbook de rotacao da credencial e do papel administrativo (R-162)

Este procedimento existe para que deploy e credencial sejam operacoes separadas. O
`db/bootstrap-prod.ts` usa `ADMIN_SENHA` apenas quando `ADMIN_EMAIL` ainda nao existe. Depois da
primeira instalacao, um redeploy preserva senha, verificacao, perfil, papel e vinculos.

## Primeira instalacao

1. Configure `ADMIN_EMAIL` e uma `ADMIN_SENHA` temporaria com pelo menos 10 caracteres no Coolify.
2. Faca o primeiro deploy e confirme que o bootstrap registrou `admin inicial criado`, sem imprimir
   a senha.
3. Entre com a conta e confirme o e-mail operacional associado a ela.
4. Remova o valor de `ADMIN_SENHA` do Coolify. A variavel pode ficar vazia nos redeploys seguintes.

Se o banco estiver vazio e `ADMIN_SENHA` estiver ausente, o bootstrap falha antes de criar qualquer
identidade. Isso e intencional: instalacao nova exige provisionamento consciente.

## Rotacao da propria senha administrativa

1. Registre uma issue operacional com executor, data e motivo da rotacao. Nunca escreva a senha na
   issue, nos logs ou neste repositorio.
2. Na tela publica `Recuperar acesso`, solicite o link para o `ADMIN_EMAIL`.
3. Abra o link recebido, defina a nova senha e confirme que o login funciona em janela anonima.
4. Faca um redeploy controlado e confirme novamente o login. O redeploy nao pode restaurar a senha
   antiga.
5. Registre apenas o resultado da verificacao na issue operacional.

Nao altere `ADMIN_SENHA` para rotacionar uma conta existente: essa variavel deixou de ser fonte da
verdade depois da primeira instalacao.

## Alteracao de papel

Use somente o cadastro administrativo de usuarios, protegido pelas regras de alvo e papel. Registre
ator, alvo, papel anterior, papel novo e motivo na issue operacional. O bootstrap nao promove nem
rebaixa usuario existente.

## Recuperacao de desastre

Em banco novo ou restauracao sem a identidade configurada, trate como primeira instalacao: configure
temporariamente `ADMIN_SENHA`, faca o deploy, valide o acesso e remova o segredo estatico novamente.
