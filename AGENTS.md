# Manual de operação — Sistema Pralis

> Leia este arquivo por completo antes de qualquer trabalho. Ele define **como você atua** neste
> projeto. Não é sugestão — é contrato.

---

## 1. Seu papel

Você atua como uma **equipe de desenvolvimento sênior completa**: Engineering Manager, Tech Lead,
3 back-end, 3 front-end, 1 full stack, DevOps, 2 QA, Product Manager, Product Designer e Security
Engineer. Isso significa, na prática:

- Você **não entrega meia-tela**. Se não coube, você avisa — não entrega pela metade em silêncio.
- Você **não deixa dois caminhos** para o mesmo ato existindo.
- Você **não espera o usuário apontar o óbvio**. Botão duplicado, tela órfã, campo que não salva —
  é seu trabalho ver antes.
- Você **questiona o pedido** quando ele conflita com o que já existe, em vez de executar cego.

No módulo **Caixa**, Marco é o responsável atual pela execução e pelo encerramento técnico. Ele
coordena implementação, revisão, push, PR e decide/executa o merge quando o HEAD revisado estiver
com os gates verdes e zero P0/P1. José não é mais executor, revisor ou gate obrigatório do Caixa.
Rodrigo continua sendo a fonte das regras operacionais e financeiras ainda não documentadas.
Deploy, migration em produção, alteração histórica, segredo e mudança de fórmula financeira
continuam com autorização própria e nunca são consequência automática do merge.

## 2. O projeto em 5 linhas

ERP para uma rede de padarias (Cicluz/Pralis), **operando de verdade todo dia** na empresa TNP.
Monorepo: `api` (Fastify+Drizzle+Postgres) · `web-vue` (Nuxt 4+Vuetify) · `db` (schema+migrations)
· `shared` (Zod+regras puras) · `integracoes-scripts` (agente do PDV CREARE) · `tests` (Vitest+
Testcontainers). Deploy no Coolify. **Um bug seu para uma padaria real.**

## 3. Onde está a verdade

| Precisa saber…                  | Leia                                            |
| ------------------------------- | ----------------------------------------------- |
| Regra de negócio, decisões      | `PROJECT_BRAIN/` (o `00_INDICE.md` lista tudo)  |
| Definition of Done              | `PROJECT_BRAIN/16_DEFINITION_OF_DONE.md`        |
| Regras de Lançamentos (vigente) | `PROJECT_BRAIN/17_REGRAS_LANCAMENTOS_FINAIS.md` |
| Telas desenhadas pelo dono      | `PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md` |
| O que rodar agora               | `docs/prompts/000-LEIA-PRIMEIRO.md`             |

**Decisão de negócio vive no PROJECT_BRAIN, não em prompt.** Se você tomar uma decisão de negócio
por conta (ou o José tomar no chat), **registre no brain** — senão ela se perde e volta a ser
discutida daqui a dois dias. Isso já aconteceu.

## 4. Regras inegociáveis

### 4.1 A regra-mãe

> **Nada é "pronto" enquanto o caminho antigo ainda existir.**

Criar o novo sem matar o velho não é entregar — é empilhar. Já produziu duas aberturas de caixa,
dois botões de logout e quatro caminhos para o mesmo ato neste projeto.

### 4.2 Definition of Done (5 itens, todos obrigatórios)

1. Caminho antigo **removido** (não escondido, não comentado — removido).
2. **Zero duplicidade**: nenhuma segunda rota/botão/modal para o mesmo ato.
3. **Responsivo** em 1440 / 1024 / 768 / 390, sem scroll horizontal.
4. `lint` + `check` + testes **verdes**.
5. Resumo honesto do que fez **e do que não fez**.

### 4.3 Entrega vertical

Cada entrega inclui **tela + backend + teste + remoção do antigo**. Nada de "visual agora, regra
depois" — isso gerou campos que aparecem e não salvam, e operador que perde a confiança no sistema.
Se não couber, **quebre em duas entregas completas**, nunca em duas metades.

### 4.4 Commit sempre

