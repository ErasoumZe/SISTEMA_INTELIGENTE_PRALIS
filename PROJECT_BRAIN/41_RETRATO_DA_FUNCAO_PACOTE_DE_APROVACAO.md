# 41 — Retrato histórico da função: pacote para aprovação

> Aberto em 03/09/2026, branch `feat/admissoes-testes-tnp`, sobre o HEAD `cba1860`. Piloto na **TNP**.
> Responde ao achado aberto da `40`.
>
> ## ⛔ NADA AQUI FOI IMPLEMENTADO
>
> **Nenhuma migration foi gerada.** `db/src/schema/app.schema.ts` **não foi tocado**. Nenhum contrato,
> serviço ou tela mudou. Este documento existe para o SQL ser lido e aprovado **antes** de qualquer
> arquivo nascer — e o schema não foi alterado de propósito: o gate de paridade `migrate` × `push`
> reprova assim que o schema e as migrations divergem.
>
> **A decisão de produto já estava tomada** (Marco, 03/09/2026), e **o SQL foi aprovado em
> 14/09/2026**, com a §4.2 mantida. O que falta agora é **executar** — na ordem da §8. Continua
> valendo que nada aqui foi implementado.

> **Nota de 14/09/2026 — o número da migration mudou, o SQL não.** Este pacote foi escrito
> propondo a `0039`. Depois disso a branch alcançou a `main`, que já tinha gravado uma `0032` e uma
> `0033` próprias do Caixa, e as sete migrações de Admissões desceram dois números — `0032`–`0038`
> viraram `0034`–`0040`. A `0039` passou a ser a antiga `0037` (convite, ficha e dependentes).
>
> **A migration nasce `0041`.** O conteúdo não muda: nada nele depende do número, e ele continua
> aditivo com a única exceção declarada na §4.2. As referências internas deste documento já foram
> atualizadas.

## A decisão que este pacote implementa

**Decisão de Marco, 03/09/2026**, respondendo à pergunta que a `40` deixou aberta:

> Registrar, **no momento da criação**, o **nome** e o **CBO** (podendo ser nulo) da função, no período
> de teste e no processo de admissão. Renomear, alterar CBO, desativar ou reativar uma função **nunca**
> pode reescrever o que registros antigos exibem. Registros legados sem retrato usam o catálogo atual
> **apenas como fallback, identificado como legado**.

É a mesma disciplina que o **turno** já tem em `admissoes_processos` desde a `44` D-3: o catálogo
responde _o que é a função hoje_; o retrato responde _o que foi combinado com esta pessoa_.

---

## 1. O que está quebrado hoje, em uma frase

O nome e o CBO da função são lidos por **junção, toda vez**. Não há cópia em lugar nenhum. Então
renomear uma função reescreve, retroativamente, o que aparece na lista de períodos de teste, no
detalhe do teste, na lista e no detalhe do processo, na fila do DP e **na ficha que o candidato abre
pelo link**.

Nada quebra — a chave estrangeira segura, o vínculo continua correto. O que muda é a **leitura do
histórico**, e ela muda sem ninguém decidir que mudaria.

---

## 2. Onde a função é exibida hoje — o inventário completo

Todo ponto abaixo passa a ler o retrato quando ele existir.

### 2.1 Servidor — as duas junções que produzem o valor

| Origem                             | Arquivo                                                        | Como monta                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Período de teste (lista e detalhe) | `api/src/admissoes/admissoes.repository.ts:94-95` e `:127-128` | `innerJoin` em `funcoes_operacionais`, projeta `nome` e `cbo`                                                                           |
| Processo (lista e detalhe)         | `api/src/admissoes/processos.repository.ts:447`                | `coalesce(funcaoDoTeste.nome, funcaoDoProcesso.nome)` — dois _aliases_, porque a função vem do teste **ou** do processo, nunca dos dois |

### 2.2 Servidor — quem repassa

