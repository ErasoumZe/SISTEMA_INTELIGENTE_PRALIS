# 28 · Cadastro de Produtos — o app Pralis × o ERP, e como fundir

> 05/08/2026. Comparação campo a campo entre a aplicação **Pralis standalone**
> (`CADASTRO DE PRODUTOS/pralis/`) e o módulo de produtos que já existe no ERP.
>
> Complementa o `24`, que já havia detectado que o módulo existe. Este documento vai ao detalhe e
> responde à pergunta prática: **o que ainda falta trazer, e como.**

---

## §0 · A conclusão, antes de tudo

**A migração já aconteceu — e foi bem feita.** O ERP não tem um esboço de cadastro de produtos: tem o
modelo do Pralis portado com fidelidade, mais melhorias que o original não tem. Existe até um
importador dedicado (`api/src/scripts/importar-pralis.ts`, 322 linhas) que lê o
`base-products.json` do app antigo e entra **pela mesma porta do cadastro manual**.

O que **não** foi portado não é modelo nem regra — é **experiência de uso**. E é justamente o que faz
diferença para quem cadastra 150 produtos.

|                                 | Pralis standalone                              | ERP hoje                                                                       |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Modelo de dados                 | 31 colunas + 3 satélites                       | **as mesmas + `produtos_conversoes`**                                          |
| Preço de venda                  | calculado **só no cliente**, nunca persistido  | **autoritativo no servidor** (ADR-002), promoção derivada na leitura (ADR-003) |
| Permissão                       | 2 papéis (`admin`/`user`)                      | 247 permissões, escopo por empresa                                             |
| Multi-loja                      | coluna `loja` com 4 valores fixos              | multiempresa real com FK, importar/exportar entre empresas                     |
| Testes de produto               | 13 unit + 2 integração                         | **16 unit + 11 integração**                                                    |
| **Scanner de código de barras** | **✅ `@zxing/browser`, câmera traseira**       | ❌ campo de texto                                                              |
| **Upload de foto**              | **✅ Cloudinary, dropzone com drag&drop**      | ❌ campo "URL da foto"                                                         |
| **Ajuda contextual**            | **✅ 31 dicas, switch por produto**            | ❌                                                                             |
| **Listagem**                    | **✅ galeria, busca, 4 filtros, 6 ordenações** | ❌ tabela de 5 colunas, **sem busca**                                          |
| **Dashboard**                   | **✅ 3 gráficos ApexCharts**                   | ❌ nenhum gráfico no sistema inteiro                                           |

**As duas pontas usam Vuetify 3.12.8 e Nuxt 4.** A migração de tela é quase 1:1 — com uma ressalva
que vale ouro (§4.1).

---

## §1 · Mapa de campos, um a um

Legenda: ✅ existe igual · 🔄 existe com outro nome/forma · ❌ não foi portado · ➕ só no ERP

