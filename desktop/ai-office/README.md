# AI Office (desktop)

A small Mac app that shows the five AI Workspace agents as pixel art staff in an
office, so you can see at a glance who is working, who is waiting for your
approval, who is queued, who hit an error and who is free. It refreshes every
10 seconds. Click a person, a card or a feed line to open that task in the
portal.

| On the floor | Meaning |
| --- | --- |
| At the desk, typing, screen lit, `...` bubble | Working on a task |
| At the desk, number bubble | Tasks queued |
| In the meeting room, `!` bubble | Waiting for your approval or input |
| At the desk, red `×` bubble | Latest task failed |
| On the sofa, `z` bubble | Free |
| Empty desk with a 暫停 sign | Agent paused in AI Workspace Settings |

## How it gets data

The app calls `GET /api/ai/office` on the portal with
`Authorization: Bearer <AI_OFFICE_TOKEN>`. That endpoint is read-only and
returns only agent names and states, task titles, stages and links, recent
event summaries and the IDs of tasks with a pending approval. It never returns
objectives, outputs, client data, costs or approval content, and the token
cannot change anything.

1. Generate a token of at least 32 characters, for example `openssl rand -hex 32`.
2. Add it as `AI_OFFICE_TOKEN` in the portal's Vercel environment variables and redeploy.
3. Open AI Office, enter the portal URL and the token. The token is stored with
   macOS Keychain encryption (`safeStorage`).

## Install on a Mac

The GitHub workflow **Build AI Office for Mac** builds the app on every change
under `desktop/ai-office`. Download the `AI-Office-mac` artifact from the run,
unzip it, and use `AI-Office-mac-arm64.zip` on Apple Silicon (M1 and later) or
`AI-Office-mac-x64.zip` on Intel Macs. Move **AI Office** into Applications.

The app is not notarised, so the first time macOS blocks it. Open **System
Settings → Privacy & Security** and choose **Open Anyway** (or right-click the
app and choose **Open**). After that it opens normally.

The **Office** menu has **Always on top**, **Open at login**, **Connection
settings…** and **Refresh now** (⌘R).

## Develop

```bash
cd desktop/ai-office
npm install
npm test        # state logic
npm start       # run the app
npm run dist:mac  # build unsigned .app bundles into dist/ (macOS)
```
