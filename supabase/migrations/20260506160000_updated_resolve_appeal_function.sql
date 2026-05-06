-- Updated Appeal Resolution Function
-- Properly reverses rating and stat changes when appeal overturns original result

CREATE OR REPLACE FUNCTION resolve_appeal(
  p_appeal_id UUID,
  p_appeal_winner_id UUID,
  p_appeal_judge_run_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_battle_id UUID;
  v_original_winner_id UUID;
  v_player_one_id UUID;
  v_player_two_id UUID;
  v_status appeal_status;
  v_rating_delta_payload JSONB;
  v_reversion_payload JSONB;
BEGIN
  -- Get appeal info with idempotency check
  SELECT battle_id, original_winner_id, status
  INTO v_battle_id, v_original_winner_id, v_status
  FROM appeals WHERE id = p_appeal_id;
  
  -- Idempotency: only process pending appeals, return FALSE if not found or not pending
  IF NOT FOUND OR v_status <> 'pending' THEN
    RETURN FALSE;
  END IF;
  
  -- Get battle players and original rating deltas
  SELECT player_one_id, player_two_id, rating_delta_payload
  INTO v_player_one_id, v_player_two_id, v_rating_delta_payload
  FROM battles WHERE id = v_battle_id;
  
  -- Determine if appeal flips the winner
  -- Null handling: draw/null appeal outcome should not overturn original winner
  IF p_appeal_winner_id IS NOT NULL AND p_appeal_winner_id IS DISTINCT FROM v_original_winner_id THEN
    -- Appeal overturned: reverse stats and ratings
    
    -- Update battle winner
    UPDATE battles
    SET winner_id = p_appeal_winner_id
    WHERE id = v_battle_id;
    
    -- Reverse rating changes if they exist
    IF v_rating_delta_payload IS NOT NULL THEN
      UPDATE profiles
      SET 
        rating = rating - COALESCE((v_rating_delta_payload->(id::text)->>'delta')::NUMERIC, 0),
        last_rated_at = NOW()
      WHERE id IN (v_player_one_id, v_player_two_id);
    END IF;
    
    -- Swap stats: original winner loses a win/gains a loss, appeal winner loses a loss/gains a win
    -- Original winner (now loser)
    UPDATE profiles
    SET 
      wins = GREATEST(0, wins - 1),
      losses = losses + 1,
      current_streak = 0
    WHERE id = v_original_winner_id;
    
    -- Appeal winner (was loser)
    UPDATE profiles
    SET 
      losses = GREATEST(0, losses - 1),
      wins = wins + 1,
      current_streak = current_streak + 1,
      best_streak = GREATEST(best_streak, current_streak + 1)
    WHERE id = p_appeal_winner_id;
    
    -- Build reversion payload
    v_reversion_payload := jsonb_build_object(
      'original_winner_id', v_original_winner_id,
      'appeal_winner_id', p_appeal_winner_id,
      'rating_delta_reverted', v_rating_delta_payload,
      'stats_swapped', TRUE,
      'reverted_at', NOW()
    );
    
    -- Mark appeal as overturned
    UPDATE appeals
    SET 
      status = 'resolved_overturned',
      appeal_winner_id = p_appeal_winner_id,
      appeal_judge_run_id = p_appeal_judge_run_id,
      rating_reverted = TRUE,
      reversion_payload = v_reversion_payload,
      resolved_at = NOW()
    WHERE id = p_appeal_id;
    
  ELSE
    -- Appeal upheld or resulted in draw: no changes
    UPDATE appeals
    SET 
      status = 'resolved_upheld',
      appeal_winner_id = p_appeal_winner_id,
      appeal_judge_run_id = p_appeal_judge_run_id,
      rating_reverted = FALSE,
      resolved_at = NOW()
    WHERE id = p_appeal_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