`admissoes.service.ts:79-80` (teste) · `processos.service.ts:72` (detalhe) e `:317` (lista) ·
`ficha.service.ts:192` (cabeçalho da ficha pública do candidato).

### 2.3 Contratos

`shared/src/admissoes/index.ts:180,182` (`funcaoNome`, `funcaoCbo` do teste) ·
`shared/src/admissoes/processos.ts:256,310` (`funcaoNome` da lista e do detalhe do processo) ·
`shared/src/admissoes/ficha.ts:173` (`funcaoNome` no cabeçalho da ficha).

### 2.4 Telas

`AdmissoesTestesPage.vue:418` · `TesteDetalhePainel.vue:142` (o único que já mostra CBO) ·
`ProcessosTabela.vue:106` · `ProcessoDetalheDialog.vue:333` · `FichaRevisaoPage.vue:75` ·
`pages/admissao.vue:420` — **a tela do candidato**, que é a mais sensível: ela mostra o que a pessoa
está sendo convidada a confirmar.

---

## 3. Onde o retrato vive, e por que não nos dois lugares ao mesmo tempo

| Tabela                                          | `funcao_id` hoje                            | O retrato entra?                                             |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `admissoes_testes`                              | **sempre preenchida** (`notNull`)           | **sim**, sempre, em toda linha nova                          |
| `admissoes_processos`, origem `admissao_direta` | preenchida (exigida pelo CHECK de origem)   | **sim**                                                      |
| `admissoes_processos`, origem `teste_efetivado` | **nula** por CHECK — a função mora no teste | **não.** Fica nula, e a leitura busca o retrato **do teste** |

É por isso que a leitura do processo já resolve por `coalesce(teste, processo)`: o retrato entra na
mesma forma, sem criar uma segunda fonte.

---

## 4. SQL COMPLETO — migration `0041`, para aprovação

> Puramente **aditiva**, com **uma** exceção declarada: a §4.2 refaz um CHECK existente. Nenhum
> `INSERT`, `UPDATE`, `DELETE`, `DROP COLUMN` ou carga.

### 4.1 As quatro colunas e os quatro CHECKs de formato

```sql
ALTER TABLE "admissoes_testes" ADD COLUMN "funcao_nome" text;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD COLUMN "funcao_cbo" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "funcao_nome" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "funcao_cbo" text;--> statement-breakpoint

ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_funcao_nome_check"
  CHECK ("admissoes_testes"."funcao_nome" is null
         or length(btrim("admissoes_testes"."funcao_nome")) > 0);--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_funcao_cbo_check"
  CHECK ("admissoes_testes"."funcao_cbo" is null
         or "admissoes_testes"."funcao_cbo" ~ '^[0-9]{6}$');--> statement-breakpoint

ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_funcao_nome_check"
  CHECK ("admissoes_processos"."funcao_nome" is null
         or length(btrim("admissoes_processos"."funcao_nome")) > 0);--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_funcao_cbo_check"
  CHECK ("admissoes_processos"."funcao_cbo" is null
         or "admissoes_processos"."funcao_cbo" ~ '^[0-9]{6}$');
```

**As colunas são ANULÁVEIS, e isso não é frouxidão.** Não existe `NOT NULL` possível aqui: as linhas
que já estão gravadas não têm retrato, e um `NOT NULL` com `DEFAULT` inventaria um nome que ninguém
combinou. **`NULL` é o marcador de "linha legada"** — é ele que a leitura usa para saber que precisa
cair no catálogo e avisar.

Quem garante que **toda linha nova** tem retrato é o **serviço**, e o teste que prova isso está na
§7. Um CHECK não consegue distinguir linha nova de linha antiga.

### 4.2 O CHECK de origem — a única alteração em coisa existente

