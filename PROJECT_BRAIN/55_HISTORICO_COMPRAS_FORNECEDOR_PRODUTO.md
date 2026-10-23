# 55 — Histórico de compras por fornecedor e produto (PROPOSTA, aguardando decisões)

> Pedido de José em 21/10/2026: trazer da planilha de discriminação, produto por produto e fornecedor
> por fornecedor, quem vende cada produto e quanto se pagou nos últimos meses; guardar num banco do
> sistema e usar isso para atualizar os dados. **Nada aqui foi implementado nem gerou migration.** O SQL
> abaixo é rascunho para aprovação (AGENTS §4.6). Regra de dinheiro e dado histórico: decisão de José/Marco
> e confirmação operacional de Rodrigo.

> **Estado em 21/10/2026 (noite):** SQL aprovado por José e **implementado** na branch
> `feat/compras-fase2-solicitacao-rodada-20261021`: migration `0065_compras_historico_precos` (gerada pelo
> drizzle-kit; **aplicada só no banco de desenvolvimento, não em produção**), importador (analisar, parear,
> associar/cadastrar fornecedor, aplicar, cancelar), consulta `/api/compras/historico/resumo` e a aba
> "Histórico de compras" em Pedidos. Diferença para o SQL mostrado: `compras_historico_importacao_itens` saiu
> **sem** `atualizado_em` (a convenção exigiria trigger e o item nao precisa dele). Testado: 19 unitários,
> integração (8 casos) e E2E no navegador nas 4 larguras. Com a planilha real (CSV de 1,2 MB exportado da aba
> de discriminação): 11.773 linhas analisadas em ~2,6 s; 44 inválidas; o pareamento real só se mede com o
> cadastro de produção. **Em 21/10 José pediu para refazer as telas de Compras, uma por uma**: esta aba pode
> mudar de lugar e de forma; o backend fica.

## 1. Por que a importação falhou

O arquivo `CICLUZ GP - TNP - DISCRIMINAÇÃO_ESTOQUE (MER).xlsx` tem 20 MB. A rota
`POST /api/compras/precos-base/importacoes/analisar-arquivo` aceita até 10 MB e respondia 413 sem dizer
o motivo ("Requisição inválida"). A mensagem foi corrigida (413 "Arquivo acima do limite de 10 MB").
Só aumentar o limite **não resolve**: a aba principal descomprime acima do teto de 64 MB do leitor
(`db/src/planilha-xlsx`, defesa contra zip bomb), e o importador de preço-base lê uma coluna só
(`ÚLTIMO MENOR CUSTO`), não um histórico.

## 2. O que a planilha tem (medido, 21/10/2026)

Aba `TNP - DISCRIMINAÇÃO MERCADORIAS` (cabeçalho na linha 5, dados a partir da 11):

- **11.773 linhas de compra**, de 02/03/2026 a 20/10/2026 (mar–out).
- **1.338 produtos distintos** (283 com prefixo `INATIVO `) e **2.408 pares fornecedor–produto**.
- **180 nomes de fornecedor** extraídos da coluna `REFERÊNCIA` (formato `FORNECEDOR - dd/mm/aa - valor`).
  Há nomes diferentes para o mesmo fornecedor (ex.: `SPAL (COCA COLA)` e `SPAL INDUSTRIA BRASILEIRA DE
BEBIDAS S/A`; `DICASA`, `DICASA DE PAPEIS`, `DICASA COMERCIO DE PAPEIS E EMBALAGENS LTDA`).
  Agrupar pela primeira palavra **não serve** (junta `ACOUGUE REI DA ESQUINA` com `ACOUGUE DO FRANCISCO`).
- Colunas úteis: `PRODUTOS`, `QUANT`, `VALOR CUSTO UN`, `TOTAL CUSTO`, `DATA REF` (serial do Excel),
  `DATA PG`, `TAG` (mês), `GRUPO MERCADORIA`, `ULTIMO MENOR CUSTO`, `ULTIMO CUSTO COMPRA`.
- **`ULTIMO MENOR CUSTO` = 0,10 em 4.779 das 11.773 linhas**: é marcador, não preço (coincide com
  "FORA DA MARGEM CUSTO"). Importado como preço-base viraria R$ 0,10 e a compra automática (custo final ≤
  base) deixaria de comprar esses produtos.
- Custo unitário: mínimo 0,03; mediana 8,12; p99 203; máximo 618. 40 linhas "NÃO CONFRONTADO"; 1 linha
  com erro de lançamento.
- Aba `TNP - DISCRIMINAÇÃO ULTIMOS 3 M...` (4.732 linhas) tem o fornecedor em coluna própria, mas só 3 meses.

Não foi possível medir o pareamento com o cadastro real: o banco de desenvolvimento tem 13 produtos e 15
fornecedores (seed). O pareamento verdadeiro exige o cadastro de produção/TNP.

## 3. Modelo proposto

Duas fases, como o preço-base: **analisar** (nada vira dado do sistema) e **aplicar** (transação única).

