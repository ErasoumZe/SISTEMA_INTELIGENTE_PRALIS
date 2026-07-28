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

**Ponto em aberto (o agente vai propor):** o que fazer com usuário **sem nenhum vínculo**
cadastrado — ver todas (não quebra a operação atual) ou não ver nenhuma (mais seguro). Sugestão:
ver todas + TODO para endurecer depois da migração dos vínculos reais.
