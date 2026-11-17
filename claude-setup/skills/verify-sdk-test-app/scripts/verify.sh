#!/usr/bin/env bash
# Launch, check, drive and tear down the SDK test app (test/test-nextjs or test/test-vite)
# on a private anvil chain, for the verify-sdk-test-app skill.
#
#   verify.sh up [vite|nextjs]   build dist, start anvil + deploy, start the app (default vite)
#   verify.sh build              rebuild SDK dist after a src edit and record it for doctor
#   verify.sh doctor             read-only: is this instance worth driving?
#   verify.sh run [pw args...]   run Playwright against the instance, capture evidence
#   verify.sh down               stop the processes this run started; keep logs and evidence
#   verify.sh paths              print the run, log and evidence directories
#
# Env: VERIFY_RUN_ID (default "default"), VERIFY_SDK_HOME (default $TMPDIR/verify-sdk-test-app),
# ANVIL_PORT (default 8645), APP_PORT (default 3110 nextjs / 3210 vite), VERIFY_SKIP_BUILD=1,
# VERIFY_SKIP_DEPS_CHECK=1, VERIFY_REPO_ROOT (default: git toplevel of the current directory).
# Written for macOS /bin/bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="${VERIFY_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || git -C "$SKILL_DIR" rev-parse --show-toplevel)}"
TMP_BASE="${TMPDIR:-/tmp}"
HOME_DIR="${VERIFY_SDK_HOME:-${TMP_BASE%/}/verify-sdk-test-app}"
RUN_ID="${VERIFY_RUN_ID:-default}"
RUN_DIR="$HOME_DIR/$RUN_ID"
STATE="$RUN_DIR/state.env"
LOG_DIR="$RUN_DIR/logs"
EVIDENCE_ROOT="$RUN_DIR/evidence"
WARM_ROUTES="/wallet /shield /transfer /unshield /permits"
# Tracked files the harness rewrites as a side effect (see cmd_up and cmd_down).
HARNESS_TOUCHED="contracts/deployments.json test/test-nextjs/next-env.d.ts"

die() {
  echo "verify: $*" >&2
  exit 1
}

say() { echo "verify: $*"; }

