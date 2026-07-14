# Unificação — Sistema Caixa (ERP) × Pralis (Cadastro de Produtos)

> Como os dois sistemas se encaixam, onde colidem e o caminho recomendado para virarem **um só
> sistema**. Companheiro de [VISAO-GERAL.md](VISAO-GERAL.md) e [ANALISE.md](ANALISE.md).

---

## 1. A descoberta principal: eles são complementares, não redundantes

|             | **Pralis** (Cadastro de Produtos)                                                                           | **Sistema Caixa** (ERP)                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Estado      | ✅ **Em produção** (`produtos.cicluzieai.com.br`)                                                           | 🟡 MVP/staging (repo de dias)                                    |
| Escopo      | Só **catálogo de produtos** (rico)                                                                          | ERP **operacional** inteiro                                      |
| Produto     | custo, **margem, preço de venda, promoção, fiscal, transformação**, foto, status, código interno sequencial | **catálogo fino**: código, descrição, marca, unidade, conversões |
| Multi-local | `loja` = BASE/TNP/LI/HORA                                                                                   | `empresa_id` (multiempresa)                                      |
| Auth        | **JWT + cookie httpOnly + Argon2** (próprio)                                                                | **better-auth** (sessão por token)                               |
| Stack       | Fastify 5 + Drizzle + Nuxt 4 + Vuetify + Zod                                                                | Fastify 5 + Drizzle + Nuxt 4 + Vuetify + Zod                     |

**Conclusão:** a stack é praticamente idêntica. O **único domínio que se sobrepõe é o produto** — e
nele o Pralis é muito mais maduro. O Sistema Caixa traz tudo o que o Pralis **não** tem (caixa,
vendas, despesas, compras, permissões, multiempresa). Não há retrabalho a jogar fora; há **um
catálogo a fundir**.

---

## 2. Os 4 pontos de atrito (e a resolução proposta)

### Atrito 1 — Modelo de produto duplicado

- Pralis: `products` (+ `product_transformacao`, `product_fiscal`, `promocoes`) com preço/margem.
- Caixa: `produtos` (+ `produtos_conversoes`) sem preço.
- **Resolução:** o **Sistema Caixa é o destino** (é o ERP, é multiempresa, tem o operacional). Migrar
  o **modelo rico do Pralis para dentro do schema do Caixa**, estendendo `produtos` com os campos
  comerciais e criando as tabelas `produtos_fiscal`, `produtos_transformacao`, `promocoes`.

### Atrito 2 — "Loja" (Pralis) × "Empresa" (Caixa)

- Pralis tem BASE/TNP/LI/HORA; Caixa tem `empresa_id` + import `importadoDe`/`idImportado`.
- **Resolução:** mapear cada **loja do Pralis → uma empresa** no Caixa. O conceito "BASE → importa
  para a loja" do Pralis **já existe** no Caixa (`importadoDe`/`idImportado`, empresa→empresa). É um
  encaixe quase 1:1.

### Atrito 3 — Autenticação divergente

- Pralis: JWT/cookie próprio; Caixa: better-auth.
- **Resolução:** **better-auth vence** (é o do ERP, mais padrão, já com permissões/multiempresa). O
  Pralis deixa de ter auth próprio quando virar módulo do Caixa. Custo: re-cadastrar/migrar usuários
  e mapear papéis (admin → `usuario_admin`).

### Atrito 4 — Contratos Zod e regras de negócio

- **Resolução:** portar as **regras puras** do Pralis (o ativo mais valioso) para `shared` do Caixa:
  `calcularVVenda` (custo÷qtCad × (1+margem)), `calcularVVendaFinal` (promoção por dia/horário),
  `montarDescricao`, `montarComoSeCompra`, `resolverMargemGrupo`. **São funções puras já testadas** —
  copiar `product.rules.ts` + `product.rules.test.ts` para `shared/src/produtos/` e adaptar nomes.

---

## 3. O que reaproveitar do Pralis (e quanto custa)

| Ativo                                                            | Reaproveitável    | Esforço | Ação                                           |
| ---------------------------------------------------------------- | ----------------- | ------- | ---------------------------------------------- |
| Regras puras (`product.rules.ts` + testes)                       | ~90%              | Baixo   | Copiar para `shared/src/produtos/regras.ts`    |
| Schema fiscal/transformação/promoção                             | ~70%              | Médio   | Recriar como tabelas Drizzle no Caixa          |
| Campos comerciais (custo/margem/preço/status/foto)               | 100%              | Médio   | Estender `produtos` no Caixa                   |
| Form de produto (`ProductForm.vue`) + leitor de código de barras | ~60%              | Médio   | Adaptar para `produtos.vue`/Workspace do Caixa |
| Upload de foto (Cloudinary)                                      | 100%              | Baixo   | Trazer o módulo `file`                         |
| Auth própria                                                     | ❌                | —       | Descartar (usar better-auth)                   |
| Conceito loja/BASE                                               | vira `empresa_id` | Baixo   | Mapear lojas→empresas                          |

---

## 4. Estratégia recomendada: **consolidar dentro do Sistema Caixa**

O Pralis está em produção, então **não se quebra o que funciona** até a paridade estar pronta.
Caminho em 4 fases (sem cutover abrupto):

**Fase A — Fundir contratos e regras (baixo risco, não toca produção)**

1. Portar regras puras do Pralis para `shared/src/produtos/` (com os testes).
2. Estender o contrato `produtoPayloadSchema` do Caixa com: `custo`, `margem`, `precoVenda`/`auto`,
   `status`, `tipo` (revenda/transformação), `fiscal`, `promocoes`.

**Fase B — Estender o schema do Caixa** 3. Migration: novos campos em `produtos` + tabelas `produtos_fiscal`, `produtos_transformacao`,
`promocoes`. (Pedir aprovação — `AGENTS.md` proíbe migration sem ordem explícita.) 4. Atualizar service/repository de produtos do Caixa para gravar/validar o modelo rico.

**Fase C — UI de produto no Caixa** 5. Trazer o formulário de produto (revenda × transformação, fiscal, promoção, preview de preço ao
vivo usando as regras compartilhadas) para a tela `produtos.vue` do Caixa.

**Fase D — Migração de dados e desligamento do Pralis** 6. Migrar produtos de produção do Pralis → empresas correspondentes no Caixa (lojas→empresas,
preservando código interno). 7. Migrar/recriar usuários no better-auth. 8. Cutover; Pralis isolado é descontinuado (vira o módulo "produtos" do ERP).

> **Resultado:** 1 repositório, 1 banco, 1 API, 1 front, auth única, produto com preço/margem/
> promoção/fiscal **dentro** do ERP que já faz caixa, vendas e compras.

---

## 5. Decisões de negócio a confirmar antes de codar (Fase B+)

1. **Loja → Empresa é 1:1?** TNP/LI/HORA viram 3 empresas? Onde fica a "BASE" (empresa-modelo de
   catálogo)?
2. **Preço por empresa ou global?** No Pralis custo/margem são por loja. Manter por `empresa_id`?
3. **Pricing também alimenta vendas/PDV?** Hoje o preço de venda do Pralis não conversa com as vendas
   do Caixa (que vêm do CREARE). Definir a fonte de verdade do preço no PDV.
4. **Estoque entra agora?** (item B2 da [ANALISE.md](ANALISE.md)) — decide se mercadorias passam a
   movimentar saldo por produto.
5. **Migração de usuários:** re-cadastro com nova senha (e-mail de reset) ou importação de hashes?
   (Argon2 → better-auth normalmente exige reset.)
   </content>
