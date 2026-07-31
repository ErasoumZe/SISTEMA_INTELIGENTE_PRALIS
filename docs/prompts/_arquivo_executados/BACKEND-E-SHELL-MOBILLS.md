# Auditoria + prompts: backend das telas novas & shell Mobills (27/07)

## ⚠ ACHADO GRAVE: trabalho da sessão de 24/07 foi PERDIDO

As migrations `0015` (tabela **`lacres`**, **`contas_usuarios`**) e `0016` (`contas.saldo_inicial`,
`lacres.rompido`) eram arquivos **não commitados** (untracked). **Não estão em nenhuma branch:**

```
lacres no schema →  main: 0 · feat/telas-fieis-mockup: 0 · feat/visual-telas-rodrigo: 0
contas_usuarios  →  0        maquina/numero de serie → 0
```

Ou seja: a **abertura por lacre**, a **confirmação em duas pontas** e o **vínculo usuário→contas**
(FOTO 4 do Rodrigo) precisam ser **refeitos**. Última vez que existiram foi na árvore de trabalho da
sessão de 24/07, que foi descartada ao trocar de branch.

**Lição de processo:** nada de trabalho grande sem commit. Mesmo WIP, commitar em branch.

## Estado real do backend por campo pendente (levantado no código)

| Campo (do desenho) | Backend hoje | O que falta |
|---|---|---|
| **Transferência: agendamento + data** | ❌ | coluna + regra de disparo |
| **Transferência: data recebimento (confirmação)** | ❌ (era o `lacres`, perdido) | fluxo 2 pontas: enviar → confirmar |
| **Transferência: múltiplo destino** | ❌ | modelo 1:N (broadcast/rateio) |
| **Transferência: sempre confirmar** | ❌ | flag |
| **Transferência: N° Lacre/Doc "do setor"** | ⚠ só `malotes.numero_lacre` | tabela `lacres` por movimento (refazer) |
| **Transferência: tipo/data/vencimento/contábil/ordem** | ✅ existe (0013) | — |
| **Lançamento: Juros + Valor Total** | ❌ | colunas `juros`, total calculado |
| **Lançamento: Data/N° Doc. Fiscal** | ❌ | 2 colunas |
| **Lançamento: credor tipado** | ⚠ `fornecedorId` e `colaboradorId` existem | falta **sócio/setor** + o discriminador de tipo |
| **Lançamento: 2ª foto** | ⚠ `fotoDocumentoUrl` (1 só) | 2ª coluna/upload |
| **Lançamento: Recorrência** | ⚠ **existe em `pedidos`** (`recorrencia`: nenhuma/semanal/quinzenal/mensal + `dataAgendada`) | replicar o padrão nos lançamentos |
| **Discriminação: desconto item/geral, R$ ou %, Vale Presente** | ❌ | colunas nos itens + regra de rateio |
| **Abertura: Maq. Cartão / N° Série** | ❌ | cadastro de maquininha + vínculo no caixa |
| **Abertura: Transf. Entrada / N° Lacre** | ❌ (perdido) | refazer |

> Boa notícia: **`pedidos` já tem recorrência e agendamento** — é o padrão a reusar, não inventar.

---

# PROMPT A — Backend das telas novas (regras)

> Rodar primeiro. Tem migration → **PARE e mostre o SQL**. Não mexe em UI.