| Pralis (`products`)                                  | ERP (`produtos`)                                         |     | Observação                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------- | :-: | ------------------------------------------------------------------------------------------- |
| `id` text + uuidv7 na app                            | `id` uuid, `uuid_generate_v7()` no banco                 | 🔄  | ERP melhor: default no banco                                                                |
| `loja` (`BASE\|TNP\|LI\|HORA`)                       | `empresa_id` uuid FK                                     | 🔄  | enum virou entidade real                                                                    |
| `codigo` `PR-XXXX-XXXX`                              | `codigo`                                                 | ✅  | mesmo alfabeto sem I/O/0/1                                                                  |
| `base_product_id` (sem FK)                           | `importado_de` + `id_importado`                          | 🔄  | ERP rastreia empresa **e** id                                                               |
| `created_by_user_id` + `created_by_name`             | `criado_por` (text)                                      | 🔄  | ERP faz join com `perfis_usuarios`                                                          |
| `nome`                                               | `descricao`                                              | 🔄  | **renomeado**                                                                               |
| `quantidade`                                         | `quantidade_individual`                                  | 🔄  |                                                                                             |
| `medida_base` (texto `UN\|KG\|...`)                  | `unidade_individual_id` FK                               | 🔄  | ERP melhor: cadastro em vez de enum                                                         |
| `codigo_barras`                                      | `codigo_barras`                                          | ✅  | **sem unique nos dois**                                                                     |
| `marca` (texto livre)                                | `marca` (texto livre)                                    | ✅  | dívida idêntica: sem cadastro                                                               |
| `embalagem`, `c_de`, `qt_cad`, `medida_compra`       | `embalagem`, `c_de`, `quantidade_caixa`, `medida_compra` | ✅  |                                                                                             |
| `codigo_interno`                                     | `codigo_interno`                                         | 🔄  | ERP tem **UNIQUE (empresa, código)**; Pralis não tem                                        |
| `foto_url`                                           | `foto_url`                                               | ✅  | mas sem upload no ERP (§3.2)                                                                |
| `grupo` (texto, **sem input na tela**)               | `grupo_mercadoria_id` FK                                 | 🔄  | ERP melhor, e com select                                                                    |
| `tipo`, `status`                                     | idem, **com CHECK**                                      | ✅  |                                                                                             |
| `estoque_min/max`, `setor_estoque`                   | idem                                                     | ✅  |                                                                                             |
| `custo`, `margem_pontual`, `v_venda_pontual`, `auto` | `custo`, `margem`, `preco_venda`, `auto`                 | 🔄  | ERP recalcula no servidor                                                                   |
| `local_venda_1/2`                                    | idem                                                     | ✅  | inertes nos dois                                                                            |
| **`habilitar_ajuda`**                                | —                                                        | ❌  | **a perda mais sentida** (§3.3)                                                             |
| `product_fiscal` (10 campos)                         | `produtos_fiscal` (10 campos)                            | ✅  | idênticos, inclusive a inconsistência de unidade                                            |
| `product_transformacao`                              | `produtos_transformacao`                                 | 🔄  | ERP **não portou `ref_receituario`** — correto, o backlog do Pralis mandava remover (DB-08) |
| `promocoes` (N)                                      | `produtos_promocoes` (N)                                 | ✅  | ERP acrescenta `valida_ate` (gravada e nunca lida)                                          |
| —                                                    | **`produtos_conversoes`**                                | ➕  | criação do ERP, não existe no Pralis                                                        |
| —                                                    | `quantidade_estoque`                                     | ➕  |                                                                                             |

**Nenhum campo do Pralis ficou de fora por engano.** Os dois ausentes foram decisões:
`ref_receituario` (o próprio backlog mandava matar) e `habilitar_ajuda` (que vale recuperar).

---

## §2 · Regras — as duas bases são a mesma, com um bug herdado

As 7 funções puras foram portadas com fidelidade e os testes provam os mesmos valores canônicos
(84,90 ÷ 30 × 1,70 = **4,81** nos dois).

| Regra                                    | Pralis                      | ERP                                 |
| ---------------------------------------- | --------------------------- | ----------------------------------- |
| `calcularVVenda` / `calcularPrecoVenda`  | idêntica                    | idêntica, **e chamada no servidor** |
| `calcularVVendaFinal` / `...ComPromocao` | idêntica, **órfã**          | idêntica, **usada** na listagem     |
| `montarDescricao`                        | idêntica                    | idêntica                            |
| `montarValidacaoQtd`                     | idêntica                    | idêntica                            |
| `montarComoSeCompra`                     | **órfã**                    | **órfã**                            |
| `resolverMargemGrupo`                    | **órfã** (`margemGrupo: 0`) | **órfã** (`margemGrupo: 0`)         |

### 🐛 O ERP herdou dois defeitos do Pralis. Vale corrigir agora, não depois.

**1 · "Como se compra" tem duas implementações divergentes — nos dois sistemas.**
A regra compartilhada (com teste) produz `"1 SACO DE25 (FARINHA... 25 KG)"`. A tela implementou um
formato **diferente e sem teste**: `"Saco de 25 KG — FARINHA... 25 KG"`. Pralis:
`ProductForm.vue:97-103`. ERP: `WorkspaceDialogs.vue:100-109`. **O ERP copiou o preview da tela, não
a regra.** Um dos dois formatos tem que morrer.

**2 · A margem por grupo é letra morta em ambos.**
`resolverMargemGrupo` existe, tem teste e **nunca é chamada** — os dois passam `margemGrupo: 0`
cravado. No Pralis, porque a tabela `grupos_mercadoria` (com `margem_padrao`) nunca é consultada. No
ERP, porque `grupos_mercadorias` **não tem coluna `margem`** — e o `seed-planilha.ts:549` **lê**
`MARGEM %` da planilha do Rodrigo e a descarta explicitamente.

Resultado prático nos dois: **a margem é digitada produto a produto.** É a tarefa **P-02** do backlog
(`#82`), e ela vale mais para o cadastro em massa do que qualquer melhoria de tela.

---

## §3 · O que realmente falta trazer

Em ordem de valor para quem vai cadastrar produto de verdade.

