# 24 · Cadastro de Produtos — estado real e o que falta

> **Atualização 26/10/2026 — R-222:** o app Cadastro de Produtos em uso nas lojas é a fonte oficial
> para funções e dados, inclusive fiscais. As decisões R-145/R-165 descritas abaixo estão revogadas
> para o trabalho de integração e preservadas como histórico. Não aposentar o app da loja até a
> paridade ser entregue e validada. Plano atual: `56_INTEGRACAO_CADASTRO_PRODUTOS_R-222.md`.

> Escrito em 05/08/2026, resgatando `PROJECT_BRAIN - Copia/62_PRALIS_CADASTRO_PRODUTOS.md` antes de
> arquivá-lo, **depois de conferir tudo contra o código**.
>
> **Este documento corrige um erro do brain.** O bloco de 04/08 em `19_REGISTRO_DE_REGRAS.md` dizia
> "Produto, estoque e compras — módulo não iniciado" e marcava R-145, R-146 e R-147 como ❌. **Três
> das quatro estavam erradas.** O módulo existe, está implementado com fidelidade e tem 20 testes.
> Os status foram corrigidos no `19`.

---

## §1 · O que JÁ existe e está testado

**Regras puras** — `shared/src/produtos/regras.ts` (148 linhas): `arredondar`,
`calcularPrecoVenda`, `calcularPrecoVendaComPromocao`, `montarDescricao`, `montarValidacaoQtd`,
`montarComoSeCompra`, `resolverMargemGrupo`.

**Tabelas** — `produtos`, `produtos_fiscal` (1:1), `produtos_transformacao` (1:1),
`produtos_promocoes` (1:N) e `produtos_conversoes`. A última é criação do ERP, não veio do Pralis.

**API** — `api/src/produtos/` (controller 98 · service 196 · repository 488 linhas), com
`GET/POST/PUT /api/produtos` mais importar e exportar, cada rota atrás de
`exigirPermissao("cadastro_produtos_*")`.

**Tela** — seções Identidade · Como se compra · Comercial · Fiscal · Transformação · Promoção em
`web-vue/components/workspace/WorkspaceDialogs.vue`, com **preview de preço ao vivo** e preview de
"como se compra".

**Testes** — 16 unitários em `tests/unit/produtos-regras.test.ts` + 4 de integração em
`tests/integration/produtos/produtos-preco.test.ts`.

**Regras confirmadas no código:**

| Regra                                                                                   | Estado real                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-146** — dois tipos (revenda/transformação); preço = custo × margem com opção manual | ✅ CHECK `('revenda','transformacao')` em `app.schema.ts:619`; `calcularPrecoVenda` com flag `auto`                                                                                                                                                                                                                                                                                    |
| **R-147** — promoção só dentro da janela de vigência                                    | ✅ **parcial.** `produtos_promocoes` tem tipo (valor\|desconto), `horaInicio`/`horaFim`, sete booleanos de dia e `validaAte`; `calcularPrecoVendaComPromocao` aplica dia + janela. **Falta o "mesmo código"**, que depende da integração com o PDV                                                                                                                                     |
| **R-145** — dados fiscais da planilha NÃO entram                                        | ✅ `scripts/seed-planilha.ts` não escreve nenhum campo fiscal (zero ocorrências de `fiscal`/`ncm`/`icms`). Ver a ressalva no §4                                                                                                                                                                                                                                                        |
| **R-148** — pedido automático no estoque mínimo                                         | ⚠️ **parcial — corrigido em 12/08.** A afirmação "nenhuma lógica de disparo" estava errada: existem `POST /api/pedidos/gerar-automatico` (`pedidos.controller.ts:34`), a regra pura `gerarItensReposicao` (`shared/src/pedidos/index.ts:104`, sugere `max - atual` quando `atual <= min`) e o ciclo `rascunho → aprovado`. **Falta** o rascunho que se auto-aprova ao atingir o mínimo |

Também já implementados: código interno sequencial por empresa (com `uniqueIndex` e preservação na
importação entre empresas), "como se compra" (`embalagem` + `cDe` + `quantidadeCaixa` +
`medidaCompra`), descrição montada automaticamente com override manual, e unidades vindas do cadastro
(`unidades_medida`) em vez de enum.

---

## §2 · Duas decisões que só existiam como sigla no código

`ADR-002` e `ADR-003` aparecem em comentários do código e **não existem em documento nenhum**.
Registradas aqui:

- **ADR-002 · O preço de venda é decisão do servidor.** Com `auto=true`, o valor enviado pelo cliente
  é **ignorado e recalculado** (`produtos.service.ts:70-84`). O front usa a mesma função só para
  preview, para que preview e valor salvo nunca divirjam.
- **ADR-003 · O preço com promoção é derivado na leitura, nunca persistido.** `listarProdutos`
  devolve `precoVendaAtual` calculado com o `agora`.

Por trás das duas está a decisão maior, registrada só no documento arquivado:
**o preço no ERP é referência de catálogo, não preço de venda** — as vendas seguem do CREARE e o ERP
não dita o PDV por enquanto.

