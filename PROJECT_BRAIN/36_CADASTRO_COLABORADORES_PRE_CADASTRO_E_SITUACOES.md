# 36 — Cadastro de colaboradores: pré-cadastro, importação contábil e situações

> Aberto em 01/09/2026, branch `feat/admissoes-testes-tnp`. Piloto na **TNP**.
> Nasce de duas perguntas que a `35` deixou fora do fluxo de admissão: **de onde vem quem já
> trabalha na empresa**, e **como se diz o que essa pessoa está fazendo hoje**.
>
> **Nada aqui foi implementado.** É registro de decisão e de bloqueio, para a próxima vertical não
> começar por adivinhação. Nenhuma migration, nenhum schema, nenhuma carga.

## O que este documento decide, em uma linha

Que **importação não cria colaborador operacional** — ela cria **pré-cadastro**, uma fila que o DP
revisa antes de qualquer coisa virar gente no sistema.

---

## 1. A fonte contábil, e por que ela não é carga

A contabilidade entregou três arquivos com extensão `.CSV`. **Nenhum é CSV tabular.** Os três são o
mesmo relatório de folha em **layout de ficha** — moldura desenhada em arte ASCII, rótulo à esquerda
e valor à direita, seções repetidas por pessoa. A extensão mente.

| Medida | Valor |
| --- | --- |
| Fichas no arquivo maior | **200** |
| Nomes distintos (contagem informada pela operação) | **193** |
| CPFs distintos (medido na estrutura) | **192** — 8 CPFs aparecem em 2 fichas, com matrículas diferentes |
| Lista de ativos fornecida pela operação | **36 pessoas** |
| Correspondências exatas por nome normalizado | **23** |
| Pessoas da lista ativa **sem ficha** | **13** |
| Cobertura extra do segundo arquivo | **nenhuma** — as 23 fichas dele já estão no maior |
| Terceiro arquivo | 6 fichas, subconjunto dos outros dois |

> **As duas contagens de "distintos" não se contradizem: elas medem coisas diferentes.** 193 é
> contagem de **nome**; 192 é contagem de **CPF**. Um nome grafado de dois jeitos, ou duas pessoas
> homônimas, explicam a diferença de um. Quem for conciliar precisa saber qual das duas está usando.

**Os 8 CPFs repetidos são a primeira decisão de modelagem**, e não uma sujeira a limpar: podem ser
readmissão — dois vínculos legítimos da mesma pessoa — ou duplicidade cadastral. A resposta define se
a identidade é **pessoa (CPF)** com N **vínculos (matrícula)**, ou uma linha só. Escolher errado aqui
custa caro depois.

**Carga direta é proibida.** Não por cautela genérica, por três fatos da estrutura:

- cerca de **40% das linhas são moldura ou vazio** — não são dado;
- as seções são **opcionais e de tamanho variável** (férias, afastamentos, valores sindicais
  aparecem só em parte das fichas), então a ficha oscila de 113 a 162 linhas e nenhum parser de
  posição fixa funciona;
- há **data sentinela `30/12/1899`** (zero-date de sistema antigo) que, importada como data real,
  corrompe o cadastro em silêncio.

Some-se a isso o estado do preenchimento: **banco, agência, conta e FGTS estão 100% vazios**;
reservista e conselho profissional, 100% vazios; **RG ausente em metade**; e o PIS vem com valor
sentinela de zeros em **57%**. Importar isso como se fosse cadastro pronto produz 200 colaboradores
que ninguém pode usar.

> **Antes de investir num parser, vale pedir à origem uma exportação tabular ou eSocial.** Fazer
> engenharia reversa de relatório de impressão é trabalho que se joga fora quando o formato certo
> aparece. Esta é uma recomendação, não uma decisão tomada.

**O que os arquivos NÃO têm:** telefone, e-mail, dependentes, fotos, anexos, exames ou ASO. Não há
nenhum binário embutido — o "espaço para polegar direito" é um retângulo desenhado para impressão em
papel. Ou seja: **a ficha contábil não resolve documentos nem dependentes**, que continuam
dependendo da ficha do candidato (`35`, V3 e V4).

---

## 2. Arquitetura de tela

A seção **Configuração** passa a ter seis entradas, nesta ordem de leitura:

| Entrada | O que é |
| --- | --- |
| **Colaboradores** | quem já está efetivado e operando |
| **Pré-cadastros** | **fila nova** — o que veio da importação e ainda não é ninguém |
| **Períodos de teste** | ADM-001 |
| **Processos de admissão** | ADM-002/ADM-003 |
| **Funções operacionais** | catálogo, hoje sem tela (só leitura por API) |
| **Turnos** | catálogo |

**Pré-cadastro é tela própria, e não uma aba de Colaboradores.** Misturar as duas faria a lista de
quem trabalha na padaria conviver com linhas que ninguém conferiu — e a primeira pessoa a abrir a
tela não saberia dizer quais são reais.

---

## 3. O fluxo, e o degrau que não se pula

```
CSV → prévia controlada → pré-cadastro → revisão do DP →
processo de admissão → efetivação → colaborador operacional → Conplus
```

**Nunca criar colaborador operacional direto por importação.** A prévia é leitura: mostra o que o
arquivo tem, o que casou, o que não casou, e não grava nada. O pré-cadastro é a fila revisável. Só
depois da revisão do DP a pessoa entra no fluxo de admissão que a `35` descreve.

O motivo é o mesmo da regra-mãe do `AGENTS.md`: um segundo caminho para "virar colaborador" faria
existir gente no sistema por dois processos diferentes, um deles sem ninguém responsável.

---

## 4. Situações: dois vocabulários que não se misturam

Este é o ponto onde a conversa mais escorrega. **São duas perguntas diferentes**, e responder as
duas com a mesma palavra produz relatório que ninguém consegue ler.

### 4.1 Situação de IMPORTAÇÃO — sobre a linha do arquivo

`encontrado` · `dados incompletos` · `sem fonte` · `duplicidade` · `não é ativo` · `revisado`

Descreve **o que aconteceu com aquela ficha na conciliação**. Morre quando o pré-cadastro é
resolvido. Não acompanha a pessoa.

### 4.2 Situação do COLABORADOR EFETIVO — sobre a pessoa

Duas camadas, e a segunda é **derivada**, nunca digitada:

- **Vínculo:** `ativo` ou `desligado`.
- **Disponibilidade:** `trabalhando` · `férias` · `atestado` · `afastado pelo INSS` · `licença`.

### 4.3 O que o schema tem hoje

**Quase nada.** Existe apenas `colaboradores_faltas_justificadas`, com **motivo em texto livre**.
Não existem férias, atestado, afastamento pelo INSS, desligamento, nem qualquer campo de "situação
atual". A disponibilidade de hoje, portanto, **não é consultável** — ela vive na cabeça de quem
escala.

### 4.4 O que NÃO está decidido

Registro como pendência, e **não como fato**: nada aqui virou enum, coluna ou migration.

- **Precedência.** Se uma pessoa tem férias e atestado no mesmo dia, o que a tela mostra? A regra
  precisa ser única e escrita, senão cada consulta inventa a sua.
- **Sobreposição de períodos.** O banco deve impedir dois afastamentos que se cruzam, ou aceitar e
  deixar a precedência resolver? A primeira opção é constraint; a segunda é convenção — e este
  projeto prefere constraint.
- **Responsável por cada lançamento.** Férias é do DP; atestado chega pela chefia; INSS vem de fora.
  Sem dono declarado, o campo vira depósito.
- **LGPD de saúde.** Atestado e INSS são **dado sensível**. Guardar o *motivo* do afastamento é
  diferente de guardar que existe afastamento — e a segunda forma resolve escala sem carregar
  diagnóstico. A decisão precisa ser explícita antes de existir coluna.
- **Derivação vs coluna.** Pela disciplina da `31` (D-2) e da `33` (C-3), situação é **derivada** e
  não tem coluna, índice nem filtro paralelo. Se a disponibilidade for derivada de períodos, ela
  segue a regra; se virar coluna gravada, contradiz as duas verticais anteriores.

---

## 5. Limites que valem agora

- **A ficha contábil não traz fotos nem arquivos de documento.** Documentos continuam bloqueados
  pela política que a `35` chama de BLOQUEIO 2.
- **Saúde exige minimização e acesso restrito.** Nenhum campo de saúde entra sem decisão registrada.
- **Conplus segue sem contrato, sem API e sem códigos homologados.** Não há o que integrar.
- **CPF só pode ser usado para conciliar depois de decisão de segurança e revisão do DP.** Conciliar
  por CPF é o caminho certo tecnicamente e o mais sensível juridicamente: casar duas bases pela
  chave da pessoa é exatamente o que a LGPD trata como cruzamento. A alternativa usada até aqui,
  nome normalizado, é fraca — foi ela que produziu as 23 correspondências e as 13 sem ficha, e não
  distingue homônimo.

