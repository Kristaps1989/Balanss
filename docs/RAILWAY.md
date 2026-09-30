# Railway: connect the backend and the app

Target: `https://balanss-production.up.railway.app` serves the Balanss API. The app (debug or release, no `.env` needed) talks to it.

Check progress at any step with:

```bash
scripts/check-api.sh                       # health, database, AI key, e-mail, auth
scripts/check-api.sh "" you@example.com    # same, plus sends a real sign-in e-mail
```

Or open `https://balanss-production.up.railway.app/health` in a browser. When everything is set, it shows:

```json
{"ok":true,"db":true,"ai":"anthropic","email":"resend","env":"production"}
```

## Automatic setup (recommended): Infrastructure as Code

The whole Railway setup lives in [`.railway/railway.ts`](../.railway/railway.ts):
- the Postgres database;
- the API service, built from `backend/Dockerfile`, which runs migrations before each deploy and uses `/health` as its health check;
- the link `DATABASE_URL → Postgres`;
- the `/data` volume, the domain and port 8081, the EU region, and "Wait for CI";
- all non-secret variables.

The GitHub workflow **Railway infrastructure** (`.github/workflows/railway.yml`) keeps Railway in sync:

| When | What happens |
|---|---|
| A pull request changes `.railway/` | Shows the plan: what would change on Railway |
| Merge to `main` | Applies the plan |
| Actions → Railway infrastructure → **Run workflow** | Applies on demand |

Code changes still deploy the usual way. Railway builds each commit on `main` once CI is green, because of "Wait for CI".

Secrets are never in git. `preserve()` keeps the values you set once in the dashboard. The workflow never deletes anything, such as a database, volume or variable. A deletion needs a person to run `railway config apply` and confirm it.

### One-time setup (about 10 minutes)

1. **Stop using the old config file.** Service **Balanss** → **Settings** → **Config-as-code**: clear `/backend/railway.json` (✕) and save. Railway can't manage a service with IaC while a config file is set. Do steps 2–5 right after this one.
2. **Secrets, set once.** Service **Balanss** → **Variables** → add:
   - `JWT_SECRET`: 48+ random characters;
   - `ANTHROPIC_API_KEY`: `sk-ant-…`;
   - `RESEND_API_KEY`: `re_…`.

   Leave everything else to the file.
3. **Railway token.** Railway → project **Balanss** → **Settings → Tokens** → create a token for the **production** environment and copy it.
4. **GitHub secret.** GitHub → repo **Balanss** → **Settings → Secrets and variables → Actions → New repository secret**. Name: `RAILWAY_TOKEN`, value: the token.
5. **First apply.** GitHub → **Actions** → **Railway infrastructure** → **Run workflow** (branch `main`). The log shows the plan, then the apply. Railway redeploys.
6. **Check.** Open `https://balanss-production.up.railway.app/health` or run `scripts/check-api.sh`.

If step 5 stops with *destructive changes*, the plan wants to delete or replace something. For example, you attached a volume with another name, or the Postgres image or region differs. Send me the log, or run the step yourself on your PC and read the plan before confirming:

```bash
npm install -g @railway/cli
railway login
railway link            # choose Balanss → production
railway config plan     # read it
railway config apply    # confirm
```

To change the infrastructure later (a new variable, more replicas, another database), edit `.railway/railway.ts` in a pull request, check the plan in the PR, then merge.

The manual steps below do the same thing by hand. Use them only if you don't use IaC.

## What was wrong

| Problem | Effect | Fix |
|---|---|---|
| The service was built from the repo root without the config file | Railway ran the Expo app (Metro, port 8081) instead of the API. The domain was created for port 8081 | Step 1 |
| No Postgres in the project | The API cannot start | Step 2 |
| Variables missing | No sign-in e-mail, no Claude, no JWT | Step 3 |
| The domain port must match the port the API listens on | 502 "Application failed to respond" | Step 3 (`PORT=8081`) |
| The app used the mock unless `.env` was set | The phone never called Railway | Fixed in code: production URL is the default |
| Gmail doesn't open `balanss://` links | Sign-in link did nothing | Fixed in code: the e-mail links to `https://…/auth/open`, which opens the app |

