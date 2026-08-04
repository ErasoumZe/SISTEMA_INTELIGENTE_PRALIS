# SPRINT — Lançamentos completos (alvo: 30/07 à noite · máx 31/07)

> Spec vigente: `PROJECT_BRAIN/17_REGRAS_LANCAMENTOS_FINAIS.md` (D1–D12 fechadas + planilha).
> DoD: `PROJECT_BRAIN/16` — **entrega vertical** (tela+backend+teste+remoção do antigo), caminho
> antigo morre, componente ≤400 linhas, responsivo.
> **Processo:** COMMIT a cada entrega (nunca deixar untracked) · **NÃO MERGEAR** (teste local
> primeiro; produção só com OK do José) · PARE e mostre o SQL antes de CADA migration · dúvida
> fora da spec → PARE e pergunte.
> Branch: `feat/backend-telas-rodrigo` (continuar nela). Rodar as entregas NA ORDEM, uma por vez.

---

## ▶ S1 · Menu e navegação (sem migration — abre o sprint)

```
Leia PROJECT_BRAIN/17 (§1 D6/D7, §4). Entrega vertical S1:
1. Menu lateral: criar a categoria "Lançamentos" agrupando Despesas/Mercadorias/Retiradas —
   os 3 itens ficam DENTRO dela (listagens continuam separadas por categoria, D6). Os itens
   soltos antigos SOMEM do menu (DoD: caminho antigo morre).
2. Visibilidade: Lançamentos SEMPRE visível para Gerência, Tesouraria, Financeiro, Diretor Geral
   e Admin; para o cargo Caixa, SÓ com caixa aberto (mecânica somenteCaixaAberto já existe —
   estender aos papéis).
3. "+ Novo" com APENAS 3 itens (estilo Mobills): Entradas · Transferências · Saídas.
   - Entradas NAVEGA para a tela de entradas (não cria nada).
   - Saídas abre o modal de lançamento.
   - Remover os itens antigos do + Novo.
4. Modal de lançamento: 3 botões no TOPO para alternar Despesa/Mercadoria/Retirada sem fechar
   (a cor da categoria acompanha: vermelho/verde/azul).
Testes de front da visibilidade por papel. Commit: "feat(nav): categoria Lancamentos, +Novo com
3 itens e alternancia no modal". Build verde.
```

## ▶ S2 · Lançamento core (migration + bind — o coração)

```
Leia PROJECT_BRAIN/17 §4. PARE e mostre o SQL antes da migration. Entrega vertical S2:
1. Migration aditiva em despesas/mercadorias/retiradas:
   - juros (monetário, default 0) + juros_tipo (real|percentual) — % incide sobre o Valor;
   - data_documento_fiscal (date) + numero_documento_fiscal (text);
   - foto_nota_url (2ª foto, ao lado da fotoDocumentoUrl existente);
   - credor_tipo (fornecedor|colaborador|socio_gestor).
2. NOVA tabela socios_gestores (id, empresa_id, nome, ativo) + CRUD mínimo + tela simples de
   cadastro (D1). FK socio_gestor_id nos lançamentos (retiradas em especial).
3. VALOR TOTAL = Valor + Juros: calculado no shared (função pura testada), exibido no modal,
   persistido onde o total já é persistido — SEM duplicar coluna se já houver total.
4. Pagamento S/N: S abre Data de Pagamento; Vencimento e as 2 fotos aparecem nos dois casos (§4).
5. LIGAR o modal: os campos data-pendente="regra" passam a salvar de verdade; remover as marcas.
   Credor tipado muda a lista (fornecedores/colaboradores/socios_gestores) conforme o tipo.
6. Testes integração: criar despesa com juros % → total certo; retirada com sócio; mercadoria com
   doc fiscal; caixa fechado + papel de gestão → lançamento vincula só à conta (sem caixa_id).
Commit por passo. Commit final: "feat(lancamento): juros, doc fiscal, credor tipado e 2a foto".
```

## ▶ S3 · Discriminação completa (migration + regra D4/D5 + EAN)

```
Leia PROJECT_BRAIN/17 §5. PARE e mostre o SQL antes da migration. Entrega vertical S3:
1. Cadastro de PATRIMÔNIO mínimo (D2): tabelas grupos_patrimonio (sig, nome — FIS/MAT/UTS/MAQ/
   MOB/EMB) e patrimonio_itens (nome, marca, grupo, setor, empresa) + CRUD + tela simples.
2. Migration nos itens (despesasItens/mercadoriasItens): desconto por nível —
   ja existe desconto por item (tipo+valor); adicionar desconto_total_tipo/valor (por item no
   V.Total) e, no HEADER do lançamento, desconto_geral_tipo/valor. Persistir valor_unitario_com_
   desconto e valor_total_com_desconto calculados.
3. Regra de cálculo (shared, função pura + testes unitários):
   - descontos cumulativos nos 3 níveis, R$ ou %;
   - desconto no V.Total do item e no Total Geral → RATEIO proporcional ao valor, em centavos,
     sobra no último item, RECALCULANDO o valor unitário (afeta custo) — D4;
   - desconto direto no V.Unit não recalcula nada.
4. Validação D5 (BLOQUEANTE): se o total da discriminação divergir do Valor do lançamento,
   NÃO SALVA e mostra ONDE diverge (diferença em R$ e a linha/campo provável).
5. Descrição por código de barras: item vindo de NF-e → ean → produtos.codigoBarras → usa o nome
   cadastrado; sem match, mantém o texto da nota e sinaliza "não cadastrado".
6. Grupo do item: lista do cadastro de produtos; para maquinário/manutenção, lista dos grupos de
   PATRIMÔNIO (passo 1).
7. RETIRADA NÃO TEM DISCRIMINAÇÃO (D12): garantir que a tela de retirada não oferece
   discriminação; não criar retiradasItens.
Testes integração: nota de 40,00 com desconto geral 17,5% → itens rateados como na FOTO 3
(0,83/1,65/2,48 · 33,00); divergência → 422 com detalhe. Commit: "feat(discriminacao): descontos
3 niveis com rateio, validacao bloqueante e descricao por EAN".
```