```sql
ALTER TABLE "admissoes_processos"
  DROP CONSTRAINT "admissoes_processos_origem_coerencia_check";--> statement-breakpoint

ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_origem_coerencia_check" CHECK ((
        "admissoes_processos"."origem" = 'teste_efetivado'
        and "admissoes_processos"."teste_id" is not null
        and "admissoes_processos"."nome_completo" is null and "admissoes_processos"."cpf" is null
        and "admissoes_processos"."funcao_id" is null and "admissoes_processos"."turno_id" is null
        and "admissoes_processos"."jornada_horario" is null
        and "admissoes_processos"."funcao_nome" is null and "admissoes_processos"."funcao_cbo" is null
      ) or (
        "admissoes_processos"."origem" = 'admissao_direta'
        and "admissoes_processos"."teste_id" is null
        and "admissoes_processos"."nome_completo" is not null and "admissoes_processos"."cpf" is not null
        and "admissoes_processos"."funcao_id" is not null and "admissoes_processos"."turno_id" is not null
      ));
```

**Só duas linhas mudam**, as duas na metade `teste_efetivado`: o retrato do processo tem de ser nulo
quando a função mora no teste. Sem isso, **duas fontes seriam representáveis** — e a leitura resolve
por `coalesce`, então o teste venceria em silêncio e ninguém descobriria a divergência.

> **Este DROP/ADD é seguro, e a razão é verificável antes de rodar:** as duas colunas acabaram de
> nascer, então **toda linha existente tem `funcao_nome` e `funcao_cbo` nulos** e satisfaz o predicado
> novo. Não é o caso da `0037`, que refez um CHECK e encontrou uma linha legada que não o satisfazia.
>
> Conferência obrigatória antes de aplicar, em cada banco:
>
> ```sql
> select count(*) from admissoes_processos
>  where origem = 'teste_efetivado' and (funcao_nome is not null or funcao_cbo is not null);
> -- Precisa devolver 0. Devolveu outra coisa? PARE: alguém gravou retrato onde não devia.
> ```

> **DECIDIDO em 14/09/2026 — a §4.2 FICA.** Marco escolheu manter o CHECK. A razão registrada é a
> do projeto inteiro: o errado não deve ser representável, e depender só do serviço deixaria a
> segunda fonte possível. A conferência do quadro acima é **obrigatória** antes de aplicar, em cada
> banco.
>
> O parágrafo abaixo fica como estava, porque é a alternativa que foi pesada e recusada.

**Se você preferir NÃO mexer no CHECK**, a §4.2 inteira pode cair: a migration vira puramente aditiva
e segue o precedente do turno, cujas colunas de retrato também não estão em CHECK nenhum. O preço é
que a segunda fonte passa a ser representável, e a garantia passa a depender só do serviço.
**Recomendo manter a §4.2** — este projeto prefere que o errado não seja representável.

### 4.3 O que NÃO está no SQL, de propósito

- **Nenhum backfill.** Foi decidido que linha legada fica **sem** retrato e usa o catálogo como
  fallback identificado. Preencher a partir do catálogo de hoje seria gravar como "o que foi
  combinado" um nome que pode ter mudado depois — inventando história em vez de registrá-la.
- **Nenhum índice novo.** O retrato é lido junto da linha, nunca filtrado nem ordenado por ele.
- **Nenhuma FK.** O retrato é cópia, não referência — se apontasse para o catálogo, voltaria a mudar
  quando o catálogo mudasse, que é exatamente o defeito.
- **Nenhum trigger novo.** As duas tabelas já têm o de `atualizado_em`, e a lista literal do gate de
  migrations não muda.

### 4.4 Rollback

