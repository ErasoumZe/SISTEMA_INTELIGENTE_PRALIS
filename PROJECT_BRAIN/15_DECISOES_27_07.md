# 15 — Decisões de 27/07 (UI e fluxo)

## D-A · Sem seletor de mês/período na topbar

O Mobills tem, mas não usamos. **Não incluir.** A topbar fica com seletor de empresa + menu do
usuário.

## D-B · Um só "Sair"

O logout fica **apenas no menu do perfil do usuário** (topbar). **Remover o "SAIR" da sidebar** —
não ter dois.

## D-C · Malotes: sem tela de cadastro (menu oculto)

**Não existe tela para criar malote.** O malote **é** o lacre (D3) e o lacre é **informado direto
no formulário de Transferência** — se o número ainda não existir, nasce ali (inline).

- O item "Malotes" fica **oculto no menu** (hide), sem apagar rota nem backend por enquanto.
- Consequência de modelagem: o cadastro de lacre precisa aceitar **criação inline** a partir da
  transferência, não depender de um cadastro prévio.
- Isso simplifica: o tesoureiro não pré-cadastra malotes; ele lança a transferência e informa o
  número do lacre que está no saco físico.

## D-D · Contas vinculadas ao usuário = prioridade

`contas_usuarios` (FOTO 4 do Rodrigo) sai da fila e vira o **Prompt 0** — roda antes de tudo.

Motivo: é a base de **quem vê, opera e confirma** cada conta. Sem isso, os seletores de
Origem/Destino mostram todas as contas para todo mundo, e não há como definir quem confirma o
recebimento de uma transferência.

**Conceito a não confundir:**

- As **9 ações** (lançar/pagar/conferir/…) = _o que_ o usuário pode fazer.
- **`contas_usuarios`** = _em quais contas_ ele pode fazer.
  São camadas complementares, não substitutas.

**✅ DECIDIDO (José, 27/07): usuário sem vínculo NÃO VÊ NENHUMA CONTA.**
Sem vínculo, os seletores vêm vazios. Só `usuario_admin`/admin enxerga todas (short-circuit, igual
ao que já acontece com permissões).

**⚠ Consequência operacional — obrigatória de tratar:** hoje **ninguém** tem vínculo. Ao subir essa
regra, a operação **para** (nenhum operador consegue lançar). Por isso o Prompt 0 exige, na mesma
entrega, um **seed de vínculos iniciais derivado do histórico real**: cada usuário é vinculado às
contas que ele já usa (contas que aparecem em lançamentos/transferências/caixas criados por ele, +
a conta do PDV dos caixas que abriu). O agente deve **mostrar a query e a contagem antes de
aplicar** — não descobrir em produção que alguém ficou sem conta.

**UI do caso vazio:** quando não houver conta vinculada, mostrar
_"Nenhuma conta vinculada ao seu usuário — peça ao administrador"_ em vez de um select vazio.
