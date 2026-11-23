#!/bin/bash
# backupschema.sh — export a HANA schema to a compressed backup on the server.
# Adapted from the original docs/backupschema.sh. Output naming: DBNAME_YYYYMMDD_HHMM
#
# USAGE (run on the HANA server, or via SSH from the Windows wrapper):
#   ./backupschema.sh <DBNAME>
#
# Example:
#   ./backupschema.sh PASDB
#   -> produces: PASDB_20260215_1420.tar.gz

SCHEMA_NAME=$1

if [ -z "$SCHEMA_NAME" ]; then
  echo "ABORT: DBNAME wajib diisi. Usage: ./backupschema.sh <DBNAME>"
  exit 1
fi

# Root directory for all backups. Change at your own risk.
BACKUP_BASE_DIR=/hana/backup

BACKUP_FOLDER="${SCHEMA_NAME}_$(date +%Y%m%d_%H%M)"
BACKUP_FULL_PATH="${BACKUP_BASE_DIR}/${BACKUP_FOLDER}"
MOVED_PATH=$(date +%Y%m%d)

echo "STAGE: 1/4|Menyiapkan folder backup"
mkdir -p "${BACKUP_BASE_DIR}"
mkdir -p "${BACKUP_FULL_PATH}"
chown ndbadm:sapsys "${BACKUP_BASE_DIR}"
chown ndbadm:sapsys "${BACKUP_FULL_PATH}"

echo "STAGE: 2/4|Export schema ${SCHEMA_NAME} (bisa lama)"
cd /hana/shared/NDB/HDB00/exe/ || { echo "ABORT: HANA exe path not found"; exit 1; }
# Perkiraan total = ukuran data schema di disk HANA; bila query tidak diizinkan, total 0 = progress tanpa persen.
EXPECT=$(./hdbsql -U STEMBACKUP -a -x "SELECT IFNULL(SUM(DISK_SIZE),0) FROM M_TABLE_PERSISTENCE_STATISTICS WHERE SCHEMA_NAME='${SCHEMA_NAME}'" 2>/dev/null | tr -dc '0-9')
[ -z "$EXPECT" ] && EXPECT=0
( while true; do sleep 5; echo "PROGRESS: $(du -sb "${BACKUP_FULL_PATH}" 2>/dev/null | cut -f1)/${EXPECT}|bytes"; done ) &
MON=$!
./hdbsql -U STEMBACKUP "EXPORT ${SCHEMA_NAME}.\"*\" AS BINARY INTO '${BACKUP_FULL_PATH}/' WITH REPLACE THREADS 16"
EXPORT_RC=$?
kill $MON 2>/dev/null; wait $MON 2>/dev/null
if [ $EXPORT_RC -ne 0 ]; then
  echo "ABORT: hdbsql EXPORT failed with exit code $EXPORT_RC"
  exit $EXPORT_RC
fi

echo "STAGE: 3/4|Mengompres hasil export"
cd "${BACKUP_BASE_DIR}" || exit 1
TOT=$(du -sb "${BACKUP_FULL_PATH}" 2>/dev/null | cut -f1)
# %u dari tar = jumlah record yang sudah diproses (1 record = 10240 byte); dilaporkan tiap 1000 record
tar -zcf "${BACKUP_FOLDER}.tar.gz" --checkpoint=1000 --checkpoint-action=echo='TARPROG %u' "${BACKUP_FOLDER}" 2>&1   | awk -v t="${TOT:-0}" '/TARPROG [0-9]+$/ {printf "PROGRESS: %d/%d|bytes\n", $NF*10240, t; fflush(); next} {print}'
TAR_RC=${PIPESTATUS[0]}
if [ $TAR_RC -ne 0 ]; then
  echo "ABORT: tar gagal dengan exit code $TAR_RC, folder export TIDAK dihapus: ${BACKUP_FULL_PATH}"
  exit $TAR_RC
fi
rm -rf "${BACKUP_FOLDER}"
echo "STAGE: 4/4|Memindahkan file backup"
mkdir -p "${BACKUP_BASE_DIR}/${MOVED_PATH}"
mv "${BACKUP_FOLDER}.tar.gz" "${BACKUP_BASE_DIR}/${MOVED_PATH}"

echo "DONE: ${BACKUP_BASE_DIR}/${MOVED_PATH}/${BACKUP_FOLDER}.tar.gz"
