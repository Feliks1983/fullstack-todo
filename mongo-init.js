db = db.getSiblingDB('todoapp');

db.createCollection('todos');

db.todos.createIndex({ createdAt: -1 });
db.todos.createIndex({ completed: 1 });
db.todos.createIndex({ priority: 1 });
db.todos.createIndex({ dueDate: 1 });

const now = new Date();
const inDays = n => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

db.todos.insertMany([
  {
    title: 'Настроить Docker Compose',
    description: 'Поднять frontend, backend, MongoDB, Redis и nginx',
    completed: true,
    priority: 'high',
    dueDate: inDays(-1),
    attachments: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    title: 'Проверить кэширование Redis',
    description: 'Заголовок X-Cache должен меняться с MISS на HIT',
    completed: false,
    priority: 'medium',
    dueDate: inDays(3),
    attachments: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    title: 'Загрузить файл к задаче',
    description: 'Проверить multipart-форму и раздачу через /uploads/',
    completed: false,
    priority: 'low',
    dueDate: inDays(7),
    attachments: [],
    createdAt: now,
    updatedAt: now,
  },
]);

print('todoapp initialized: collection, indexes and seed data created');