```
Implemente o BACKEND dos campos que hoje estão como data-pendente="regra" nas telas novas
(branch feat/visual-telas-rodrigo). Fonte de verdade dos campos:
PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md. Contexto: PROJECT_BRAIN/12 (fundo simples — NÃO
existe mais déficit/dívida).

IMPORTANTE — trabalho perdido a refazer: as tabelas `lacres` e `contas_usuarios` foram criadas na
sessão de 24/07 mas NUNCA commitadas (não estão em nenhuma branch). Refaça-as.

Faça em ETAPAS, uma por vez, commitando cada uma. PARE e mostre o SQL antes de CADA migration.
Se qualquer etapa exigir decisão de negócio não coberta pelo doc 14, PARE e pergunte.

ETAPA 1 — Lacre e vínculo de contas (base do resto)
- Tabela `lacres`: numero (único por empresa), transferencia_id, origem (saida|retorno),
  rompido (bool), empresa_id. O lacre é do MOVIMENTO (a identidade do malote continua sendo
  malotes.numero_lacre — são coisas diferentes, documente a distinção no schema).
- Tabela `contas_usuarios` (FOTO 4): vínculo usuário ↔ contas que ele pode operar. Alimenta as
  opções de Origem/Destino e quem pode confirmar recebimento.
- Endpoints de cadastro/listagem mínimos.

ETAPA 2 — Transferência em DUAS PONTAS (o item mais importante)
- Colunas: agendada (bool) + data_agendamento; data_recebimento; sempre_confirmar (bool);
  status de confirmação (ex.: pendente|confirmada) — escolha nomes coerentes com o schema atual.
- Fluxo: quem envia cria a transferência (com lacre); o DESTINATÁRIO confirma o recebimento →
  grava data_recebimento e rompe o lacre. Só quem tem a conta destino vinculada
  (contas_usuarios) pode confirmar.
- "Sempre confirmar": exige confirmação mesmo quando origem e destino são do mesmo usuário.
- Múltiplo destino: modelar como 1 transferência → N destinos (com valor por destino). Se achar
  que deve ser N transferências agrupadas, PARE e me proponha as duas opções com prós/contras
  ANTES de implementar.
- Abertura de caixa por N° de lacre: o operador informa o lacre da transferência de entrada; o
  sistema confirma o recebimento para a conta do PDV e funda o caixa (fundo simples, sem dívida).

ETAPA 3 — Lançamento (Despesa/Mercadoria/Retirada)
- Colunas: juros (valor monetário, default 0) — VALOR TOTAL = valor + juros (calcular, não
  duplicar coluna se já houver total); data_documento_fiscal; numero_documento_fiscal;
  segunda foto (ex.: foto_nota_url ao lado de foto_documento_url).
- Credor tipado: discriminador (fornecedor|colaborador|socio_setor) + o vínculo para
  sócio/setor que hoje não existe. Fornecedor e colaborador já têm FK.
- RECORRÊNCIA: reutilizar o padrão que JÁ existe em `pedidos` (recorrencia:
  nenhuma|semanal|quinzenal|mensal + data_agendada) — estenda-o se precisar de "número de
  repetições" e "dia da semana" conforme o desenho. Não inventar modelo novo.

ETAPA 4 — Discriminação com desconto
- Nos itens: valor unitário com desconto, valor total com desconto e o % efetivo.
- No header: desconto geral em R$ ou % (flag do tipo) + natureza "Vale Presente".
- Regra de rateio do desconto geral entre os itens: PARE e confirme comigo a regra antes de
  implementar (proporcional ao valor? igualitária?).

ETAPA 5 — Máquina de cartão
- Cadastro de maquininha (número de série, apelido, empresa) + vínculo na abertura do caixa.

Ao final de cada etapa: testes de integração cobrindo o caminho feliz e a regra de permissão.
lint + check + testes verdes. Branch: feat/backend-telas-rodrigo. NÃO MERGEAR.
```

---

# PROMPT B — Shell Mobills: menu e navegação (o pedido repetido)

> O José pediu isto mais de uma vez e ainda não foi feito: o app inteiro com cara de Mobills,
> incluindo **menu** e **funcionamento das telas**. Rodar DEPOIS do prompt A (ou em paralelo por
> outra pessoa — tocam arquivos diferentes: A = api/db, B = web-vue/shell).

```
Redesenhe o SHELL do app (menu + navegação + layout base) na linguagem do Mobills. Referências:
docs/research/mobills/DESIGN_TOKENS.md e BEHAVIORS_E_TOPOLOGIA.md (extraídos do Mobills real),
PROJECT_BRAIN/04_UX_MOBILLS.md, e o menu por SETOR do Xmind V2 (PROJECT_BRAIN/10).

Esta rodada é de SHELL — não reescrever o conteúdo interno das telas.

1) SIDEBAR estilo Mobills
   - Fundo claro/branco, ícone + rótulo, item ativo com realce (não a barra laranja atual).
   - Botão "+ NOVO" no TOPO da sidebar (FAB roxo #6515dd, pill raio 25px) que abre menu curto de
     lançamento: Entrada · Despesa · Mercadoria · Retirada · Transferência — cada um com o ícone
     na SUA cor de categoria (--cat-*).
   - Agrupar os itens conforme o Xmind V2 (Entradas · Transferências · Saídas · Resultados ·
     Configuração), preparando o terreno para o menu por SETOR (a montagem por setor em si é
     um trabalho posterior — aqui só a estrutura de grupos).

2) TOPBAR
   - Seletor de PERÍODO (mês) no centro, como no Mobills.
   - Seletor de EMPRESA e usuário à direita.

3) CARDS DE TOTAIS no topo das telas de listagem
   - Padrão Mobills: card por categoria, ícone circular colorido, rótulo pequeno + número grande.
   - Usar --cat-* e elevação Vuetify 1–2 (Material, não sombra custom).

4) LISTAS
   - Densidade Mobills: linha com situação · data · descrição · chip de categoria colorido ·
     conta · valor à direita (verde/vermelho pelo sinal) · ações.
   - Rodapé com "Saldo previsto final do dia" quando fizer sentido.

REGRAS: aditivo e reversível; NÃO tocar api/db/shared; NÃO mudar regra de permissão (o menu
continua respeitando as permissões atuais); responsivo nos breakpoints do projeto
(1260/1024/768/560/390) — sidebar vira drawer no celular.
Antes de codar, me mostre em 5 linhas como vai ficar o shell. Branch: feat/shell-mobills.
NÃO MERGEAR. Screenshots antes/depois de 3 telas no resumo final.
```

---

## Ordem recomendada

1. **Prompt A** (backend) — destrava a persistência do que já está desenhado.
2. **Prompt B** (shell) — entrega finalmente a cara de Mobills no app inteiro.
3. Depois: menu **por setor** (Xmind V2) e os módulos novos (DP, fiscal, contagem).
