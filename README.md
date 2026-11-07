Команды развертывания
Внедрение разработки
# Start development environment
docker-compose up --build

# Start in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Scale services
docker-compose up --scale backend=2

Развертывание производства
# Production deployment
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Update specific service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps backend

# Check status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

Резервное копирование и восстановление
# Backup MongoDB
docker exec todo-mongo mongodump --db todoapp --out /backup

# Backup volumes
docker run --rm -v todo_mongo-data:/data -v "$(pwd):/backup" alpine tar czf /backup/mongo-backup.tar.gz -C /data .

# Restore
docker run --rm -v todo_mongo-data:/data -v "$(pwd):/backup" alpine tar xzf /backup/mongo-backup.tar.gz -C /data

GET https://localhost/health
GET https://localhost/api/todos

для фронтенда реакт
http://localhost
