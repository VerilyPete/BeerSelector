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
PROBE_KEY="${PROBE_KEY:-auth_cookies}"
# Assigned in two steps rather than with `${VAR:-...}`: the braces and quotes in
# a JSON default need escaping inside that expansion, and the backslashes end up
# in the stored value.
if [ -z "${PROBE_VALUE:-}" ]; then
  PROBE_VALUE='{"PHPSESSID":"planted-session-token"}'
fi

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

q() { sqlite3 "$db" "$1" 2>/dev/null; }

report() {
  echo "  schema_version rows : $(q 'SELECT group_concat(version, ",") FROM schema_version ORDER BY version')"
  echo "  MAX(version)        : $(q 'SELECT MAX(version) FROM schema_version')"
  [ -n "$PROBE_KEY" ] && \
    echo "  $PROBE_KEY row : $(q "SELECT COALESCE((SELECT value FROM preferences WHERE key='$PROBE_KEY'), '<absent>')")"
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
    q "DELETE FROM schema_version WHERE version >= $TO_VERSION;"
    q "INSERT OR REPLACE INTO schema_version (version, applied_at)
       VALUES ($FROM_VERSION, '2026-01-01T00:00:00.000Z');"
    [ -n "$PROBE_KEY" ] && q "INSERT OR REPLACE INTO preferences (key, value, description)
       VALUES ('$PROBE_KEY', '$PROBE_VALUE', 'planted by verify-migration.sh');"
    echo "Staged a v$FROM_VERSION device:"; report
    echo
    echo "Now relaunch the app so setupDatabase() runs, then: $0 assert" ;;

  assert)
    ver=$(q 'SELECT MAX(version) FROM schema_version')
    echo "After upgrade:"; report; echo
    fail=0
    [ "$ver" = "$TO_VERSION" ] || { echo "FAIL: schema_version is '$ver', expected $TO_VERSION"; fail=1; }
    if [ -n "$PROBE_KEY" ]; then
      n=$(q "SELECT COUNT(*) FROM preferences WHERE key='$PROBE_KEY'")
      [ "$n" = "0" ] || { echo "FAIL: $PROBE_KEY survived the migration ($n row)"; fail=1; }
    fi
    [ "$fail" = "0" ] && echo "PASS: migration ran, schema at $TO_VERSION, $PROBE_KEY purged"
    exit $fail ;;

  *) echo "usage: $0 {inspect|downgrade|assert}"; exit 2 ;;
esac
