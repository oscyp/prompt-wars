SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),
 'migration_applied',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007154542'),
 'reroll_price',(SELECT credits FROM public.character_edit_prices WHERE edit_kind='prompt_suggestions_reroll'),
 'private_tables',(SELECT jsonb_agg(jsonb_build_object(
  'table',c.relname,'rls',c.relrowsecurity,
  'authenticated_any_table_privilege',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
  'anon_any_table_privilege',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
  'service_read',has_table_privilege('service_role',c.oid,'SELECT'),
  'service_write',has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE'),
  'realtime_published',EXISTS(SELECT 1 FROM pg_publication_tables p WHERE p.schemaname='private' AND p.tablename=c.relname)
 )) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='private' AND c.relname IN ('suggestion_step_operations','suggestion_step_attempts')),
 'step_rpcs',(SELECT jsonb_agg(jsonb_build_object(
  'function',p.proname,'security_definer',p.prosecdef,'config',p.proconfig,
  'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
 )) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('reserve_suggestion_step_operation','renew_suggestion_step_operation','finish_suggestion_step_operation','expire_suggestion_step_operations')),
 'action_recovery_installed',(SELECT position('coalesce(private.suggestion_operation_result(o.id)' IN p.prosrc)>0
 FROM pg_proc p WHERE p.oid='public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean,integer)'::regprocedure),
 'scheduled_sweeper',(SELECT jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) FROM cron.job WHERE jobname='expire-suggestion-step-operations'),
 'step_operation_count',(SELECT count(*) FROM private.suggestion_step_operations)
) AS verification;