1. `compras_historico_importacoes` + `compras_historico_importacao_itens` (staging): uma linha por linha da
   planilha, com o resultado do pareamento de fornecedor e de produto (`correspondencia`, `fornecedor_nao_encontrado`, `produto_nao_encontrado`, `ambiguidade`, `invalido`).
   Só a linha pareada é aplicada; as demais ficam no relatório; sem gravação por aproximação (ver §5).
2. `fornecedores_aliases`: nome como aparece na planilha → fornecedor do cadastro. Decidido por pessoa,
   uma vez; as próximas importações reaproveitam.
3. `compras_historico_precos` (imutável): uma linha por compra (empresa, fornecedor, produto, data,
   quantidade, custo unitário, custo da embalagem, total, documento, origem). **Origem** `planilha` hoje
   e `recebimento` no futuro: cada pedido recebido (R-213) grava sua linha, então o histórico continua vivo
   sem nova planilha. Idempotência: `UNIQUE (empresa_id, importacao_item_id)`.
4. "Último preço por fornecedor e produto" e "evolução nos últimos meses" são **consultas** sobre essa
   tabela (`DISTINCT ON`), sem tabela derivada para ficar desatualizada.
5. Tela dentro de Compras: por produto (quem vende, último custo, variação em 3/6 meses) e por fornecedor
   (o que vende e a que preço), com os vínculos do catálogo.

### SQL final proposto (NÃO aplicado; migration 0065 só será gerada depois do seu OK)

```sql
-- 0065 (PROPOSTA — NÃO gerada, NÃO aplicada). Só tabelas novas; nenhum UPDATE em dado existente.

create table fornecedores_aliases (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fornecedor_id uuid not null,
  alias_normalizado text not null,
  criado_por text references perfis_usuarios(usuario_id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint fornecedores_aliases_empresa_alias_unico unique (empresa_id, alias_normalizado),
  constraint fornecedores_aliases_fornecedor_empresa_fk
    foreign key (fornecedor_id, empresa_id) references fornecedores(id, empresa_id) on delete cascade
);
create index fornecedores_aliases_fornecedor_idx on fornecedores_aliases (fornecedor_id);

create table compras_historico_importacoes (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome_arquivo text not null,
  hash_arquivo text not null,
  status text not null default 'analisada',
  total_linhas integer not null,
  total_pareadas integer not null default 0,
  total_pendentes integer not null default 0,
  total_aplicadas integer not null default 0,
  periodo_inicio date,
  periodo_fim date,
  criado_por text not null references perfis_usuarios(usuario_id) on delete restrict,
  aplicado_por text references perfis_usuarios(usuario_id) on delete restrict,
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz,
  constraint compras_historico_importacoes_empresa_hash_unico unique (empresa_id, hash_arquivo),
  constraint compras_historico_importacoes_status_check check (status in ('analisada', 'aplicada', 'cancelada')),
  constraint compras_historico_importacoes_totais_check check (
    total_linhas >= 0 and total_pareadas >= 0 and total_pendentes >= 0 and total_aplicadas >= 0
  )
);
create index compras_historico_importacoes_empresa_criado_idx on compras_historico_importacoes (empresa_id, criado_em);

create table compras_historico_importacao_itens (
  id uuid primary key default uuid_generate_v7(),
  importacao_id uuid not null references compras_historico_importacoes(id) on delete cascade,
  numero_linha integer not null,
  fornecedor_informado text not null,
  fornecedor_normalizado text not null,
  produto_informado text not null,
  produto_normalizado text not null,
  data_compra date,
  quantidade numeric(14, 3),
  custo_unitario numeric(14, 4),
  documento text,
  fornecedor_id uuid references fornecedores(id) on delete restrict,
  produto_id uuid references produtos(id) on delete restrict,
  resultado text not null,
  detalhe text,
  atualizado_em timestamptz not null default now(),
  constraint compras_historico_itens_linha_unica unique (importacao_id, numero_linha),
  constraint compras_historico_itens_linha_check check (numero_linha > 0),
  constraint compras_historico_itens_resultado_check check (
    resultado in ('correspondencia', 'fornecedor_nao_encontrado', 'produto_nao_encontrado', 'ambiguidade', 'invalido')
  )
);
create index compras_historico_itens_importacao_resultado_idx
  on compras_historico_importacao_itens (importacao_id, resultado);

create table compras_historico_precos (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fornecedor_id uuid not null,
  produto_id uuid not null,
  data_compra date not null,
  quantidade numeric(14, 3) not null,
  custo_unitario numeric(14, 4) not null,
  documento text,
  origem text not null,
  importacao_item_id uuid references compras_historico_importacao_itens(id) on delete restrict,
  pedido_item_id uuid references pedidos_itens(id) on delete restrict,
  criado_por text references perfis_usuarios(usuario_id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint compras_historico_precos_quantidade_check check (quantidade > 0),
  constraint compras_historico_precos_custo_check check (custo_unitario > 0),
  constraint compras_historico_precos_origem_check check (origem in ('planilha', 'recebimento')),
  constraint compras_historico_precos_origem_referencia_check check (
    (origem = 'planilha' and importacao_item_id is not null and pedido_item_id is null)
    or (origem = 'recebimento' and pedido_item_id is not null and importacao_item_id is null)
  ),
  constraint compras_historico_precos_importacao_unica unique (importacao_item_id),
  constraint compras_historico_precos_fornecedor_empresa_fk
    foreign key (fornecedor_id, empresa_id) references fornecedores(id, empresa_id) on delete restrict,
  constraint compras_historico_precos_produto_empresa_fk
    foreign key (produto_id, empresa_id) references produtos(id, empresa_id) on delete restrict
);
create index compras_historico_precos_produto_data_idx
  on compras_historico_precos (empresa_id, produto_id, data_compra desc);
create index compras_historico_precos_fornecedor_data_idx
  on compras_historico_precos (empresa_id, fornecedor_id, data_compra desc);
```

