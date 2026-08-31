-- Retire three starter prompt templates.
--
-- 'Shadow Approach', 'Adaptive Counter' and 'Slow Motion Moment' were the only
-- 'intermediate' rows covering all three move types, so `get_battle_templates`
-- picked 'intermediate' as its preferred tier and served exactly these three in
-- every battle. They are being removed from the served pool.
--
-- Retired, not deleted: `battle_prompts.prompt_template_id` is a FK with
-- ON DELETE SET NULL and a template-based prompt stores no text of its own, so
-- deleting the rows would erase what past players actually submitted --
-- `resolve-battle` reads the body back off this table at judge time.
-- `active_until` removes them from both the RLS select policy and the
-- `get_battle_templates` pool while leaving history intact.
UPDATE prompt_templates
SET active_until = NOW()
WHERE title IN ('Shadow Approach', 'Adaptive Counter', 'Slow Motion Moment')
  AND (active_until IS NULL OR active_until > NOW());