listener_pid() {
  lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

pgid_of() {
  ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ' || true
}

group_alive() {
  [ -n "${1:-}" ] && kill -0 -- "-$1" 2>/dev/null
}

load_state() {
  [ -f "$STATE" ] || die "no running instance for run '$RUN_ID' (no $STATE). Run: verify.sh up"
  # shellcheck disable=SC1090
  . "$STATE"
}

write_state() {
  {
    echo "MODE=$MODE"
    echo "REPO_ROOT=$REPO_ROOT"
    echo "ANVIL_PORT=$ANVIL_PORT"
    echo "APP_PORT=$APP_PORT"
    echo "ANVIL_PGID=${ANVIL_PGID:-}"
    echo "APP_PGID=${APP_PGID:-}"
    echo "GIT_SHA=$GIT_SHA"
    echo "AGENTS_MD_PREEXISTED=$AGENTS_MD_PREEXISTED"
    echo "STARTED_AT=$STARTED_AT"
    echo "BUILT_SRC=${BUILT_SRC:-}"
  } >"$STATE"
}

src_fingerprint() {
  # Content hash of the SDK sources the dist is built from. Content, not mtime: other tools
  # touch files without changing them, and turbo then (correctly) replays the cached dist.
  (cd "$REPO_ROOT" &&
    git ls-files -co --exclude-standard -- packages/sdk/src packages/react-sdk/src |
    git hash-object --stdin-paths | shasum | cut -c1-16)
}

build_dist() {
  say "building @zama-fhe/sdk and @zama-fhe/react-sdk dist (the test apps import dist, not src)"
  mkdir -p "$LOG_DIR"
  pnpm_flags=""
  [ "${VERIFY_SKIP_DEPS_CHECK:-}" = 1 ] && pnpm_flags="--config.verify-deps-before-run=false"
  # Fingerprint before building, so an edit made during the build reads as stale.
  fingerprint="$(src_fingerprint)"
  # shellcheck disable=SC2086
  if ! (cd "$REPO_ROOT" && pnpm $pnpm_flags build:react-sdk) >"$LOG_DIR/build.log" 2>&1; then
    tail -20 "$LOG_DIR/build.log" >&2
    if grep -q ERR_PNPM_VERIFY_DEPS_BEFORE_RUN "$LOG_DIR/build.log"; then
      echo "verify: node_modules is behind the lockfile. Run pnpm install, or re-run with VERIFY_SKIP_DEPS_CHECK=1 if the drift is dev tooling only." >&2
    fi
    die "build failed; full log: $LOG_DIR/build.log"
  fi
  BUILT_SRC="$fingerprint"
}

cmd_build() {
  load_state
  build_dist
  write_state
  say "dist rebuilt. Vite and Next.js serve the linked packages from disk; if a journey still shows old behavior, run down and up."
}

cmd_paths() {
  echo "repo:      $REPO_ROOT"
  echo "run dir:   $RUN_DIR"
  echo "logs:      $LOG_DIR"
  echo "evidence:  $EVIDENCE_ROOT"
}

start_app() {
  set -m
  if [ "$MODE" = nextjs ]; then
    (cd "$APP_DIR" && NEXT_PUBLIC_ANVIL_PORT="$ANVIL_PORT" exec ./node_modules/.bin/next dev --port "$APP_PORT") \
      </dev/null >"$LOG_DIR/app.log" 2>&1 &
  else
    (cd "$APP_DIR" && VITE_ANVIL_PORT="$ANVIL_PORT" exec ./node_modules/.bin/vite --port "$APP_PORT" --strictPort) \
      </dev/null >"$LOG_DIR/app.log" 2>&1 &
  fi
  APP_PGID=$!
  set +m
}

cmd_up() {
  MODE="${1:-vite}"
  case "$MODE" in
    nextjs) APP_DIR="$REPO_ROOT/test/test-nextjs"; APP_PORT="${APP_PORT:-3110}" ;;
    vite) APP_DIR="$REPO_ROOT/test/test-vite"; APP_PORT="${APP_PORT:-3210}" ;;
    *) die "unknown app '$MODE' (use nextjs or vite)" ;;
  esac
  ANVIL_PORT="${ANVIL_PORT:-8645}"

  if [ -f "$STATE" ]; then
    # shellcheck disable=SC1090
    . "$STATE"
    if group_alive "${ANVIL_PGID:-}" || group_alive "${APP_PGID:-}"; then
      die "run '$RUN_ID' is already up ($STATE). Run verify.sh down first, or set VERIFY_RUN_ID."
    fi
    rm -f "$STATE"
  fi

  # Preflight: tools, submodule, installed deps.
  for tool in anvil forge cast jq lsof curl git; do
    command -v "$tool" >/dev/null || die "missing tool: $tool"
  done
  [ -f "$REPO_ROOT/test/playwright/start-anvil.sh" ] || die "$REPO_ROOT is not a zama-ai/sdk checkout"
  [ -f "$REPO_ROOT/contracts/lib/fhevm/sdk/js-sdk/contracts/foundry.toml" ] ||
    die "contracts/lib/fhevm is not checked out. Run: pnpm submodule:install && pnpm contracts:install"
  [ -d "$REPO_ROOT/contracts/dependencies" ] || die "contracts deps missing. Run: pnpm contracts:install"
  [ -x "$APP_DIR/node_modules/.bin/$([ "$MODE" = nextjs ] && echo next || echo vite)" ] ||
    die "$APP_DIR/node_modules is missing. Run: pnpm install"
  [ -x "$REPO_ROOT/test/playwright/node_modules/.bin/playwright" ] ||
    die "test/playwright/node_modules is missing. Run: pnpm install"

  # Refuse busy ports: start-anvil.sh kill -9s whatever listens on its port.
  for port in "$ANVIL_PORT" "$APP_PORT"; do
    pid="$(listener_pid "$port")"
    if [ -n "$pid" ]; then
      die "port $port is in use by pid $pid ($(ps -o command= -p "$pid" | cut -c1-120)). Pick other ports (ANVIL_PORT/APP_PORT); never kill a process you did not start."
    fi
  done

  mkdir -p "$LOG_DIR" "$EVIDENCE_ROOT"
  GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  AGENTS_MD_PREEXISTED=no
  [ -e "$APP_DIR/AGENTS.md" ] && AGENTS_MD_PREEXISTED=yes
  ANVIL_PGID=
  APP_PGID=

  # The deploy rewrites contracts/deployments.json (drops the final newline) and next dev
  # rewrites next-env.d.ts. Keep clean copies so down can undo exactly that.
  rm -rf "$RUN_DIR/pristine"
  mkdir -p "$RUN_DIR/pristine"
  for file in $HARNESS_TOUCHED; do
    if git -C "$REPO_ROOT" diff --quiet -- "$file"; then
      cp "$REPO_ROOT/$file" "$RUN_DIR/pristine/$(echo "$file" | tr / _)"
    fi
  done

  if [ "${VERIFY_SKIP_BUILD:-}" = 1 ]; then
    # The caller vouches that dist matches the current src.
    BUILT_SRC="$(src_fingerprint)"
  else
    build_dist
  fi

  # Each background job gets its own process group (set -m), so down stops exactly what we started.
  say "starting anvil on $ANVIL_PORT and deploying the cleartext FHEVM host + test tokens"
  set -m
  (cd "$REPO_ROOT/test/playwright" && exec ./start-anvil.sh "$ANVIL_PORT") \
    </dev/null >"$LOG_DIR/anvil.log" 2>&1 &
  ANVIL_PGID=$!
  set +m
  write_state

  waited=0
  until grep -q "Anvil ready on port $ANVIL_PORT" "$LOG_DIR/anvil.log" 2>/dev/null; do
    if ! group_alive "$ANVIL_PGID"; then
      tail -30 "$LOG_DIR/anvil.log" >&2
      die "anvil/deploy exited early; full log: $LOG_DIR/anvil.log. Run verify.sh down."
    fi
    [ "$waited" -ge 360 ] && die "anvil not ready after 360s; see $LOG_DIR/anvil.log. Run verify.sh down."
    sleep 2
    waited=$((waited + 2))
  done
  say "anvil ready after ${waited}s"

  say "starting $MODE dev server on $APP_PORT"
  start_app
  write_state

  # Ready means every route compiles and serves, not just that the port answers.
  for route in $WARM_ROUTES; do
    waited=0
    until [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$APP_PORT$route" || true)" = 200 ]; do
      if ! group_alive "$APP_PGID"; then
        if [ "$MODE" = nextjs ] && [ "${NEXT_NOTICE_RETRIED:-}" != 1 ] &&
          grep -q "stopped to show the upgrade recommendation" "$LOG_DIR/app.log"; then
          # next dev stops once per version when it detects an agent and its own version has a
          # security advisory; a restart within 5 minutes proceeds. Never run the `next upgrade`
          # it suggests from here: report the notice to the user instead.
          cp "$LOG_DIR/app.log" "$LOG_DIR/app.next-security-notice.log"
          say "next dev stopped once to show a Next.js security-upgrade notice (saved to $LOG_DIR/app.next-security-notice.log); restarting it once"
          NEXT_NOTICE_RETRIED=1
          start_app
          write_state
          continue
        fi
        tail -30 "$LOG_DIR/app.log" >&2
        die "$MODE dev server exited; full log: $LOG_DIR/app.log. Run verify.sh down."
      fi
      [ "$waited" -ge 240 ] && die "$route not serving after 240s; see $LOG_DIR/app.log. Run verify.sh down."
      sleep 2
      waited=$((waited + 2))
    done
  done
  say "up: $MODE at http://localhost:$APP_PORT, anvil at http://127.0.0.1:$ANVIL_PORT (run '$RUN_ID')"
  say "next: verify.sh doctor"
}

