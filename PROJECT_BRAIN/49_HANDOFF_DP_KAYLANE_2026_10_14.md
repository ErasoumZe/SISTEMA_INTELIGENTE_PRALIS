# 49 — Handoff de Departamento Pessoal para Kaylane

**Data:** 14/10/2026  
**Responsável pela continuidade:** Kaylane  
**Estado:** referência técnica publicada para reconciliação; **não pronta para merge, deploy ou migration**.

## 1. Referência exata

| Item | Valor |
| --- | --- |
| Repositório | `ErasoumZe/SISTEMA_INTELIGENTE_PRALIS` |
| Branch de handoff | `handoff/dp-onboarding-kaylane-20261014` |
| HEAD de referência | `cb0b3a6080230c986d2dde3f9c0796bf424a5deb` antes deste documento; conferir o HEAD publicado da branch |
| Main comparada | `origin/main` `75164ba76307f9dac3a3e7c3825e562183973b52` em 14/10/2026 |
| Divergência apurada | 85 commits à frente e 102 atrás da `main` |
| Tracker principal | [#179 — DP-HANDOFF](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/179) |

Esta branch é o retrato do último trabalho local confirmado de Colaboradores/DP. Ela existe para
preservar e revisar o estado, não para ser mesclada inteira na `main`.

## 2. Limite de integração — obrigatório

O diff contra a `main` também toca Login, Caixa, shell de aplicação e estilos globais. Esses arquivos
podem ter sido alterados por trabalhos paralelos e uma mesclagem integral pode sobrescrever correções
mais recentes. Portanto:

1. partir sempre da `origin/main` atual para cada nova fatia;
2. trazer somente a vertical necessária, com comparação de contratos de API, schema e permissões;
3. não misturar migration, mudança visual e alteração de Caixa na mesma PR sem dependência explícita;
4. não aplicar `0050`–`0056`, não corrigir dados históricos, não fazer deploy e não escrever em
   serviços externos por esta branch.

O primeiro trabalho é [#180 — DP-H0](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/180).

## 3. O que existe neste HEAD

### Fluxo de admissões

- testes e admissão direta, processo, ASO, convite e ficha pública/revisão DP, sob `api/src/admissoes/`
  e `web-vue/components/admissoes/`;
- efetivação idempotente em `api/src/admissoes/efetivacao.*`, sem criar pessoa paralela;
- ficha única de colaborador, vínculos históricos, recontratação, timeline e dados cadastrais em
  `api/src/colaboradores/` e `web-vue/components/colaboradores/`;
- catálogo de clínicas ocupacionais, unidades e vínculo com o processo, em `api/src/clinicas/` e
  `web-vue/components/clinicas/`;
- tela de Departamento Pessoal em `web-vue/components/departamento-pessoal/DepartamentoPessoalPage.vue`.

### Rotas de tela relevantes

| Rota | Porta funcional |
| --- | --- |
| `/admissao` | fila/testes de admissão |
| `/admissoes_processos` | processos de admissão |
| `/admissoes_processos/:id` | detalhe do processo |
| `/admissoes_processos/:id/ficha` | revisão da ficha pelo DP |
| `/admissoes_processos/:id/efetivar` | efetivação do processo |
| `/colaboradores` e `/colaboradores/:id` | lista e ficha única do colaborador |
| `/clinicas_ocupacionais` | catálogo de clínicas e unidades |
| `/departamento_pessoal` | painel do DP |

### Guarda de backend confirmada no código

As rotas de processos exigem permissões `admissoes_processos_*`; ficha usa
`admissoes_processos_ver_ficha` e `admissoes_processos_revisar_ficha`; clínicas usam
`admissoes_clinicas_ocupacionais_*`; cadastro de colaboradores usa
`cadastro_colaboradores_*`. A tela não é a única barreira: o backend usa `exigirPermissao` e
`exigirAlgumaPermissao`. A paridade precisa ser provada novamente após a reconciliação, em [#182](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/182).

### Schema candidato — não aplicado

As migrations `0050_low_mad_thinker.sql` a `0056_sharp_killraven.sql` contêm vínculos e eventos de
colaborador, campos cadastrais/onboarding, clínicas e chaves/constraints associadas. São candidatas.
O preflight de CPF normalizado e a aprovação de migration são condições anteriores a qualquer banco
persistente: [#181](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/181).

## 4. Regras já documentadas

- há uma pessoa por CPF dentro da empresa; recontratação cria novo vínculo, não outro colaborador;
- efetivação é a porta única para criar/vincular o colaborador operacional;
- vínculo trabalhista e onboarding não são o mesmo estado;
- onboarding segue `em_cadastro → cadastro_completo → aguardando_contabilidade → retorno_contabilidade → pendente_configuracao → configurado`;
- checklist é derivado de fatos auditáveis, não contador digitado;
- documentos, contratos, EPI, ponto e Conplus permanecem em verticais próprias, sem simular salvamento.

Fontes: `PROJECT_BRAIN/47_EFETIVACAO_COLABORADOR_E_VINCULOS.md` e
`PROJECT_BRAIN/48_CICLO_CADASTRO_CONTABILIDADE_CONFIGURACAO.md`. Se houver conflito, código/schema/testes
do HEAD e decisão operacional confirmada prevalecem; não inventar regra de CPF, retenção ou folha.

## 5. Pendências organizadas

| Ordem | Issue | Entrega | Condição |
| --- | --- | --- | --- |
| 1 | [#180](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/180) | reconciliar a referência com a `main` | bloqueia qualquer PR funcional |
| 2 | [#181](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/181) | preflight e aprovação das migrations | autorização explícita antes de aplicar |
| 3 | [#182](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/182) | regressão de fluxo, permissões e isolamento | banco isolado e dados sintéticos |
| 4 | [#183](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/183) | responsividade e decomposição | sem mudança de regra/schema |
| posterior | [#158](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/158) | documentos privados e LGPD | política, storage e segurança aprovados |
| posterior | [#160](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/160) | contabilidade/Conplus | layout e contrato externo homologados |
| posterior | [#168](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/168) | treinamento pós-admissão | vínculo/identidade e contrato externo |

As issues antigas [#156](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/156),
[#157](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/157),
[#159](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/159) e
[#161](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/161) registram a evolução local.
Não fechá-las por inferência: a triagem ocorre após as provas da #180–#182.

## 6. Testes existentes e próxima validação

Já há testes em:

- `tests/integration/admissoes/` (processos, convites, ficha, fila e efetivação);
- `tests/integration/colaboradores/` (perfil, onboarding e isolamento entre empresas);
- `tests/integration/clinicas/clinicas-ocupacionais.test.ts`;
- `tests/e2e/admissoes-*.spec.ts`;
- testes unitários de admissões, permissões e seeds.

Após criar cada fatia, rodar no mínimo:

```powershell
npm run lint
npm run check
npm test
npm run test:integration
```

E provar manualmente em 1440, 1024, 768 e 390px. O preview local de interface não substitui teste
integrado quando o endpoint depende de schema ainda não aplicado.

## 7. Riscos conhecidos

1. **P1 — base defasada:** 102 commits de distância da main e arquivos fora de DP no diff.
2. **P1 — schema e dados existentes:** CPF pode estar vazio, inválido ou duplicado; não impor
   unicidade sem preflight e autorização.
3. **P1 — dados pessoais:** não anexar PII real, documentos, credenciais ou planilhas em issue,
   fixture, log ou commit.
4. **P2 — manutenção de UI:** `CadastroColaboradorTabs.vue` (574 linhas),
   `DepartamentoPessoalPage.vue` (499), `PerfilColaboradorPage.vue` (484) e
   `ClinicasOcupacionaisPage.vue` (460) excedem a orientação de ~400 linhas.

## 8. Checklist de retomada

- [ ] clonar o repositório e fazer `git fetch origin`;
- [ ] conferir branch, HEAD e árvore antes de editar;
- [ ] ler os documentos 46, 47, 48 e este 49;
- [ ] iniciar pela #180, sem abrir PR gigante;
- [ ] usar somente banco isolado e dados sintéticos até a #181 estar aprovada;
- [ ] manter uma única porta de efetivação e não recriar fluxo direto paralelo;
- [ ] validar rota + API + permissão + teste em cada ação;
- [ ] registrar decisão de negócio nova no `PROJECT_BRAIN`;
- [ ] só propor merge com HEAD revisado e gates verdes; deploy exige autorização separada.
