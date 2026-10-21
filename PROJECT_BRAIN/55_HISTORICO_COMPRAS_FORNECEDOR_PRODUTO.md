# 55 — Histórico de compras por fornecedor e produto (PROPOSTA, aguardando decisões)

> Pedido de José em 21/10/2026: trazer da planilha de discriminação, produto por produto e fornecedor
> por fornecedor, quem vende cada produto e quanto se pagou nos últimos meses; guardar num banco do
> sistema e usar isso para atualizar os dados. **Nada aqui foi implementado nem gerou migration.** O SQL
> abaixo é rascunho para aprovação (AGENTS §4.6). Regra de dinheiro e dado histórico: decisão de José/Marco
> e confirmação operacional de Rodrigo.

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
   planilha, com o resultado do pareamento de fornecedor e de produto (`correspondencia`, `ambiguidade`,
   `nao_encontrado`, `invalido`). Ambiguidade e não encontrado **bloqueiam** a aplicação; sem gravação por
   aproximação (mesma regra do doc 53).
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

### Rascunho de SQL (NÃO aplicado; precisa de aprovação antes de virar migration 0065)

```sql
create table fornecedores_aliases (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fornecedor_id uuid not null,
  alias_normalizado text not null,
  criado_por text references perfis_usuarios(usuario_id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint fornecedores_aliases_empresa_alias_unico unique (empresa_id, alias_normalizado),
  constraint fornecedores_aliases_fornecedor_empresa_fk
    foreign key (fornecedor_id, empresa_id) references fornecedores(id, empresa_id) on delete cascade
);

create table compras_historico_importacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome_arquivo text not null,
  hash_arquivo text not null,
  status text not null default 'analisada' check (status in ('analisada','aplicada','cancelada')),
  total_linhas integer not null check (total_linhas >= 0),
  periodo_inicio date,
  periodo_fim date,
  criado_por text not null references perfis_usuarios(usuario_id) on delete restrict,
  aplicado_por text references perfis_usuarios(usuario_id) on delete restrict,
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz,
  constraint compras_historico_importacoes_empresa_hash_unico unique (empresa_id, hash_arquivo)
);

create table compras_historico_importacao_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references compras_historico_importacoes(id) on delete cascade,
  numero_linha integer not null check (numero_linha > 0),
  fornecedor_informado text not null,
  produto_informado text not null,
  data_compra date,
  quantidade numeric(14,3),
  custo_unitario numeric(14,4),
  fornecedor_id uuid,
  produto_id uuid,
  resultado text not null check (resultado in ('correspondencia','ambiguidade','nao_encontrado','invalido')),
  detalhe text,
  constraint compras_historico_itens_linha_unica unique (importacao_id, numero_linha)
);

create table compras_historico_precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fornecedor_id uuid not null,
  produto_id uuid not null,
  data_compra date not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  custo_unitario numeric(14,4) not null check (custo_unitario > 0),
  custo_total numeric(14,2),
  documento text,
  origem text not null check (origem in ('planilha','recebimento')),
  importacao_item_id uuid references compras_historico_importacao_itens(id) on delete restrict,
  pedido_id uuid references pedidos(id) on delete restrict,
  criado_por text references perfis_usuarios(usuario_id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint compras_historico_precos_origem_ref_check check (
    (origem = 'planilha' and importacao_item_id is not null)
    or (origem = 'recebimento' and pedido_id is not null)
  ),
  constraint compras_historico_precos_importacao_unica unique (empresa_id, importacao_item_id),
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

(`pedidos.id` e os nomes de FK composta seguem o padrão do schema atual; os nomes finais saem do
`drizzle-kit generate`. Em produção, simular a migration no estado real antes — ver memória do deploy 0015–0028.)

## 4. "Atualizar os dados do sistema" — o que cada coisa faz

| Dado do sistema                                      | Proposta                                                                                                                                                    | Risco                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Vínculo fornecedor–produto (`fornecedores_produtos`) | Ao aplicar, cria/atualiza o vínculo com `preco_ofertado` = último custo, evento imutável com ator `sistema`.                                                | Baixo; estado (pendente/aprovado) é decisão 3 abaixo. |
| Preço-base (`produtos_precos_base`)                  | **Não mexe sozinho.** Mostra o "menor custo dos últimos N meses" como _sugestão_; trocar a base passa pela análise e aplicação existentes, com confirmação. | **Dinheiro**: a base decide a compra automática.      |
| Preço-base inicial                                   | A carga inicial é ato único (doc 53). Esta importação não a repete.                                                                                         | —                                                     |

## 5. Decisões necessárias antes do SQL

1. **Formato de entrada.** (a) CSV/XLSX de **uma aba só** exportado da planilha (pequeno, sem mexer no teto
   de zip bomb) — **recomendado**; (b) subir o arquivo de 20 MB inteiro, elevando limite de upload e de
   descompressão (consome memória do servidor numa planilha de 64+ MB descomprimidos).
2. **O valor 0,10** em `ULTIMO MENOR CUSTO` é "sem preço" e será ignorado? (recomendado: sim; o histórico usa
   `VALOR CUSTO UN`, que é o pago de fato.)
3. **Vínculo vindo da planilha** nasce `aprovado` (Compras já comprou desse fornecedor) ou `pendente`
   (doc 53: o que vem de fora nasce pendente)? Recomendado: `aprovado`, com origem `compras` e evento, pois
   é compra efetivamente feita — **confirmar com Rodrigo**.
4. **Pareamento de fornecedores com nomes diferentes:** lista de apelidos confirmada por pessoa (recomendado),
   nunca automática.
5. **Produtos `INATIVO ...`** (283): importar para produto inativo existente, ou ignorar?
6. **Período:** importar tudo (mar–out/2026) ou só os últimos N meses? E "últimos meses" na tela = 3, 6?
7. **Compras futuras** gravam histórico no recebimento (origem `recebimento`)? Recomendado: sim.
8. **Linhas "NÃO CONFRONTADO" (40) e a de erro de lançamento:** ficam fora até conferência?

## 6. Fora de escopo desta proposta

Tela de **agenda/recorrência de pedido**: contrato no doc 52; depende da pergunta do §6 daquele documento
(ocorrência cria tarefa de revisão ou pedido "A fazer"). O formulário antigo de agendamento (data +
recorrência, só lembrete) saiu junto com o "Novo pedido manual" no E8.
