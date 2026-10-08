# TestFlight — What to Test

Target: Prompt Wars **1.3.3 (14)**. Confirm the installed build number before testing. This text describes intended behavior, not completed device acceptance.

## Paste-ready notes (en-US)

This build introduces a new way to create your battle move from a shared situation.

- Start a new practice battle. In Build move, select an action and an intention without typing. Check the complete Your move text, then tap Lock in and confirm. Cancel should keep your draft; confirming should submit only once.
- Try Write your own, edit the full text, and return to Build move. Switching modes should preserve your words. Replacing edited text should ask first; cancel and Undo should restore the previous move.
- Close and reopen the app while drafting. Your text and Undo should survive. Changing move type or entering the next round must not submit an unfinished or previous-round move.
- Keep writing while starters load or the connection is unavailable. Free choices should remain usable. New starters should appear only after you choose to use them, without replacing your current text.
- Finish the battle and open the move review. The scene and recorded moves should match the round. Results must remain available even when a video is missing. Existing battles may intentionally retain the older composer.
- Check small screens, the software keyboard, larger text, VoiceOver and Reduce Motion. Report clipped text, hidden buttons, unexpected focus changes, lost drafts, duplicate submissions or crashes.

Please include your iPhone model, iOS version, app build, battle/round, steps and a screenshot in feedback. Do not include passwords or authentication tokens.

## Coordinated QA supplement

Use an existing eligible test account. Check new casual/friend and ranked assignments separately from practice, and complete a pinned legacy single/Bo3 battle where available. These checks create real hosted game records; ranked games can affect account state. Tutorial coverage requires an appropriate eligible test account or pre-existing test state, not an account reset.

Paid starter rerolls and video requests are separate, explicit checks with an agreed credit allowance. TestFlight installation does not make backend credits or AI-provider usage free. Verify the visible price before confirmation, no spend on ordinary loading/retry, and recovery of an interrupted purchase via **Check starter request**. Do not start another purchase while its outcome is unknown. Deliberate provider/moderation/refund failures require a coordinated test environment; do not induce them on the shared service.

An appeal may remain unavailable when its independent calibration prerequisites are absent. Record the actual response without treating it as proof that primary judging has been calibrated. Real-model calibration, human label review and the 12-person pilot remain outside this device pass.

Native acceptance is **NOT RUN at preparation time**. Record actual results with build, device, OS, accessibility settings and evidence; browser fixture geometry and Jest do not count as device acceptance.
