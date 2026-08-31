# 69 — Plano do design novo (agosto/2026)

> Documento de **plano e decisões** da frente de Design. O design system continua sendo o `67`.
> O relatório do que já foi feito em 01/08 continua sendo o `68`.
> Este aqui responde: **o que falta, em que ordem, e por quê.**

**Estabelecido em 27/08/2026.** Nasceu porque a fila estava viva em três arquivos fora do
repositório e começou a se contradizer — dois itens do plano original sumiram sem ninguém notar
(VIS-03 e VIS-06) e pedidos novos entraram na frente deles. Prompt é instrução descartável; a
decisão mora aqui (`16`, "onde as decisões vivem").

---

## 1. A regra-mãe desta frente

> **Manter o sistema igual — menu, cores, permissões, rotas, regras — e aplicar só o layout
> novo, corrigindo toda a responsividade.**

Decidido por Marco em 26/08. Tudo abaixo decorre disso.

### 1.1 A regra dura da cor

**Nenhuma cor do sistema muda. Zero hex novo.** Reforçada por Marco em 26/08 e reconfirmada em
27/08 quando ele pediu "gradiente moderno" e depois escolheu manter a regra.

Congelado: `--cx-brand` `#6515dd` · as seis categorias do `web-vue/utils/cores-categoria.ts` ·
todas as derivadas · o `CATEGORIA_POR_TELA` · todos os `--cx-*` · a cadeia `--empresa-*` →
`--cx-*` → alias · os 34 pares de contraste medidos.

**Isto não é só texto: virou guardião.** `VIS-00` lê os blocos datados desta frente no `main.css`
e **falha o build** se achar hex, `rgb()` ou `hsl()` literal. A regra parou de depender de alguém
lembrar dela.

**Quatro fontes independentes convergem contra gradiente decorativo**, e sustentam a decisão:
a própria regra; a skill `product-ui-design` (gradiente roxo-azul é "AI tell"); o
`linear.app/DESIGN.md` (_"Don't add atmospheric gradients or spotlight cards"_); e o
`supabase/DESIGN.md` (_"Don't add atmospheric gradients to hero bands"_).

**O que dá cor à interface são as seis categorias que já existem.** Entradas amarelo,
transferências laranja, despesas vermelho, mercadorias verde, retiradas azul, resultado roxo.
Já é uma paleta viva; ela só não era usada fora do menu.

### 1.2 A lição que custou três itens

Três blocos foram escritos para consertar coisas que **não estavam quebradas**: `SHELL-02`
(o botão já media 48px), `VIS-01` (o defeito era de outro sistema) e a primeira versão do
`VIS-04` (a primária não é `--cx-brand`, é a cor de categoria injetada pelo `aplicarTema`).

**Regra permanente daqui em diante:** antes de escrever qualquer item, provar que o alvo existe
neste worktree e medir o **valor computado**. Seletor morto não implica requisito violado; um
piso que nunca encosta não conserta nada. Bloco que não muda nada é dívida, não entrega.

---

## 2. Onde a frente está em 27/08/2026

Branch de topo: `feat/vis-lote-e1-home-navegavel`. As branches **empilham** — cada uma nasce do
HEAD da anterior, nunca de `origin/main`, porque esta frente não faz merge na `main` e uma branch
nascida da `main` perde todos os consertos anteriores (foi o defeito do SHELL-02, seção 4 do
checkpoint de 26/08).

### Entregue

| Item           | O que resolveu                                                                 |
| -------------- | ------------------------------------------------------------------------------ |
| SHELL-01       | menu ancorado no topo; acabou o vão entre grupos nos perfis com poucas telas   |
| SHELL-02 + 02b | trava de 44px no botão de menu; o comentário declara que é trava, não conserto |
| VIS-00         | guardião "zero hex novo" que falha o build                                     |
| VIS-02         | cartão: raio, respiro, cabeçalho separado, contorno no escuro em vez de sombra |
| VIS-04 + 04b   | hierarquia e alvo de botão, sem tocar em cor                                   |
| VIS-05         | chip de dica legível no tema escuro                                            |
| VIS-07         | cápsula do item ativo do menu — o elemento-assinatura                          |
| VIS-08         | estado vazio visível em 390px                                                  |
| VIS-12         | rail sem barra de rolagem horizontal                                           |
| E-1a/E-1b      | home deixa de ser recado e vira atalho; topbar ganha o caminho de volta        |

