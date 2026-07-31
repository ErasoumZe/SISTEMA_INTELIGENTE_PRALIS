# TUDO pronto para colar — 4 prompts, na ordem

> Prompt A já vem com as Etapas 6 e 7 (o trabalho perdido) embutidas. Não precisa montar nada.
> Rode UM por vez, sessão nova no Claude Code. **NÃO MERGEAR** em nenhum deles.
>
> **Decisões do José (27/07) já aplicadas nos prompts:** sem seletor de mês na topbar · sem "SAIR"
> na sidebar (fica só no perfil) · **Malotes oculto** (não há tela de criar malote — o lacre é
> informado na Transferência) · contas vinculadas ao usuário viraram o **Prompt 0** (prioridade).

---

## 🗺 ORDEM COMPLETA (é só seguir de cima para baixo)

| # | Prompt | O que faz | Estado |
|---|---|---|---|
| 0 | (histórico) | tabela `contas_usuarios` + `lacres` + endpoints | ✅ feito |
| **0-A** | **Ajustes rápidos de UI** | tira "Sair" duplicado, tira seletor de mês, oculta Malotes | ⬅ **5 min** |
| **0-B** | **Completar vínculo contas↔usuário** | seletores, tela, seed, mensagem vazia | ⬅ |
| **A** | **Backend das telas** | 7 etapas (lacre, 2 pontas, lançamento, discriminação, maquininha, saldo inicial, retorno B2) | ⬅ |
| **B** | **Shell Mobills** | menu, topbar, cards, listas | ⬅ |
| **C** | **Tesouraria** | cockpit do tesoureiro | ⬅ |
| **D** | **Responsividade** | 5 telas novas em 1440/1024/768/390 | ⬅ |

**Branch:** tudo continua em `feat/backend-telas-rodrigo` (ela já contém `telas-fieis-mockup` e
`visual-telas-rodrigo` — pilha linear, 0 commits atrás da main). **Um merge no fim leva tudo.**

**Limpeza do repositório (fazer no GitHub, são branches mortas e 9–12 commits atrás):**
`feat/cockpit-caixa-dre` · `feat/design-tokens-tema-fonte` · `fix/malotes-excluir-e-codigo-lacre`

---

## ▶ PROMPT 0-A — Ajustes rápidos de UI (rodar primeiro, é rápido)

```
Três ajustes pontuais de UI (decisões do José, PROJECT_BRAIN/15). Só isto, nada além.

1. web-vue/components/app/AppShell.vue (~linhas 211-217): REMOVER o botão "Sair" da sidebar.
   O logout já existe no menu do perfil do usuário — não ter dois. Manter o emit("logout")
   funcionando para o menu do perfil; remover apenas o botão da sidebar.

2. Se houver seletor de mês/período no shell (AppShell.vue / AppWorkspace.vue): REMOVER.
   Não usamos seletor de período. Manter o seletor de EMPRESA.

3. web-vue/utils/domain.ts (~linha 94): OCULTAR o item "malotes" do menu.
   Não existe tela de criar malote — o lacre é informado direto na Transferência.
   Apenas esconder do menu (não apagar rota nem backend).

lint + check + build verdes. Commit único:
"fix(ui): remove Sair duplicado e seletor de mes; oculta Malotes do menu".
Continue na branch feat/backend-telas-rodrigo. NÃO MERGEAR.
```

---

## ✅/⚠ PROMPT 0 — PARCIALMENTE EXECUTADO (28/07) — falta a metade

> Verificado no código (commit `7c1f01f`, branch `feat/backend-telas-rodrigo`):
>
> | Item | Estado |
> |---|---|
> | 1 · tabela `contas_usuarios` + migration 0015 | ✅ feito |
> | 2 · API (controller/service/repository) + permissões no catálogo | ✅ feito |
> | *(bônus)* tabela `lacres` — era a Etapa 1 do Prompt A | ✅ adiantado |
> | 3 · **seletores filtrando pelas contas do usuário** | ❌ **não feito** |
> | 4 · **tela de cadastro do vínculo** | ❌ **não feito** |
> | 6 · **seed de vínculos iniciais** | ❌ **não feito** — sem isso a operação PARA |
> | 7 · **mensagem de caso vazio** | ❌ **não feito** |
>
> **Rode o PROMPT 0-B abaixo antes de seguir para o Prompt A.**

