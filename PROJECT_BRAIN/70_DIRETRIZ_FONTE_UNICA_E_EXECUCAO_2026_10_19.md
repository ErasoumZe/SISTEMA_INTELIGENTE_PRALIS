# 70 — Diretriz de fonte única e execução contínua

**Vigência:** 19/10/2026
**Decisão de Marco:** este documento define a base de trabalho para as alterações futuras do Pralis.

## 1. Diretório e base canônicos

A única cópia de execução passa a ser:

```text
D:\Sistema Pralis - Principal
```

Ela foi clonada da `origin/main` no commit
`850a822d95cbfa3f6c6ea4ae13279a3e1027d6fb`, com árvore inicialmente limpa. As demais pastas,
worktrees e branches locais são **histórico/evidência**, nunca base para nova implementação, merge,
deploy ou comparação final.

Antes de iniciar qualquer entrega, confirmar no diretório canônico:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git status --short
git log --oneline -15
```

Depois criar uma branch nova a partir da `main` recém-confirmada. Nunca editar diretamente a `main`.

## 2. Passado é evidência, não base de código

Uma branch, pasta ou documento histórico pode ser lido apenas para recuperar contexto ou uma decisão.
Ele não autoriza copiar arquivos inteiros, reaplicar migrations, restaurar fluxos removidos ou concluir
que algo ainda existe. Código, schema, testes e `PROJECT_BRAIN` do HEAD atual da `main` vencem qualquer
estado anterior.

Se uma mudança antiga ainda for necessária, ela deve ser reconstruída como uma fatia pequena sobre a
`main`, comparando contrato de API, permissões, schema e testes antes de escrever.

## 3. Branch, revisão e PR

1. Uma intenção de negócio por branch e por PR.
2. Uma pessoa/agente principal escreve; agentes de revisão não editam os mesmos arquivos.
3. Toda entrega inclui a vertical completa: interface, API/guarda quando existir, permissão, teste e
   remoção do caminho substituído.
4. Antes de PR: revisar o HEAD exato, `git diff --check`, lint, check, testes proporcionais ao risco
   e validação responsiva quando houver UI.
5. Push, PR, merge e deploy são atos separados. Merge não autoriza deploy. Migration, fórmula de
   dinheiro, dado histórico, segredo e escrita externa exigem autorização específica.

## 4. Uso obrigatório de skills e agentes

Para cada entrega, o responsável deve:

1. ler `AGENTS.md`, este documento e as fontes do `PROJECT_BRAIN` ligadas ao módulo;
2. usar as skills aplicáveis (por exemplo: Segundo Cérebro para contexto/handoff, testes para
   regressão, UX/responsividade para telas e segurança para acesso);
3. usar agentes de revisão independentes antes da PR, com escopos separados — ao menos arquitetura/
   backend-permissões e interface/testes quando o trabalho tocar esses domínios;
4. consolidar a decisão no escritor principal, sem agentes alterarem a mesma área em paralelo;
5. registrar no Segundo Cérebro o checkpoint, fonte, branch, HEAD, evidências e pendências.

## 5. Primeiro trabalho sob esta diretriz

Branch: `feat/menu-permissoes-revisao-20261019`.

Escopo: revisar o catálogo de telas, grupos de menu e permissões para que cada tela aplicável possa
ser organizada em um grupo e tenha acesso realmente protegido por API, sem tela órfã em `Geral`,
permissão inerte ou item de menu que prometa uma ação indisponível. A investigação precede qualquer
alteração de regra de negócio ou de banco.

## 6. Definition of Done adicional para menu/permissões

- toda tela registrada aparece exatamente em um grupo configurável ou possui motivo explícito para
  ficar fora do menu;
- a tela disponível para organização não some do seletor de inclusão;
- visibilidade de menu, navegação direta e API têm paridade de permissão;
- nenhuma permissão exibida promete ação que não existe;
- testes cobrem a falha encontrada e a regressão de empresa/perfil relevante;
- o resultado informa o que foi removido, preservado, corrigido e o que depende de decisão
  operacional.
