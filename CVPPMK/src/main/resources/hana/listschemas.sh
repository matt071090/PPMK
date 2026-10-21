#!/bin/bash
# listschemas.sh — print HANA company schema names, one per line (excludes system/infra schemas).
# Dipakai oleh Backup-HanaSchema.ps1 buat nampilin daftar pilihan database.

QFILE=$(mktemp)
cat > "$QFILE" << 'EOF'
SELECT SCHEMA_NAME FROM SCHEMAS WHERE SCHEMA_NAME NOT LIKE '_SYS%' AND SCHEMA_NAME NOT LIKE 'SYS%' ORDER BY SCHEMA_NAME
EOF

cd /hana/shared/NDB/HDB00/exe/ || { echo "ABORT: HANA exe path not found" >&2; exit 1; }

./hdbsql -U STEMBACKUP -a -j -I "$QFILE" \
  | sed 's/^"//; s/"$//' \
  | grep -v -E '^\s*$' \
  | grep -v -i 'row selected\|rows selected' \
  | grep -v -E '^(B1_|XSSQLCC_AUTO_USER_|SAP_XS_|HANA_XS_)'

rm -f "$QFILE"