---

## ▶ PROMPT 0-B — Completar o vínculo usuário↔contas (rodar AGORA)

```
A tabela `contas_usuarios`, os endpoints e a tabela `lacres` já foram entregues (commit 7c1f01f).
Faltam 4 itens do mesmo trabalho. NÃO refazer o que já existe — completar.

Contexto: PROJECT_BRAIN/14 (FOTO 4) e PROJECT_BRAIN/15 (decisão D-D).
Regra definida: usuário SEM vínculo NÃO VÊ NENHUMA CONTA. Só admin/usuario_admin vê todas.

1) APLICAR o vínculo nos seletores (o que dá sentido à tabela):
   - Origem/Destino da Transferência: oferecer SOMENTE as contas vinculadas ao usuário logado.
   - Conta nos lançamentos (despesa/mercadoria/retirada): idem.
   - Admin/usuario_admin: todas (short-circuit, igual às permissões).
   - Deixar preparado o gancho de "quem pode CONFIRMAR recebimento" (só quem tem a conta
     de destino vinculada) — a confirmação em si é a Etapa 2 do Prompt A.

2) TELA de cadastro do vínculo (em Usuários ou Cadastros → Usuário/Permissões):
   lista de contas com checkbox por usuário. Simples, sem inventar UX. Usar as permissões
   cadastro_contas_usuarios_* que já estão no catálogo.

3) ⚠ SEED DE VÍNCULOS INICIAIS — o item mais crítico:
   Hoje NINGUÉM tem vínculo. Com a regra "sem vínculo = nenhuma conta", ao subir isso a operação
   PARA (nenhum operador consegue lançar). Portanto, derive os vínculos do histórico real:
   - contas que aparecem em lançamentos/transferências criados por cada usuário;
   - a conta do PDV dos caixas que cada usuário abriu.
   PARE e me mostre a QUERY de derivação + a CONTAGEM de vínculos que ela criaria (por usuário),
   ANTES de aplicar. Quem não tiver histórico fica sem vínculo (cadastro manual depois).

4) MENSAGEM de caso vazio: quando o seletor não tiver conta, exibir
   "Nenhuma conta vinculada ao seu usuário — peça ao administrador" em vez de select vazio.

Testes: usuário com 2 contas só enxerga essas 2; admin enxerga todas; vínculo duplicado é
rejeitado pelo UNIQUE; seletor vazio mostra a mensagem.
lint + check + testes verdes. Continue na branch feat/backend-telas-rodrigo. NÃO MERGEAR.
```

---

## 📄 PROMPT 0 original (histórico — já parcialmente executado)

> É a Etapa 1 do Prompt A, isolada por prioridade. Base de quem vê/opera/confirma cada conta.
> Referência: FOTO 4 do Rodrigo (`PROJECT_BRAIN/14`, §FOTO 4).