### Aberto

| Item       | O que é                                             | Por que importa                                        |
| ---------- | --------------------------------------------------- | ------------------------------------------------------ |
| **VIS-10** | **Cabeçalho de tela**                               | **O maior ganho isolado da frente.** Muda as ~40 telas |
| VIS-03     | tabela: tokenizar, tirar `!important`, raio cravado | sumiu do Lote B sem ninguém notar                      |
| VIS-06     | paginação: alinhamento, estado, alvo                | sumiu do Lote B junto com o VIS-03                     |
| VIS-13     | logo certa em cada tema                             | `login.vue` e `index.vue` cravam a logo clara          |
| SHELL-06   | limpeza dos seletores mortos S2/S3                  | depende do VIS-10                                      |

---

## 3. Decisões tomadas

| #          | Decisão                                                                                                                                                                                                                 | Quando |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **D-02**   | A Direção C do Stitch é a direção oficial, nos limites do §2 da proposta                                                                                                                                                | 26/08  |
| **D-04**   | O título da tela vive **só na página**. O `.topbar-page-id` é removido                                                                                                                                                  | 26/08  |
| **D-01**   | **Noto Sans permanece.** Trocar fonte exige aprovação (`67` §8)                                                                                                                                                         | 26/08  |
| **D-06**   | No claro o card se separa por elevação; no escuro por luminância + `--cx-line-soft`                                                                                                                                     | 26/08  |
| **D-COR**  | Zero hex novo. A home usa as seis categorias existentes                                                                                                                                                                 | 27/08  |
| **D-HOME** | A home não espelha o menu: até 6 favoritos por estrela + espaço de relatórios. **DECIDIDA, NÃO IMPLEMENTADA** — o E-1a entregou a home espelhando o menu com 32 atalhos, e a decisão é posterior à entrega. É a Etapa 2 | 27/08  |
| **D-05**   | Filete de categoria no card: **suspenso**, acrescentaria lugar onde a cor aparece                                                                                                                                       | 26/08  |

| **D-LOGIN-VIDRO** | O cartão das telas de entrada é de **vidro**. Única exceção aberta ao `67` §10 ("nunca em card de conteúdo e nunca atrás de texto de leitura"), e vale só para `login`, `forgot-password` e `reset-password` | 28/08 |
| **D-LOGIN-ESCURO** | As telas de entrada abrem **sempre no escuro**, para todos. A escolha claro/escuro continua existindo dentro do sistema | 28/08 |
| **D-VIS-E5a** | O gradiente da marca (`--cx-brand-gradiente`) **alcança o FAB "+ NOVO"**. O banner do VIS-E5c que diz o contrário está desatualizado | 27/08 |

**D-LOGIN-VIDRO — por que a exceção se sustenta.** A regra do `67` §10 existe porque vidro atrás de
texto de leitura entrega o contraste a um fundo que o sistema **não controla**: conteúdo rolando,
tabela, imagem. Na tela de entrada o fundo é conhecido, é nosso e não rola — são sete manchas cuja
cor, posição e força nós escolhemos. O risco que a regra previne não existe ali.
A opacidade não foi escolhida, foi medida em **24 instantes** da animação ao longo de 120s, porque
as manchas se movem e um quadro só não representa o pior caso. Em 78%: 5,30:1 no claro e 7,15:1 no
escuro. Piso conhecido: 70% ainda passa (5,11 / 7,00).
**A ordem da correção é fixa:** se reprovar, sobe a opacidade do vidro. Nunca clareia o texto.

**D-LOGIN-ESCURO — o que ela obriga.** O gradiente do fundo não ficou bom no tema claro, e manter
duas versões do mesmo desenho é dívida. A entrada passa a ter um tema só.
Isto **revoga em parte** o item "login responsivo aos dois temas": o login não precisa mais
funcionar bem no claro, porque não abre no claro.
É **comportamento novo numa tela que não deveria ganhar controle**, e por isso fica registrado: a
exceção é autorizada por Marco. As duas regras que a tornam segura:

1. as telas de entrada **leem e devolvem** a preferência, e **nunca gravam**. Se gravassem "dark",
   quem prefere claro perderia a escolha só por passar pelo login — e passar pelo login é
   obrigatório;
