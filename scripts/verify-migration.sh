#!/bin/bash
#
# Verify a schema migration against real SQLite on an iOS simulator.
#
# WHY THIS EXISTS
#
# Migration unit tests mock the database. They prove a statement is *issued*
# with the right arguments; they cannot prove it executes, that the version gate
# in schema.ts fires, or that the migration releases the master lock rather than
# wedging startup. For a migration those are the parts that matter: if the
# registration is wrong, every existing install fails on launch, and a green
# Jest suite says nothing about it.
#
# `.maestro/19-migration-lock.yaml` does NOT close this gap either. It launches
# with `clearState: true`, and a cleared database is created directly at
# CURRENT_SCHEMA_VERSION — schema.ts only calls runMigrations on the
# `currentVersion < CURRENT_SCHEMA_VERSION` branch. A fresh install therefore
# never runs a migration at all.
#
# HOW IT WORKS
#
# The old-version state is manufactured rather than obtained by installing an
# older build: `getCurrentSchemaVersion` is `MAX(version) FROM schema_version`,
# so writing a lower marker makes the database indistinguishable from a genuine
# older install to the code under test. That also lets the caller plant rows a
# real migration would have to delete — data that might otherwise only exist
# after a real login.
#
# LIMIT: this does not exercise a real store-upgrade install. It exercises the
# migration path. Those differ only in the provenance of the version marker,
# which is precisely what MAX(version) cannot see.
#
# USAGE
#
#   ./scripts/verify-migration.sh inspect     # show current schema + probe rows
#   ./scripts/verify-migration.sh downgrade   # stage the pre-migration state
#   <relaunch the app so setupDatabase runs>
#   ./scripts/verify-migration.sh assert      # require the migration happened
#
# Override the defaults per migration:
#   FROM_VERSION=7 TO_VERSION=8 PROBE_KEY=auth_cookies ./scripts/verify-migration.sh downgrade
#
set -uo pipefail

APP_ID="${APP_ID:-org.verily.FSbeerselector}"
FROM_VERSION="${FROM_VERSION:-7}"
TO_VERSION="${TO_VERSION:-8}"
# A preferences row the migration under test must delete. Planted by `downgrade`
# and required absent by `assert`. Set PROBE_KEY='' for a migration that deletes
# nothing, and only the version assertion is made.
#
# `-` not `:-`. `${PROBE_KEY:-auth_cookies}` treats "set to ''" the same as
# "unset" and substitutes the default either way, which silently defeats the
# escape hatch this comment documents: `PROBE_KEY='' ./verify-migration.sh
# ...` would still get `auth_cookies`. `-` alone only substitutes when the
# variable is truly unset.
PROBE_KEY="${PROBE_KEY-auth_cookies}"
# Assigned in two steps rather than with `${VAR:-...}`: the braces and quotes in
# a JSON default need escaping inside that expansion, and the backslashes end up
# in the stored value.
if [ -z "${PROBE_VALUE:-}" ]; then
  PROBE_VALUE='{"PHPSESSID":"planted-session-token"}'
fi
# A fixed, recognisable timestamp rather than `date`'s actual output. A real
# migration writes `new Date().toISOString()` at whatever moment it actually
# runs — this value is never that by chance, which is what makes it usable as
# proof of PROVENANCE: `assert` requires this exact row to still be present, not
# just any row at $FROM_VERSION. A device already at $TO_VERSION for reasons
# unrelated to this test cycle (a fresh install, an earlier real migration, a
# `downgrade` whose write silently failed) has no way to produce this row by
# accident.
STAGED_MARKER_TIMESTAMP='2026-01-01T00:00:00.000Z'

STAGE="${1:-}"