### 3.1 · Busca e filtros na listagem 🔴

Hoje o ERP não tem **busca** na tela de produtos. O campo de busca do `CadastroTable.vue:147-184` só
renderiza com `modoServidor=true`, e `pages/produtos.vue` não passa essa prop. Só há paginação
client-side sobre a lista inteira já carregada — e a listagem carrega **todos os satélites de todas as
empresas sem WHERE** (`produtos.repository.ts:71-165`).

Com 150 produtos passa. Com o mix real de uma rede de padarias, não.

O Pralis tem: busca server-side, painel de filtros retrátil com badge de contagem (Status, Tipo,
Setor, Grupo) e 6 ordenações — inclusive por código interno crescente e decrescente
(`index.vue:38-92`).

**Ressalva honesta:** os filtros e a ordenação do Pralis são **client-side**, e ele também não tem
paginação no servidor. Copiar como está herda o mesmo teto. O certo é levar o **desenho** e
implementar no servidor.

### 3.2 · Upload de foto 🔴

ERP: campo de texto `URL da foto`, sem sequer `.url()` no Zod. Ninguém vai hospedar imagem à mão para
150 produtos.

Pralis: dropzone com clique **e** drag&drop, preview 120px, Trocar/Remover, spinner, e
`POST /files` → Cloudinary com limite de 8 MB (`file.service.ts:20`).

**Decisão necessária:** o ERP não usa Cloudinary. Já existe upload multipart para **fotos de documento
de lançamento** (`useFotoDocumento.ts`), gravando em `/app/storage` com volume nomeado que sobrevive a
redeploy. **Reaproveitar esse caminho é melhor que introduzir Cloudinary** — menos um serviço externo,
menos uma chave, e o backup já cobre.

### 3.3 · Ajuda contextual ⭐

31 dicas de campo (`ProductForm.vue:111-141`) exibidas como `hint`, ligadas por um switch cuja
preferência é **gravada no produto** (`habilitar_ajuda`).

É a funcionalidade mais barata de portar e a de maior retorno para quem não é você usando a tela. Um
cadastro de produto tem ~40 campos, e metade deles ("C/ ou DE", "medida de compra", "precisão") não é
autoexplicativa.

Só sugiro uma mudança: a preferência deveria ser **do usuário**, não do produto.

### 3.4 · Scanner de código de barras por câmera

`@zxing/browser`, `BrowserMultiFormatReader`, `facingMode: 'environment'`, moldura sobreposta, para a
câmera ao fechar (`BarcodeScanner.vue`, 89 linhas). Autocontido e migra sem atrito.

O próprio Pralis registra que **leitores laser USB já digitam direto no campo** — a câmera é o caminho
mobile. Se o cadastro é feito no balcão com leitor, isso desce de prioridade.

### 3.5 · Dashboard com gráficos

3 gráficos ApexCharts (barra horizontal por usuário, donut ativos/inativos, área de cadastros por
dia), com tudo agregado em SQL (`admin.repository.ts:13-84`).

**Não recomendo portar agora.** O ERP não tem nenhuma lib de gráfico, e o Rodrigo pediu Curva ABC
(R-149) — outra tela, outros cortes. Introduzir ApexCharts para replicar um dashboard de cadastro
gasta a decisão de biblioteca no lugar errado. Guarde para a onda de Relatórios.

### 3.6 · O que NÃO trazer

- **`calcularVVendaFinal`, `resolverSetorVenda`, tabelas `grupos_mercadoria`/`locais_venda`/`setores`**
  — código morto no Pralis, nunca chamado.
- **`ref_receituario`** — o backlog do Pralis (DB-08) mandava remover; o ERP acertou em não portar.
- **`base-products.json`** — 150 produtos, mas o primeiro registro é literalmente `"TESTE"`, os nomes
  de grupo têm caracteres invisíveis U+2060 embutidos, e **nenhum tem dado fiscal**. E a R-145 diz que
  a fonte é a **planilha do Rodrigo**, não o Pralis. Ver §5.
- **A tela `importar.vue`** — o conceito BASE→loja já existe no ERP como importar/exportar entre
  empresas, com FK de verdade.

---

## §4 · Como levar, na prática

### 4.1 · A ressalva que economiza um dia de trabalho

Os dois usam Vuetify 3.12.8 — mas o Pralis **substitui o icon set**. O plugin
`plugins/vuetify-icons.ts` troca o default por **Material Symbols Rounded renderizado como
ligadura**. Todos os ícones no código são `inventory_2`, `barcode_scanner`, `arrow_back`,
`cloud_upload`.

