# S2 (refeito) — os campos do lançamento que aparecem e não salvam

> **Rode depois de commitar o S6/S7.** Este é o S2 do sprint de 29/07, que **nunca foi
> implementado** — os commits pulam de `f21b874` (S1) direto para `9338d10` (S3).
> Leia o `AGENTS.md` e o `PROJECT_BRAIN/19_REGISTRO_DE_REGRAS.md` antes de começar.

---

## Por que este prompt existe

Auditoria de 30/07, contra o código commitado: **9 dos 17 campos que o Rodrigo desenhou na FOTO 2
não chegam ao banco.** Eles aparecem na tela, o operador digita, clica em salvar, e o dado
evapora. Todos os 9 são deste S2.

Isso viola a R2 do `PROJECT_BRAIN/16` pelo nome — *"um operador que digita 'Juros' e não vê
salvar"* — e é a causa raiz de o José achar que "regras caíram em desuso". Não caíram uma a uma:
foram embora juntas quando o S2 foi pulado.

**A marca física do problema é o atributo `data-pendente="regra"` no template.** Ele existe em
`OperacaoLancamentoDatas.vue:28,32`, `OperacaoLancamentoFotos.vue:25` e
`OperacaoLancamentoCredor.vue:21,29`. Quando este prompt terminar, **não pode sobrar nenhum**.

---

## Escopo — as regras do registro (cite os ids nos commits)

| Id | Regra | Hoje |
|---|---|---|
| **R-041** | Juros em **R$ ou %** sobre o valor | grava só R$, reaproveitando `valor_acrescimo`. Não há `juros_tipo` e a tela não oferece o toggle |
| **R-042** | **Valor Total** = Valor + Juros | calculado inline no `.vue`. Não é função pura, não tem teste, não persiste |
| **R-044** | **Data do documento fiscal** (emissão) | `data-pendente`, some ao salvar |
| **R-045** | **Número do documento fiscal** | `data-pendente`, some ao salvar |
| **R-046** | **Tipo de credor** escolhido antes do credor | só estado de UI, não persistido |
| **R-047** | **Sócio/Gestor** como tipo de credor, com cadastro próprio | a tabela não existe; o chip cai nos *setores* e o id fica numa ref local |
| **R-049** | **Duas fotos** (comprovante + nota com itens) | só a 1ª salva; a 2ª guarda o nome do arquivo numa ref e some |

---

## Passo 1 · PARE — o SQL antes de tudo

Escreva a migration e **me mostre antes de gerar ou aplicar**. Regra R-111.

O que ela precisa cobrir, nas **três** tabelas (`despesas`, `mercadorias`, `retiradas`):

- `juros_tipo` — `'real' | 'percentual'`, nulo permitido (histórico não tem)
- `data_documento_fiscal` — `date`, nulo permitido
- `numero_documento_fiscal` — `text`, nulo permitido
- `credor_tipo` — `'fornecedor' | 'colaborador' | 'socio_gestor'`, nulo permitido
- `foto_nota_url` — `text`, nulo permitido
- `socio_gestor_id` — FK para a tabela nova

E a tabela nova `socios_gestores` (R-047, D1 do `PROJECT_BRAIN/17`): cadastro **simples**, por
empresa. A planilha confirma que a lista é curta — `RET. SÓCIOS - RODRIGO`, `PRO LABORE - RODRIGO`
(aba GRUPOSREF, col. X). Não invente campos além de nome, empresa e ativo.

**Decisões que quero ver justificadas no SQL, não silenciosas:**

1. **Juros: coluna nova ou reaproveitar `valor_acrescimo`?** Hoje o juros em R$ vai para
   `valor_acrescimo`, que é semanticamente "acréscimo", não "juros". Meça: `valor_acrescimo` é
   usado em algum outro lugar (relatório, DRE, fórmula de saldo)? Se for, separar é obrigatório;
   se não, reaproveitar com um comentário honesto é aceitável. **Traga a medição, não o palpite.**
2. **`credor_tipo` é derivável** de qual FK está preenchida. Então: coluna redundante ou não?
   Meu voto é **coluna**, porque o tipo é uma escolha do operador que precisa sobreviver mesmo
   se o credor for apagado, e porque a tela precisa reabrir no tipo certo. Mas argumente.
