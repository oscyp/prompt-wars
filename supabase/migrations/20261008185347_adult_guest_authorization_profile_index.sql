-- Account deletion cascades through profile_id; cover that lookup as its audit grows.
CREATE INDEX IF NOT EXISTS adult_guest_authorizations_profile_id
 ON private.adult_guest_authorizations(profile_id);

-- Intake now counts the independent 24-hour reservations, not authorization rows.
-- Permit lookup has its unique token-hash index; cleanup uses created_at/expiry.
DROP INDEX IF EXISTS private.adult_guest_network_velocity;
