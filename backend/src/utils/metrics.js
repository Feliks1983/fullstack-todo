const prometheus = require('prom-client');

// Create a Registry
const register = new prometheus.Registry();

// HTTP request metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// Database metrics
const dbQueryDuration = new prometheus.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
});

const dbConnectionsActive = new prometheus.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
});

// Custom business metrics
const todosCreated = new prometheus.Counter({
  name: 'todos_created_total',
  help: 'Total number of todos created',
});

const activeUsers = new prometheus.Gauge({
  name: 'active_users',
  help: 'Number of active users',
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(dbQueryDuration);
register.registerMetric(dbConnectionsActive);
register.registerMetric(todosCreated);
register.registerMetric(activeUsers);

// Default metrics (CPU, memory, etc.)
prometheus.collectDefaultMetrics({ register });

// Metrics middleware
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const method = req.method;
    const status = res.statusCode;

    httpRequestDuration.observe({ method, route, status }, duration);

    httpRequestsTotal.inc({ method, route, status });
  });

  next();
}

// Metrics endpoint
function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

module.exports = {
  register,
  httpRequestDuration,
  httpRequestsTotal,
  dbQueryDuration,
  dbConnectionsActive,
  todosCreated,
  activeUsers,
  metricsMiddleware,
  metricsEndpoint,
};
