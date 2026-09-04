This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Google Drive gallery folder import

The admin album page can import every image in a publicly shared Google Drive
folder, including images in nested folders. Enable the Google Drive API in the
Google Cloud project, create a restricted API key, and add it as the server-only
`GOOGLE_DRIVE_API_KEY` environment variable locally and in Vercel. Do not use a
`NEXT_PUBLIC_` prefix.

In the admin console, open a gallery album, choose **Import Drive folder**, and
paste a folder shared as **Anyone with the link can view**. The importer lists
each filename and Drive link before inserting the images, and skips files that
are already in the album.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Slack team profile sync

Team Hub avatars and Slack display names are cached in Supabase; the browser
never calls Slack directly.

1. Apply `supabase/migrations/20260717000000_create_profiles_and_slack_sync.sql`.
2. Give the Slack bot `users:read` and `users:read.email` scopes, then reinstall
   it to the workspace. Slack requires `users:read.email` for `profile.email`.
3. Configure the Edge Function secrets:

   ```bash
   supabase secrets set SLACK_BOT_TOKEN=xoxb-... \
     SLACK_PROFILE_SYNC_SECRET=replace-with-a-long-random-value
   ```

4. Deploy the function:

   ```bash
   supabase functions deploy sync-slack-profiles --no-verify-jwt
   ```

5. Add `SLACK_PROFILE_SYNC_SECRET` with the same value and a separate random
   `CRON_SECRET` to the Vercel project. `vercel.json` invokes the protected
   server route every day at 09:00 UTC.

Owners can run a sync from **Team Hub → Management → Slack profiles**. The
Edge Function can also be invoked directly for debugging:

```bash
curl --request POST \
  "$SUPABASE_URL/functions/v1/sync-slack-profiles" \
  --header "x-sync-secret: $SLACK_PROFILE_SYNC_SECRET"
```

The same `CRON_SECRET` protects `/api/social-manual-reminders`. Vercel invokes
that route every five minutes to deliver due manual social-post reminders with
the post creative and calendar link. This interval requires Vercel Pro or
Enterprise; Vercel Hobby only permits once-daily cron jobs.

### First-time matching

The migrations seed the current team profiles without inventing email
addresses or Supabase Auth IDs. Add each known email to enable automatic email
matching:

```sql
update public.profiles
set email = 'person@example.com'
where team_username = 'Understory_Karen';
```

If Slack does not expose an email, copy the member ID from Slack and set the
one-time fallback mapping instead:

```sql
update public.profiles
set slack_user_id = 'U0123456789'
where team_username = 'Understory_Karen';
```

The sync tries email first and then `slack_user_id`. It updates existing
profiles only and logs unmatched profiles and Slack users in the Edge Function
logs.

## Finance workspace

Finance lives at `/team-hub/management/finance`. Team Portal owners can open
it directly with their existing Team Portal identity; there is no separate
Finance or social-provider sign-in. Its server routes repeat the owner check
before returning staff hours, budgets, encrypted payment profiles, and staff
invoice PDF files. Apply all Supabase migrations before using the workspace.

Generate `TOKEN_ENCRYPTION_KEY` with either `openssl rand -base64 32` or
`openssl rand -hex 32`. Never commit the generated value.