Só cria tabelas novas; nenhum `UPDATE` em dado existente. Os nomes finais de FK/índice saem do
`drizzle-kit generate`; em produção, simular a migration no estado real antes (memória do deploy 0015–0028).

## 4. "Atualizar os dados do sistema" — o que cada coisa faz

| Dado do sistema                                      | Proposta                                                                                                                                                    | Risco                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Vínculo fornecedor–produto (`fornecedores_produtos`) | Ao aplicar, cria/atualiza o vínculo com `preco_ofertado` = último custo, evento imutável com ator `sistema`.                                                | Baixo; estado (pendente/aprovado) é decisão 3 abaixo. |
| Preço-base (`produtos_precos_base`)                  | **Não mexe sozinho.** Mostra o "menor custo dos últimos N meses" como _sugestão_; trocar a base passa pela análise e aplicação existentes, com confirmação. | **Dinheiro**: a base decide a compra automática.      |
| Preço-base inicial                                   | A carga inicial é ato único (doc 53). Esta importação não a repete.                                                                                         | —                                                     |

## 5. Decisões registradas (José, 21/10/2026: "aceito as recomendações do doc 55, 1 a 8")

1. **Entrada:** CSV ou XLSX de **uma aba só** (pequeno). Não se mexe nos tetos de upload (10 MB) nem de descompressão.
2. **0,10 em `ULTIMO MENOR CUSTO`:** ignorado. O histórico usa `VALOR CUSTO UN` (o pago de fato).
3. **Vínculo vindo da planilha nasce `aprovado`** (origem `compras`, evento do sistema). **Sujeito à confirmação de
   Rodrigo antes de aplicar em produção** (gate operacional, como a reconciliação do frete).
4. **Fornecedores com nomes diferentes:** lista de apelidos confirmada por pessoa. Nome sem par: escolher um
   fornecedor existente (cria o apelido) ou cadastrar um novo; nunca automático.
5. **Produtos `INATIVO ...`:** pareiam pelo nome exato com produto do cadastro (inclusive inativo); sem par fica
   pendente. O prefixo não é removido por aproximação. _(Recomendação minha, não estava explícita em §5.)_
6. **Período:** tudo (mar–out/2026). Tela mostra 3 meses por padrão, com opção de 6. _(idem)_
7. **Compras futuras:** cada recebimento grava histórico (`origem='recebimento'`). Entrega posterior, sem migration
   nova (a coluna `pedido_item_id` já nasce na 0065).
8. **Linhas "NÃO CONFRONTADO" (40) e a de erro de lançamento:** ficam fora (resultado `invalido`, com detalhe).
   _(idem)_

**Comportamento da aplicação (decidido junto):**

- Aplicar grava **só as linhas pareadas**. As demais ficam no relatório (fornecedor/produto não encontrado,
  ambiguidade, inválida) e podem ser pareadas depois: o pareamento é refeito sobre a mesma importação e a aplicação
  é idempotente (`UNIQUE (importacao_item_id)`). Isso **difere do preço-base** (doc 53), onde pendência bloqueia
  tudo: lá é ato único de dinheiro; aqui é histórico de leitura, e 11 mil linhas não podem travar por 1 produto.
- Vínculo `fornecedores_produtos`: cria se não existir (`aprovado`, `origem='compras'`, `preco_ofertado` = custo da
  compra mais recente); se existir `pendente`, passa a `aprovado`; se `rejeitado`, **não toca** e lista no relatório.
  A análise mostra **antes de aplicar** quantos vínculos serão criados/aprovados e uma amostra.
- Preço-base: **não é alterado** por esta importação.

## 6. Fora de escopo desta proposta

Tela de **agenda/recorrência de pedido**: contrato no doc 52; depende da pergunta do §6 daquele documento
(ocorrência cria tarefa de revisão ou pedido "A fazer"). O formulário antigo de agendamento (data +
recorrência, só lembrete) saiu junto com o "Novo pedido manual" no E8.