**O ERP usa MDI** (`mdi-basket`, `mdi-warehouse`). Copiar template do Pralis sem traduzir os nomes
produz caixas vazias na tela. Não é difícil — é só chato de descobrir depois.

Junto: o Pralis define `defaults` globais de componente no `nuxt.config.ts:83-91` (VCard rounded xl,
VTextField outlined+rounded lg). O ERP tem os seus. **Não leve os do Pralis** — quebraria a linguagem
visual Cicluz (`67`).

### 4.2 · Ordem sugerida

| #   | Tarefa                                                                                                      | Onde                                                      | Por quê                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | **Margem por grupo** — coluna em `grupos_mercadorias`, importar do `GRUPOSREF`, ligar `resolverMargemGrupo` | migration + `seed-planilha.ts` + `produtos.service.ts:81` | é a **P-02 / #82**; sem isso o cadastro em massa exige digitar margem 150 vezes |
| 2   | **Busca e filtros server-side** na listagem                                                                 | `produtos.repository.ts`, `pages/produtos.vue`            | sem busca a tela não escala; e corrige o SELECT sem WHERE                       |
| 3   | **Ajuda contextual**                                                                                        | `WorkspaceDialogs.vue`                                    | barato, alto retorno, preferência por usuário                                   |
| 4   | **Upload de foto** reusando `/app/storage`                                                                  | `useFotoDocumento` como base                              | evita Cloudinary                                                                |
| 5   | **Resolver "como se compra"** — escolher um formato e matar o outro                                         | `regras.ts` **ou** o preview                              | dívida herdada, com teste do lado errado                                        |
| 6   | **Scanner por câmera**                                                                                      | componente novo                                           | autocontido; prioridade depende do leitor físico                                |
| 7   | Tela de produto sair do `WorkspaceDialogs`                                                                  | —                                                         | são **290 linhas de template** dentro de um arquivo de 993 (regra 4.5)          |

### 4.3 · O que fazer com a pasta do Pralis

**Não é para virar submódulo nem ser mergeada.** É uma aplicação separada, com auth própria, banco
próprio, Cloudinary e deploy próprio. Depois de extrair o que interessa, ela vira referência
histórica — mesmo destino do `_ARQUIVO_MORTO/`.

⚠️ Antes disso: `stack/api/.env` tem **credenciais reais** (JWT, cookie, Cloudinary, Resend, banco).
Não está no git (o `.gitignore` cobre), mas está no disco e agora está numa pasta conectada. Se aquele
Cloudinary e aquele Resend ainda estiverem ativos, **rotacione as chaves**.

---

## §5 · A pergunta que trava a decisão

`24` §4 já tinha registrado, e agora está mais nítida: existem **dois importadores ativos** gravando
na mesma tabela, com fontes diferentes.

| Importador                           | Fonte                                                                    | Traz fiscal?                    |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------- |
| `api/src/scripts/importar-pralis.ts` | `base-products.json` do app Pralis — **150 produtos**                    | **sim**, o bloco inteiro        |
| `scripts/seed-planilha.ts`           | planilha do Rodrigo, aba `(BASE) CADASTRO PRODUTOS`, só linhas com "TNP" | **não** — descarta de propósito |

A **R-145** (04/08) diz que a fonte é a planilha do Rodrigo e que **dado fiscal não entra**, porque
está errado e causa pagamento de imposto a maior.

Mas note: o `base-products.json` **não tem nenhum bloco fiscal preenchido** — a planilha de origem
estava vazia nesse ponto. Então, na prática, os dois caminhos hoje produzem o mesmo resultado quanto
ao fiscal. O conflito é **potencial**, não atual.

**A decisão que falta é outra, e é de escopo:** o `seed-planilha` grava só 12 campos por produto
(descrição, tipo, status, embalagem, marca, grupo, EAN…) e **não grava custo, margem, preço, estoque,
locais nem foto**. O `importar-pralis` grava tudo isso. Ou seja: **a planilha do Rodrigo dá o
catálogo; o Pralis dá os dados comerciais.**

Se o objetivo é ter produto com preço funcionando, provavelmente o certo é **os dois**, nesta ordem:
planilha primeiro (catálogo canônico, com os critérios de linha do Rodrigo), Pralis depois
**enriquecendo** apenas os campos comerciais dos produtos que casarem — e nunca criando produto novo.

Isso **não existe hoje** e é a peça que falta desenhar. É decisão sua e do Rodrigo, não minha.
