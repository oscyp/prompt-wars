-- Prompt Wars Phase 1+ Database Functions
-- Server-owned gameplay logic and state transitions

--------------------------------------------------------------------------------
-- PROFILE MANAGEMENT
--------------------------------------------------------------------------------

-- Create or update profile on auth user creation (trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

--------------------------------------------------------------------------------
-- BATTLE STATE TRANSITIONS
--------------------------------------------------------------------------------

-- Create a new battle (returns battle_id)
CREATE OR REPLACE FUNCTION create_battle(
  p_player_one_id UUID,
  p_character_id UUID,
  p_mode battle_mode DEFAULT 'ranked',
  p_friend_challenge_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  -- Determine timeout based on mode
  v_timeout_hours := CASE 
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked') THEN 8
    ELSE 2
  END;
  
  INSERT INTO battles (
    player_one_id,
    player_one_character_id,
    player_two_id,
    mode,
    status,
    player_one_prompt_deadline
  )
  VALUES (
    p_player_one_id,
    p_character_id,
    p_friend_challenge_id, -- NULL for matchmaking, set for friend challenges
    p_mode,
    CASE WHEN p_friend_challenge_id IS NULL THEN 'created' ELSE 'matched' END,
    NOW() + (v_timeout_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_battle_id;
  
  RETURN v_battle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a bot battle (player vs bot persona)
CREATE OR REPLACE FUNCTION create_bot_battle(
  p_player_one_id UUID,
  p_character_id UUID,
  p_bot_persona_id UUID,
  p_mode battle_mode DEFAULT 'bot',
  p_theme TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  -- Determine timeout based on mode
  v_timeout_hours := CASE 
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked', 'bot') THEN 8
    ELSE 2
  END;
  
  INSERT INTO battles (
    player_one_id,
    player_one_character_id,
    player_two_id,
    player_two_character_id,
    is_player_two_bot,
    bot_persona_id,
    mode,
    status,
    theme,
    theme_revealed_at,
    matched_at,
    player_one_prompt_deadline,
    player_two_prompt_deadline
  )
  VALUES (
    p_player_one_id,
    p_character_id,
    NULL, -- Bot has no profile
    NULL, -- Bot has no character
    TRUE,
    p_bot_persona_id,
    p_mode,
    'matched', -- Bot battles are immediately matched with theme revealed
    p_theme,
    NOW(),
    NOW(),
    NOW() + (v_timeout_hours || ' hours')::INTERVAL,
    NULL -- Bot doesn't need a deadline
  )
  RETURNING id INTO v_battle_id;
  
  RETURN v_battle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Match players (called by matchmaking Edge Function)
CREATE OR REPLACE FUNCTION match_battle(
  p_battle_id UUID,
  p_player_two_id UUID,
  p_player_two_character_id UUID,
  p_theme TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_timeout_hours INTEGER;
  v_mode battle_mode;
BEGIN
  -- Get battle mode
  SELECT mode INTO v_mode FROM battles WHERE id = p_battle_id;
  
  -- Determine timeout
  v_timeout_hours := CASE 
    WHEN v_mode = 'ranked' THEN 2
    ELSE 8
  END;
  
  UPDATE battles
  SET 
    player_two_id = p_player_two_id,
    player_two_character_id = p_player_two_character_id,
    status = 'matched',
    theme = p_theme,
    theme_revealed_at = NOW(),
    matched_at = NOW(),
    player_one_prompt_deadline = NOW() + (v_timeout_hours || ' hours')::INTERVAL,
    player_two_prompt_deadline = NOW() + (v_timeout_hours || ' hours')::INTERVAL
  WHERE id = p_battle_id AND status = 'created';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock prompt (client-initiated, server validates)
CREATE OR REPLACE FUNCTION lock_prompt(
  p_battle_id UUID,
  p_profile_id UUID,
  p_prompt_template_id UUID DEFAULT NULL,
  p_custom_prompt_text TEXT DEFAULT NULL,
  p_move_type move_type DEFAULT 'attack'
)
RETURNS UUID AS $$
DECLARE
  v_prompt_id UUID;
  v_battle_status battle_status;
  v_word_count INTEGER;
  v_is_bot_battle BOOLEAN;
BEGIN
  -- Check battle is in correct state
  SELECT status, is_player_two_bot INTO v_battle_status, v_is_bot_battle 
  FROM battles WHERE id = p_battle_id;
  
  IF v_battle_status NOT IN ('matched', 'waiting_for_prompts') THEN
    RAISE EXCEPTION 'Battle not ready for prompt submission';
  END IF;
  
  -- Check player is participant
  IF NOT EXISTS (
    SELECT 1 FROM battles 
    WHERE id = p_battle_id 
      AND (player_one_id = p_profile_id OR player_two_id = p_profile_id)
  ) THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;
  
  -- Check prompt doesn't already exist for this player
  IF EXISTS (
    SELECT 1 FROM battle_prompts 
    WHERE battle_id = p_battle_id AND profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Prompt already submitted for this battle';
  END IF;
  
  -- Calculate word count if custom
  IF p_custom_prompt_text IS NOT NULL THEN
    v_word_count := array_length(regexp_split_to_array(trim(p_custom_prompt_text), '\s+'), 1);
  END IF;
  
  -- Insert prompt (immutable after this point)
  INSERT INTO battle_prompts (
    battle_id,
    profile_id,
    prompt_template_id,
    custom_prompt_text,
    move_type,
    moderation_status,
    is_locked,
    locked_at,
    word_count
  )
  VALUES (
    p_battle_id,
    p_profile_id,
    p_prompt_template_id,
    p_custom_prompt_text,
    p_move_type,
    CASE 
      WHEN p_prompt_template_id IS NOT NULL THEN 'approved'
      ELSE 'pending'
    END,
    TRUE,
    NOW(),
    v_word_count
  )
  RETURNING id INTO v_prompt_id;
  
  -- Update battle status based on prompt submission
  IF v_is_bot_battle THEN
    -- Bot battles: human submits and battle immediately goes to resolving (bot prompt generated during resolution)
    UPDATE battles SET status = 'resolving' WHERE id = p_battle_id;
  ELSIF (SELECT COUNT(*) FROM battle_prompts WHERE battle_id = p_battle_id AND is_locked = TRUE) = 2 THEN
    -- Both human players have submitted
    UPDATE battles SET status = 'resolving' WHERE id = p_battle_id;
  ELSE
    -- Still waiting for other human player
    UPDATE battles SET status = 'waiting_for_prompts' WHERE id = p_battle_id;
  END IF;
  
  RETURN v_prompt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve battle (called by judge Edge Function after scoring)
CREATE OR REPLACE FUNCTION resolve_battle(
  p_battle_id UUID,
  p_winner_id UUID, -- NULL if draw
  p_is_draw BOOLEAN,
  p_score_payload JSONB,
  p_rating_delta_payload JSONB,
  p_judge_prompt_version TEXT,
  p_judge_model_id TEXT,
  p_judge_seed INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_player_one_id UUID;
  v_player_two_id UUID;
  v_mode battle_mode;
  v_is_bot_battle BOOLEAN;
  v_rows_updated INTEGER;
BEGIN
  -- Get battle players
  SELECT player_one_id, player_two_id, mode, is_player_two_bot
  INTO v_player_one_id, v_player_two_id, v_mode, v_is_bot_battle
  FROM battles WHERE id = p_battle_id;
  
  -- Update battle with idempotency guard
  UPDATE battles
  SET 
    status = 'result_ready',
    winner_id = p_winner_id,
    is_draw = p_is_draw,
    score_payload = p_score_payload,
    rating_delta_payload = p_rating_delta_payload,
    judge_prompt_version = p_judge_prompt_version,
    judge_model_id = p_judge_model_id,
    judge_seed = p_judge_seed,
    completed_at = NOW()
  WHERE id = p_battle_id AND status = 'resolving';
  
  -- Get row count to guard against double-apply in concurrent resolve races
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  -- If no rows were updated, battle was already resolved; return FALSE to prevent double stats
  IF v_rows_updated = 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Update player stats (for bot battles, only update player_one)
  IF v_is_bot_battle THEN
    -- Bot battles: only update human player stats with null-safe loss logic
    UPDATE profiles
    SET 
      total_battles = total_battles + 1,
      wins = CASE WHEN id = p_winner_id THEN wins + 1 ELSE wins END,
      losses = CASE WHEN id IS DISTINCT FROM p_winner_id AND NOT p_is_draw THEN losses + 1 ELSE losses END,
      draws = CASE WHEN p_is_draw THEN draws + 1 ELSE draws END,
      current_streak = CASE 
        WHEN id = p_winner_id THEN current_streak + 1
        WHEN NOT p_is_draw THEN 0
        ELSE current_streak
      END,
      best_streak = CASE 
        WHEN id = p_winner_id AND current_streak + 1 > best_streak THEN current_streak + 1
        ELSE best_streak
      END,
      first_battle_completed_at = COALESCE(first_battle_completed_at, NOW())
    WHERE id = v_player_one_id;
  ELSE
    -- Human vs human: update both players with null-safe loss logic
    UPDATE profiles
    SET 
      total_battles = total_battles + 1,
      wins = CASE WHEN id = p_winner_id THEN wins + 1 ELSE wins END,
      losses = CASE WHEN id IS DISTINCT FROM p_winner_id AND NOT p_is_draw THEN losses + 1 ELSE losses END,
      draws = CASE WHEN p_is_draw THEN draws + 1 ELSE draws END,
      current_streak = CASE 
        WHEN id = p_winner_id THEN current_streak + 1
        WHEN NOT p_is_draw THEN 0
        ELSE current_streak
      END,
      best_streak = CASE 
        WHEN id = p_winner_id AND current_streak + 1 > best_streak THEN current_streak + 1
        ELSE best_streak
      END,
      first_battle_completed_at = COALESCE(first_battle_completed_at, NOW())
    WHERE id IN (v_player_one_id, v_player_two_id);
  END IF;
  
  -- Update ratings for ranked battles (skip for bot battles)
  IF v_mode = 'ranked' AND p_rating_delta_payload IS NOT NULL AND NOT v_is_bot_battle THEN
    UPDATE profiles
    SET 
      rating = rating + COALESCE((p_rating_delta_payload->(id::text)->>'delta')::NUMERIC, 0),
      rating_deviation = COALESCE((p_rating_delta_payload->(id::text)->>'rd')::NUMERIC, rating_deviation),
      rating_volatility = COALESCE((p_rating_delta_payload->(id::text)->>'vol')::NUMERIC, rating_volatility),
      last_rated_at = NOW()
    WHERE id IN (v_player_one_id, v_player_two_id);
  END IF;
  
  -- Update rival counts (30-day window, skip for bot battles)
  IF NOT v_is_bot_battle AND v_player_two_id IS NOT NULL THEN
    INSERT INTO rivals (profile_id, rival_profile_id, battles_count_30d, last_battle_at)
    VALUES 
      (v_player_one_id, v_player_two_id, 1, NOW()),
      (v_player_two_id, v_player_one_id, 1, NOW())
    ON CONFLICT (profile_id, rival_profile_id) 
    DO UPDATE SET 
      battles_count_30d = rivals.battles_count_30d + 1,
      last_battle_at = NOW();
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire timed-out battles
CREATE OR REPLACE FUNCTION expire_timed_out_battles()
RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE battles
  SET status = 'expired'
  WHERE status = 'waiting_for_prompts'
    AND (
      (player_one_prompt_deadline < NOW() AND NOT EXISTS (
        SELECT 1 FROM battle_prompts WHERE battle_id = battles.id AND profile_id = player_one_id AND is_locked = TRUE
      ))
      OR
      (player_two_prompt_deadline < NOW() AND NOT EXISTS (
        SELECT 1 FROM battle_prompts WHERE battle_id = battles.id AND profile_id = player_two_id AND is_locked = TRUE
      ))
    );
  
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- WALLET OPERATIONS (Idempotent)
--------------------------------------------------------------------------------

-- Grant credits with idempotency
CREATE OR REPLACE FUNCTION grant_credits(
  p_profile_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_battle_id UUID DEFAULT NULL,
  p_purchase_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_transaction_id 
    FROM wallet_transactions 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_transaction_id IS NOT NULL THEN
      RETURN v_transaction_id; -- Already processed
    END IF;
  END IF;
  
  -- Get current balance
  SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits';
  
  -- Insert transaction
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    battle_id,
    purchase_id,
    metadata,
    idempotency_key
  )
  VALUES (
    p_profile_id,
    p_amount,
    v_current_balance + p_amount,
    'credits',
    p_reason,
    p_battle_id,
    p_purchase_id,
    p_metadata,
    p_idempotency_key
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Spend credits with validation
CREATE OR REPLACE FUNCTION spend_credits(
  p_profile_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_battle_id UUID DEFAULT NULL,
  p_video_job_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_transaction_id 
    FROM wallet_transactions 
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_transaction_id IS NOT NULL THEN
      RETURN v_transaction_id;
    END IF;
  END IF;
  
  -- Get current balance
  SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits';
  
  -- Validate sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits: % available, % required', v_current_balance, p_amount;
  END IF;
  
  -- Insert transaction (negative amount)
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    battle_id,
    video_job_id,
    metadata,
    idempotency_key
  )
  VALUES (
    p_profile_id,
    -p_amount,
    v_current_balance - p_amount,
    'credits',
    p_reason,
    p_battle_id,
    p_video_job_id,
    p_metadata,
    p_idempotency_key
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refund credits (for failed video jobs)
CREATE OR REPLACE FUNCTION refund_credits(
  p_video_job_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_battle_id UUID;
  v_profile_id UUID;
  v_credits_charged INTEGER;
  v_idempotency_key TEXT;
BEGIN
  -- Get job info
  SELECT battle_id, credits_charged INTO v_battle_id, v_credits_charged
  FROM video_jobs WHERE id = p_video_job_id;
  
  IF v_credits_charged IS NULL OR v_credits_charged = 0 THEN
    RETURN FALSE; -- Nothing to refund
  END IF;
  
  -- Get player who paid (simplified: first player for MVP)
  SELECT player_one_id INTO v_profile_id FROM battles WHERE id = v_battle_id;
  
  -- Build idempotency key
  v_idempotency_key := 'refund_video_' || p_video_job_id::text;
  
  -- Grant refund
  PERFORM grant_credits(
    v_profile_id,
    v_credits_charged,
    'video_generation_failed',
    v_idempotency_key,
    v_battle_id,
    NULL,
    jsonb_build_object('video_job_id', p_video_job_id)
  );
  
  -- Mark job as refunded
  UPDATE video_jobs SET refunded = TRUE WHERE id = p_video_job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- APPEALS
--------------------------------------------------------------------------------

-- Check appeal eligibility (1/day cap)
CREATE OR REPLACE FUNCTION can_appeal(
  p_profile_id UUID,
  p_battle_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_battle_mode battle_mode;
  v_winner_id UUID;
  v_appeals_today INTEGER;
BEGIN
  -- Get battle info
  SELECT mode, winner_id INTO v_battle_mode, v_winner_id
  FROM battles WHERE id = p_battle_id;
  
  -- Only ranked losses can be appealed
  IF v_battle_mode != 'ranked' OR v_winner_id = p_profile_id OR v_winner_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check daily cap
  SELECT COUNT(*) INTO v_appeals_today
  FROM appeals
  WHERE profile_id = p_profile_id
    AND created_at >= CURRENT_DATE;
  
  RETURN v_appeals_today < 1;
END;
$$ LANGUAGE plpgsql;

-- Submit appeal
CREATE OR REPLACE FUNCTION submit_appeal(
  p_battle_id UUID,
  p_profile_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_appeal_id UUID;
  v_original_winner UUID;
BEGIN
  -- Validate eligibility
  IF NOT can_appeal(p_profile_id, p_battle_id) THEN
    RAISE EXCEPTION 'Appeal not eligible: daily cap or battle constraints';
  END IF;
  
  -- Get original winner
  SELECT winner_id INTO v_original_winner FROM battles WHERE id = p_battle_id;
  
  -- Create appeal
  INSERT INTO appeals (
    battle_id,
    profile_id,
    original_winner_id,
    status
  )
  VALUES (
    p_battle_id,
    p_profile_id,
    v_original_winner,
    'pending'
  )
  RETURNING id INTO v_appeal_id;
  
  RETURN v_appeal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve appeal (called by appeal Edge Function)
CREATE OR REPLACE FUNCTION resolve_appeal(
  p_appeal_id UUID,
  p_appeal_winner_id UUID,
  p_appeal_judge_run_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_battle_id UUID;
  v_original_winner_id UUID;
  v_status appeal_status;
BEGIN
  -- Get appeal info
  SELECT battle_id, original_winner_id INTO v_battle_id, v_original_winner_id
  FROM appeals WHERE id = p_appeal_id;
  
  -- Determine outcome
  IF p_appeal_winner_id != v_original_winner_id THEN
    v_status := 'resolved_overturned';
    
    -- Revert rating change (simplified: swap winner, negate deltas)
    -- Full implementation would recalculate Glicko-2 from battle history
    UPDATE battles
    SET winner_id = p_appeal_winner_id
    WHERE id = v_battle_id;
    
    -- Mark as reverted
    UPDATE appeals
    SET 
      status = v_status,
      appeal_winner_id = p_appeal_winner_id,
      appeal_judge_run_id = p_appeal_judge_run_id,
      rating_reverted = TRUE,
      resolved_at = NOW()
    WHERE id = p_appeal_id;
  ELSE
    v_status := 'resolved_upheld';
    
    UPDATE appeals
    SET 
      status = v_status,
      appeal_winner_id = p_appeal_winner_id,
      appeal_judge_run_id = p_appeal_judge_run_id,
      resolved_at = NOW()
    WHERE id = p_appeal_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- DAILY LOGIN STREAK
--------------------------------------------------------------------------------

-- Update daily login streak with mercy day
CREATE OR REPLACE FUNCTION update_daily_login_streak(
  p_profile_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_login DATE;
  v_current_streak INTEGER;
  v_mercy_used BOOLEAN;
  v_credits_granted INTEGER;
BEGIN
  SELECT daily_login_last_date, daily_login_streak, daily_login_mercy_used_this_week
  INTO v_last_login, v_current_streak, v_mercy_used
  FROM profiles WHERE id = p_profile_id;
  
  -- If already logged in today, nothing to do
  IF v_last_login = CURRENT_DATE THEN
    RETURN FALSE;
  END IF;
  
  -- Check streak continuation
  IF v_last_login = CURRENT_DATE - 1 THEN
    -- Consecutive day
    v_current_streak := v_current_streak + 1;
  ELSIF v_last_login = CURRENT_DATE - 2 AND NOT v_mercy_used THEN
    -- Missed one day but mercy available
    v_current_streak := v_current_streak + 1;
    v_mercy_used := TRUE;
  ELSE
    -- Streak broken
    v_current_streak := 1;
  END IF;
  
  -- Reset mercy on new week (Sunday)
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    v_mercy_used := FALSE;
  END IF;
  
  -- Update profile
  UPDATE profiles
  SET 
    daily_login_last_date = CURRENT_DATE,
    daily_login_streak = v_current_streak,
    daily_login_mercy_used_this_week = v_mercy_used
  WHERE id = p_profile_id;
  
  -- Grant escalating credits (1 + streak bonus)
  v_credits_granted := LEAST(1 + (v_current_streak / 7), 5); -- Cap at 5
  
  PERFORM grant_credits(
    p_profile_id,
    v_credits_granted,
    'daily_login',
    'daily_login_' || p_profile_id::text || '_' || CURRENT_DATE::text,
    NULL,
    NULL,
    jsonb_build_object('streak', v_current_streak)
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- NOTIFICATION FREQUENCY CAP
--------------------------------------------------------------------------------

-- Check if notification can be sent (2/day cap by default)
CREATE OR REPLACE FUNCTION can_send_notification(
  p_profile_id UUID,
  p_category TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_max_per_day INTEGER;
  v_sent_today INTEGER;
  v_category_enabled BOOLEAN;
BEGIN
  -- Get user preferences
  SELECT max_per_day INTO v_max_per_day
  FROM notification_preferences WHERE profile_id = p_profile_id;
  
  v_max_per_day := COALESCE(v_max_per_day, 2);
  
  -- Check category enabled
  EXECUTE format('SELECT %I FROM notification_preferences WHERE profile_id = $1', p_category)
  INTO v_category_enabled USING p_profile_id;
  
  v_category_enabled := COALESCE(v_category_enabled, TRUE);
  
  IF NOT v_category_enabled AND p_category != 'result_ready' THEN
    RETURN FALSE; -- result_ready always sends
  END IF;
  
  -- Count sends today
  SELECT COUNT(*) INTO v_sent_today
  FROM notification_sends
  WHERE profile_id = p_profile_id AND sent_at >= CURRENT_DATE;
  
  RETURN v_sent_today < v_max_per_day OR p_category = 'result_ready';
END;
$$ LANGUAGE plpgsql;

-- Log notification send
CREATE OR REPLACE FUNCTION log_notification_send(
  p_profile_id UUID,
  p_category TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notification_sends (profile_id, category, sent_at)
  VALUES (p_profile_id, p_category, NOW());
  
  -- Cleanup old logs (retain 7 days)
  DELETE FROM notification_sends
  WHERE sent_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