```
Implemente o vínculo USUÁRIO ↔ CONTAS. Referência: PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md
(FOTO 4 — desenho do Rodrigo ligando cada pessoa às contas que ela opera:
Rodrigo → CT Financeiro, CT Cofre, CT Caixa, CT CX 1/2/3 · Bianca → CT Financeiro, CT Cofre ·
Peter → CT Financeiro, CT Caixa · Joana → CT CX 1/2/3).

ATENÇÃO: esta tabela foi criada na sessão de 24/07 mas NUNCA foi commitada (perdida). Refaça.
PARE e mostre o SQL antes da migration. COMMITE cada passo (nada untracked).

CONCEITO — não confundir com permissão:
- As 9 ações (lançar/pagar/conferir/…) dizem O QUE o usuário pode fazer.
- `contas_usuarios` diz EM QUAIS CONTAS ele pode fazer. São camadas complementares.

Entregas:
1. Tabela `contas_usuarios`: empresa_id, conta_id (FK contas), usuario_id (FK perfis_usuarios),
   criado_em; UNIQUE (conta_id, usuario_id). Migration aditiva.
2. API: CRUD do vínculo + endpoint para listar "as contas do usuário logado".
3. APLICAR o vínculo onde importa:
   - Os seletores de Origem/Destino da Transferência passam a oferecer SOMENTE as contas
     vinculadas ao usuário logado (admin vê todas).
   - Idem para a Conta nos lançamentos (despesa/mercadoria/retirada).
   - Preparar o gancho para "quem pode CONFIRMAR o recebimento" (Etapa 2 do Prompt A): só quem
     tem a conta de destino vinculada.
4. Tela de cadastro do vínculo dentro de Usuários (ou Cadastros → Usuário/Permissões): lista de
   contas com checkbox por usuário. Simples, sem inventar UX nova.
5. REGRA DEFINIDA (José, 27/07): usuário SEM vínculo **NÃO VÊ NENHUMA CONTA**. Sem vínculo, os
   seletores vêm vazios. Exceção: `usuario_admin`/admin enxerga todas (short-circuit, como já
   acontece com permissões).

6. ⚠ OBRIGATÓRIO por causa da regra acima — SEED DE VÍNCULOS INICIAIS:
   Como ninguém tem vínculo hoje, ao subir isso a operação PARA (nenhum operador consegue lançar).
   Portanto, na MESMA migration/bootstrap:
   - vincular automaticamente cada usuário às contas que ele **já usa hoje** — derive do histórico
     real: contas que aparecem em lançamentos/transferências/caixas criados por ele
     (e a conta do PDV dos caixas que ele abriu);
   - se um usuário não tiver histórico, deixe sem vínculo (ele será cadastrado manualmente).
   PARE e me mostre a query de derivação + a contagem de vínculos que ela vai criar, ANTES de
   aplicar. Não quero descobrir em produção que alguém ficou sem conta.

7. Mensagem de UI clara no caso vazio: quando o seletor não tiver nenhuma conta, exibir
   "Nenhuma conta vinculada ao seu usuário — peça ao administrador" em vez de um select vazio.

Testes de integração: usuário vinculado a 2 contas só enxerga essas 2 nos seletores; admin enxerga
todas; vínculo duplicado é rejeitado pelo UNIQUE.
lint + check + testes verdes. Branch: feat/contas-usuarios. NÃO MERGEAR.
```

---

## ▶ PROMPT A — Backend das telas novas (rodar primeiro)

