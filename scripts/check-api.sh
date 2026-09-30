#!/usr/bin/env bash
# Checks that a deployed Balanss API is reachable and configured the way the app needs it.
#   scripts/check-api.sh                                   # production (Railway)
#   scripts/check-api.sh https://balanss-production.up.railway.app you@example.com
# With an e-mail address it also requests a real sign-in e-mail to that address.
set -uo pipefail

URL=${1:-https://balanss-production.up.railway.app}
URL=${URL%/}
URL=${URL%/v1}
EMAIL=${2:-}
fail=0
ok() { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; }

echo "Checking $URL"

health=$(curl -sS -m 20 -w '\n%{http_code}' "$URL/health" 2>&1)
code=${health##*$'\n'}
body=${health%$'\n'*}
if [[ $code != 200 ]]; then
  bad "/health returned $code: $body"
  echo "  → Railway: open the service → Deployments → latest → Deploy Logs."
  echo "    502/'Application failed to respond' usually means the domain's target port does not match PORT (see docs/RAILWAY.md, step 4)."
  exit 1
fi
ok "/health → $body"
field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^,\"}]*\).*/\1/p" <<<"$body"; }
[[ $(field db) == true ]] && ok "database connected" || bad "database not connected"
[[ $(field env) == production ]] && ok "NODE_ENV=production" || warn "NODE_ENV is $(field env), expected production"
[[ $(field ai) == anthropic ]] && ok "Claude API key set (AI copy on)" || warn "AI is '$(field ai)': ANTHROPIC_API_KEY missing, templates only"
[[ $(field email) == resend ]] && ok "sign-in e-mails are sent (Resend)" || bad "EMAIL_PROVIDER is '$(field email)': nobody can sign in by e-mail. Set EMAIL_PROVIDER=resend + RESEND_API_KEY"

code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$URL/v1/me")
[[ $code == 401 ]] && ok "/v1/me requires sign-in (401)" || bad "/v1/me returned $code, expected 401"

code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$URL/auth/open?token=invalid-token-x")
[[ $code == 200 ]] && ok "sign-in link page /auth/open is live" || bad "/auth/open returned $code"

if [[ -n $EMAIL ]]; then
  res=$(curl -sS -m 30 -w '\n%{http_code}' -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}" "$URL/v1/auth/magic-link")
  code=${res##*$'\n'}
  if [[ $code == 200 ]]; then
    ok "sign-in e-mail requested for $EMAIL: check the inbox"
    grep -q devToken <<<"$res" && bad "response contains devToken: never allowed in production"
  else
    bad "magic link returned $code: ${res%$'\n'*} (Railway logs show the Resend error)"
  fi
fi

echo
[[ $fail == 0 ]] && echo "All required checks passed." || echo "Some checks failed; see docs/RAILWAY.md."
exit $fail
