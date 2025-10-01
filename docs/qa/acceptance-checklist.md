# LifeCurrents Acceptance Checklist

Use the following quick checks to validate the unified chat experience and the latest UI refinements.

## 1. Supabase-backed chat sync
1. Open LifeCurrents in Browser A and sign in.
2. Start a new chat, send a message, then branch an assistant reply.
3. Open Browser B (or an incognito window) and load the app.
4. Verify the new thread, branch, and edited content appear automatically after refresh.
5. Type in the chat input on Browser A without sending; reload and confirm the draft is restored.
6. Disable the network, add a message, then re-enable connectivity and ensure it syncs without duplication.

## 2. Task and calendar graph navigation
1. From the In Progress list, click any item.
2. Confirm the graph pans and highlights the corresponding node.
3. Repeat from the Completed list and a calendar entry.
4. Disconnect a node locally and confirm a toast warns if the node cannot be found.

## 3. In-progress typography parity
1. Observe the "In Progress" header and the list item text.
2. Confirm both use matching font sizes while retaining original weight and family.

## 4. Calendar auto-scroll to "now"
1. Refresh the page.
2. Within one second, confirm the red "now" line is vertically centered.
3. Scroll manually and verify the view remains where you leave it.

## 5. Supabase layout persistence
1. Resize each panel border.
2. Refresh the app.
3. Confirm each border returns to the saved position without flicker.
4. Repeat on a second device/browser to confirm cross-device persistence.

## 6. Graph control panel sizing
1. Observe the three-button control block in the graph.
2. Confirm the buttons and margins are approximately 50% smaller while remaining tappable.

## 7. Top commit box removal
1. Confirm there is no top banner showing commit timestamps and no residual gap.

## 8. Chat sidebar "New Chat" button
1. Confirm the button shows centered "New Chat" text with no overflow or icon.
2. Resize the sidebar to ensure the label stays visible.

Document test results or regressions before release.
