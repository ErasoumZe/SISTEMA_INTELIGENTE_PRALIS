-- LIMPEZA DOS DADOS OPERACIONAIS DO CAIXA (ambiente que ainda nao entrou em operacao).
--
-- Apaga so o que o caixa e o financeiro geraram: caixas e fechamentos, transferencias, lacres, vendas, despesas,
-- mercadorias, retiradas, quebras, conferencias, paradas do computador, anexos (linhas do banco) e ajustes de conta.
-- NAO apaga cadastro: empresas, usuarios, cargos/permissoes, PDVs, turnos, contas, colaboradores, produtos,
-- fornecedores, formas de pagamento. O saldo de cada conta volta ao `contas.saldo_inicial` (o saldo e derivado dos
-- movimentos), entao NADA aqui "zera" valor de cadastro: se o saldo inicial das contas tambem e de teste, e outra
-- decisao (dinheiro).
--
-- COMO USAR (nunca roda sozinho; nao faz parte das migrations nem do deploy):
--   1) BACKUP antes:  node scripts/backup-db.mjs   (o dump tem dado pessoal: guarde fora do repositorio)
--   2) ENSAIO (padrao, nao grava nada: mostra as contagens e desfaz no fim):
--        psql "$DATABASE_URL" -f scripts/limpeza/limpar-dados-operacionais.sql
--   3) Conferiu as contagens? Aplicar de verdade:
--        psql "$DATABASE_URL" -v confirmar=1 -f scripts/limpeza/limpar-dados-operacionais.sql
--   4) Os ARQUIVOS anexados ficam no volume /app/storage (container da API), FORA do banco: este script so cuida
--      do banco. NAO apague o /app/storage inteiro: ali tambem ficam as fotos de PRODUTOS (cadastro) e os documentos
--      de ADMISSOES. Depois do passo 3, apague SOMENTE estas pastas do caixa:
--          cd /app/storage && ls                      (conferir primeiro)
--          rm -rf fechamentos-caixa vendas despesas mercadorias retiradas
--      Mantenha: produtos  produtos-base  admissoes  admissoes-dependentes
--
-- Tudo roda em UMA transacao. Qualquer erro (por exemplo uma tabela nova que referencia estas) desfaz tudo.

\set ON_ERROR_STOP on
\if :{?confirmar}
\else
  \set confirmar 0
\endif

BEGIN;

CREATE TEMP TABLE _contagens (momento text, tabela text, linhas bigint) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.contar(momento text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fechamentos_caixa','fechamentos_caixa_anexos','fechamentos_caixa_conferencias_tesouraria',
    'fechamentos_caixa_relatorios_maquininha','fechamentos_caixa_relatorios_vendas','quebras_caixa',
    'ajustes_fechamento_caixa','alteracoes_pos_fechamento_caixa','caixa_autorizacoes','caixa_indisponibilidades',
    'edicoes_caixa','debitos_colaboradores','transferencias','transferencias_conferencias_fisicas',
    'transferencias_conferencias_recusadas','transferencias_destinos_candidatos','lacres',
    'vendas','vendas_pagamentos','vendas_produtos','vendas_comprovantes','despesas','despesas_itens',
    'mercadorias','mercadorias_itens','retiradas','ajustes_contas',
    -- cadastros que NAO devem mudar (conferencia)
    'empresas','perfis_usuarios','pdvs','turnos','contas','colaboradores','produtos'
  ] LOOP
    EXECUTE format('INSERT INTO _contagens SELECT %L, %L, count(*) FROM %I', momento, t, t);
  END LOOP;
END $$;

SELECT pg_temp.contar('antes');

-- Entregas de mensagem ligadas a um fechamento (a mensagem em si fica).
DELETE FROM mensagens_admin_entregas WHERE fechamento_caixa_id IS NOT NULL;

-- Filhas primeiro.
DELETE FROM vendas_comprovantes;
DELETE FROM vendas_pagamentos;
DELETE FROM vendas_produtos;
DELETE FROM transferencias_conferencias_fisicas;
DELETE FROM transferencias_conferencias_recusadas;
DELETE FROM transferencias_destinos_candidatos;
DELETE FROM ajustes_fechamento_caixa;
DELETE FROM alteracoes_pos_fechamento_caixa;
DELETE FROM caixa_autorizacoes;
DELETE FROM caixa_indisponibilidades;
DELETE FROM debitos_colaboradores;
DELETE FROM edicoes_caixa;
-- Os relatorios (maquininha e vendas) apontam para os anexos: saem antes deles.
DELETE FROM fechamentos_caixa_relatorios_maquininha;
DELETE FROM fechamentos_caixa_relatorios_vendas;
DELETE FROM fechamentos_caixa_anexos;
DELETE FROM fechamentos_caixa_conferencias_tesouraria;
DELETE FROM quebras_caixa;
DELETE FROM despesas_itens;
DELETE FROM mercadorias_itens;

-- Lacres referenciam transferencias: saem antes delas. Todos (numeros de teste voltam a ficar livres).
DELETE FROM lacres;

-- Movimentos e, por ultimo, os caixas.
DELETE FROM vendas;
DELETE FROM despesas;
DELETE FROM mercadorias;
DELETE FROM retiradas;
DELETE FROM transferencias;
DELETE FROM ajustes_contas;
DELETE FROM fechamentos_caixa;

SELECT pg_temp.contar('depois');

\echo
\echo '=== CONTAGENS (antes -> depois). Cadastros nao podem mudar. ==='
SELECT a.tabela, a.linhas AS antes, d.linhas AS depois
FROM _contagens a JOIN _contagens d ON d.tabela = a.tabela AND d.momento = 'depois'
WHERE a.momento = 'antes'
ORDER BY (a.linhas = d.linhas), a.tabela;

\if :confirmar
  \echo
  \echo '>>> CONFIRMADO: gravando (COMMIT).'
  COMMIT;
\else
  \echo
  \echo '>>> ENSAIO: nada foi gravado (ROLLBACK). Para aplicar: -v confirmar=1'
  ROLLBACK;
\endif
