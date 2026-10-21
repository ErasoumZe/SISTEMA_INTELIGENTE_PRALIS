# 56 — Agendamento de pedido (módulo novo de Compras)

> Tela desenhada por José em 21/10/2026, primeira do redesenho "tela por tela" de Compras. Este documento
> registra o que ele disse e o que decidiu; **nada foi implementado**. Complementa e, onde diz, **substitui** o
> doc 52 (recorrência como calendário). O que ainda está aberto está no §7: não implementar por suposição.

> **Estado em 21/10/2026 (noite): IMPLEMENTADO** na branch `feat/compras-fase2-solicitacao-rodada-20261021`
> (commits `cdff2f97`, `b113f345`, `ce98a5f6`, só locais). Migration `0066_compras_agendamento_pedidos`
> gerada pelo drizzle-kit a partir do SQL aprovado no §8 (+ os dois gatilhos de `atualizado_em`), **aplicada só
> no banco de desenvolvimento**. Tela `/agendamento_pedidos` no menu de Compras; agendador no tick de Compras
> (60 s). Permissões ficaram com o nome da tela, como as demais: `agendamento_pedidos_visualizar` e
> `agendamento_pedidos_gerir` (Compras e Gerência no seed de referência; em produção é passo de dados). Conferir e
> enviar exige também `pedidos_editar` (abre a rodada). Testado: 17 + 6 unitários, 9 de integração e E2E no
> navegador nas 4 larguras. **Não feito nesta entrega:** trocar o responsável pela tela (o servidor aceita
> `responsavelId`; a tela usa quem cria) e a remoção dos campos legados `pedidos.data_agendada`/`recorrencia`
> (precisa contar o uso em produção antes).

## 1. O que é

Um **módulo próprio no menu de Compras**, ao lado de "Conferências de estoque" (mesmo padrão: agenda de um
lado, cadastro do agendamento do outro). Não é aba da tela de Pedidos.

O uso real, nas palavras de José: o comprador vai a uma **área da loja** (ex.: Salão), escolhe o **local**
(ex.: Geladeira), olha na lista **todos os produtos daquele lugar**, marca os que precisam de pedido, define a
recorrência (ex.: bebidas, duas vezes por semana) e o tempo que o fornecedor tem para responder, e salva.

## 2. A tela

### 2.1 Lista de produtos (embaixo)

- Filtros: **grupo e subgrupo**, **área/setor da loja**, **local de estoque** e **local de venda**.
  (Subgrupo = grupo de mercadoria filho, `grupos_mercadorias.grupo_pai_id`. Área, setor e locais já existem no
  produto: `area_estoque`, `setor_estoque`, `local_venda_1/2` — o mesmo conjunto de filtros da conferência.)
- O comprador **marca** os produtos que entram no agendamento.
- Ao lado de cada produto, **legenda em bolinhas** (pode ter mais de uma):
  - **verde** — está entre os que **mais vendem**;
  - **amarela** — está entre os que **mais compramos**;
  - **azul** — está entre os que **mais dão lucro**.
- **Critério das bolinhas (decisão de José, 21/10):** top **20%** dos produtos da empresa nos **últimos 3 meses**:
  - verde: quantidade vendida (vendas integradas do PDV);
  - amarela: valor gasto comprando (histórico de compras, doc 55);
  - azul: lucro = (preço de venda − custo) × quantidade vendida.

### 2.2 Card "Agendamento de pedido"

- **Grupo e subgrupo** do pedido.
- **Recorrência** (§3).
- **Tempo de resposta da cotação**: é o prazo que o **fornecedor** vê para responder (o mesmo prazo da rodada).
- **Salvar** e **Cancelar**.

## 3. Recorrência (decisão de José, 21/10: "o que tiver mais opções")

José citou o Calendário do iPhone porque ele tem muitos tipos de repetição; na resposta, pediu **o mais completo**
— se o do Mac tem mais, segue o do Mac — e deu exemplos: uma vez por semana; um dia a cada três meses; **dia 2 de
janeiro e dia 3 de fevereiro**.