> Isso responde em parte à pergunta em aberto do `21` §5 ("a promoção sai do cadastro e vira botão
> separado?"): a arquitetura **já** trata promoção como satélite do produto, e o preço promocional
> nunca é gravado no cadastro.

---

## §3 · O que falta — pauta concreta para a etapa de Compras

**1. Margem por grupo: a regra existe, a coluna não, e o dado está na planilha.**
`resolverMargemGrupo()` foi portada e **nunca é chamada** — `produtos.service.ts:81` e
`shared/src/cadastros/index.ts:153` passam `margemGrupo: 0` cravado, porque
`grupos_mercadorias` (`app.schema.ts:398`) não tem coluna `margem`. E o dado existe: o seed **lê**
`MARGEM %` da coluna L da aba `GRUPOSREF` e o descarta explicitamente
(`scripts/seed-planilha.ts:284-286`, relatório na linha 550). Consequência: **a margem tem que ser
digitada produto a produto**. É uma migration aditiva de uma coluna.

**2. Cadastro de marcas.** `produtos.marca` é `text` livre, sem cadastro nem FK — ao contrário de
grupos e unidades, que têm cadastro próprio.

**3. Tela de busca e edição de produto.** É o B-07 da reunião: hoje não dá para dar desconto num
produto sem recadastrá-lo.

**4. Desempate de promoções sobrepostas.** `calcularPrecoVendaComPromocao` aplica **a primeira
promoção ativa do array** (`regras.ts:80`). Não há critério quando duas são válidas ao mesmo tempo
(ex.: uma de 10h-12h e uma de "segunda o dia todo") — o comportamento depende da ordem de inserção no
banco. **Pergunta de produto em aberto.**

**5. `refReceituario`.** O Pralis tinha dois campos de receituário; o ERP portou só
`produtoReceituario`. Relevante porque ficha técnica é uma das perguntas em aberto do `21` §5.

**6. Abas × seções.** O documento antigo previa **abas** no formulário; o que existe são **seções
empilhadas num modal único**. Se abas ainda forem o alvo, é decisão não registrada.

**7. Telas já cadastradas e escondidas.** `promocoes`, `estoque_produtos`, `fiscal_produtos` e
`ficha_tecnica` **já existem** em `web-vue/utils/domain.ts` com permissão própria, mas estão em
`telasOcultasNoDrawerEPermissoes`. Isso responde em parte à pergunta do `21` §5 sobre o estoque ter
menu próprio: **o esqueleto já foi decidido, só está oculto.**

---

## §4 · ~~Ressalva a levantar com o José — conflito de fontes~~ · RESOLVIDO pela R-165 (12/08/2026)

> 🕰️ **Histórico.** Esta seção descrevia um conflito que **não existe mais**. Mantida porque explica
> por que o importador do Pralis existiu e por que ele foi removido.

O que existia até 12/08: **dois importadores ativos gravando na mesma tabela, com fontes diferentes**.

- ~~`api/src/scripts/importar-pralis.ts`~~ — decisão de 03/07 (_"Pralis é a fonte de verdade"_), que
  trazia o bloco `fiscal` completo. **Decisão REVOGADA e arquivo REMOVIDO pela R-165.**
- `scripts/seed-planilha.ts` — R-145, de 04/08: a fonte é a **planilha do Rodrigo**, e **dado fiscal
  não entra** porque está errado e causa pagamento de imposto a maior. **É a única porta que cria
  produto em massa hoje.**

**Decisão vigente (R-165, José, 12/08):** somente a planilha do Rodrigo cria produto. O Pralis é
referência visual/histórica, não fonte executável. Enriquecimento futuro dos campos comerciais só
poderá agir sobre produto já conciliado, nunca criar, e depende de nova autorização.

---

## §5 · Regra de negócio que existe no código e não tinha dono

**Produto duplicado bloqueia, com escape consciente.** `produtos.service.ts:62-68` recusa salvar
produto com a mesma descrição ou o mesmo código de barras na mesma empresa, e a mensagem diz **quem
cadastrou o original** (_"Já existe o produto X nesta loja (cadastrado por Fulano)"_). O bypass é o
flag `forcar` no payload — o "cadastrar mesmo assim".

---

## §6 · O que foi descartado do documento antigo

- **Stack do Pralis** (tsyringe, Cloudinary, Resend, auth JWT + Argon2) — nada foi adotado; a auth é
  better-auth por decisão.
- **Multi-loja BASE/TNP/LI/HORA** — substituído por `empresa_id` + `importadoDe`/`idImportado`. O
  conceito de catálogo BASE não existe no ERP.
- **Plano A0/A1/A2** — executado.
- **BUG-02** (margem "0,7" virando 0,7% em vez de 70%) — já resolvido em
  `shared/src/cadastros/index.ts:132`, com o comentário creditando o documento antigo.
- **`habilitarAjuda`** — não foi portado, e não faz falta.