2. restauram **duas** coisas ao sair: o `data-theme` do `<html>` e o tema do **Vuetify**. Esquecer o
   segundo deixa os componentes calculados como claros por dentro — foi o sintoma que apareceu
   quando a medição forçava só o atributo.

Como o projeto é `ssr: false`, o atributo também é escrito por um **script inline no `<head>`**
(`nuxt.config.ts`): sem ele a tela ficava clara até **1422ms** antes de virar escura. A lista de
rotas do script e a do `useTemaEntrada` têm de andar juntas; mudar uma sem a outra traz a piscada
de volta.

| **D-PAINEL-ADMIN** | As faixas de NÚMERO do painel são de **administrador total** (`usuario_admin`). O `admin` legado **não** entra. A faixa 4 ("Ir para") continua para todos | 28/08 |
| **D-LOGO-ANIMADA** | O símbolo da Cicluz é **animado** no rail, no menu aberto e no login. Não entra na home | 28/08 |

**D-PAINEL-ADMIN — o que ela obriga, e o que quase deu errado.** O painel mostra dinheiro do
negócio inteiro; isso é leitura de **dono**, não de operação, e não é a mesma pergunta que "pode
abrir a tela".

Não nasceu permissão nova, e não podia: **`permissoesAcessoTotal` não é uma permissão** — é
`readonly Permissao[]` (`shared/src/autenticacao/index.ts:276`), um catálogo derivado, e
`temPermissao("permissoesAcessoTotal")` não compila. Nenhuma das ~250 permissões do enum significa
administrador: quem responde isso é o **role**.

A função é `ehAdministradorTotal(perfil)`, irmã da `podeLancarSemCaixa` no mesmo arquivo e pelo
mesmo motivo já documentado lá: a tela precisa da mesma resposta que o servidor, e copiar a regra
no front criaria duas verdades.

**Só `usuario_admin`, e a diferença para a irmã é deliberada.** A `podeLancarSemCaixa` aceita
`admin` também porque responde outra pergunta ("é retaguarda?"). Copiar o teste dela seria
vazamento: o legado veria o número do negócio inteiro por herdar um nome. O sistema diz isso em
três lugares — `api/src/auth/perfil.service.ts:10` ("o role admin NÃO tem efeito especial"), a
linha 12 do mesmo arquivo (só `usuario_admin` recebe `permissoesAcessoTotal`) e o rótulo que o
usuário lê em `WorkspaceDialogs.vue:14-17`.

**Um ponto de chamada só**, no `AppWorkspace`, descendo como booleano. Marco já pediu, para depois,
uma aba que define o que cada usuário vê no painel; com a função consultada em cada faixa, o
configurador teria de achar todos os pontos.

**Dois filtros em série:** ser administrador decide se a faixa **existe**; o `metricasPermitidas`
continua decidindo, card a card, quem já podia ver o dado.

**D-LOGO-ANIMADA — os três lugares e a armadilha.** Rail (só símbolo, 52px), menu aberto (símbolo

- palavra, lateral, 52px) e login (empilhado, símbolo responsivo). **Não** entra na home: com a
  sidebar recolhida, o símbolo do rail e o do cabeçalho ficavam na mesma dobra com a mesma animação.

A armadilha é o movimento reduzido: a animação é **SMIL** (`<animate>` nativo do SVG), e **SMIL não
obedece CSS**. O reset global do projeto zera `animation-duration` e não alcança um `<animate>` —
sem tratamento em código a preferência seria ignorada e ninguém notaria, porque o reset _parece_
cobrir tudo. Resolvido com `pauseAnimations()`, que mantém o símbolo visível e parado.

Custo medido, navegador com GPU: menu aberto 52 fps (escuro) e 57 (claro) contra ~60 de linha de
base. `glowIntensity` **não** é alavanca de desempenho — com glow 0 o número não muda, porque os
três `feGaussianBlur` rodam de qualquer jeito.

### Abertas

- **D-03** — 360px entra no checklist ou é descartado por escrito? (`67` §13.7)
- **D-07** — `R$` duplicado em `OperacoesPage.vue:121` (`68` §6.1). Tela de negócio
- **D-08** — chips de permissão com hex cravado no `PermissoesGrade` (`68` §6.2). Tela de negócio
- **R-097** — menu por categoria ou por setor? **Não bloqueia esta frente**, porque Marco decidiu
  em 27/08 manter o menu exatamente como está