O Calendário da Apple grava a repetição no padrão aberto **iCalendar (RFC 5545, regra RRULE)**, o mesmo do
EventKit. Replicar o padrão dá o comportamento exato. Opções (superconjunto iPhone + Mac + datas avulsas):

| Opção             | Como funciona                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Atalhos           | Nunca · Todo dia · Toda semana · A cada 2 semanas · Todo mês · Todo ano · Personalizado                                               |
| Frequência        | Diária, semanal, mensal ou anual, **a cada N** (1 a 999)                                                                              |
| Semanal           | um ou **vários dias da semana**                                                                                                       |
| Mensal "Cada"     | um ou **vários dias do mês** (1 a 31)                                                                                                 |
| Mensal "No(a)"    | 1º, 2º, 3º, 4º, 5º ou último + domingo…sábado, **dia**, **dia útil** ou **fim de semana**                                             |
| Anual             | um ou **vários meses**, opcionalmente com "No(a)" (ex.: última sexta de março)                                                        |
| **Datas avulsas** | lista de datas sem padrão (ex.: 2/jan e 3/fev) — não existe na tela da Apple, mas existe no padrão (RDATE) e atende o exemplo de José |
| Término           | **Nunca**, **na data** ou **depois de N vezes** (esta última é do Mac)                                                                |
| Resumo            | frase no topo dizendo a regra ("A cada 2 semanas, na segunda e na quinta")                                                            |
| Editar/excluir    | **só esta** ou **esta e as futuras**, como no iPhone; nunca reescreve ocorrência passada (doc 52)                                     |

Data inexistente (dia 31 em mês de 30) **não vira outro dia**: é pulada, como no padrão (doc 52).

**Ferramentas:** José sugeriu REA e Ghidra. Elas analisam programas; não há Calendário da Apple neste PC (Windows),
e o comportamento já é público (RFC 5545 + documentação do EventKit + guias da Apple). A conferência usará uma
biblioteca de referência do padrão nos testes. Se José quiser, ele entra no iCloud.com pelo navegador e o REA lê
o editor de repetição da Apple (somente leitura); o login é dele.

## 4. O que acontece na data (decisão de José, 21/10)

Na data de cada ocorrência, o pedido **aparece para o comprador conferir**: ele pode **adicionar produtos** e então
**envia a cotação aos fornecedores por WhatsApp**. O sistema **não envia sozinho** (mantém doc 52 §6 opção 1 e doc 53).

- O fornecedor de cada produto vem da **base produto → fornecedor (e valor)**, que nasce da planilha: é o catálogo
  fornecedor–produto alimentado pelo histórico de compras (doc 55). Cada fornecedor recebe **os seus** produtos
  (rodada multi-fornecedor, doc 54).
- O fornecedor precisa estar **cadastrado com pelo menos nome e WhatsApp** (regra de convite já existente).
- O prazo de resposta vem do agendamento.

## 5. Relação com o que existe

- Usa o fluxo da Fase 2: a ocorrência vira uma **solicitação** pronta para conferir; enviar = abrir a **rodada**.
- Substitui de vez os campos antigos `pedidos.data_agendada` e `pedidos.recorrencia` (legado; a remoção entra na
  mesma entrega, regra-mãe).
- Doc 52: as tabelas `pedidos_agendas`/`pedidos_agenda_ocorrencias` seguem como base; ganham produtos marcados,
  grupo/subgrupo, prazo de resposta, datas avulsas e término por quantidade.

## 6. Fora desta tela

A tela de Pedidos atual (painel com catálogo, histórico, preço-base, solicitações) será redesenhada por José,
tela por tela. Até lá, nada novo entra nela.

## 7. Decisões de 21/10 (José: "use as suas recomendações")