3. **CHECK de coerência:** `credor_tipo = 'socio_gestor'` deve exigir `socio_gestor_id`
   preenchido? Cuidado com o mesmo problema da 0017 — um CHECK rígido aborta na primeira linha
   legada. Provavelmente é "os dois nulos OU coerentes", como você fez lá.

**Não gere a migration antes do meu OK.**

---

## Passo 2 · Valor Total como regra pura (R-042)

Hoje o cálculo vive em `AppWorkspace.vue:311-320`. Sai de lá.

- Função pura em `shared/`, testada: `valorTotalCentavos(valor, juros, jurosTipo)`.
- Aritmética em **centavos inteiros**, como todo o resto do sistema.
- Percentual incide sobre o **Valor**, não sobre o total (R-041).
- Testes: R$ e %, zero, juros nulo, arredondamento de centavo.
- O backend recalcula e **não confia** no total vindo do cliente. Um total que chega pronto do
  front é um total que o front pode mentir.

---

## Passo 3 · Credor tipado (R-046, R-047)

- Cadastro de sócios/gestores: migration + repository + service + controller + tela, no padrão dos
  outros cadastros. Nada de endpoint inventado (R-117 do AGENTS).
- O seletor de tipo troca a lista do campo Credor: fornecedor → fornecedores, colaborador →
  colaboradores, sócio/gestor → sócios.
- **Mate o caminho antigo:** hoje "Sócios/setores" cai na lista de *setores* e há um
  `TODO(regras)` em `useOperacaoLancamento.ts:132`. Remova o TODO e o desvio — não deixe os dois.
- Ao **editar** um lançamento, o tipo tem que reabrir corretamente a partir do que foi salvo.

---

## Passo 4 · A segunda foto (R-049)

Já existe upload funcionando para `foto_documento_url`. **Reuse o mecanismo** — não escreva um
segundo caminho de upload. Se o atual estiver amarrado a um único campo, generalize-o.

Nomes que o desenho usa: foto 1 = recibo/boleto/nota; foto 2 = nota com os itens.

---

## Passo 5 · Ligar tudo e apagar as marcas

- Zod (`shared/`), payload, service e repository de **despesa, mercadoria e retirada**. Os três.
- **Remova todos os `data-pendente="regra"`** dos componentes do modal.
- Ao reabrir um lançamento salvo, **todos** os campos novos voltam preenchidos. Salvar e não
  conseguir reabrir é meio caminho, e meio caminho aqui é o defeito que estamos consertando.

---

## Passo 6 · O gate que impede isto de acontecer de novo

Adicione ao script de check do repositório uma verificação que **falha o build** se encontrar
`data-pendente` em qualquer arquivo de `web-vue/`.

Motivo escrito no próprio script: `data-pendente` marca campo que aparece na tela e não persiste.
É a assinatura do defeito que matou 9 regras neste projeto. Se um dia for legítimo usá-lo de novo,
que seja uma decisão consciente de remover o gate — não um esquecimento silencioso.

---

## Testes obrigatórios (integração, contra banco real)

1. Despesa com **juros em %** → `valor_total` correto no banco, `juros_tipo = 'percentual'`.
2. Despesa com juros em R$ → idem, `juros_tipo = 'real'`.
3. Lançamento com **data e número do doc fiscal** → gravados; **reabertos** na edição.
4. Retirada com **sócio/gestor** → `credor_tipo = 'socio_gestor'` e `socio_gestor_id` corretos.
5. Lançamento com **as duas fotos** → as duas URLs no banco.
6. Os três domínios (despesa, mercadoria, retirada) cobertos — não só despesa.
7. Total calculado no backend **ignora** um total divergente enviado pelo cliente.

---

## Fechamento

- Commits por passo, citando o id da regra (ex.: `feat(lancamentos): juros em R$ ou % (R-041)`).
- Atualize a coluna **Status** do `PROJECT_BRAIN/19` para cada regra que fechar. Registro
  desatualizado mente, e um registro que mente é pior que não ter.
- `lint` + `check` + testes verdes.
- **NÃO MERGEIE** (R-110).
- No resumo: o que fechou, **o que não fechou**, e o que precisa de decisão do José.

## Fora deste prompt

Não faça agora: identidade visual Cicluz, acentuação da UI, menu pelo Xmind, os 3 níveis de
desconto pela tela (R-054), "mostrar onde diverge" no front (R-057), transferência sem caixa
aberto (R-032). Cada um vira entrega própria — foi misturar tudo que produziu o Frankenstein.
