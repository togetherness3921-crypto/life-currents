# Preview Build Workflow QA Guide

Use this checklist to validate the in-app preview build experience.

## 1. Notification Indicator
- Seed Supabase with a `preview_builds` row whose `is_seen` field is `false`.
- Load the application and confirm the floating button appears in the lower-right corner, pulsing with the attention animation.
- Verify that the badge count matches the number of unseen builds.

## 2. Real-time Updates
- While the app remains open, insert another unseen row into `preview_builds` using Supabase Studio or SQL.
- Confirm the badge count updates within a few seconds without a manual refresh.

## 3. Build List Panel
- Click the floating button to open the panel.
- Confirm the panel header reads **Preview Builds** and unseen rows now show `is_seen = true` in the database.
- Validate loading, empty, and error states by toggling network conditions (e.g., disable network to trigger an error message).

## 4. View Action
- For a build with a populated `preview_url`, click **View** and ensure it opens a new tab to the preview deployment.
- For a build without a `preview_url`, verify the **View** button is disabled and the “Preview URL pending deployment…” helper text is shown.

## 5. Commit Workflow
- Click **Commit** for a build in the `pending_review` state.
- Confirm the button immediately reads “Committing…” and becomes disabled.
- Monitor the GitHub Actions workflow `merge_pr.yml` and verify it receives a dispatch containing the selected `pr_number`.
- Once the workflow updates the row status to `committed`, confirm the UI badge clears, the build pill now reads “Committed,” and the button label switches to **Committed**.

## 6. Accessibility
- Tab to the floating action button and ensure focus outlines are visible.
- Use the keyboard to open the dialog (Enter) and navigate between actions inside the panel.
- Verify that screen readers announce the badge count (e.g., using VoiceOver or NVDA).