# Never bare `booted`: more than one simulator is frequently up, and simctl
# silently picks one of them. Auto-detect, but refuse to guess when ambiguous.
if [ -z "${DEVICE:-}" ]; then
  # Deliberately not `mapfile`: that is bash 4+, and macOS ships bash 3.2 as
  # /bin/bash — which is the only shell this script is ever run under.
  booted=$(xcrun simctl list devices | grep '(Booted)' | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}')
  count=$(printf '%s\n' "$booted" | grep -c . )
  case "$count" in
    0) echo "FAIL: no booted simulator. Boot one, or set DEVICE=<udid>."; exit 1 ;;
    1) DEVICE="$booted" ;;
    *) echo "FAIL: $count simulators booted; set DEVICE=<udid> to choose."
       xcrun simctl list devices | grep '(Booted)'; exit 1 ;;
  esac
fi

container=$(xcrun simctl get_app_container "$DEVICE" "$APP_ID" data 2>/dev/null) || {
  echo "FAIL: $APP_ID is not installed on $DEVICE"; exit 1; }
db=$(find "$container" -name 'beers.db' -not -path '*/Caches/*' 2>/dev/null | head -1)
[ -n "$db" ] || { echo "FAIL: beers.db not found — launch the app once first."; exit 1; }

# Propagates sqlite3's real exit status instead of discarding it. The prior
# version piped stderr to /dev/null unconditionally and never looked at the
# exit code, so a write that failed for ANY reason — a read-only file, a
# permissions error, SQLITE_BUSY from a concurrent writer — looked identical to
# one that succeeded: empty stdout, silence, exit 0 from every call site that
# didn't bother to check. `downgrade` used to be exactly that kind of call
# site; it no longer is, below.
q() {
  local out status
  out=$(sqlite3 "$db" "$1" 2>&1)
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "SQLITE ERROR (exit $status) running: $1" >&2
    echo "$out" >&2
    return "$status"
  fi
  printf '%s' "$out"
}

# `printf '%s\n' "$(report)"` was never used — every caller inlines this — but
# the function itself must return success on its own when $PROBE_KEY is empty.
# `[ -n "$PROBE_KEY" ] && echo ...` as the LAST statement makes the whole
# function return 1 (the `&&`'s own false) whenever PROBE_KEY='' is passed —
# not because anything failed, but because bash propagates a compound
# command's exit status as the function's return value. `inspect`, whose body
# is just `report`, would then exit non-zero having printed nothing but
# correct output. The explicit `return 0` decouples "did the report run" from
# "did the last line's guard happen to be true".
report() {
  echo "  schema_version rows : $(q "SELECT group_concat(version, ',') FROM (SELECT version FROM schema_version ORDER BY version)")"
  echo "  MAX(version)        : $(q 'SELECT MAX(version) FROM schema_version')"
  if [ -n "$PROBE_KEY" ]; then
    echo "  $PROBE_KEY row : $(q "SELECT COALESCE((SELECT value FROM preferences WHERE key='$PROBE_KEY'), '<absent>')")"
  fi
  return 0
}

