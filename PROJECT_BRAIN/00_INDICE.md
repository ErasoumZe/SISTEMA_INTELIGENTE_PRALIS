# PROJECT BRAIN — Sistema Inteligente Pralis (SISTEMA_CAIXA)

> **Versão 2 — 22/07/2026.** Este brain substitui, como fonte de verdade de PRODUTO, a pasta
> `PROJECT_BRAIN - Copia` (64 arquivos, trabalho do Luís/fase anterior — que continua válida
> como referência TÉCNICA de auth/permissões/QA, ver `05`).
>
> **Motivo da v2:** o projeto vinha sendo construído a partir de interpretação. Em 22/07 abrimos
> as três fontes reais (planilha operacional, conta Mobills, anotações do Rodrigo) e o modelo de
> negócio ficou explícito. Este brain congela esse entendimento.

## Como ler

| #                                      | Documento                    | Responde                                                                                         |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| [01](01_VISAO_E_FONTES.md)             | Visão e fontes da verdade    | de onde vem cada decisão e quem ganha em caso de conflito                                        |
| [02](02_REGRAS_DE_NEGOCIO_PLANILHA.md) | Regras de negócio (planilha) | como o dinheiro anda de verdade na padaria                                                       |
| [03](03_MODELO_DE_CORES.md)            | Modelo de cores              | o que cada cor significa e como aplicar no sistema                                               |
| [04](04_UX_MOBILLS.md)                 | UX Mobills                   | o que copiar (e o que NÃO copiar) do Mobills                                                     |
| [05](05_ESTADO_ATUAL_SISTEMA.md)       | Estado atual                 | o que já existe no código, tabela por tabela                                                     |
| [06](06_GAPS_E_DECISOES.md)            | Gaps e decisões              | o que falta e o que só o Rodrigo pode responder                                                  |
| [07](07_METODO_CLONE_UI.md)            | Método de clone de UI        | como extrair o Mobills e reconstruir em Vuetify                                                  |
| [08](08_PLANO_DE_ACAO.md)              | Plano de ação                | as duas trilhas (Modelo + Visual), fases e gates até o v1.0                                      |
| [09](09_AUDITORIA_PERMISSOES.md)       | Auditoria de permissões      | matriz cargo × ação, divergências, usuários de teste                                             |
| [10](10_XMIND_V2_MUDANCAS.md)          | **Xmind V2 (novo)**          | o que mudou no novo mapa: menu por setor, módulos novos, telas do Rodrigo                        |
| [12](12_DECISAO_FUNDO_SIMPLES.md)      | **Fundo simples (24/07)**    | o déficit foi revogado — malote é fundo; o que sai do código                                     |
| [14](14_TELAS_RODRIGO_TRANSCRICAO.md)  | **Telas do Rodrigo (27/07)** | transcrição dos 5 wireframes: campos, regras novas, impacto                                      |
| [15](15_DECISOES_27_07.md)             | **Decisões 27/07**           | sem seletor de mês · um só Sair · Malotes oculto (lacre inline) · contas do usuário = prioridade |

## Regra de ouro deste brain

> **Funcionamento = planilha. Aparência = Mobills. Escopo = Xmind. Detalhe de tela =
> anotações do Rodrigo. Base técnica = o que o Luís construiu.**

Quando duas fontes discordarem, a ordem de precedência está em `01`, seção 3.

## Estado em uma linha

Núcleo operacional em produção e estável (caixa, lançamentos, integração CREARE blindada,
NF-e, relatórios, permissões em 3 camadas). O que falta não é correção — é **alinhar o
funcionamento e a aparência ao modelo real do negócio**, que agora está documentado.
