# Setup: Supabase + GitHub Pages (https://alkammah-memo.github.io)

These steps need your accounts, so they cannot be automated. Total time: about 15 minutes.

## 1. Supabase (separate organization and project)
1. Go to https://supabase.com/dashboard and sign in.
2. **New organization** -> name `Alkammah` (type: Personal/Team, plan: Free is enough).
3. **New project** inside it -> name `alkammah-memo`, set a strong database password (save it), choose the region closest to Cairo (Europe / Frankfurt).
4. Open **SQL Editor** -> New query -> paste the whole content of `supabase/migrations/0001_init.sql` -> **Run**. You should see "Success".
5. **Authentication -> Sign In / Providers**: keep **Email** enabled and turn **OFF "Allow new users to sign up"** (this is a private system).
6. **Authentication -> Users -> Add user -> Create new user**: enter your email and a strong password, tick **Auto Confirm User**.
7. **Authentication -> URL Configuration**: Site URL = `https://alkammah-memo.github.io`.
8. **Project Settings -> API**: copy the **Project URL** and the **anon public** key (never the service_role key).

## 2. GitHub organization and repository
1. https://github.com/organizations/plan -> create an organization named exactly **`Alkammah-Memo`** (Free plan).
2. In that organization create a **public** repository named exactly **`Alkammah-Memo.github.io`**.
   (GitHub Pages on free plans requires a public repository. The repo contains no secrets; the data is protected by Supabase login + row-level security.)
3. Push the contents of this `app` folder to the `main` branch of that repository.
4. Repository **Settings -> Secrets and variables -> Actions -> Variables tab -> New repository variable**:
   - `VITE_SUPABASE_URL` = the Project URL from step 1.8
   - `VITE_SUPABASE_ANON_KEY` = the anon public key from step 1.8
5. Repository **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
6. The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`.
   Your site appears at **https://alkammah-memo.github.io**.

## 3. First use
1. Open the site and sign in with the user from step 1.6.
2. **Settings -> Gemini API Keys**: paste up to three keys (use keys from different Google projects so quotas are independent),
   press **Save**, then **Test connection** on each key. Each test checks a real AI request and a Live voice handshake.
3. Recommended: in Google AI Studio / Cloud Console, restrict each key to **HTTP referrer `https://alkammah-memo.github.io/*`**
   (and `http://localhost:5173/*` for development). Browser-side keys are then useless anywhere else.

## Notes
- Gemini keys are stored in your Supabase `user_settings` row (private to your login via RLS) and on the device.
- All data also stays available offline in the browser (IndexedDB) and re-syncs when you are back online.
- To rotate the anon key or redeploy, just change the repository variables and re-run the workflow.
