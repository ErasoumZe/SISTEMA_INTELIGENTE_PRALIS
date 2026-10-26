-- Reconciliação EXCLUSIVA do banco de desenvolvimento.
-- Não executar em produção e não executar sem backup validado.
-- Pré-condições e verificações são abortivas: qualquer divergência provoca ROLLBACK.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.estoque_movimentos
    GROUP BY pedido_recebimento_id, pedido_item_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicidade impede estoque_movimentos_recebimento_item_unico';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admissoes_processos_dependentes_anexos
    GROUP BY dependente_id, tipo HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicidade impede admissoes_processos_dependentes_anexos_tipo_unico';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admissoes_processos_dependentes_anexos anexos
    LEFT JOIN public.empresas empresas ON empresas.id = anexos.empresa_id
    WHERE empresas.id IS NULL
  ) THEN
    RAISE EXCEPTION 'registro orfao impede FK de empresa dos anexos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admissoes_processos_dependentes_anexos anexos
    LEFT JOIN public.admissoes_processos_dependentes dependentes
      ON dependentes.id = anexos.dependente_id
     AND dependentes.processo_id = anexos.processo_id
     AND dependentes.empresa_id = anexos.empresa_id
    WHERE dependentes.id IS NULL
  ) THEN
    RAISE EXCEPTION 'registro orfao impede FK composta dos anexos';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admissoes_processos_dependentes_anexos
    WHERE empresa_id IS NULL OR dependente_id IS NULL OR processo_id IS NULL OR tipo IS NULL
  ) THEN
    RAISE EXCEPTION 'chave nula impede reconciliacao dos anexos';
  END IF;
END $$;

BEGIN;

-- Pré-requisito da FK composta de 0061 e da migration 0062.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND conrelid = 'public.admissoes_processos_dependentes'::regclass
  ) THEN
    ALTER TABLE public.admissoes_processos_dependentes
      ADD CONSTRAINT admissoes_processos_dependentes_id_processo_empresa_unico
      UNIQUE (id, processo_id, empresa_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentos_recebimento_item_unico'
      AND conrelid = 'public.estoque_movimentos'::regclass
  ) THEN
    ALTER TABLE public.estoque_movimentos
      ADD CONSTRAINT estoque_movimentos_recebimento_item_unico
      UNIQUE (pedido_recebimento_id, pedido_item_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_anexos_empresa_id_empresas_id_fk'
      AND conrelid = 'public.admissoes_processos_dependentes_anexos'::regclass
  ) THEN
    ALTER TABLE public.admissoes_processos_dependentes_anexos
      ADD CONSTRAINT admissoes_processos_dependentes_anexos_empresa_id_empresas_id_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_anexos_dependente_fk'
      AND conrelid = 'public.admissoes_processos_dependentes_anexos'::regclass
  ) THEN
    ALTER TABLE public.admissoes_processos_dependentes_anexos
      ADD CONSTRAINT admissoes_processos_dependentes_anexos_dependente_fk
      FOREIGN KEY (dependente_id, processo_id, empresa_id)
      REFERENCES public.admissoes_processos_dependentes(id, processo_id, empresa_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS admissoes_processos_dependentes_anexos_tipo_unico
  ON public.admissoes_processos_dependentes_anexos (dependente_id, tipo);

CREATE INDEX IF NOT EXISTS admissoes_processos_dependentes_anexos_empresa_dependente_idx
  ON public.admissoes_processos_dependentes_anexos (empresa_id, dependente_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND conrelid = 'public.admissoes_processos_dependentes'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentos_recebimento_item_unico'
      AND conrelid = 'public.estoque_movimentos'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_anexos_empresa_id_empresas_id_fk'
      AND conrelid = 'public.admissoes_processos_dependentes_anexos'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_anexos_dependente_fk'
      AND conrelid = 'public.admissoes_processos_dependentes_anexos'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'admissoes_processos_dependentes_anexos_tipo_unico'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'admissoes_processos_dependentes_anexos_empresa_dependente_idx'
  ) THEN
    RAISE EXCEPTION 'verificacao final da reconciliacao falhou';
  END IF;
END $$;

COMMIT;
