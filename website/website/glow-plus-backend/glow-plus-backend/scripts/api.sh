#!/usr/bin/env bash
# Glow+ authed request helper  (T10)
#
# Logs in as a seeded account, caches the JWT, and reuses it for later calls so
# per-task testing doesn't mean re-pasting tokens.
#
#   ./scripts/api.sh merchant GET  /bookings
#   ./scripts/api.sh consumer GET  /bookings/me
#   ./scripts/api.sh consumer POST /bookings '{"merchantId":"...","styleId":"...","startTime":"..."}'
#   ./scripts/api.sh public   GET  /bookings/availability?merchantId=x&styleId=y&date=2026-08-24
#   ./scripts/api.sh token merchant     # print just the token
#   ./scripts/api.sh reset              # drop cached tokens
#
# Accounts come from `npm run seed`. Requires the API running on $API_BASE.
set -euo pipefail

# T49 — the version lives in the base URL, so the paths passed to this script
# stay bare (`/bookings/me`, not `/v1/bookings/me`), matching how both real
# clients are built. `/health` is VERSION_NEUTRAL and is not reachable through
# this helper's base — curl it directly at http://localhost:4000/health.
API_BASE="${API_BASE:-http://localhost:4000/v1}"
CACHE_DIR="${TMPDIR:-/tmp}/glow-tokens"
mkdir -p "$CACHE_DIR"

MERCHANT_EMAIL="merchant@glowplus.test"; MERCHANT_PASSWORD="Merchant123!"
CONSUMER_EMAIL="consumer@glowplus.test"; CONSUMER_PASSWORD="Consumer123!"
ADMIN_EMAIL="admin@glowplus.test"; ADMIN_PASSWORD="Admin123!"

die() { echo "error: $*" >&2; exit 1; }

# Logs in if there's no cached token, or if the cached one is rejected.
get_token() {
  local role="$1"
  local cache="$CACHE_DIR/$role.jwt"
  local path email password check_path
  # Admin tokens fail the /bookings/me liveness check by design (RequireConsumerGuard
  # rejects them with 403), so validate against an admin-only route instead.
  check_path="/bookings/me"; [[ "$role" == "admin" ]] && check_path="/admin/metrics/platform"
  if [[ -s "$cache" ]] && curl -sf -o /dev/null \
      -H "Authorization: Bearer $(cat "$cache")" "$API_BASE$check_path" 2>/dev/null; then
    cat "$cache"; return
  fi

  case "$role" in
    merchant) path=/merchants/login; email=$MERCHANT_EMAIL; password=$MERCHANT_PASSWORD ;;
    consumer) path=/auth/login;      email=$CONSUMER_EMAIL; password=$CONSUMER_PASSWORD ;;
    admin)    path=/admin/login;     email=$ADMIN_EMAIL;    password=$ADMIN_PASSWORD ;;
    *) die "unknown role '$role' (use merchant|consumer|admin|public)" ;;
  esac

  local body token
  body=$(curl -s -X POST "$API_BASE$path" -H 'Content-Type: application/json' \
           -d "{\"email\":\"$email\",\"password\":\"$password\"}")
  token=$(printf '%s' "$body" | sed -nE 's/.*"token"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')
  [[ -n "$token" ]] || die "login failed for $role. Is the API up and seeded (npm run seed)? Response: $body"
  printf '%s' "$token" > "$cache"
  printf '%s' "$token"
}

case "${1:-}" in
  reset) rm -f "$CACHE_DIR"/*.jwt 2>/dev/null || true; echo "cached tokens cleared"; exit 0 ;;
  token) get_token "${2:?usage: api.sh token <merchant|consumer>}"; echo; exit 0 ;;
  "")    die "usage: api.sh <merchant|consumer|public> <METHOD> <path> [json-body]" ;;
esac

ROLE="$1"; METHOD="${2:?missing METHOD}"; RAW_PATH="${3:?missing path}"; BODY="${4:-}"
PATH_ONLY="/${RAW_PATH#/}"

args=(-s -w '\n--- HTTP %{http_code} ---\n' -X "$METHOD" "$API_BASE$PATH_ONLY")
[[ "$ROLE" != "public" ]] && args+=(-H "Authorization: Bearer $(get_token "$ROLE")")
[[ -n "$BODY" ]] && args+=(-H 'Content-Type: application/json' -d "$BODY")

curl "${args[@]}"