cmd_doctor() {
  load_state
  fail=0
  ok() { echo "  ok    $*"; }
  bad() {
    echo "  FAIL  $*"
    fail=1
  }
  warn() { echo "  warn  $*"; }

  echo "run '$RUN_ID': $MODE app :$APP_PORT, anvil :$ANVIL_PORT, started $STARTED_AT at $GIT_SHA"

  for pair in "anvil:$ANVIL_PORT:${ANVIL_PGID:-}" "app:$APP_PORT:${APP_PGID:-}"; do
    name="${pair%%:*}"
    rest="${pair#*:}"
    port="${rest%%:*}"
    pgid="${rest#*:}"
    if ! group_alive "$pgid"; then
      bad "$name process group $pgid is gone"
      continue
    fi
    pid="$(listener_pid "$port")"
    if [ -z "$pid" ]; then
      bad "$name: nothing listens on :$port"
    elif [ "$(pgid_of "$pid")" = "$pgid" ]; then
      ok "$name: :$port is owned by this run (pid $pid, pgid $pgid)"
    else
      bad "$name: :$port is owned by pid $pid, not by this run's pgid $pgid"
    fi
  done

  rpc="http://127.0.0.1:$ANVIL_PORT"
  chain_id="$(cast chain-id --rpc-url "$rpc" 2>/dev/null || true)"
  if [ "$chain_id" = 31337 ]; then
    ok "anvil answers RPC, chain id 31337"
  else
    bad "anvil RPC chain id is '$chain_id', want 31337"
  fi

  deployments="$REPO_ROOT/contracts/deployments.json"
  for key in erc20 cToken USDT cUSDT wrappersRegistry; do
    addr="$(jq -r ".$key" "$deployments")"
    code="$(cast code "$addr" --rpc-url "$rpc" 2>/dev/null || true)"
    if [ -n "$code" ] && [ "$code" != 0x ]; then
      ok "contract $key deployed at $addr"
    else
      bad "contract $key has no code at $addr (deploy incomplete or addresses drifted)"
    fi
  done

  status="$(curl -s -o "$RUN_DIR/doctor-wallet.html" -w '%{http_code}' "http://localhost:$APP_PORT/wallet" || true)"
  if [ "$status" = 200 ]; then
    ok "app serves /wallet (HTTP 200)"
  else
    bad "app /wallet returned HTTP '$status'"
  fi
  # The <title> is "Token SDK Test App" (nextjs) or "Token SDK Test App (Vite)".
  if grep -q "<title>Token SDK Test App" "$RUN_DIR/doctor-wallet.html" 2>/dev/null; then
    ok "page title identifies the SDK test app"
  else
    bad "/wallet on :$APP_PORT is not the SDK test app"
  fi

  if [ ! -f "$REPO_ROOT/packages/sdk/dist/esm/index.js" ] || [ ! -f "$REPO_ROOT/packages/react-sdk/dist/index.js" ]; then
    bad "packages dist is missing; the app cannot load the SDK. Run: verify.sh build"
  elif [ "$(src_fingerprint)" != "${BUILT_SRC:-}" ]; then
    bad "SDK src changed since the last build by this run; the app serves old SDK code. Run: verify.sh build"
  else
    ok "SDK dist was built from the current src"
  fi

  head_sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  if [ "$head_sha" = "$GIT_SHA" ]; then
    ok "HEAD unchanged since up ($head_sha)"
  else
    warn "HEAD moved from $GIT_SHA to $head_sha since up"
  fi

  if [ "$fail" = 0 ]; then
    echo "doctor: healthy"
  else
    echo "doctor: NOT healthy. Read $LOG_DIR/*.log, then verify.sh down && verify.sh up"
    return 1
  fi
}