case "$STAGE" in
  inspect)
    echo "DB: $db"; report ;;

  downgrade)
    # The explicit FROM_VERSION row is load-bearing. Deleting the rows at or
    # above TO_VERSION and stopping there leaves the table empty, and
    # getCurrentSchemaVersion returns `MAX(version) ?? 0` — so the app sees 0 and
    # replays every migration from the beginning against a schema that already
    # has each column. That tests something else entirely, and passing it would
    # mean nothing. The first draft of this script had exactly that bug.
    #
    # Every write below is checked. A verification tool that reports "staged"
    # over a write that silently failed is worse than no tool at all — it is
    # confident and wrong, and nothing downstream can tell the difference
    # between that and a write that genuinely happened.
    q "DELETE FROM schema_version WHERE version >= $TO_VERSION;" >/dev/null || {
      echo "FAIL: could not clear schema_version >= $TO_VERSION"; exit 1; }
    q "INSERT OR REPLACE INTO schema_version (version, applied_at)
       VALUES ($FROM_VERSION, '$STAGED_MARKER_TIMESTAMP');" >/dev/null || {
      echo "FAIL: could not write the v$FROM_VERSION marker row"; exit 1; }
    if [ -n "$PROBE_KEY" ]; then
      q "INSERT OR REPLACE INTO preferences (key, value, description)
         VALUES ('$PROBE_KEY', '$PROBE_VALUE', 'planted by verify-migration.sh');" >/dev/null || {
        echo "FAIL: could not plant $PROBE_KEY"; exit 1; }
    fi

    # Self-verification, not a repeat of the writes above: re-READ what the DB
    # now actually holds and require it to match what was just requested. A
    # write can report success and still not be visible in what a fresh read
    # returns (WAL/rollback-journal edge cases, a second connection racing
    # this one) — checking sqlite3's exit status catches a write that
    # ERRORED, not a write that silently no-opped.
    ver_now=$(q "SELECT MAX(version) FROM schema_version") || {
      echo "FAIL: could not re-read schema_version after staging"; exit 1; }
    [ "$ver_now" = "$FROM_VERSION" ] || {
      echo "FAIL: staged v$FROM_VERSION but the DB now reads '$ver_now' — the write did not take"
      exit 1
    }
    if [ -n "$PROBE_KEY" ]; then
      probe_now=$(q "SELECT COUNT(*) FROM preferences WHERE key='$PROBE_KEY' AND value='$PROBE_VALUE'") || {
        echo "FAIL: could not re-read $PROBE_KEY after staging"; exit 1; }
      [ "$probe_now" = "1" ] || {
        echo "FAIL: planted $PROBE_KEY but it is not readable back — the write did not take"
        exit 1
      }
    fi

    echo "Staged a v$FROM_VERSION device:"; report
    echo
    echo "Now relaunch the app so setupDatabase() runs, then: $0 assert" ;;

  assert)
    ver=$(q 'SELECT MAX(version) FROM schema_version') || {
      echo "FAIL: could not read schema_version"; exit 1; }
    echo "After upgrade:"; report; echo
    fail=0
    [ "$ver" = "$TO_VERSION" ] || { echo "FAIL: schema_version is '$ver', expected $TO_VERSION"; fail=1; }

    # The check that actually closes 6.1. MAX(version)=$TO_VERSION on its own
    # proves nothing about THIS test cycle: a fresh install lands there
    # directly, an unrelated earlier migration could have put it there, and a
    # `downgrade` whose writes silently failed leaves it there too, untouched.
    # Requiring the exact marker row `downgrade` staged — $FROM_VERSION at
    # $STAGED_MARKER_TIMESTAMP, a timestamp no real migration would ever
    # produce — is what proves this specific run started from a genuine
    # pre-migration state and the migration that just ran is what moved it to
    # $TO_VERSION, rather than `assert` being run against a device that
    # happened to be there already.
    marker=$(q "SELECT COUNT(*) FROM schema_version WHERE version=$FROM_VERSION AND applied_at='$STAGED_MARKER_TIMESTAMP'") || {
      echo "FAIL: could not read the staged v$FROM_VERSION marker"; exit 1; }
    [ "$marker" = "1" ] || {
      echo "FAIL: the staged v$FROM_VERSION marker is missing — either 'downgrade' was never run, its write silently failed, or the app was reinstalled (clearing the DB) instead of upgraded in place"
      fail=1
    }

    if [ -n "$PROBE_KEY" ]; then
      n=$(q "SELECT COUNT(*) FROM preferences WHERE key='$PROBE_KEY'") || {
        echo "FAIL: could not read $PROBE_KEY"; exit 1; }
      [ "$n" = "0" ] || { echo "FAIL: $PROBE_KEY survived the migration ($n row)"; fail=1; }
    fi
    [ "$fail" = "0" ] && echo "PASS: migration ran, schema at $TO_VERSION, $PROBE_KEY purged"
    exit $fail ;;

  *) echo "usage: $0 {inspect|downgrade|assert}"; exit 2 ;;
esac
