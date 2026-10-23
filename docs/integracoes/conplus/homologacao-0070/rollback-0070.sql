-- ROLLBACK da migration 0079_eventos_layout_oficial (antes 0070) — desfaz exatamente o que ela criou.
--
-- NÃO é migration e não é executado por nenhum procedimento automático. Só com autorização específica.
-- Perde, sem volta, o que foi gravado nas estruturas da 0079 depois da aplicação: código e razão social
-- da empresa no Questor, dados do catálogo oficial, período/contrato/sequência das linhas exportadas,
-- cancelamentos de lançamento e a trilha de auditoria (questor_auditoria). Antes de rodar, faça o backup
-- do procedimento de homologação. Para voltar ao estado EXATO de antes, prefira restaurar o backup.
--
-- Pré-condição verificada abaixo: sem lançamentos cancelados que colidam com ativos na chave antiga
-- (a 0079 permite relançar um evento cancelado; a 0077 não). Se houver, o script para sem alterar nada.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM questor_eventos_variaveis_lancamentos
    GROUP BY empresa_id, competencia, vinculo_id, evento_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Rollback interrompido: há lançamentos cancelados e relançados na mesma chave; a unicidade da 0077 não pode ser restaurada';
  END IF;
END $$;

DROP TABLE questor_auditoria;

DROP INDEX questor_exportacoes_eventos_chave_questor_unica;
ALTER TABLE questor_exportacoes_eventos_variaveis
  DROP CONSTRAINT questor_exportacoes_eventos_linha_check,
  DROP COLUMN codigo_periodo_calculo,
  DROP COLUMN codigo_contrato,
  DROP COLUMN sequencia;

ALTER TABLE questor_exportacoes
  DROP CONSTRAINT questor_exportacoes_periodo_check,
  DROP COLUMN codigo_periodo_calculo;

DROP INDEX questor_eventos_variaveis_lancamentos_unico;
ALTER TABLE questor_eventos_variaveis_lancamentos
  DROP CONSTRAINT questor_eventos_variaveis_lancamentos_cancelamento_check,
  DROP CONSTRAINT questor_eventos_variaveis_lancamentos_cancelado_por_fk,
  DROP COLUMN cancelado_em,
  DROP COLUMN cancelado_por,
  DROP COLUMN motivo_cancelamento;
ALTER TABLE questor_eventos_variaveis_lancamentos
  ADD CONSTRAINT questor_eventos_variaveis_lancamentos_unico UNIQUE (empresa_id, competencia, vinculo_id, evento_id);

ALTER TABLE questor_eventos_variaveis
  DROP CONSTRAINT questor_eventos_variaveis_natureza_check,
  DROP CONSTRAINT questor_eventos_variaveis_catalogo_check,
  DROP COLUMN sequencia_questor,
  DROP COLUMN filial_questor,
  DROP COLUMN natureza;

ALTER TABLE questor_configuracoes
  DROP CONSTRAINT questor_configuracoes_codigo_empresa_check,
  DROP CONSTRAINT questor_configuracoes_razao_social_check,
  DROP COLUMN codigo_empresa_questor,
  DROP COLUMN razao_social_questor;

-- Registro da 0079 no controle do Drizzle (created_at = "when" do journal).
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792777123905;

COMMIT;