cmd_run() {
  load_state
  cmd_doctor >/dev/null || die "doctor failed; run verify.sh doctor for details"
  evidence="$EVIDENCE_ROOT/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$evidence"
  {
    echo "command: verify.sh run $*"
    echo "app: $MODE http://localhost:$APP_PORT"
    echo "anvil: http://127.0.0.1:$ANVIL_PORT"
    echo "git: $(git -C "$REPO_ROOT" rev-parse HEAD)"
    echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "working tree (git status --porcelain):"
    git -C "$REPO_ROOT" status --porcelain
  } >"$evidence/run.txt"
  say "evidence -> $evidence"
  set +e
  (cd "$REPO_ROOT/test/playwright" &&
    VERIFY_SKILL_DIR="$SKILL_DIR" VERIFY_REPO_ROOT="$REPO_ROOT" VERIFY_EVIDENCE_DIR="$evidence" \
      VERIFY_BASE_URL="http://localhost:$APP_PORT" VERIFY_ANVIL_PORT="$ANVIL_PORT" VERIFY_APP="$MODE" \
      ./node_modules/.bin/playwright test --config "$SKILL_DIR/playwright.verify.config.mts" "$@") |
    tee "$evidence/stdout.txt"
  rc=${PIPESTATUS[0]}
  set -e
  echo "exit: $rc" >>"$evidence/run.txt"
  say "playwright exit $rc; evidence in $evidence (report.json, html/, artifacts/, journeys/)"
  return "$rc"
}

