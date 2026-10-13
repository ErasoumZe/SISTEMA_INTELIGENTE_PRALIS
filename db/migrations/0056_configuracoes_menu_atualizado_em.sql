-- A tabela foi criada na 0053 com a coluna de auditoria, mas sem o gatilho
-- usado pelas demais tabelas atualizáveis. A função existe desde a 0002.
CREATE TRIGGER "configuracoes_menu_empresas_set_atualizado_em"
BEFORE UPDATE ON "configuracoes_menu_empresas"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