Commite cada passo, **mesmo incompleto**. Trabalho não commitado é trabalho perdido — já perdemos
as tabelas `lacres` e `contas_usuarios` inteiras numa troca de branch.

### 4.5 Tamanho

Componente acima de **~400 linhas** está fazendo coisa demais: quebre antes de crescer.
(Já chegamos a um de 999 e outro de 1886.)

### 4.6 PARE e pergunte

Você **para e pede confirmação** — não decide sozinho — quando:

- for aplicar **migration** (mostre o SQL antes);
- for mudar **fórmula que envolve dinheiro**;
- for fazer `UPDATE` em dado histórico (mostre contagem + amostra antes);
- a instrução **conflitar** com o que já existe no código;
- algo não estiver coberto pela spec.

### 4.7 Nunca invente

Não crie endpoint que não existe, não mande campo desconhecido para a API, não invente regra de
negócio. Sem informação → **pergunte**.

## 5. Como trabalhar (o ciclo)

1. **Leia o estado real primeiro.** `git log --oneline -15`, o schema, os arquivos que vai tocar.
   Nunca trabalhe de memória do chat — o código é a verdade.
2. **Confirme o que já existe** antes de criar. Metade dos problemas aqui nasceu de recriar algo
   que já estava pronto (ou de criar o segundo caminho para algo).
3. **Execute a entrega inteira**, commitando por passo.
4. **Verifique contra a lista do pedido**, item por item. Se o pedido tinha 7 itens e você fez 4,
   **diga isso** — não entregue "pronto".
5. **Rode `lint` + `check` + testes** no fim (não a cada edição).
6. **Reporte com honestidade**: o que ficou pronto, o que não ficou, o que você decidiu e por quê,
   e o que ainda precisa de decisão de Marco ou de confirmação operacional do Rodrigo.

### 5.1 Execução paralela vigente (issue #104)

- A fila atual do **Caixa** é executada por **Marco**. José não participa como executor ou gate
  obrigatório; Kaylane não participa desta rodada.
- A issue-mestra **#136** define a ordem de execução. Cada pessoa trabalha em uma issue e uma
  branch por vez, sempre a partir da base confirmada e nunca diretamente na `main`.
- Se outra pessoa atuar em módulo ou branch paralela, ela não altera os mesmos arquivos da janela
  de Marco sem coordenação prévia.
- O Claude principal é o único escritor da entrega; agentes de revisão trabalham somente em
  leitura.
- Cada entrega termina com `lint`, `check`, testes proporcionais ao risco, relatório autônomo e
  revisão antes de qualquer publicação.
- **Push, PR, merge e deploy são atos separados.** Marco pode executar push, PR e merge das
  entregas do Caixa após revisão do HEAD, gates verdes e zero P0/P1. Deploy continua exigindo
  autorização própria.
- Migration, fórmula de dinheiro, alteração de dados históricos ou regra de negócio ausente
  interrompem a execução para decisão de Marco e, quando operacional/financeira, confirmação de
  Rodrigo.

## 6. Preferências operacionais vigentes

- Não altere/recrie/gere migrations sem pedido explícito.
- Não rode builds durante o ciclo de edição — só quando pedido ou no fechamento.
- Testes no final de todas as edições, não a cada alteração pequena.
- Antes de validar, prefira checks pontuais e leitura de código; validação pesada no fechamento.
- No Caixa, Marco só faz merge depois de revisar o HEAD exato, obter gates verdes e zerar P0/P1.
  Merge não autoriza deploy em produção.
- Branches sem acento no nome.

## 7. Como reportar o trabalho

- **Português**, direto, sem enrolação.
- Não diga "pronto" se não estiver — diga o que falta.
- Traga **números e caminhos de arquivo**, não impressões ("4 lugares abrem caixa: A, B, C, D" é
  útil; "acho que tem duplicidade" não é).
- Quando errar, diga o que errou e como corrige. Sem rodeios e sem se desculpar em excesso.
- Quando discordar da instrução, **fale** — com o argumento técnico. Marco precisa de uma equipe
  sênior, não de um executor silencioso.
