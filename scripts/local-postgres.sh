#!/usr/bin/env bash

set -euo pipefail

postgres_bin_dir="${COLD_START_POSTGRES_BIN_DIR:-/opt/homebrew/opt/postgresql@17/bin}"
data_dir="${COLD_START_POSTGRES_DATA_DIR:-$HOME/.cold-start-postgres}"
host="127.0.0.1"
port="55432"
database_user="coldstart"
database_name="coldstart"

initdb_bin="$postgres_bin_dir/initdb"
pg_ctl_bin="$postgres_bin_dir/pg_ctl"
pg_isready_bin="$postgres_bin_dir/pg_isready"
psql_bin="$postgres_bin_dir/psql"
createuser_bin="$postgres_bin_dir/createuser"
createdb_bin="$postgres_bin_dir/createdb"

for binary in "$initdb_bin" "$pg_ctl_bin" "$pg_isready_bin" "$psql_bin" "$createuser_bin" "$createdb_bin"; do
  if [[ ! -x "$binary" ]]; then
    echo "PostgreSQL 17 is required at $postgres_bin_dir. Set COLD_START_POSTGRES_BIN_DIR to override it." >&2
    exit 1
  fi
done

is_ready() {
  "$pg_isready_bin" -h "$host" -p "$port" -U "$database_user" -d "$database_name" >/dev/null 2>&1
}

initialize() {
  if [[ ! -f "$data_dir/PG_VERSION" ]]; then
    "$initdb_bin" -D "$data_dir" --auth=trust --username="$(id -un)"
  fi
}

ensure_role_and_database() {
  if ! "$psql_bin" -h "$host" -p "$port" -d postgres -Atqc "select 1 from pg_roles where rolname = '$database_user'" | grep -qx 1; then
    "$createuser_bin" -h "$host" -p "$port" -s "$database_user"
  fi

  if ! "$psql_bin" -h "$host" -p "$port" -d postgres -Atqc "select 1 from pg_database where datname = '$database_name'" | grep -qx 1; then
    "$createdb_bin" -h "$host" -p "$port" -O "$database_user" "$database_name"
  fi
}

start() {
  initialize

  if is_ready; then
    echo "Cold Start Postgres is already accepting connections at $host:$port."
    return
  fi

  if "$pg_ctl_bin" -D "$data_dir" status >/dev/null 2>&1; then
    echo "The Cold Start Postgres process is running but not accepting connections. Check $data_dir/server.log." >&2
    exit 1
  fi

  if ! "$pg_ctl_bin" -D "$data_dir" -l "$data_dir/server.log" -o "-p $port -h $host" start; then
    echo "Cold Start Postgres could not start. Port $port may still belong to Docker Desktop. Check $data_dir/server.log." >&2
    exit 1
  fi

  ensure_role_and_database
  echo "Cold Start Postgres is ready at postgres://$database_user:local@$host:$port/$database_name"
}

stop() {
  if "$pg_ctl_bin" -D "$data_dir" status >/dev/null 2>&1; then
    "$pg_ctl_bin" -D "$data_dir" stop -m fast
  else
    echo "Cold Start Postgres is not running."
  fi
}

status() {
  if is_ready; then
    "$psql_bin" -h "$host" -p "$port" -U "$database_user" -d "$database_name" -Atqc "show server_version"
  else
    echo "Cold Start Postgres is not accepting connections at $host:$port." >&2
    exit 1
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 64
    ;;
esac