- **D-SIMBOLO** — o símbolo colorido da Cicluz depende de **arte nova** para virar vetor de verdade.
  Ver o item no `ROTEIRO-DESIGN-ATE-O-FIM.md`: o que existe hoje não permite o gradiente animado que
  Marco pediu

---

## 4. As quatro etapas até o fim

A ordem tem um motivo: **o cabeçalho de tela muda ~40 telas; a home muda uma.** Fazer a home
primeiro deixa ela bonita e o resto do sistema com a cara antiga — e aí é a home que destoa.

### Etapa 1 · Fechar o design das telas · ~6h

`VIS-13` (logo) → `VIS-03` (tabela) → `VIS-06` (paginação) → `VIS-10` (cabeçalho de tela).

O `VIS-10` é o item que "faz parecer novo": título grande na página, subtítulo, ações à direita.
Ele **remove** o `.topbar-page-id` do `AppShell.vue:267` e unifica quatro cabeçalhos que já
existem espalhados — `CadastroTablePage.vue:66`, `PlaceholderPage.vue:11`,
`OperacoesPage.vue:114`, `TesourariaCockpit.vue:127`. É a `16` sendo cumprida, não dívida sendo
criada.

### Etapa 2 · Home definitiva · ~4h

> **O que está no ar hoje NÃO é isto.** O E-1a entregou a home espelhando o menu com 32 atalhos
> em lista. A D-HOME veio depois. Esta etapa é o que substitui aquilo — e o caminho antigo (a
> lista de 32) tem de ser REMOVIDO, não empilhado ao lado dos blocos novos (`16`, regra-mãe).

Evolui o E-1, que já entregou `AppAtalhosTelas.vue` (53 linhas) e `atalhos-home.ts` com teste.
A lista de atalhos vira **grid de blocos quadrados** tipo springboard, um por categoria, com a
cor dela; título de seção com o vidro que já existe (`--cx-chrome-blur`); e uma faixa
**reservada** para relatórios, rotulada e sem conteúdo inventado.

### Etapa 3 · Favoritos no banco · ~6h · **sai da frente de Design**

Toca `db` e `api`, território da frente do Caixa. Exige verificação de colisão antes e **parada
obrigatória antes de aplicar a migration** (`AGENTS` §4.6). É entrega vertical: tela + backend +
teste, ou não vem (`16` R2).

### Etapa 4 · Fechamento · ~2h

Revisão dos commits, `SHELL-06` (limpeza dos seletores mortos, depois do VIS-10), e integração
na `main` em ondas.

---

## 5. Regras de convivência com as frentes paralelas

Existem três frentes na mesma máquina: **Design**, **Caixa** e **Cadastro de Colaboradores**.
O sistema opera de verdade todos os dias (`AGENTS` §2). As regras completas estão em
`Planejamento/STATUS-DESIGN-ATUAL.md` como RD-01 a RD-04. Em resumo:

1. **Integração em ondas, nunca no fim.** Branch antiga não se "adapta", se rebase à mão.
2. **Verificação de janela de colisão antes de cada item**, com a saída colada no relatório.
3. **Nada quebra o sistema rodando:** bloco aditivo e reversível por deleção, bloco congelado
   intocado, e nenhuma tag sai de template sem antes descobrir quem a renderiza.
4. **Territórios disjuntos:** Design fica no fim do `main.css` e em templates de apresentação;
   Caixa em `api`/`db`/`tests`. A Etapa 3 é a exceção declarada, e por isso exige a checagem.

---

## 6. Referências externas

- `Referencias/Design/design-md/` — os `DESIGN.md` de **linear.app**, **supabase** e
  **voltagent**. Servem como referência de **rigor e restrição**, nunca de paleta.
- `Referencias/Design/` — o ZIP do Stitch com a Direção C e as nove telas de módulo, mais as
  capturas do sistema real e os SVG da marca.
- Skill `product-ui-design` — mata os sinais de "cara de IA": gradiente roxo-azul, glow em
  indicador de status, rótulo em monospace, par de botões preenchido+fantasma, faixa de quatro
  cards de estatística.

**Nenhuma delas vence o `67`, o `16` ou o código real.**
