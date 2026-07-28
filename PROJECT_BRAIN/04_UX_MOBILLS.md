# 04 — UX Mobills: o que copiar e o que não copiar

> Base: sessão de 22/07 na conta de teste "Sistema Cicluz" (web.mobills.com.br), onde simulamos
> um dia completo de caixa. Registro completo em `docs/spec/SIMULACAO_dia-de-caixa-mobills.md`.

## 1. Estrutura geral (copiar)

```
┌──────────────┬──────────────────────────────────────────────┐
│  [+ NOVO]    │   [seletor de período ▼]        [usuário ▼]  │
│              ├──────────────────────────────────────────────┤
│  Dashboard   │   Título da página                            │
│  Contas      │                                               │
│  Transações  │   ┌────────┬────────┬────────┬────────┐      │
│  Cartões     │   │ Saldo  │Receitas│Despesas│ Cartão │      │
│  Planejamento│   └────────┴────────┴────────┴────────┘      │
│  Relatórios  │                                               │
│  Mais opções │   [conteúdo]                                  │
│  Configurações│                                              │
└──────────────┴──────────────────────────────────────────────┘
```

Elementos a adotar:

- **Botão `+ NOVO` fixo no topo da sidebar**, abrindo um menu curto de tipos de lançamento.
  No Mobills: `Despesa · Receita · Despesa cartão · Transferência`.
  No Pralis deve ser: **`Entrada · Despesa · Mercadoria · Retirada · Transferência`** — as cinco
  categorias coloridas, cada uma com seu ícone na sua cor.
- **Seletor de período no topo central** (mês). O Pralis precisa disso + **seletor de empresa**.
- **Cards de totais no topo da página**, um por categoria, com ícone circular colorido.
- **Sidebar clara, ícone + label**, item ativo com barra/realce.
- **Toast de confirmação** no canto superior direito após salvar.

## 2. O formulário de lançamento (copiar quase inteiro)

Ordem dos campos no Mobills, de cima para baixo:

```
[ VALOR — grande, colorido pelo tipo, é o herói do formulário ]
[ toggle "Foi paga/recebida" ]
[ Hoje | Ontem | Outros...  ← atalhos de data ]
[ Descrição ]
[ Categoria ▼ ]
[ Conta ▼ ]
[ Anexar arquivo ]
[ toggle "Ignorar transação" ]
[ Mais detalhes ▸ ]   → Tags, Observação, repetição
        [ SALVAR E CRIAR NOVA ]  [ SALVAR ]
```

O que isso ensina, ponto a ponto:

1. **O valor é o campo herói** — enorme, no topo, colorido pelo tipo (verde receita, vermelho
   despesa, azul transferência). O usuário digita só números e o campo formata sozinho.
   _Hoje o Pralis trata valor como um campo comum no meio do formulário._
2. **Atalhos de data `Hoje / Ontem / Outros`** — resolve 90% dos casos em um clique.
   _Combina perfeitamente com `DATA REF` da planilha._
3. **Toggle de efetivação no próprio formulário** (`Foi paga` / `Foi recebida`) — é o
   `V (EFETUADO)` da planilha e a base do saldo previsto × realizado.
4. **`SALVAR E CRIAR NOVA`** — indispensável para lançamento em lote. O operador de padaria
   lança 20 despesas seguidas. _O Pralis não tem isso e precisa ter._
5. **`Mais detalhes` recolhido** — o formulário começa curto. Campos raros ficam escondidos.
6. **Categoria criável na hora** — digitou um nome que não existe, oferece "Criar categoria X".
   _Cuidado: no Pralis os grupos são contábeis; criar na hora deve exigir permissão._

## 3. Saldo atual × saldo previsto (copiar — é regra R2)

Todo card de conta mostra os dois:

```
banco
Saldo atual     R$ 87.658,27
Saldo previsto  R$ 87.757,05   ← inclui o que ainda não foi recebido/pago
```

Isso resolve nativamente o **crediário** e as **despesas a vencer**. É a tradução visual das
colunas `V` e `DATA PG` da planilha. **Adotar em todo lugar que mostra saldo.**

## 4. Lista de transações (copiar a estrutura, corrigir o defeito)

Colunas do Mobills: `Situação · Data · Descrição · Categoria · Conta · Valor · Ações`.
Boa densidade, chip de categoria colorido, valor à direita.

Rodapé útil: **`Saldo Previsto Final do Dia`**.