## Manual setup (reference; not needed with IaC)

### 1. Point the service at the backend config
Service **Balanss** → **Settings**:
- **Source**: repo `Kristaps1989/Balanss`, branch `main`. Leave **Root Directory** empty (the Dockerfile needs the whole repo, because the backend uses `shared/`).
- **Config-as-code** → **Railway Config File** → `/backend/railway.json`.

This switches the build to `backend/Dockerfile`. It also runs database migrations before each deploy and uses `/health` as the health check.

### 2. Add Postgres
On the project canvas: **+ Create → Database → PostgreSQL**. Put it in the same region as the API.

### 3. Variables
Service **Balanss** → **Variables** → **Raw Editor**, paste, then fill in the `<…>` parts:

```
NODE_ENV=production
PORT=8081
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<48+ random characters, e.g. from a password manager>
ANTHROPIC_API_KEY=<sk-ant-… from console.anthropic.com → API keys>
EMAIL_PROVIDER=resend
RESEND_API_KEY=<re_… from resend.com → API keys>
EMAIL_FROM=Balanss <onboarding@resend.dev>
STORAGE_DIR=/data/storage
RAILWAY_RUN_UID=0
```

Notes:
- `RAILWAY_RUN_UID=0` lets the API write to the volume from step 4. Railway mounts volumes as root, and the container otherwise runs as the `node` user.
- `PORT=8081` matches the domain you already generated (Networking shows "→ Port 8081"). If you change one, change the other.
- `PUBLIC_API_URL` is not needed: the API reads Railway's `RAILWAY_PUBLIC_DOMAIN`.
- `onboarding@resend.dev` is Resend's test sender. It can only send to the e-mail address of your Resend account, which is enough for your own testing. Before other people use the app, verify a domain in Resend and change `EMAIL_FROM`, e.g. `Balanss <noreply@yourdomain.lv>`.
- Optional later: `GOOGLE_CLIENT_IDS` (Google sign-in, see NATIVE_SETUP.md §3), `REVENUECAT_WEBHOOK_SECRET` (Pro), `EXPO_ACCESS_TOKEN` (push).
- The Claude key lives **only** here. Never in the app, `.env` or GitHub.

### 4. Volume (meal photos)
Right-click the service → **Attach volume** → mount path `/data`.

### 5. Region (GDPR)
**Settings → Deploy → Regions**: an EU region, e.g. *EU West (Amsterdam)*. Use the same region for Postgres.

### 6. Deploy and check
Apply the changes (**Deploy**). Watch **Deployments → Build Logs / Deploy Logs**. A good start ends with:

```
migrations applied
balanss api ready
```

Then run `scripts/check-api.sh`. Common failures:
- **`/health` 502**: the port doesn't match (step 3), or the app crashed. The deploy log shows the error, e.g. `JWT_SECRET must be set` or `DATABASE_URL must be set`.
- **`db:false`**: `DATABASE_URL` is not `${{Postgres.DATABASE_URL}}`, or Postgres is in another project.
- **`email:"console"`**: `EMAIL_PROVIDER=resend` is missing.
- **Magic link 500**: Resend refused it. Usually the recipient is not your Resend account address while using `onboarding@resend.dev`.

Optional: turn on **Wait for CI** (Settings → Deploy), so Railway deploys only after GitHub Actions is green.

## App

1. Pull `main` in Android Studio (Git → Pull), run `npm install`, then start Metro (`npx expo start`) and press **Run ▶**.
2. No `.env` is needed: the app uses `https://balanss-production.up.railway.app` by default. Overrides:
   - `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`: a local backend on the emulator.
   - `EXPO_PUBLIC_USE_MOCK=1`: offline mock data.
3. Sign in: **Turpināt ar e-pastu** → your Resend account address → open the e-mail **on the phone** → **Pieslēgties** → **Atvērt Balanss**. The app opens signed in and starts onboarding.

If the login screen says *"Nevar sasniegt serveri"*, the phone has no internet or the API is down: run `scripts/check-api.sh`.