## ▶ S4 · Contas com fundo + usuários vinculados (D8)

```
Leia PROJECT_BRAIN/17 §2. PARE e mostre o SQL antes da migration. Entrega vertical S4:
1. Migration: contas.saldo_inicial (monetário, NOT NULL default '0') — o "valor de fundo".
2. Cadastro de conta (tela): campo "Valor de fundo" + MULTI-SELECT de usuários que podem
   movimentar (grava em contas_usuarios, que já existe).
3. Saldo da conta = fundo + entradas − saídas (DERIVADO dos movimentos — nunca sobrescrever o
   fundo). Exibir o saldo atual na listagem de contas.
4. Comportamento-teste (o exemplo do José): CONTA COFRE fundo 10.000; tesoureiro transfere 500
   cofre→caixa 1 → cofre exibe 9.500, caixa 1 recebe +500.
5. Completar o 0-B pendente: seletores de Origem/Destino e Conta dos lançamentos filtram pelas
   contas vinculadas ao usuário (admin vê todas); sem vínculo → vazio com a mensagem
   "Nenhuma conta vinculada ao seu usuário — peça ao administrador".
6. SEED de vínculos iniciais derivado do histórico (quem já usou cada conta) — PARE e mostre a
   query + contagens antes de aplicar.
Testes: saldo derivado; filtro por vínculo; admin vê tudo. Commit: "feat(contas): fundo inicial,
saldo derivado e vinculo de usuarios".
```

## ▶ S5 · Recorrência (D3)

```
Leia PROJECT_BRAIN/17 §1 D3 e §4. PARE e mostre o SQL antes da migration. Entrega vertical S5:
1. Migration: bloco de recorrência nos lançamentos (frequência: dia|semana|quinzena|mes|ano;
   dias da semana quando semanal; quantidade de repetições) — REUSAR/estender o padrão que já
   existe em pedidos, não inventar outro.
2. Comportamento: ao salvar com recorrência, o sistema CRIA automaticamente os lançamentos
   futuros da série (como NÃO PAGOS, vencimento na data de cada ocorrência). Limite de geração:
   12 meses à frente. A série é identificável (serie_id) e cancelável (cancela as futuras não
   pagas, nunca as passadas).
3. Permissão: SÓ Admin, Gerência e Financeiro veem/usam o bloco de recorrência (403 no backend
   para os demais).
4. UI: o bloco de recorrência do modal (já desenhado) passa a funcionar.
Testes: série semanal seg+qua cria as ocorrências certas; cancelar série remove só futuras;
caixa → 403. Commit: "feat(lancamento): recorrencia com geracao automatica de serie".
```

## ▶ S6 · Entradas do dia (D7)

```
Entrega vertical S6: a tela de Entradas lista TODAS as entradas do DIA atual (não amostra),
paginada (50/página) com totalizador no topo; "+ Novo → Entradas" navega para ela. Filtro de
data para consultar outros dias. Sem criação manual. Testes de front.
Commit: "feat(entradas): lista completa do dia com paginacao".
```

## ▶ S7 · Seeding da planilha (script, dry-run primeiro)

```
Leia PROJECT_BRAIN/17 §3 (fontes confirmadas). Criar scripts/seed-planilha.ts (tsx, idempotente,
chave natural por nome/código, só TNP):
- grupos de despesas (+REF), mercadorias (+margem/tipo/computar/docfnf), retiradas (+ativa)
  ← aba GRUPOSREF;
- contas (CNT CONTA - *) com ativas ← GRUPOSREF;
- patrimônio: grupos SIG + itens ← aba PATRIMONIO;
- setores/cargos ← aba FOLHA PAGAMENTO;
- produtos ← pasta CADASTRO DE PRODUTOS do repositório (com codigo_barras).
MODO DRY-RUN por padrão: imprime contagens e amostras SEM gravar. PARE, me mostre o dry-run,
e só grave após aprovação. Commit: "feat(seed): importacao da planilha (dry-run + apply)".
```

## ▶ S8 · QA vertical de fechamento

```
1. Fluxo completo local: abrir caixa → lançar despesa c/ juros e discriminação (divergência
   bloqueia; corrigida, salva) → mercadoria via NF-e com descrição por EAN → retirada com sócio
   (sem discriminação) → recorrência criando série → transferência cofre→caixa debitando fundo →
   entradas do dia listadas.
2. Responsividade das telas tocadas (1440/1024/768/390) — sem scroll horizontal.
3. Varredura de duplicidade (nenhum caminho antigo sobrevivente nos fluxos tocados).
4. lint + check + testes TODOS verdes. Me devolver o resumo por entrega.
NÃO MERGEAR — o José testa local e decide o deploy.
```

---

## Cronograma-alvo

| Quando | Entregas |
|---|---|
| 29/07 (hoje) | S1 + S2 |
| 30/07 manhã | S3 |
| 30/07 tarde | S4 + S5 |
| 30/07 noite | S6 + S7 (dry-run) + S8 |
| Folga 31/07 | S5/S7 se deslizarem (são os menos acoplados) |