1. **Quantidade:** o agendamento guarda uma **quantidade padrão opcional** por produto. Na data, a conferência já vem
   preenchida com ela; sem padrão, com a sugestão do estoque (máximo − saldo). Tudo editável antes de enviar. Produto
   sem quantidade padrão e acima do máximo aparece na conferência, mas não entra sozinho.
2. **Tempo de resposta:** em **horas** (1 a 720), como o prazo da rodada; a tela oferece atalhos (4 h, 12 h, 1 dia, 2 dias).
3. **Produto com mais de um fornecedor:** a cotação vai para **todos os fornecedores com vínculo aprovado** no catálogo
   (é o que dá concorrência; cada um recebe só os seus produtos).
4. **Produto sem fornecedor:** **não bloqueia**; na conferência o comprador escolhe o fornecedor (como na rodada, doc 53).
5. **Área × local:** os quatro filtros são **independentes** e usam os campos que o produto já tem (área de estoque,
   local de estoque = setor, local de venda 1/2, grupo/subgrupo). Não se assume que "Salão" é um e "Geladeira" é o outro.
6. **Aviso:** o sino avisa o **responsável** do agendamento (por padrão quem criou; pode ser trocado) quando o pedido do
   dia fica pronto para conferir. A lista "para conferir" do módulo mostra a todos que têm a permissão.

Permissões novas (passo de dados, não migration): `agendamento_pedidos_visualizar` e `agendamento_pedidos_gerir`
(Compras, Gerência, Admin). Os campos legados `pedidos.data_agendada`/`pedidos.recorrencia` saem numa migration
própria, depois de contar em produção quantos pedidos ainda os usam (dado histórico: PARE).

## 8. SQL proposto (migration 0066 — mostrado a José em 21/10, **ainda não gerado nem aplicado**)

