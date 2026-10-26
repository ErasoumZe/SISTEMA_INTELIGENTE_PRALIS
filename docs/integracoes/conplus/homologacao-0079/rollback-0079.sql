-- ROLLBACK da migration 0079_eventos_layout_oficial (antes da renumeração: 0070) — desfaz exatamente o que ela criou.
--
-- NÃO é migration e não é executado por nenhum procedimento automático. Só com autorização específica.
-- Perde, sem volta, o que foi gravado nas estruturas da 0079 depois da aplicação: código e razão social
-- da empresa no Questor, dados do catálogo oficial, período/contrato/sequência das linhas exportadas,
-- cancelamentos de lançamento e a trilha de auditoria (questor_auditoria). Antes de rodar, faça o backup
-- do procedimento de homologação. Para voltar ao estado EXATO de antes, prefira restaurar o backup.
--
-- Pré-condições verificadas abaixo (se falharem, o script para sem alterar nada):
-- 1. nenhum lançamento cancelado: sem a coluna cancelado_em ele voltaria a ser ATIVO para o código da
--    0077 e poderia entrar num arquivo oficial (valor cancelado indo para a folha). Havendo cancelados,
--    a saída é restaurar o backup — ou decisão explícita de Marco sobre o destino deles;
-- 2. o registro da 0079 existe no controle do Drizzle com o when atual (banco na numeração antiga não
--    tem: ali este script não se aplica).

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE created_at = 1792777123905) <> 1 THEN
    RAISE EXCEPTION 'Rollback interrompido: a 0079 (when 1792777123905) não está registrada exatamente uma vez neste banco';
  END IF;
  IF EXISTS (SELECT 1 FROM questor_eventos_variaveis_lancamentos WHERE cancelado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback interrompido: há lançamentos cancelados; sem a coluna eles voltariam a valer. Restaure o backup.';
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

-- Registro da 0079 no controle do Drizzle (created_at = "when" do journal). Conferido: exatamente 1 linha.
DO $$
DECLARE
  apagadas integer;
BEGIN
  DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792777123905;
  GET DIAGNOSTICS apagadas = ROW_COUNT;
  IF apagadas <> 1 THEN
    RAISE EXCEPTION 'Rollback interrompido: esperava apagar 1 registro da 0079, apagaria %', apagadas;
  END IF;
END $$;

COMMIT;