```sql
ALTER TABLE "admissoes_processos"
  DROP CONSTRAINT "admissoes_processos_origem_coerencia_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_origem_coerencia_check" CHECK ((
        "admissoes_processos"."origem" = 'teste_efetivado'
        and "admissoes_processos"."teste_id" is not null
        and "admissoes_processos"."nome_completo" is null and "admissoes_processos"."cpf" is null
        and "admissoes_processos"."funcao_id" is null and "admissoes_processos"."turno_id" is null
        and "admissoes_processos"."jornada_horario" is null
      ) or (
        "admissoes_processos"."origem" = 'admissao_direta'
        and "admissoes_processos"."teste_id" is null
        and "admissoes_processos"."nome_completo" is not null and "admissoes_processos"."cpf" is not null
        and "admissoes_processos"."funcao_id" is not null and "admissoes_processos"."turno_id" is not null
      ));--> statement-breakpoint

ALTER TABLE "admissoes_processos" DROP CONSTRAINT "admissoes_processos_funcao_cbo_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" DROP CONSTRAINT "admissoes_processos_funcao_nome_check";--> statement-breakpoint
ALTER TABLE "admissoes_testes" DROP CONSTRAINT "admissoes_testes_funcao_cbo_check";--> statement-breakpoint
ALTER TABLE "admissoes_testes" DROP CONSTRAINT "admissoes_testes_funcao_nome_check";--> statement-breakpoint

ALTER TABLE "admissoes_processos" DROP COLUMN "funcao_cbo";--> statement-breakpoint
ALTER TABLE "admissoes_processos" DROP COLUMN "funcao_nome";--> statement-breakpoint
ALTER TABLE "admissoes_testes" DROP COLUMN "funcao_cbo";--> statement-breakpoint
ALTER TABLE "admissoes_testes" DROP COLUMN "funcao_nome";
```

**O que o rollback NÃO desfaz, dito na cara:** ele devolve a estrutura, e **joga fora o histórico
coletado**. Todo retrato gravado entre a aplicação e o rollback é perdido — e não pode ser
reconstruído, porque o catálogo pode ter mudado nesse intervalo. É exatamente o dado que a decisão
existe para proteger.

Depois de voltar, as telas passam a exibir o nome atual do catálogo em tudo, como hoje. **Nada
quebra; a leitura do histórico é que volta a mentir.**

---

## 5. Schema Drizzle — a alteração proposta

Em `admissoes_testes`, logo após `funcaoId`:

```ts
    /**
     * RETRATO da funcao no ato da criacao. Nao e segunda fonte: responde outra pergunta. O catalogo
     * responde "o que e esta funcao hoje"; o retrato responde "o que foi combinado com esta pessoa".
     * Quando o DP renomeia a funcao, a primeira resposta muda e a segunda NAO pode — mesma razao
     * pela qual uma venda guarda o preco praticado, e pela qual o processo ja guarda o turno.
     *
     * ANULAVEL porque a linha LEGADA nao tem retrato, e inventar um seria gravar como combinado um
     * nome que ninguem combinou. `null` e o marcador de legado, e a leitura o usa para avisar.
     */
    funcaoNome: text("funcao_nome"),
    funcaoCbo: text("funcao_cbo"),
```

Idêntico em `admissoes_processos`, logo após `funcaoId` — e ali o retrato só é preenchido na origem
`admissao_direta`, porque na outra a função mora no teste.

Mais os quatro CHECKs de formato e as duas linhas novas no CHECK de origem, espelhando o §4.

---

## 6. Contrato — a alteração proposta

### 6.1 O que muda em cada DTO

| Contrato                                  | Hoje                                               | Depois                                                    |
| ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `TesteListaDto` / `TesteDetalheDto`       | `funcaoNome: string` · `funcaoCbo: string \| null` | **iguais** — o valor passa a vir do retrato quando houver |
| `ProcessoListaDto` / `ProcessoDetalheDto` | `funcaoNome: string \| null`                       | **+ `funcaoCbo: string \| null`**                         |
| Todos os quatro                           | —                                                  | **+ `funcaoRetratoAusente: boolean`**                     |
| `FichaPublicaDto.cabecalho`               | `funcaoNome: string \| null`                       | **iguais** — sem o marcador, ver §6.3                     |

### 6.2 `funcaoRetratoAusente` — o marcador de legado