```sql
-- 0066 (PROPOSTA — NÃO gerada, NÃO aplicada). Tabelas novas + 2 CHECKs ampliados. Nenhum dado existente é alterado.

-- 1) A série: o que o comprador salva no card "Agendamento de pedido".
create table pedidos_agendas (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  grupo_mercadoria_id uuid not null,            -- o subgrupo escolhido (ou o grupo, se não houver subgrupo)
  responsavel_id text not null references perfis_usuarios(usuario_id) on delete restrict,
  inicio_em timestamptz not null,               -- data e hora da 1ª ocorrência
  fuso_horario text not null,                   -- copiado da empresa ao salvar (a regra é calculada no horário local)
  regra jsonb not null,                         -- recorrência (formato validado no servidor; ver doc 56 §3)
  termino_tipo text not null default 'nunca',
  termino_em date,
  termino_quantidade integer,
  prazo_resposta_horas integer not null,        -- o prazo que o fornecedor vê na cotação
  status text not null default 'ativa',
  serie_anterior_id uuid references pedidos_agendas(id) on delete restrict,  -- "esta e as futuras"
  encerrada_em timestamptz,
  criado_por text not null references perfis_usuarios(usuario_id) on delete restrict,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pedidos_agendas_id_empresa_unica unique (id, empresa_id),
  constraint pedidos_agendas_grupo_empresa_fk
    foreign key (grupo_mercadoria_id, empresa_id) references grupos_mercadorias(id, empresa_id) on delete restrict,
  constraint pedidos_agendas_status_check check (status in ('ativa', 'encerrada')),
  constraint pedidos_agendas_encerramento_check check ((status = 'encerrada') = (encerrada_em is not null)),
  constraint pedidos_agendas_prazo_check check (prazo_resposta_horas between 1 and 720),
  constraint pedidos_agendas_fuso_check check (btrim(fuso_horario) <> ''),
  constraint pedidos_agendas_termino_check check (
    (termino_tipo = 'nunca' and termino_em is null and termino_quantidade is null)
    or (termino_tipo = 'data' and termino_em is not null and termino_quantidade is null)
    or (termino_tipo = 'quantidade' and termino_quantidade between 1 and 999 and termino_em is null)
  )
);
create index pedidos_agendas_empresa_status_idx on pedidos_agendas (empresa_id, status);

-- 2) Os produtos marcados na lista.
create table pedidos_agendas_produtos (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agenda_id uuid not null,
  produto_id uuid not null,
  quantidade_padrao numeric(14, 3),             -- opcional; vazio = sugestão pelo estoque na data
  constraint pedidos_agendas_produtos_unico unique (agenda_id, produto_id),
  constraint pedidos_agendas_produtos_agenda_empresa_fk
    foreign key (agenda_id, empresa_id) references pedidos_agendas(id, empresa_id) on delete cascade,
  constraint pedidos_agendas_produtos_produto_empresa_fk
    foreign key (produto_id, empresa_id) references produtos(id, empresa_id) on delete restrict,
  constraint pedidos_agendas_produtos_quantidade_check check (quantidade_padrao is null or quantidade_padrao > 0)
);

-- 3) Cada data em que o pedido acontece (só as que já viraram fato: chegaram, foram canceladas ou movidas).
create table pedidos_agenda_ocorrencias (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agenda_id uuid not null,
  previsto_para timestamptz not null,           -- instante calculado pela regra (chave contra duplicidade)
  data_atual timestamptz not null,              -- igual ao previsto, ou a nova data de "editar só esta"
  situacao text not null default 'aguardando_conferencia',
  solicitacao_id uuid references compras_solicitacoes(id) on delete restrict,
  enviada_por text references perfis_usuarios(usuario_id) on delete restrict,
  enviada_em timestamptz,
  cancelada_por text references perfis_usuarios(usuario_id) on delete restrict,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pedidos_agenda_ocorrencias_unica unique (agenda_id, previsto_para),
  constraint pedidos_agenda_ocorrencias_agenda_empresa_fk
    foreign key (agenda_id, empresa_id) references pedidos_agendas(id, empresa_id) on delete cascade,
  constraint pedidos_agenda_ocorrencias_situacao_check
    check (situacao in ('agendada', 'aguardando_conferencia', 'enviada', 'cancelada')),
  constraint pedidos_agenda_ocorrencias_conferencia_check
    check (situacao not in ('aguardando_conferencia', 'enviada') or solicitacao_id is not null),
  constraint pedidos_agenda_ocorrencias_envio_check
    check ((situacao = 'enviada') = (enviada_em is not null and enviada_por is not null)),
  constraint pedidos_agenda_ocorrencias_cancelamento_check
    check ((situacao = 'cancelada') = (cancelada_em is not null and cancelada_por is not null))
);
create index pedidos_agenda_ocorrencias_empresa_situacao_idx
  on pedidos_agenda_ocorrencias (empresa_id, situacao, data_atual);

-- 4) Gatilhos de atualizado_em (convenção do projeto para tabela com a coluna).
create trigger pedidos_agendas_set_atualizado_em
  before update on pedidos_agendas for each row execute function set_atualizado_em();
create trigger pedidos_agenda_ocorrencias_set_atualizado_em
  before update on pedidos_agenda_ocorrencias for each row execute function set_atualizado_em();

-- 5) A solicitação que nasce na data diz de onde veio; o aviso no sino ganha um tipo.
alter table compras_solicitacoes drop constraint compras_solicitacoes_origem_check;
alter table compras_solicitacoes add constraint compras_solicitacoes_origem_check
  check (origem in ('manual', 'sugestao', 'rapida', 'agendamento'));
alter table notificacoes drop constraint notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
    'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir'));
```

Como funciona: a regra fica em `regra` (jsonb validado pelo contrato em `shared`, testado contra uma biblioteca de
referência do padrão RFC 5545). As datas futuras são **calculadas**, não gravadas uma a uma; uma linha em
`pedidos_agenda_ocorrencias` só nasce quando a data chega (vira solicitação para conferir), quando a data é cancelada
ou movida ("só esta"). O `UNIQUE (agenda_id, previsto_para)` impede que o agendador crie a mesma data duas vezes.
