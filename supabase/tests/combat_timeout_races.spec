# PostgreSQL isolationtester fixture (run on an isolated migrated Supabase DB).
# Uses independent connections and blocking permutations; NOT executed locally.
setup
{
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('73000000-0000-4000-8000-000000000001','combat-race-one@fixture.invalid','{"age_confirmed":true,"username":"combat_race_one"}'),
 ('74000000-0000-4000-8000-000000000002','combat-race-two@fixture.invalid','{"age_confirmed":true,"username":"combat_race_two"}');
 INSERT INTO characters(id,profile_id,name,archetype,battle_cry) VALUES
 ('73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000001','Race one','strategist','Ready'),
 ('73000000-0000-4000-8000-000000000012','74000000-0000-4000-8000-000000000002','Race two','titan','Ready');
 INSERT INTO battles(id,mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('73000000-0000-4000-8000-000000000021','ranked','waiting_for_prompts','bo3',3,
 '73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',
 '73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000012');
 INSERT INTO battle_rounds(id,battle_id,round_number,status,lock_in_deadline)
 VALUES('73000000-0000-4000-8000-000000000031','73000000-0000-4000-8000-000000000021',1,'waiting_for_prompts',NOW()-INTERVAL '1 minute');
}
teardown
{
 DELETE FROM auth.users WHERE id IN ('73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002');
}

session "leave"
step "leave_begin" { BEGIN; }
step "leave_claim" { SELECT claim_leave_battle('73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000001',0,'isolation-free'); }
step "leave_resolve" {
 SELECT resolve_battle('73000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000002',FALSE,'{"resolution":"forfeit"}',NULL,'v1','forfeit',0);
 UPDATE battles SET status='completed' WHERE id='73000000-0000-4000-8000-000000000021' AND status='result_ready';
}
step "leave_commit" { COMMIT; }
step "assert_terminal" {
 DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM battles WHERE id='73000000-0000-4000-8000-000000000021' AND
   ((status='completed' AND winner_id='74000000-0000-4000-8000-000000000002') OR (status='expired' AND winner_id IS NULL))) THEN
   RAISE EXCEPTION 'race overwrote terminal outcome'; END IF;
  IF EXISTS(SELECT 1 FROM battle_rounds WHERE id='73000000-0000-4000-8000-000000000031' AND status IN ('waiting_for_prompts','resolving')) THEN
   RAISE EXCEPTION 'race stranded an active round'; END IF;
 END $$;
}

session "timeout"
step "timeout_begin" { BEGIN; }
step "timeout_apply" { SELECT resolve_round_timeout('73000000-0000-4000-8000-000000000031',NULL); }
step "timeout_commit" { COMMIT; }

session "submit"
step "submit_begin" { BEGIN; }
step "submit_prompt" {
 SELECT lock_prompt('73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000001',NULL,
 'A shield redirects the incoming bolt into the empty arena.','defense','approved',1);
}
step "submit_commit" { COMMIT; }
step "assert_prompt_survives" {
 DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM battles WHERE id='73000000-0000-4000-8000-000000000021' AND status='waiting_for_prompts') THEN
   RAISE EXCEPTION 'timeout expired a committed prompt'; END IF;
  IF (SELECT count(*) FROM battle_prompts WHERE battle_id='73000000-0000-4000-8000-000000000021' AND is_locked)<>1 THEN
   RAISE EXCEPTION 'committed prompt missing'; END IF;
 END $$;
}

permutation "leave_begin" "leave_claim" "timeout_begin" "timeout_apply" "leave_resolve" "leave_commit" "timeout_commit" "assert_terminal"
permutation "timeout_begin" "timeout_apply" "leave_begin" "leave_claim" "timeout_commit" "leave_resolve" "leave_commit" "assert_terminal"
permutation "submit_begin" "submit_prompt" "timeout_begin" "timeout_apply" "submit_commit" "timeout_commit" "assert_prompt_survives"
