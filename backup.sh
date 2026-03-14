#!/bin/bash

# Caminho para o banco de dados original
DB_PATH="/home/campin/Bots/BPOL2025/database.sqlite"

# Diretório onde os backups serão armazenados (cria se não existir)
BACKUP_DIR="/home/campin/Bots/BPOL2025/backups"
mkdir -p "$BACKUP_DIR"

# Cria um timestamp para identificar o backup
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Executa o comando de backup, criando um arquivo com o timestamp
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/database_backup_${TIMESTAMP}.sqlite'"

# Opcional: Remove backups com mais de 7 dias (descomente se desejar)
# find "$BACKUP_DIR" -type f -name "database_backup_*.sqlite" -mtime +7 -delete
