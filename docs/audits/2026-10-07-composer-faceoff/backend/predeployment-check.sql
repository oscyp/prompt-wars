SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),
 'reroll_price',(SELECT credits FROM public.character_edit_prices WHERE edit_kind='prompt_suggestions_reroll'),
 'latest_migration',(SELECT max(version) FROM supabase_migrations.schema_migrations),
 'action_operations_last_24h',(SELECT coalesce(jsonb_agg(summary),'[]'::jsonb) FROM (
  SELECT status,failure_code,count(*) AS operations,sum(credits_spent) AS credits_spent,
   count(*) FILTER(WHERE refunded_at IS NOT NULL) AS refunded_operations,
   count(*) FILTER(WHERE status='pending' AND lease_expires_at<=clock_timestamp()) AS expired_leases,
   round(avg(extract(epoch FROM updated_at-created_at)) FILTER(WHERE status='succeeded')::numeric,2) AS mean_delivery_seconds
  FROM private.suggestion_operations WHERE created_at>clock_timestamp()-interval '24 hours'
  GROUP BY status,failure_code ORDER BY status,failure_code
 ) summary),
 'suggestion_wallet_last_24h',(SELECT coalesce(jsonb_agg(summary),'[]'::jsonb) FROM (
  SELECT reason,count(*) AS entries,sum(amount) AS credits
  FROM public.wallet_transactions WHERE created_at>clock_timestamp()-interval '24 hours'
   AND (reason='prompt_suggestions' OR reason LIKE 'prompt_suggestions_refund:%')
  GROUP BY reason ORDER BY reason
 ) summary)
) AS verification;
