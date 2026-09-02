# 37 — Admissão: a ficha pública do candidato (V3) e os dependentes (V4)

> Aberto em 02/09/2026, branch `feat/admissoes-testes-tnp`. Piloto na **TNP**.
> Continua a `35` (mapa do fluxo) e o pacote de aprovação V2–V4. Diferente da `35` e da `36`, que são
> registro de decisão, **este documento descreve código que existe**: migrations `0037` e `0038`,
> rotas, telas e testes.
>
> Ambiente de teste. O aviso de privacidade em vigor é o de **teste** (`AVISO-TESTE-ADMISSAO-V1`), e
> ele não pode vigorar em produção — a guarda é de servidor, não de botão. Ver §6.

## O que estas duas verticais decidem, em uma linha

Que o **candidato preenche a própria ficha por um link, sem ter conta no sistema** — e que a partir
da V4 ele declara os dependentes, com **CPF conferido em três lugares: tela, servidor e banco**.

---

## 1. A ficha pública (V3)

### 1.1 A única tela sem login

`web-vue/pages/admissao.vue` é a única superfície do sistema aberta a quem não tem conta. Por isso
ela não monta `AppWorkspace`, não lê sessão, não usa `usePermissoes` e não aparece em `itemPorTela` —
se aparecesse, viraria item de menu para todo mundo. Um teste de varredura (`convite-token.test.ts`)
trava as três ausências, porque nenhuma delas quebra o build quando alguém as reintroduz.

### 1.2 O token, e por onde ele NÃO anda

| Onde | Vale? | Por quê |
| --- | --- | --- |
| Fragmento da URL (`#t=…`) | **sim**, e só na chegada | Fragmento não é enviado ao servidor, não entra no log nem no `Referer` |
| Cabeçalho `x-admissao-convite` | **sim** | É como cada requisição se identifica |
| Caminho ou query da rota | **não** | `req.url` é registrado pelo logger em toda requisição |
| `localStorage`, `sessionStorage`, cookie | **não** | Sobreviveria à aba e ao aparelho emprestado |
| Título, console, captura de erro | **não** | Sai da máquina sem ninguém decidir que sairia |

Na chegada, a página lê o fragmento e **apaga a barra de endereços** com `history.replaceState`. Link
compartilhado por engano, print de tela e histórico do navegador deixam de carregar o segredo.

O que o banco guarda é o **SHA-256** do token. O texto em claro aparece uma vez, na emissão, e não há
rota que o recupere depois.

### 1.3 Os três estados de um link

| Situação | Resposta | Por quê essa e não outra |
| --- | --- | --- |
| Token não bate com nenhuma linha | **404** | Não confirma existência a quem está adivinhando |
| Convite revogado | **410** | Quem tem o link merece saber que ele acabou |
| Convite expirado | **410** | Idem — e com instrução de pedir outro ao RH |
| Cabeçalho ausente | **401** | Não houve tentativa de identificação |

Isso só é possível porque a busca por hash roda **sem filtro de empresa e sem filtro de revogação**:
a empresa sai dali, e o revogado precisa ser encontrado para virar 410 em vez de 404.

### 1.4 A empresa nunca vem do cliente

Há dois caminhos e duas fontes de empresa, e **nenhuma das duas é o corpo da requisição**:

- caminho interno (DP): `empresaDoAtor(perfil)`, com três recusas 403 fechadas;
- caminho público (candidato): a linha do **convite**, achada pelo hash do token.

Não existe `empresaId` nem `processoId` em nenhum contrato público. Um campo opcional bastaria para
alguém voltar a ler do cliente "só nesse caso".

### 1.5 O ator externo na trilha

A trilha do processo é append-only e sempre teve autor humano. O candidato não tem perfil, e a
solução aprovada (**D-1, opção B**) foi dar ao evento uma segunda referência possível:

```
convite_id  →  admissoes_convites
CHECK: num_nonnulls(ator_usuario_id, convite_id) = 1
```

XOR, não "um dos dois pode ser nulo": todo evento tem **exatamente um** autor. Não foi criado usuário
técnico "sistema" — um autor falso é pior que autor externo declarado.

---

## 2. Dependentes (V4)

### 2.1 O que o candidato faz

Lista, cadastra, edita e remove dependentes **pelo mesmo link**, na mesma página, sem segundo
formulário e sem segunda rota para o mesmo ato. Quatro rotas públicas, todas pelo convite:

```
GET    /api/admissao/dependentes
POST   /api/admissao/dependentes
PUT    /api/admissao/dependentes/:id
DELETE /api/admissao/dependentes/:id
```

O `:id` é o id do dependente, **nunca** um token. O teste de varredura de rota pública passou a ler os
dois controllers e a exigir que o único parâmetro de caminho seja `:id`.

### 2.2 Por que o CPF do dependente é opcional

São dados de **terceiros**, muitas vezes de crianças, de gente que pode nunca ser admitida. Criança
costuma não ter CPF, e exigir criaria dado falso — que é pior que dado ausente. Quando o CPF vem, ele
vem **válido**.