```
Implemente o BACKEND dos campos que hoje estão como data-pendente="regra" nas telas novas
(branch feat/visual-telas-rodrigo). Fonte de verdade dos campos:
PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md. Contexto obrigatório: PROJECT_BRAIN/12
(fundo simples — NÃO existe mais déficit/dívida do malote).

IMPORTANTE — trabalho perdido a refazer: as tabelas `lacres` e `contas_usuarios` foram criadas na
sessão de 24/07 mas NUNCA commitadas (não estão em nenhuma branch). Refaça-as.

Faça em ETAPAS, uma por vez, COMMITANDO CADA UMA (mesmo que incompleta — não deixe trabalho
untracked). PARE e mostre o SQL antes de CADA migration. Se alguma etapa exigir decisão de negócio
não coberta pelo doc 14, PARE e pergunte.

ETAPA 1 — Lacre (a tabela `contas_usuarios` já foi feita no PROMPT 0 — não refazer)
- Tabela `lacres`: numero (único por empresa), transferencia_id, origem (saida|retorno),
  rompido (bool), empresa_id. O lacre é do MOVIMENTO — a identidade do malote continua sendo
  malotes.numero_lacre. São coisas diferentes: documente a distinção no schema.
- IMPORTANTE (decisão do José, 27/07): NÃO existe tela de cadastro de malote. O malote/lacre é
  informado direto no formulário de Transferência — se o número não existir, é criado ali mesmo
  (inline). O menu "Malotes" está oculto. Modele pensando nesse fluxo inline.
- Endpoints de cadastro/listagem mínimos de lacre.

ETAPA 2 — Transferência em DUAS PONTAS (o item mais importante)
- Colunas: agendada (bool) + data_agendamento; data_recebimento; sempre_confirmar (bool);
  status de confirmação (pendente|confirmada) — nomes coerentes com o schema atual.
- Fluxo: quem envia cria a transferência (com lacre); o DESTINATÁRIO confirma o recebimento →
  grava data_recebimento e rompe o lacre. Só quem tem a conta destino vinculada
  (contas_usuarios) pode confirmar.
- "Sempre confirmar": exige confirmação mesmo quando origem e destino são do mesmo usuário.
- Múltiplo destino: modelar como 1 transferência → N destinos (valor por destino). Se você achar
  que deve ser N transferências agrupadas, PARE e me proponha as duas opções com prós/contras
  ANTES de implementar.
- Abertura de caixa por N° de lacre: o operador informa o lacre da transferência de entrada; o
  sistema confirma o recebimento para a conta do PDV e funda o caixa (fundo simples, sem dívida).

ETAPA 3 — Lançamento (Despesa/Mercadoria/Retirada)
- Colunas: juros (monetário, default 0) — VALOR TOTAL = valor + juros (calcular; não duplicar
  coluna se já houver total); data_documento_fiscal; numero_documento_fiscal; segunda foto
  (ex.: foto_nota_url ao lado do fotoDocumentoUrl existente).
- Credor tipado: discriminador (fornecedor|colaborador|socio_setor) + o vínculo para sócio/setor
  que hoje não existe. Fornecedor e colaborador JÁ têm FK — reusar.
- RECORRÊNCIA: reutilizar o padrão que JÁ EXISTE em `pedidos` (coluna recorrencia:
  nenhuma|semanal|quinzenal|mensal + data_agendada). Estenda-o para "número de repetições" e
  "dia da semana" conforme o desenho. NÃO inventar modelo novo.

ETAPA 4 — Discriminação com desconto
- Nos itens: valor unitário com desconto, valor total com desconto e o % efetivo.
- No header: desconto geral em R$ ou % (flag do tipo) + natureza "Vale Presente".
- Regra de rateio do desconto geral entre os itens: PARE e confirme comigo a regra antes de
  implementar (proporcional ao valor? igualitária?).

ETAPA 5 — Máquina de cartão
- Cadastro de maquininha (número de série, apelido, empresa) + vínculo na abertura do caixa.

ETAPA 6 — Saldo inicial de conta (trabalho perdido, refazer)
- Coluna `contas.saldo_inicial` (monetário, NOT NULL default '0').
- Saldo da conta passa a ser: saldo_inicial + movimentos (entradas − saídas).
- Motivo: quando a empresa entra no sistema as contas já têm dinheiro; sem isso o saldo nasce
  errado. Migration aditiva simples.
- Expor no cadastro de contas e no cálculo de saldo por conta.
- Teste: conta com saldo_inicial 1000 + entrada 500 − saída 200 → saldo 1300.

ETAPA 7 — Retorno automático no fechamento, regra B2 (trabalho perdido, refazer)
- Ao FECHAR o caixa: gerar automaticamente uma transferência de RETORNO (caixa → cofre) com TODO
  o dinheiro em espécie restante, deixando o caixa ZERADO.
- Coerente com PROJECT_BRAIN/12 (fundo simples): o caixa não deve nada; ao fechar devolve tudo.
- Reusar a criação de transferência cofre↔caixa que já existe (a mesma do retorno manual do M2),
  com tipo=retorno e a próxima ordem (proximaOrdemTransferenciaRepository JÁ EXISTE).
- A conta de cofre vem de `empresas.conta_cofre_id` — se não estiver mapeada, FALHE com mensagem
  clara (nunca criar conta automaticamente).
- Lacre do retorno: opcional (D5), mas o campo deve ser aceito.
- Testes: fechar caixa com 790 em espécie → transferência de retorno de 790 criada e caixa fecha
  com saldo ZERO; fechar caixa já zerado → nenhuma transferência criada (não gerar lançamento 0).

Ao final de cada etapa: testes de integração cobrindo o caminho feliz e a regra de permissão.
lint + check + testes verdes. Branch: feat/backend-telas-rodrigo. NÃO MERGEAR.
Se o contexto encher, commite o que estiver pronto e me diga em que etapa parou.
```

