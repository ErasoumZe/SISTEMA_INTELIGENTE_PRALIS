# Prompt único — implementar TODAS as telas dos mockups (visual do sistema)

> Cole tudo isto no Claude Code (Opus, sessão nova). Uma branch, **um commit por tela** (pra revisão),
> build verde a cada passo. Regra-mãe: **UI aditiva e reversível — não muda api/banco/permissões/
> cálculos/rotas/dados.** Reutilizar backend existente; onde uma tela precisar de algo ainda não
> pronto, construir o VISUAL e ligar no endpoint quando existir (indicado em cada passo).
> Pré-requisito ideal: o PR do M2 já mergeado na main (a tela de Transferência usa os endpoints dele).

```
Implemente as telas abaixo na ordem, com a cara de Mobills (Material = mesmo idioma do Vuetify).
Branch sem acento: feat/telas-visual-pralis. UM COMMIT POR TELA, npm run build verde entre elas.
Se o contexto encher, commite o que estiver pronto e pare — eu continuo. NÃO tocar lógica/cálculo/
schema; é UI. Onde eu escrever "PARE", pare e pergunte.

── PASSO 0 · TOKENS (fundação, sem tela) ──
web-vue/nuxt.config.ts (tema Vuetify) e web-vue/assets/main.css. Ler docs/research/mobills/
DESIGN_TOKENS.md e PROJECT_BRAIN/03_MODELO_DE_CORES.md. Aplicar:
- neutros: canvas #F4F6FA, surface #FFFFFF, ink rgba(0,0,0,.87), ink-soft rgba(0,0,0,.54),
  line #E4E8EF; brand/primary #6515DD; success #16A34A; error #DC2626; warning #B7791F; info #2196F3.
- ADICIONAR tokens de categoria FIXOS (não seguem tema por empresa):
  --cat-entradas #B7791F/#FEF6E4 · --cat-transferencias #C2410C/#FFF1E8 · --cat-despesas #C0392B/#FDECEA
  · --cat-mercadorias #15803D/#E9F7EE · --cat-retiradas #1D4ED8/#EAF0FE · --cat-resultado #6D28D9/#F3EDFD
- fonte Noto Sans (corpo); botões/pills raio 25px; cards 12–16px; elevação Vuetify 1–3.
Commit: "feat(ui): tokens e tema Mobills + cores de categoria". Build verde.

── PASSO 1 · MALOTES (backend do M1 já pronto: malotes.valor + status) ──
REGRA (D3): o malote É o LACRE. NÃO existe "código" nem campo "Malote (saco)" — remover de vez.
Lista por lacre: badge do lacre (cor --cat-transferencias), valor, status (disponível verde / em uso
laranja / devolvido cinza), ação Editar (um só botão). Form "Novo malote": SÓ "Número do lacre"
(obrigatório) + "Valor". Status nasce disponível. Alvo: docs/mockups/malotes-tela-alvo.html.
Se o modelo (malotes+lacres_malotes+codigo) atrapalhar apresentar "1 malote = 1 lacre + 1 valor",
PARE e proponha a simplificação — não gambiarra. Commit: "feat(ui): tela de malotes por lacre".

── PASSO 2 · COCKPIT DO CAIXA (tela /caixa já existe — repintar) ──
Aplicar a paleta de categoria nas 6 seções já existentes, cada uma com barra/ícone na sua cor:
Entradas #B7791F · Transferências #C2410C · Despesas #C0392B · Mercadorias #15803D · Retiradas
#1D4ED8 · Resultado #6D28D9. Cabeçalho: status (aberto/PDV/turno/operador) + dois cards —
"Dinheiro no caixa" (saldo físico) e "Déficit a quitar (malote)" em fundo --cat-transferencias-soft.
Cada seção: barra colorida + ícone + nome + total + "+ Lançar" (some sem permissão / caixa fechado).
NÃO recalcular nada — usar o resumo da API. Commit: "feat(ui): cockpit do caixa nas cores das categorias".

── PASSO 3 · LANÇAMENTO (Despesa — backend já existe) ──
Formulário estilo Mobills: VALOR herói grande na cor --cat-despesas; atalhos de data Hoje/Ontem/
Outros; Descrição; Grupo; Conta; "Discriminar itens" e "Mais detalhes" recolhíveis; botões
"Salvar e criar nova" + "Salvar". Mostrar uma trilha do ciclo de vida (Lançado → Efetuado → Pago →
Conferido) como INDICADOR VISUAL somente-leitura por enquanto (o enforcement/efetuar/pagar é o M3 —
não implementar ação aqui, só exibir o estágio atual). Replicar o mesmo padrão para Mercadorias,
Retiradas e Entradas (Entradas = leitura). Commit: "feat(ui): lançamentos estilo Mobills".

── PASSO 4 · PERMISSÕES em GRADE (telas × 9 ações) ──
Substituir o paredão de texto por uma GRADE: linhas = domínios (Despesas, Mercadorias, Retiradas,
Transferências, Entradas), colunas = 9 ações (Lançar, Pagar, Discriminar, Ver, Ver$, Editar, Editar$,
Excluir, Excluir$), célula = ícone tri-estado (verde permite / cinza herdado / vermelho nega). Abas
Setor / Cargo / Usuário. A gravação continua no formato regras jsonb ATUAL — só a EXIBIÇÃO muda;
NÃO migrar dado, NÃO renomear código. Ações cujo código ainda não existe no catálogo aparecem
desabilitadas com tooltip "disponível na Fase C". Alvo: o mockup de permissões aprovado.
Commit: "feat(ui): permissoes em grade telas x acoes".

── PASSO 5 · TRANSFERÊNCIA (precisa do M2 — endpoints propostaRetorno / transferencia-cofre / GET transferencias) ──
Se o M2 estiver na main: construir a tela. Se NÃO estiver, PARE e me avise (não invente backend).
Form: VALOR herói na cor --cat-transferencias; TIPO (Suprimento / Sangria / Retorno — SEM "Abertura":
abertura nasce ao escolher o malote na abertura do caixa, não aqui); atalhos de data + as duas datas
(criação automática, transferência manual); Origem→Destino; LACRE (único campo de identificação — o
malote É o lacre, sem campo separado); Descrição obrigatória; bloco "Movimentos do dia neste caixa"
(1ª/2ª/3ª via o GET agregado, TOTAL SAÍDA/ENTRADA/SALDO); "Salvar e criar nova" + "Salvar".
No fechamento do caixa, mostrar a proposta de RETORNO pela sobra (propostaRetorno). Alvo: docs/mockups/
(transferência) + PROJECT_BRAIN/04 §6. Commit: "feat(ui): tela de transferencia (suprimento/sangria/retorno)".

── FIM ──
Rodar lint + check + testes de front verdes. Push da branch. Abrir UM PR com os commits separados por
tela (NÃO mergear na produção). Me dar o resumo: telas prontas, o que ficou visual-só (ciclo de vida,
9 ações) esperando M3, e qualquer PARE que apareceu.
```

## Nota honesta (para você, não pro agente)

São 6 passos numa sessão — é bastante. Duas coisas ficam **visuais mas ainda não “funcionando 100%”**,
por dependerem de backend que ainda não fizemos:

- **Ciclo de vida** (efetuar/pagar/conferir) na tela de Despesa → só o indicador aparece; a AÇÃO é o **M3**.
- **Grade de permissões** → as ações novas (Pagar/Ver$/Editar$) só ficam clicáveis quando a **Fase C** do
  catálogo estiver na main.
- **Transferência** → precisa do **M2 mergeado**. Se não estiver, o agente PARA nesse passo.

O resto (tokens, Malotes, Cockpit repintado, formulários) fica **funcionando de verdade** — é o grosso
do "ver na tela" que você quer. Se preferir garantir que a Transferência entre completa, **mergeia o PR
do M2 antes de rodar isto.**