A coluna `finalidades` registra **para que** cada dependente foi informado (imposto de renda,
salário-família, plano de saúde). Ela existia desde a `0037` e ninguém a preenchia: coletar dado de
menor sem finalidade declarada é exatamente o defeito que a coluna previne.

### 2.3 A declaração: cinco estados, e só três são válidos

`sem_dependentes` é **nullable de propósito**. Ausência de dependente é **declaração**, não tabela
vazia.

| Estado | `sem_dependentes` | Linhas | Pode enviar? |
| --- | --- | --- | --- |
| não respondeu | `NULL` | 0 | **não** — o contrato exige a resposta |
| declarou que não tem | `true` | 0 | sim |
| declarou e cadastrou | `false` | ≥ 1 | sim |
| incoerente A | `true` | ≥ 1 | **recusado** (409) |
| incoerente B | `false` | 0 | **recusado** no envio (409) |

As transições, que o serviço mantém:

- **cadastrar** um dependente com `true` gravado → passa a `false`. A declaração vira mentira no
  instante em que alguém é cadastrado.
- **remover o último** → volta a `NULL`, e **não** a `true`. Apagar não é declarar: quem tirou o único
  dependente pode estar corrigindo um erro de digitação, e marcar `true` por ele poria na ficha uma
  declaração que o candidato nunca fez. Ele responde de novo, conscientemente.
- **rascunho** aceita `false` com lista vazia — é o estado normal de quem acabou de marcar que tem e
  ainda vai cadastrar. A coerência completa só é cobrada no **envio**.

> **O CHECK do banco não consegue fazer isso.** Ele cobra que a declaração **exista** no ramo
> `enviada`; não consegue cobrar que ela seja **verdade**, porque `CHECK` não enxerga outra tabela. A
> conferência é no serviço, dentro do lock da ficha — o mesmo lock que as rotas de dependente tomam,
> então ninguém cadastra alguém entre a contagem e a gravação.

### 2.4 Concorrência: o que o banco garante e o que ele não garante

Todas as escritas tomam `FOR NO KEY UPDATE` na **ficha** antes de qualquer coisa. A ficha é o ponto
único de contenção do processo; usar outro lock — ou nenhum — deixaria duas abas gravarem em paralelo.

| Caso | Quem garante | Resultado |
| --- | --- | --- |
| Mesmo CPF, duas abas | índice único parcial `(processo_id, cpf)` | segunda perde, com **409**, não 500 |
| CPF duplicado por SQL direto | o mesmo índice | `23505` |
| **Sem CPF, duas abas** | **ninguém** | duas linhas iguais são possíveis |

A última linha é **lacuna conhecida e deliberada**, não esquecimento: o índice é parcial porque o CPF
é opcional, e fechá-la exigiria um índice novo sobre nome + nascimento — que recusaria irmãos gêmeos
homônimos e casos legítimos de grafia repetida. Fica registrada aqui para não ser "descoberta" como
defeito nem "corrigida" sem decisão.

---

## 3. D-7 — APROVADA: o dígito verificador passa a ser conferido pelo banco

> **Decisão de Marco, 01/09/2026.** "CPF de dependente precisa validar dígito verificador também no
> BANCO, não somente no Zod/API."

### 3.1 O que havia antes

O banco conferia **formato**: `cpf ~ '^[0-9]{11}$'`. Onze dígitos quaisquer entravam. A regra de
verdade vivia só no Zod, e um caminho novo que esquecesse o contrato gravaria CPF inválido de um
terceiro — possivelmente uma criança — sem ninguém descobrir até alguém precisar do dado.

### 3.2 Como o banco recusa (migration `0038`)

Ele **refaz a conta da Receita**, dígito por dígito:

1. 10º dígito: soma os 9 primeiros com pesos 10…2, multiplica por 10, tira o resto por 11. O resto 10
   precisa virar 0 — que é o que o resto por 10 no fim faz, sem precisar de `CASE`.
2. 11º dígito: o mesmo com os 10 primeiros e pesos 11…2.
3. Se qualquer um dos dois não bater com o dígito gravado, o `INSERT` morre.

Mais duas guardas que **não são redundantes**:

- **sequência repetida** (`cpf = repeat(substring(cpf,1,1), 11)`) — as onze sequências (`000…`,
  `111…`) **passam** na aritmética do módulo 11 e precisam ser recusadas à parte;
- **`CASE`, e não `AND`** — o Postgres não garante ordem de avaliação dentro de um `AND`. Com `and`, o
  `::int` pode rodar antes do regex, e um valor com letra viraria erro `22P02` em vez de violação de
  `CHECK`: rejeitado do mesmo jeito, mas por uma porta que o tratamento de erro não conhece. `CASE` é
  o mecanismo que a documentação garante.

### 3.3 Expressão inline, e não função `IMMUTABLE`

A alternativa natural seria uma função `cpf_valido(text)` — mais legível, reutilizável nas outras três
colunas de CPF do sistema. **Foi recusada**, e o motivo é operacional:

> `drizzle-kit push` **não cria funções**. Um `CHECK` que chama função exigiria criá-la antes do push
> em `db/setup-dev.mjs` **e** em `tests/setup/testcontainers.ts` — o mesmo caminho de provisionamento
> que neste repositório já produziu tabela sem trigger. Expressão inline **não tem o que faltar no
> push**.

O preço é ilegibilidade, pago com comentário no schema. O ganho de reuso era especulativo: a D-7 pede
uma coluna, e as outras três exigiriam validar as linhas já gravadas — decisão própria, não tomada
aqui.

### 3.4 A conferência que o gate não fazia

`migracoes.test.ts` compara constraints por `conrelid`/`conname` — **não** pelo texto da expressão.
Uma divergência entre o caminho `migrate` e o caminho `push` passaria despercebida. A prova que vale é
comportamental: a suíte tenta gravar CPF com dígito errado **por SQL direto**, sem a API no caminho, e
exige recusa.

---

## 4. Onde cada regra do CPF vive

| Camada | Arquivo | O que garante |
| --- | --- | --- |
| Tela | `web-vue/pages/admissao.vue` | erro imediato, antes de sair da máquina |
| Contrato | `shared/src/admissoes/cpf.ts` | `cpfValido` — a conta canônica, uma só |
| Servidor | `shared/src/admissoes/dependentes.ts` | `cpfTesteSchema` opcional; vazio vira `NULL` |
| Banco | migration `0038` | a mesma conta, para **qualquer** caminho |

A tela **não tem cópia do algoritmo**: importa `cpfValido` da raiz de `@padaria/shared`. Uma cópia
seria o defeito — e neste repositório já foi, quando a matriz de cargos vivia duplicada no seed.

---

## 5. O que estas verticais NÃO fazem

Registrado para não parecer esquecimento:

- **documentos e anexos** — nenhum upload, nenhum storage, nenhum `multipart`;
- **dados de saúde** — o aviso de teste proíbe explicitamente, e não há campo;
- **efetivação do colaborador** e **integração Conplus** — fora de escopo;
- **importação CSV / pré-cadastro** — é a `36`, e continua sem implementação;
- **o DP vendo a lista de dependentes** — a ficha de revisão mostra a *declaração*, não a lista. Falta
  a tela, e ela é a próxima decisão natural: hoje o DP aprova sem ver quem foi declarado.

---

## 6. As guardas do aviso de teste, e por que são três

`AVISO-TESTE-ADMISSAO-V1` diz, na primeira linha, **"Ambiente de teste — não use dados pessoais
reais."** Ele não é aviso jurídico da Pralis e não vale como base legal.

A versão vigente mora em **constante versionada no código** (D-8) — não em variável de ambiente, não
em tabela configurável pela tela. Mudar o aviso é mudar a base jurídica da coleta, e isso tem de passar
por revisão, commit e deploy. Variável de ambiente muda sem revisor; tabela deixa o DP alterar sozinho
o texto que a pessoa já aceitou.

| Guarda | Onde | O que impede |
| --- | --- | --- |
| **G-1** | `avisoVigenteDoAmbiente` | abrir o formulário em produção sob aviso de teste |
| **G-2** | emissão do convite | emitir link novo em produção |
| **G-3** | `aceiteDeAvisoPermitido` | **gravar aceite** em produção |

G-3 é separada de G-2 de propósito: um convite emitido **antes** de uma promoção de ambiente
continuaria coletando depois dela, e a guarda da emissão já teria passado. Aceite de teste se
reconhece pelo **prefixo** da string gravada — não por coluna, flag ou memória de quem estava lá.

---

## 7. Bloqueios que continuam de pé

1. **O aviso de privacidade oficial não existe.** Enquanto ele não entrar no registro, nada disto pode
   sair de ambiente de teste. É o mesmo bloqueio 1 da `35`.
2. **Retenção não está decidida.** Dependente de processo cancelado hoje some por
   `on delete cascade` do processo. Guardar para sempre e apagar junto são decisões diferentes, e
   nenhuma foi tomada.
3. **Duplicidade de dependente sem CPF** — §2.4.
4. **O DP não vê os dependentes** — §5.

---

## 8. Como isto foi provado

- **`0038` por `migrate`, nunca em banco persistente.** A migration foi gerada, lida e exercitada em
  banco descartável; a expressão foi conferida contra o Postgres real em tabela temporária, com CPF
  válido, CPF de dígito errado, sequência repetida, valor com letra, valor curto e `NULL`.
- **Dígito verificador e duplicidade provados duas vezes**, pela API e por SQL direto — um teste que
  só passa pela API prova o Zod, não o banco.
- **Isolamento provado contra alvo que existe**: um dependente real de outra empresa, e um de outro
  candidato da mesma empresa. Id inexistente também daria 404 e não provaria nada.
- **A allowlist do default-deny é enumerada por teste.** Abrir uma rota ao público passa a ser um diff
  que alguém precisa aprovar, em vez de acontecer em silêncio.