---

## ▶ PROMPT B — Shell Mobills: menu e navegação (rodar depois do A)

```
Redesenhe o SHELL do app (menu + navegação + layout base) na linguagem do Mobills. Referências:
docs/research/mobills/DESIGN_TOKENS.md e BEHAVIORS_E_TOPOLOGIA.md (extraídos do Mobills real),
PROJECT_BRAIN/04_UX_MOBILLS.md, e a estrutura do Xmind V2 (PROJECT_BRAIN/10).

Esta rodada é de SHELL — não reescrever o conteúdo interno das telas.

1) SIDEBAR estilo Mobills
   - Fundo claro/branco, ícone + rótulo, item ativo com realce (não a barra laranja atual).
   - Botão "+ NOVO" no TOPO da sidebar (FAB roxo #6515dd, pill raio 25px) que abre menu curto de
     lançamento: Entrada · Despesa · Mercadoria · Retirada · Transferência — cada um com o ícone
     na SUA cor de categoria (--cat-*).
   - Agrupar os itens conforme o Xmind V2 (Entradas · Transferências · Saídas · Resultados ·
     Configuração), preparando o terreno para o menu por SETOR (a montagem por setor em si é
     trabalho posterior — aqui só a estrutura de grupos).
   - REMOVER o botão "SAIR" da sidebar: já existe logout no menu do perfil do usuário (topbar).
     Não ter dois.
   - OCULTAR o item de menu "Malotes" (decisão do José, 27/07): NÃO existe tela para criar malote.
     O malote/lacre é informado direto no formulário de Transferência. Apenas esconder do menu
     (hide) — não apagar a rota nem o backend nesta rodada.

2) TOPBAR
   - NÃO incluir seletor de mês/período (decisão do José, 27/07 — não usar).
   - Seletor de EMPRESA e menu do usuário (com o logout) à direita.

3) CARDS DE TOTAIS no topo das telas de listagem
   - Padrão Mobills: card por categoria, ícone circular colorido, rótulo pequeno + número grande.
   - Usar --cat-* e elevação Vuetify 1–2 (Material, não sombra custom).

4) LISTAS
   - Densidade Mobills: linha com situação · data · descrição · chip de categoria colorido ·
     conta · valor à direita (verde/vermelho pelo sinal) · ações.
   - Rodapé com "Saldo previsto final do dia" quando fizer sentido.

REGRAS: aditivo e reversível; NÃO tocar api/db/shared; NÃO mudar regra de permissão (o menu
continua respeitando as permissões atuais); responsivo nos breakpoints do projeto
(1260/1024/768/560/390) — sidebar vira drawer no celular.
Antes de codar, me mostre em 5 linhas como vai ficar o shell. Branch: feat/shell-mobills.
NÃO MERGEAR. Screenshots antes/depois de 3 telas no resumo final.
```

---

## ▶ PROMPT C — Tela de Tesouraria (rodar depois do B)

```
Recrie a tela de TESOURARIA (existia na sessão de 24/07 e se perdeu por não ter sido commitada).
Contexto: o tesoureiro NÃO opera caixa — ele move dinheiro entre contas (cofre → caixas → banco)
por transferência. Hoje a rota /transferencias mostra uma tabela genérica de cadastro, que não
serve para ele.

Entregas:
- Substituir a tabela genérica em /transferencias por um cockpit de tesouraria:
  · botão "Nova transferência" que NÃO depende de caixa aberto (o tesoureiro não tem caixa);
  · lista limpa das transferências do período, com origem → destino, valor, lacre, status de
    confirmação (pendente/confirmada) e data de recebimento quando houver;
  · cards de total no topo: Saída · Entrada · Saldo (padrão Mobills, cores --cat-transferencias).
- A criação/edição REUSA o modal de transferência já existente (não duplicar formulário) — apenas
  dispare os eventos de "nova"/"editar" do workspace.
- Respeitar as permissões atuais (transferencias_visualizar / _criar / _editar).
- Se o backend de confirmação (Prompt A, Etapa 2) já estiver na branch, ligue o status de verdade;
  se não, mostre como somente leitura e marque data-pendente="regra".
- Responsivo nos breakpoints do projeto (1260/1024/768/560/390).

Branch: continue em feat/shell-mobills. NÃO MERGEAR.
```

