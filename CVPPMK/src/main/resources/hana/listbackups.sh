#!/bin/bash
# listbackups.sh — print available backup archives, one per line, as path relative to
# BACKUP_BASE_DIR (format: DATEFOLDER/FILE.tar.gz, sesuai struktur yang dibuat backupschema.sh,
# atau CLIENT/DATEFOLDER/FILE.tar.gz kalau ditaro manual 1 level lebih dalam).
# Kedalaman DIBATASI 3 level: tanpa batas, find ikut masuk ke folder hasil extract/export
# yang isinya ribuan file dan listing bisa nggak selesai-selesai (dulu hang di server 197, 511 GB).
# Dipakai oleh Restore-HanaSchema.ps1 buat nampilin daftar pilihan backup.

BACKUP_BASE_DIR=/hana/backup

find "$BACKUP_BASE_DIR" -mindepth 2 -maxdepth 3 -type f -name "*.tar.gz" -printf "%P\n" 2>/dev/null | sort
