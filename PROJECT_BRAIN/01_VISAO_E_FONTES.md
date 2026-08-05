# 01 — Visão e fontes da verdade

## 1. O que é o sistema

ERP para uma rede de padarias (Cicluz / Grupo Pralis), operando hoje três empresas:
**TNP**, **LISBOA (LI)** e **HORA**. Dono/decisor: **Rodrigo**. Substitui um conjunto de
planilhas Excel + um bot em Node que o programador anterior (**Luís**) mantinha.

O sistema **não está inventando** um jeito de trabalhar. Ele está **digitalizando um jeito de
trabalhar que já existe e funciona** — que está inteiro na planilha
`CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx`.

Essa é a correção de rumo mais importante deste brain.

## 2. As cinco fontes

| Fonte                            | O que é                                                                     | O que dita                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A. Planilha CICLUZ GP**        | 40 abas, operação real de 3 empresas, com fórmulas, conferência e histórico | **REGRAS DE NEGÓCIO** e o **código de cores**                                  |
| **B. Mobills**                   | app de finanças pessoais que o Rodrigo usa                                  | **LINGUAGEM VISUAL e UX** (formulários, cards, listas, saldo atual × previsto) |
| **C. Xmind "SISTEMA PRALIS"**    | mapa mental do produto completo                                             | **ESCOPO** — quais módulos existem e sua prioridade                            |
| **D. Anotações do Rodrigo**      | rascunhos em papel (ex.: tela "Transferência")                              | **DETALHE DE TELA** — campos, ordem, agrupamento                               |
| **E. Código atual (Luís + nós)** | monorepo em produção                                                        | **BASE TÉCNICA** — arquitetura, auth, permissões, integrações                  |

## 3. Precedência em caso de conflito

1. **Planilha** vence em qualquer questão de _como o dinheiro se comporta_ (contas, sinais,
   lacres, conferência, fechamento).
2. **Anotações do Rodrigo** vencem em _como a tela é organizada_ (quais campos, em que ordem).
3. **Xmind** vence em _o que existe_ (se um módulo está no mapa, ele entra no roadmap).
4. **Mobills** vence em _como aquilo se parece e se comporta na mão_ (espaçamento, tipografia,
   modais, feedback, cor de estado).
5. **Código atual** vence em _como implementar_ — não jogamos fora arquitetura, permissões,
   multi-tenant, idempotência da integração. Nada disso muda.

> Regra prática: se a planilha e o Mobills discordarem, **a planilha define o dado, o Mobills
> define a apresentação**. Exemplo: a planilha exige lacre na transferência (dado); o Mobills não
> tem lacre — então criamos o campo, mas com a estética de campo do Mobills.

## 4. O que explicitamente MUDA de rumo

Decisão do Rodrigo (22/07), registrada:

- **A identidade visual "padaria artesanal"** (creme + laranja + Montserrat + logo Pralis,
  descrita no playbook 66, hoje em `_ARQUIVO_MORTO/`) **deixa de ser o alvo**.
  O alvo passa a ser **"cara de Mobills"**: limpo, claro, denso em informação, com o **código de
  cores da planilha** aplicado por categoria de lançamento.
- Isso é uma decisão de produto, não uma crítica ao trabalho anterior. O rigor técnico do playbook 66 continua (as regras que sobreviveram estão em `67` §13, e o playbook em si foi para `_ARQUIVO_MORTO/`) e continua
  valendo como **referência de qualidade técnica de UI** (responsividade, contraste, tokens,
  checklist) — muda a paleta e o conceito, não o rigor.

## 5. As três empresas

A planilha replica cada aba por empresa: `(TNP)`, `(LI)`, `(HORA)`. No sistema isso já é
resolvido por **multi-tenant via `empresa_id`** — não precisamos de abas por empresa, mas
**todo relatório e todo saldo tem que ser filtrável por empresa**, e o seletor de empresa é
elemento de primeira classe da interface (já existe).

## 6. Glossário rápido (vocabulário do Rodrigo)

| Termo                        | Significado                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| **Malote**                   | saco físico que carrega dinheiro entre cofre e caixa                                               |
| **Lacre**                    | número único, impresso, de fonte externa, que sela o malote. Digitado pelo operador. Não se repete |
| **Sangria**                  | retirada de dinheiro do caixa para o cofre durante o turno (segurança)                             |
| **Transferência de retorno** | devolução da sobra do caixa ao cofre no fechamento                                                 |
| **Suprimento / troco**       | dinheiro que entra no caixa para dar troco                                                         |
| **Grupo**                    | a categoria contábil do lançamento (ex.: `DES MAT. ESCRITÓRIO`, `MER MERCADORIA REVENDA`)          |
| **Discriminação**            | detalhamento item a item de um lançamento                                                          |
| **D/Pago**                   | lançamento que já teve `data de pagamento` preenchida                                              |
| **CX 1M / 1T**               | caixa do PDV 1, turno Manhã / Tarde — **é uma conta contábil**                                     |
| **Conferido**                | lançamento validado contra o extrato (coluna `CONF` da planilha)                                   |