---

## ▶ PROMPT D — Responsividade das 5 telas novas (por último)

> Auditoria de 27/07: as 5 telas novas foram feitas com **ZERO media queries**, enquanto o projeto
> já tem padrão responsivo maduro em `web-vue/assets/main.css`.

```
Corrija a RESPONSIVIDADE das telas novas. Elas foram construídas sem nenhuma media query e
quebram em telas menores. Esta rodada é SÓ layout/CSS.

REGRAS:
- NÃO mudar campos, rótulos, regras, lógica, api, db nem schema.
- NÃO remover nem renomear campos: a fidelidade aos desenhos do Rodrigo
  (PROJECT_BRAIN/14) tem que ser preservada em TODAS as larguras — em telas pequenas os campos
  EMPILHAM, nunca somem.
- Seguir o padrão responsivo que o projeto JÁ tem em web-vue/assets/main.css
  (breakpoints 1260 / 1024 / 768 / 720 / 560 / 400 / 390, sintaxe `@media (width <= Npx)`) e as
  regras de design-system/PROJECT_BRAIN/65_RESPONSIVE_UI_STANDARD.md. Não inventar breakpoints.
- Preferir CSS fluido (minmax, 1fr, clamp) a media query quando resolver igual.
- Nada de scroll horizontal em nenhuma largura. Área de toque >= 44px.
- Alvos de teste: 1440 · 1024 · 768 · 390.

POR COMPONENTE:

1) PermissoesGrade.vue — PRIORIDADE MÁXIMA
   Hoje: grid-template-columns: 120px repeat(9, 1fr) — 10 colunas fixas, inviável em <900px.
   Em telas largas manter a grade telas × 9 ações. Em médias/pequenas escolher e me explicar:
     (a) scroll horizontal APENAS na grade, com a coluna "Tela" sticky à esquerda; ou
     (b) cards: um card por tela, com as 9 ações em grid 3x3 dentro.
   Cabeçalhos abreviados devem continuar legíveis (tooltip com nome completo se precisar).

2) OperacaoLancamentoModal.vue — o form mais denso
   Linhas de 3 campos (Valor|Juros|Valor Total e Data Lanç|Data Doc.Fiscal|N° Doc.Fiscal) viram
   2 colunas em tablet e 1 no celular. Recorrência empilha. As duas fotos lado a lado no desktop,
   empilhadas no celular. Modal fullscreen em <=560px com rodapé de ações sempre alcançável.

3) OperacaoTransferenciaModal.vue
   Trocar max-width="470" fixo por largura responsiva (fullscreen em <=560px).
   Origem→Destino lado a lado no desktop, empilhado no celular. Linhas repetíveis do bloco
   Retorno/Sangria empilham. Resumo (Saída/Entrada/Saldo) sempre visível.

4) MalotesList.vue
   No celular, valor e status vão para baixo do lacre (não espremer à direita).

5) CaixaResumoPage.vue (cockpit)
   Ajustar breakpoints das colunas para os cards de total não ficarem estreitos em tablet; seções
   por categoria empilham no celular mantendo barra de cor e total visíveis.

VERIFICAÇÃO obrigatória: rodar e conferir as 5 telas em 1440, 1024, 768 e 390. Se alguma não
couber sem sacrificar campo, PARE e proponha alternativa (ex.: seção colapsável) — não esconda
informação por conta própria.
lint + check + testes de front verdes. Um commit:
"fix(ui): responsividade das telas novas (1440/1024/768/390)". NÃO MERGEAR.
```