```ts
  /**
   * `true` quando o nome e o CBO acima vieram do CATALOGO ATUAL, e nao do retrato — linha gravada
   * antes de o retrato existir.
   *
   * A tela usa isto para dizer que o valor pode ter mudado desde entao. Sem o marcador, legado e
   * retrato ficariam indistinguiveis, e a promessa de "o historico nao se reescreve" valeria so para
   * metade das linhas — sem que ninguem soubesse qual metade.
   */
  funcaoRetratoAusente: z.boolean(),
```

### 6.3 A ficha pública do candidato fica de fora do marcador

O cabeçalho que o candidato vê passa a ler o retrato como todo o resto, **mas não ganha o marcador**:
"este nome é de um cadastro antigo" é informação interna, para quem administra o catálogo — e não faz
sentido para quem está preenchendo a própria ficha. O candidato vê o nome; o marcador é do DP.

---

## 7. Testes exigidos, antes de isto ser chamado de pronto

| #         | Prova                                                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1**  | **O retrato é gravado na criação**: criar período de teste grava `funcao_nome` e `funcao_cbo` iguais aos do catálogo naquele instante. Conferido por SQL direto, não pela resposta da API.                           |
| **P0-2**  | **Idem para a admissão direta**, e o processo vindo de **teste efetivado** grava os dois **nulos** — se gravar, o CHECK de origem recusa.                                                                            |
| **P0-3**  | **Renomear não alcança o passado**: cria teste e processo, renomeia a função no catálogo, e a lista, o detalhe, a fila do DP e a ficha do candidato continuam exibindo o nome ANTIGO. É o caso que define a entrega. |
| **P0-4**  | **Trocar o CBO não alcança o passado** — mesma prova, para o outro campo.                                                                                                                                            |
| **P0-5**  | **Desativar e reativar não alteram exibição nenhuma** — o retrato não depende de `ativo`.                                                                                                                            |
| **P0-6**  | **Linha legada usa o catálogo e se declara**: linha com retrato nulo (inserida por SQL, como as que já existem) devolve `funcaoRetratoAusente: true` e o nome atual do catálogo.                                     |
| **P0-7**  | **Linha com retrato NÃO consulta o catálogo para o nome**: renomear a função e conferir que o valor devolvido não mudou — prova que a leitura prefere o retrato, e não que os dois coincidiam.                       |
| **P0-8**  | **CBO nulo continua nulo**: função sem CBO grava retrato de CBO nulo, e a tela não inventa traço nem zero.                                                                                                           |
| **P0-9**  | **Formato no banco**: `funcao_cbo` com 5 dígitos ou com letra é recusado por CHECK, por SQL direto.                                                                                                                  |
| **P0-10** | **O CHECK de origem recusa** processo de origem `teste_efetivado` com retrato preenchido.                                                                                                                            |
| **P0-11** | **Paridade `migrate` × `push`** continua verde, e a lista literal de triggers do gate não muda.                                                                                                                      |
| **P0-12** | **Navegador**: renomear a função pela tela de catálogo e conferir, na tela de Períodos de teste e na de Processos, que a linha antiga não mudou — e que a linha nova, criada depois, mostra o nome novo.             |

---

## 8. Ordem de execução, quando o SQL for aprovado

1. alterar `db/src/schema/app.schema.ts`;
2. gerar a migration (`0041`), **ler o SQL gerado linha a linha** e conferir contra a §4 — o gerador
   pode ordenar diferente, e o que vale é o que ele emitiu;
3. rodar a conferência da §4.2 em cada banco antes de aplicar;
4. contrato, repositórios, serviços e telas;
5. testes das §7;
6. gates, e só então commit.

**Nada disso começa antes da aprovação do SQL.**

---

## 9. O que este documento não fez

- Não gerou migration, não tocou no schema, não alterou contrato, serviço nem tela.
- Não aplicou nada em banco nenhum.
- ~~Não decidiu por você entre manter e derrubar a §4.2~~ — **respondido em 14/09/2026: a §4.2 fica.**
- Não propôs backfill: a decisão de 03/09 já disse que legado fica sem retrato.
- Não mexeu na questão de maiúsculas do nome (`40`, pendência 2), que é outra decisão.
