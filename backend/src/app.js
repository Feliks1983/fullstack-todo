"use strict";

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const { Todo } = require("./models/todoService");
const {
  NODE_ENV,
  PORT,
  CORS_ORIGIN,
  MAX_FILE_SIZE,
  UPLOAD_DIR,
  ENABLE_ANALYTICS,
  ENABLE_METRICS,
  PRIORITIES,
  LEVELS,
  currentLevel,
  upload,
  toAttachments,
  removeFiles,
  cacheSet,
  cacheGet,
  cacheClear,
} = require("./utils/configs");
const { logger, requestLogger } = require("./utils/logger");

const { metricsMiddleware, register } = require("./utils/metrics");
const { redisCache } = require("./utils/redisCache");
const { AppError, errorHandler } = require("./utils/error");

const app = express();
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  cors({
    origin: CORS_ORIGIN.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const redis = redisCache.client;
redis.on("error", (err) => log("error", "Redis error", { error: err.message }));
redis.on("ready", () => log("info", "Redis connected"));
redis.on("end", () => log("warn", "Redis connection closed"));

mongoose.connection.on("connected", () => log("info", "MongoDB connected"));
mongoose.connection.on("error", (err) =>
  log("error", "MongoDB error", { error: err.message }),
);
mongoose.connection.on("disconnected", () =>
  log("warn", "MongoDB disconnected"),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

function log(level, msg, meta = {}) {
  if (LEVELS[level] > currentLevel) return;
  const time = new Date().toISOString();
  const line =
    NODE_ENV === "production"
      ? JSON.stringify({ time, level, msg, ...meta })
      : `[${time}] ${level.toUpperCase()} ${msg}${Object.keys(meta).length ? " " + JSON.stringify(meta) : ""}`;
  (level === "error" ? console.error : console.log)(line);
}

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new AppError("MONGODB_URI is not defined");
    }

    await mongoose.connect(mongoUri);

    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection failed", {
      message: error.message,
    });

    throw error;
  }
};

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: "deny",
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self'; sandbox",
      );
    },
  }),
);

app.use(requestLogger);
app.use(metricsMiddleware);
app.use((req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  res.setHeader("X-API-Version", process.env.API_VERSION || "1.0.0");
  res.setHeader("X-Request-ID", req.headers["x-request-id"] || randomUUID());

  next();
});

const isValidId = (id) => mongoose.isValidObjectId(id);

app.get("/health", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const redisOk = redis.isReady;
  const healthy = mongoOk && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "unhealthy",
    mongo: mongoOk ? "connected" : "disconnected",
    redis: redisOk ? "connected" : "disconnected",
    environment: NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    containerId: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

if (ENABLE_METRICS) {
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      logger.error("Failed to generate metrics", { error: error.message });
      res.status(500).end("Error generating metrics");
    }
  });
}

app.use("/api/", authLimiter);

app.get("/api/todos", async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const { status, priority } = req.query;

    const filter = {};
    if (status === "completed") filter.completed = true;
    else if (status === "pending") filter.completed = false;
    if (PRIORITIES.includes(priority)) filter.priority = priority;

    const cacheKey = `cache:todos:${status || "all"}:${priority || "all"}:${page}:${limit}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const [todos, filteredTotal, completedCount, allCount] = await Promise.all([
      Todo.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Todo.countDocuments(filter),
      Todo.countDocuments({ completed: true }),
      Todo.countDocuments(),
    ]);

    const payload = {
      todos,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / limit),
      },
      totals: {
        all: allCount,
        completed: completedCount,
        pending: allCount - completedCount,
      },
    };

    await cacheSet(cacheKey, payload);
    res.set("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

app.get("/api/analytics", async (req, res, next) => {
  try {
    if (!ENABLE_ANALYTICS)
      return res.status(404).json({ error: "Analytics disabled" });

    const cacheKey = "cache:analytics";
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const [agg] = await Todo.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: { $sum: { $cond: ["$completed", 1, 0] } },
              },
            },
          ],
          byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
        },
      },
    ]);

    const totals = agg.totals[0] || { total: 0, completed: 0 };
    const byPriority = { low: 0, medium: 0, high: 0 };
    agg.byPriority.forEach((p) => {
      byPriority[p._id] = p.count;
    });

    const payload = {
      total: totals.total,
      completed: totals.completed,
      pending: totals.total - totals.completed,
      byPriority,
    };

    await cacheSet(cacheKey, payload);
    res.set("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/todos",
  upload.array("attachments", 5),
  async (req, res, next) => {
    try {
      const { title, description, priority, dueDate, completed } = req.body;
      const todo = new Todo({
        title,
        description,
        priority: priority || undefined,
        dueDate: dueDate || null,
        completed: completed === "true" || completed === true,
        attachments: toAttachments(req.files),
      });
      await todo.save();
      await cacheClear();
      res.status(201).json(todo);
    } catch (err) {
      await removeFiles((req.files || []).map((f) => f.filename));
      next(err);
    }
  },
);

app.put(
  "/api/todos/:id",
  upload.array("attachments", 5),
  async (req, res, next) => {
    try {
      if (!isValidId(req.params.id)) {
        await removeFiles((req.files || []).map((f) => f.filename));
        return res.status(400).json({ error: "Invalid todo id" });
      }

      const todo = await Todo.findById(req.params.id);
      if (!todo) {
        await removeFiles((req.files || []).map((f) => f.filename));
        return res.status(404).json({ error: "Todo not found" });
      }

      const { title, description, priority, dueDate, completed } = req.body;
      if (title !== undefined) todo.title = title;
      if (description !== undefined) todo.description = description;
      if (priority !== undefined) todo.priority = priority;
      if (dueDate !== undefined) todo.dueDate = dueDate || null;
      if (completed !== undefined)
        todo.completed = completed === true || completed === "true";
      if (req.files && req.files.length)
        todo.attachments.push(...toAttachments(req.files));

      await todo.save();
      await cacheClear();
      res.json(todo);
    } catch (err) {
      await removeFiles((req.files || []).map((f) => f.filename));
      next(err);
    }
  },
);

app.delete("/api/todos/:id", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return res.status(400).json({ error: "Invalid todo id" });
    const todo = await Todo.findByIdAndDelete(req.params.id);
    if (!todo) return res.status(404).json({ error: "Todo not found" });

    await removeFiles(todo.attachments.map((a) => a.filename));
    await cacheClear();
    res.json({ message: "Todo deleted", id: todo._id });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File too large (max ${MAX_FILE_SIZE} bytes)`
        : err.message;
    return res.status(400).json({ error: message, code: err.code });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large" });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  log("error", "Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  res.status(500).json({
    error: NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

app.use(errorHandler);

let server;

const startServer = async () => {
  try {
    await connectDB();
    await redis.connect();
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Todo API running on port ${PORT}`);
      console.log(
        `Environment: ${process.env.NODE_ENV || "environment" || "production" || "service"}`,
      );
    });
  } catch (error) {
    logger.error("Failed to start server", { message: error.message });
    process.exit(1);
  }
};

let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);

  const finish = async () => {
    try {
      await mongoose.connection.close();
      await redis.quit();
      console.log("MongoDB connection closed");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown", err);
      process.exit(1);
    }
  };

  if (server) {
    server.close(finish);
  } else {
    finish();
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
