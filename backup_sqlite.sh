#!/bin/bash

# Caminho do banco de dados
DATABASE="/home/campin/Bots/BPOL2025/database.sqlite"

# Diretório onde os backups serão armazenados
BACKUP_DIR="/home/campin/Bots/BPOL2025/backups"

# Data e hora atual para nome do arquivo de backup
DATE=$(date +'%Y-%m-%d_%H-%M-%S')

# Nome do arquivo de backup
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sqlite"

# Criar o diretório de backups caso não exista
mkdir -p "$BACKUP_DIR"

# Criar o backup usando o comando SQLite
sqlite3 "$DATABASE" ".backup '$BACKUP_FILE'"

# Remover backups antigos (opcional: mantém apenas os últimos 7 dias)
find "$BACKUP_DIR" -type f -name "*.sqlite" -mtime +7 -delete

# Mensagem de log
echo "Backup realizado: $BACKUP_FILE"
