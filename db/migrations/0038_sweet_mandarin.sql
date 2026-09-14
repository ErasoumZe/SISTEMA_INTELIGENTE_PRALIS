-- ADM-003 P0 — a revelacao de CPF sai da versao funcional do processo.
--
-- ACRESCENTADO A MAO (o comentario, nao o DDL): o drizzle-kit gera o DROP/CREATE, mas nao explica.
--
-- O indice nasceu na 0033 SEM clausula parcial, enquanto o irmao de `admissoes_testes_historico`
-- nasceu PARCIAL na 0032 (`where acao <> 'cpf_revelado'`). A assimetria e o que obriga a revelacao
-- do processo a consumir uma versao: sem versao nova, o segundo evento colidiria com o primeiro.
--
-- Consumir versao faz uma LEITURA escrever na linha raiz — `versao`, `atualizado_por` e, por
-- trigger, `atualizado_em`. O detalhe passa a mostrar como "Alterado por" quem so leu o documento.
--
-- Este e o unico caminho: a trigger e BEFORE UPDATE em qualquer coluna, entao nao existe UPDATE
-- que preserve `atualizado_em`. A revelacao precisa deixar de escrever na linha, e para isso o
-- indice precisa aceitar `cpf_revelado` repetido dentro da mesma versao.
--
-- A unicidade das acoes FUNCIONAIS nao muda: repetir um cancelamento continua recusado pelo banco.
-- Nenhuma tabela e criada, alterada ou removida. Nenhum INSERT, UPDATE, DELETE ou carga.
DROP INDEX "admissoes_processos_historico_evento_unico";--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_historico_evento_unico" ON "admissoes_processos_historico" USING btree ("processo_id","versao") WHERE "admissoes_processos_historico"."acao" <> 'cpf_revelado';