## 5. O que NÃO copiar — os defeitos do Mobills

Descobertos na simulação. São exatamente onde o Pralis precisa ser **melhor**:

| Defeito                                                                                | Efeito                                                                                           | O que o Pralis faz                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Transferência não tem campo Descrição** (só "Observação" escondida em Mais detalhes) | as 8 transferências do dia aparecem como _"Transferência entrada…"_, todas idênticas e ilegíveis | descrição obrigatória + **lacre** visível na linha |
| Sem conceito de lacre / malote                                                         | nenhuma rastreabilidade do dinheiro físico                                                       | lacre é campo de primeira classe                   |
| Sem PDV / turno / operador                                                             | sem responsabilidade nem conferência                                                             | vínculo obrigatório com caixa (PDV+turno+usuário)  |
| Só uma data                                                                            | não separa fato de pagamento                                                                     | 3 datas (`ref`, `vencimento`, `pagamento`)         |
| Sem discriminação de itens                                                             | não detalha o que compõe o lançamento                                                            | discriminação (já existe no Pralis)                |
| Sem conferência/auditoria                                                              | não confronta com extrato                                                                        | `V`, `CONF`, `DIF. LANÇ`, `OCORRÊNCIAS`            |
| Limite de 3 contas no plano free                                                       | —                                                                                                | irrelevante (é nosso sistema)                      |
| Categoria criável por qualquer um                                                      | bagunça contábil                                                                                 | criação de grupo exige permissão                   |

> **A frase-síntese:** _queremos a leveza do Mobills com o rigor da planilha._ O Mobills é fácil
> e ilegível; a planilha é ilegível e rigorosa. O Pralis tem que ser fácil **e** rigoroso.

## 6. A tela de Transferência (Mobills + rascunho do Rodrigo)

Fusão das duas fontes — é a tela mais importante do rework:

```
┌─ NOVA TRANSFERÊNCIA ─────────────────────────────────────────┐
│  R$ 490,00                                          [BRL ▼]  │   ← valor herói, laranja
│                                                               │
│  [Hoje] [Ontem] [Outros...]        Data da transferência      │
│  Data de criação: automática (22/07/2026 14:32)               │   ← as duas datas explícitas
│                                                               │
│  Tipo:  ( ) Abertura  ( ) Suprimento  ( ) Sangria  ( ) Retorno│   ← R4: um mecanismo, 4 papéis
│                                                               │
│  Origem  [ CNT CONTA - COFRE PRINCIPAL ▼ ]                    │
│  Destino [ CNT CONTA - CAIXA 1M ▼ ]                           │
│                                                               │
│  Lacre   [ 007 ]  ⓘ número único = o próprio malote (D3)       │   ← R5. NÃO há campo separado de malote/código
│                                                               │
│  Descrição [ ABERTURA CX1M — troco inicial ]                  │   ← corrige o defeito do Mobills
│  Observação [ ................................ ]              │
│                                                               │
│  ─ Movimentos do dia neste caixa ───────────────────────────  │   ← R6: agrupamento
│    1ª transf.  490,00  lacre 007   ⊖ saída do cofre           │
│    2ª transf.  168,45  lacre 008   ⊖ saída do cofre           │
│    1º retorno  ...                 ⊕ entrada no cofre         │
│    ─────────────────────────────────────────────────          │
│    TOTAL SAÍDA 658,45   TOTAL ENTRADA 0,00   SALDO −658,45    │
│                                                               │
│              [ SALVAR E CRIAR NOVA ]      [ SALVAR ]          │
└───────────────────────────────────────────────────────────────┘
```

Cada elemento tem origem rastreável:

- valor herói, atalhos de data, dois botões de salvar → **Mobills**
- Origem/Destino/Lacre inicial/Lacre final/totais → **rascunho do Rodrigo**
- Tipo do movimento, agrupamento por dia, totais entrada/saída/saldo → **planilha**
- laranja da tela → **cor da aba TRANSFERÊNCIAS** (`03`)

## 7. A tela de Malotes

**NÃO existe "código do malote" nem campo "Malote (saco)".** O malote É o lacre (D3). A tela lista
malotes por **lacre** (identidade única), com **valor** e **status** (disponível/em uso/devolvido) —
sem nenhum outro identificador. Cada linha ganha o histórico de uso do lacre (qual caixa, qual dia,
qual movimento). Ver `SPEC_malotes-lacres-caixa.md`.
