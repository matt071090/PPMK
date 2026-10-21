#!/bin/bash
# restoreschema.sh — restore a HANA schema from a backup produced by backupschema.sh.
# Can restore into the original schema name, or into a different (renamed) schema
# in the same IMPORT statement via HANA's "rename schema ... to ..." clause.
#
# ⚠️ DESTRUCTIVE (when TARGET_SCHEMA == SOURCE_SCHEMA): replaces existing tables in
# the target schema. There is no undo. Always test in a non-production system first,
# and confirm the exact HANA IMPORT syntax with your Basis/DBA team before relying
# on this in production — it has not been executed against a live HANA instance.
#
# USAGE (run on the HANA server, or via SSH from the Windows wrapper):
#   ./restoreschema.sh <SOURCE_SCHEMA> <BACKUP_RELATIVE_PATH> <TARGET_SCHEMA> CONFIRM
#
#   SOURCE_SCHEMA        the schema name the backup was originally exported from, e.g. PASDB
#   BACKUP_RELATIVE_PATH path to the .tar.gz relative to /hana/backup, format:
#                        DATEFOLDER/FILE.tar.gz (mis. 20260215/PASDB_20260215_1420.tar.gz)
#   TARGET_SCHEMA        schema to restore INTO — same as SOURCE_SCHEMA for a normal
#                        restore, or a different (existing or not) name to restore
#                        as a rename/copy
#   CONFIRM              literal word "CONFIRM" — the script aborts without it
#
# Example (normal restore, same schema):
#   ./restoreschema.sh PASDB 20260215/PASDB_20260215_1420.tar.gz PASDB CONFIRM
#
# Example (restore into a renamed schema, e.g. CTS0006_2023 -> CTS0006_STEM):
#   ./restoreschema.sh CTS0006_2023 20230131/CTS0006_2023_20230131_0000.tar.gz CTS0006_STEM CONFIRM
#
# Resulting hdbsql statement (source schema name comes from inside the backup itself):
#   IMPORT "SOURCE_SCHEMA"."*" FROM '<extract_dir>/'
#   WITH IGNORE EXISTING
#   RENAME SCHEMA "SOURCE_SCHEMA" TO "TARGET_SCHEMA" THREADS 24;

SOURCE_SCHEMA=$1
BACKUP_RELATIVE_PATH=$2
TARGET_SCHEMA=$3
CONFIRM_FLAG=$4

BACKUP_BASE_DIR=/hana/backup
ARCHIVE_PATH="${BACKUP_BASE_DIR}/${BACKUP_RELATIVE_PATH}"
BACKUP_FOLDER_NAME=$(basename "${BACKUP_RELATIVE_PATH}" .tar.gz)
EXTRACT_ROOT="${BACKUP_BASE_DIR}/RESTORE_TMP"
EXTRACT_DIR="${EXTRACT_ROOT}/${BACKUP_FOLDER_NAME}"

if [ -z "$SOURCE_SCHEMA" ] || [ -z "$BACKUP_RELATIVE_PATH" ] || [ -z "$TARGET_SCHEMA" ]; then
  echo "ABORT: missing arguments. Usage: ./restoreschema.sh <SOURCE_SCHEMA> <BACKUP_RELATIVE_PATH> <TARGET_SCHEMA> CONFIRM"
  exit 1
fi

if [ "$CONFIRM_FLAG" != "CONFIRM" ]; then
  echo "ABORT: this will import into schema '${TARGET_SCHEMA}' (existing objects with the same name are skipped, not replaced)."
  echo "Re-run with the literal word CONFIRM as the 5th argument to proceed."
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "ABORT: backup archive not found at $ARCHIVE_PATH"
  exit 1
fi

case "$(readlink -f "$ARCHIVE_PATH")" in
  "$(readlink -f "$BACKUP_BASE_DIR")"/*) ;;
  *) echo "ABORT: BACKUP_RELATIVE_PATH resolves outside $BACKUP_BASE_DIR"; exit 1 ;;
esac

echo "STAGE: 1/3|Mengekstrak arsip backup"
mkdir -p "$EXTRACT_ROOT"
# ukuran hasil ekstrak tidak diketahui di muka, jadi progress tahap ini hanya jumlah byte yang sudah diekstrak (tanpa persen)
tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_ROOT" --checkpoint=1000 --checkpoint-action=echo='TARPROG %u' 2>&1   | awk '/TARPROG [0-9]+$/ {printf "PROGRESS: %d/0|bytes\n", $NF*10240; fflush(); next} {print}'
TAR_RC=${PIPESTATUS[0]}
if [ $TAR_RC -ne 0 ]; then
  echo "ABORT: tar gagal mengekstrak arsip (exit code $TAR_RC)"
  exit $TAR_RC
fi
if [ ! -d "$EXTRACT_DIR" ]; then
  echo "ABORT: extracted folder not found at $EXTRACT_DIR — check BACKUP_FOLDER_NAME matches the archive contents"
  exit 1
fi

echo "STAGE: 2/3|Import ke schema ${TARGET_SCHEMA} (bisa lama)"
cd /hana/shared/NDB/HDB00/exe/ || { echo "ABORT: HANA exe path not found"; exit 1; }
# Perkiraan progress import = jumlah objek di schema tujuan yang sudah muncul / jumlah objek di folder export.
TOTAL_OBJ=$(find "${EXTRACT_DIR}/index/${SOURCE_SCHEMA}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
CNT_SQL="SELECT COUNT(*) FROM TABLES WHERE SCHEMA_NAME='${TARGET_SCHEMA}'"
BASE=$(./hdbsql -U STEMBACKUP -a -x "$CNT_SQL" 2>/dev/null | tr -dc '0-9'); BASE=${BASE:-0}
( while true; do sleep 10; CUR=$(./hdbsql -U STEMBACKUP -a -x "$CNT_SQL" 2>/dev/null | tr -dc '0-9'); [ -n "$CUR" ] && echo "PROGRESS: $((CUR>BASE ? CUR-BASE : 0))/${TOTAL_OBJ}|objek"; done ) &
MON=$!
./hdbsql -U STEMBACKUP "IMPORT \"${SOURCE_SCHEMA}\".\"*\" FROM '${EXTRACT_DIR}/' WITH IGNORE EXISTING RENAME SCHEMA \"${SOURCE_SCHEMA}\" TO \"${TARGET_SCHEMA}\" THREADS 24"
IMPORT_RC=$?
kill $MON 2>/dev/null; wait $MON 2>/dev/null

echo "STAGE: 3/3|Membersihkan file sementara"
rm -rf "$EXTRACT_DIR"

if [ $IMPORT_RC -ne 0 ]; then
  echo "ABORT: hdbsql IMPORT failed with exit code $IMPORT_RC"
  exit $IMPORT_RC
fi

echo "DONE: schema ${TARGET_SCHEMA} restored from ${BACKUP_FOLDER_NAME} (source schema ${SOURCE_SCHEMA})"