stop_group() {
  name="$1"
  pgid="$2"
  group_alive "$pgid" || return 0
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    group_alive "$pgid" || {
      say "stopped $name (pgid $pgid)"
      return 0
    }
    sleep 1
  done
  kill -KILL -- "-$pgid" 2>/dev/null || true
  say "killed $name (pgid $pgid) after TERM timeout"
}

cmd_down() {
  load_state
  stop_group app "${APP_PGID:-}"
  stop_group anvil "${ANVIL_PGID:-}"
  for port in "$APP_PORT" "$ANVIL_PORT"; do
    pid="$(listener_pid "$port")"
    [ -z "$pid" ] || echo "verify: warning: :$port still has listener pid $pid (not ours if its pgid is not one we started)" >&2
  done
  # next dev drops an untracked AGENTS.md into the app dir; remove it only if this run created it.
  app_dir="$REPO_ROOT/test/test-$MODE"
  if [ "$AGENTS_MD_PREEXISTED" = no ] && [ -e "$app_dir/AGENTS.md" ] &&
    [ -n "$(git -C "$REPO_ROOT" status --porcelain -- "$app_dir/AGENTS.md")" ]; then
    rm -f "$app_dir/AGENTS.md"
    say "removed $app_dir/AGENTS.md written by next dev"
  fi
  # Undo the harness's rewrites of tracked files, but only for files that were clean at up time.
  for file in $HARNESS_TOUCHED; do
    pristine="$RUN_DIR/pristine/$(echo "$file" | tr / _)"
    if [ ! -f "$pristine" ] || cmp -s "$pristine" "$REPO_ROOT/$file"; then
      continue
    fi
    if [ "$file" = contracts/deployments.json ] &&
      [ "$(jq -S . "$pristine")" != "$(jq -S . "$REPO_ROOT/$file")" ]; then
      echo "verify: warning: the deploy wrote different addresses to $file; left as is (clean copy: $pristine)" >&2
      continue
    fi
    cp "$pristine" "$REPO_ROOT/$file"
    say "restored $file (rewritten by the harness)"
  done
  rm -f "$STATE"
  say "down. Logs and evidence kept in $RUN_DIR"
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  build) cmd_build ;;
  doctor) cmd_doctor ;;
  run) shift; cmd_run "$@" ;;
  down) cmd_down ;;
  paths) cmd_paths ;;
  *)
    sed -n '2,15p' "$0"
    exit 2
    ;;
esac