---

## 6. Aviso de privacidade **de teste** — decisão de 01/09/2026

> Esta decisão pertence tematicamente à `35` (o link do candidato é a V2). Fica registrada aqui por
> determinação de Marco, e a `35` deve ser lida junto.

**Decisão de Marco:** fica autorizado criar um aviso de privacidade **exclusivo de ambiente de
teste**, chamado **`AVISO-TESTE-ADMISSAO-V1`**, para destravar o **fluxo técnico** do link do
candidato.

**O que esta decisão NÃO é.** Ela não é o aviso jurídico da Pralis, não aprova texto legal, e **não
remove o BLOQUEIO 1**. Produção continua bloqueada exatamente como estava. O que ela destrava é a
possibilidade de exercitar convite, ficha e devolução em ambiente isolado, com dado sintético —
coisa que hoje é impossível porque a emissão exige uma versão de aviso vigente que não existe.

### Regras inegociáveis

- O texto diz, com todas as letras: **"Ambiente de teste — não use dados pessoais reais."**
- Uso permitido **somente em banco e ambiente isolados de teste**.
- A guarda é **do servidor**, obrigatoriamente. Botão desabilitado e flag de frontend são
  conveniência, nunca garantia — quem chama a rota direto não vê botão nenhum.
- Deve ser **impossível** emitir convite real ou aceitar este aviso em produção.
- Testes usam **apenas dados sintéticos ou autorizados**.
- **Não libera** upload de documentos, fotos, ASO, dado médico nem Conplus. Esses seguem bloqueados.
- O aceite grava **versão e data/hora na trilha**.
- Quando o aviso oficial existir, ele **substitui a configuração de emissão**. Os aceites de teste
  **permanecem no histórico**, identificados como teste — não se apagam e não se convertem.

### Por que "identificado como teste" precisa ser estrutural

Se a única diferença entre um aceite de teste e um aceite real for a memória de quem estava lá, em
seis meses ninguém sabe distinguir. O marcador tem que viver no dado: o prefixo **`AVISO-TESTE-`**
na versão gravada é o que separa os dois, e a consulta que precisar excluir aceites de teste não
depende de lista mantida à mão.

### Onde a guarda mora

Duas camadas, e nenhuma delas é a tela:

1. **Configuração da versão vigente** recusa versão de teste quando o ambiente é produção. Mesmo
   precedente do seed, que se recusa a rodar com `NODE_ENV=production` — falha fechada, antes de
   qualquer escrita.
2. **A rota de emissão** recusa com 409 quando não há versão vigente, e recusa também quando a
   versão vigente é de teste e o ambiente é produção. Sem as duas, um deploy com configuração
   errada emitiria link real contra um aviso que diz "não use dados reais".

O detalhamento — SQL, contrato e os P0 que provam cada guarda — está no pacote de aprovação da
V2–V4, e **nada disso foi implementado**: esta rodada só registra a decisão.

---

## 7. Fora deste documento

Formulário público, convite, upload de documentos, dependentes, efetivação em `colaboradores`,
importação gravando em banco, integração Conplus, e qualquer status de férias/atestado/INSS no
schema. Tudo isso é vertical própria, e a maior parte está bloqueada na `35`.

---

## 8. Pendências

- **Decisão de identidade:** pessoa (CPF) com N vínculos, ou linha única por matrícula. Bloqueia o
  modelo de pré-cadastro.
- **Fonte de verdade:** importar só o arquivo maior e arquivar os outros dois, ou reconciliar os
  três. Sem decisão, 229 fichas viram 229 registros para ~192 pessoas.
- **Os 8 CPFs repetidos:** readmissão ou duplicidade.
- **As 13 pessoas ativas sem ficha:** de onde vem o cadastro delas.
- **Campos 100% vazios** (banco, FGTS, reservista, conselho, estrangeiro): entram no schema inicial
  ou ficam fora até existir dado.
- **PIS sentinela em 57%:** gravar nulo, gravar o zero, ou bloquear até obter. Impacta eSocial.
- **Pedido à contabilidade** de exportação tabular/eSocial, que tornaria o parser desnecessário.
