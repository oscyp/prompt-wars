-- Run in a local transaction after the composer_judge_calibration migration.
BEGIN;
DO $$
DECLARE row_id uuid;
BEGIN
  INSERT INTO public.judge_calibration_sets(locale,prompt_one_text,prompt_one_move_type,prompt_two_text,prompt_two_move_type,expected_winner)
  VALUES ('en','Same idea','attack','Same idea','attack',NULL) RETURNING id INTO row_id;
  IF NOT EXISTS (SELECT 1 FROM public.judge_calibration_sets WHERE id=row_id AND expected_winner IS NULL AND label_provenance='authored_candidate' AND dataset_split='tuning' AND judge_policy_version='v1.0.0-mvp') THEN
    RAISE EXCEPTION 'draw label or conservative legacy defaults lost';
  END IF;
  BEGIN
    UPDATE public.judge_calibration_sets SET expected_winner=3 WHERE id=row_id;
    RAISE EXCEPTION 'invalid winner accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.judge_calibration_sets SET label_provenance='human_review_assumed' WHERE id=row_id;
    RAISE EXCEPTION 'fabricated provenance enum accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.judge_calibration_runs(judge_prompt_version,judge_model_id,locale,total_count,correct_count,accuracy,threshold,status,per_item_results,evaluation_metadata)
  VALUES('v2.0.0-ideas','fixture-only','multilingual',1,0,0,0.9,'failed','[]','{"passed":false,"labelProvenance":"authored_candidate"}');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.judge_calibration_sets) OR EXISTS(SELECT 1 FROM public.judge_calibration_runs) THEN
    RAISE EXCEPTION 'calibration evidence exposed to clients';
  END IF;
  BEGIN
    INSERT INTO public.judge_calibration_runs(judge_prompt_version,judge_model_id,locale,total_count,correct_count,accuracy,threshold,status,per_item_results)
    VALUES('v2.0.0-ideas','client-forged','multilingual',80,80,1,0.9,'passed','[]');
    RAISE EXCEPTION 'client can forge calibration evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
