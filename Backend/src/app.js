import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import { errorHandler } from "./middlewares/error.middleware.js";
import { globalLimiter } from "./middlewares/rateLimiter.middleware.js";
import swaggerUi from "swagger-ui-express";

const app = express();

// Security: Disable Express signature header to prevent fingerprinting
app.disable("x-powered-by");

// Trust proxy to properly inspect forwarded client IP addresses behind reverse proxies
app.set("trust proxy", 1);

// Security Headers: Frameguard, noSniff, strict referrer policy, cross-origin resource policy
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
    xssFilter: true,
    noSniff: true,
  })
);

// Request Logging (skip healthcheck polling spam in container/console logs)
app.use(
  morgan("dev", {
    skip: (req) => (req.originalUrl || req.url || "").includes("/healthcheck"),
  })
);

// Production Rate Limiting across all /api routes
app.use("/api", globalLimiter);

// Compression for better performance
app.use(compression());

const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const isDevelopment = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In development, permit localhost and 127.0.0.1 on any port
      if (
        isDevelopment &&
        (/^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }

      // In production or configured env, check against CORS_ORIGIN
      if (
        configuredOrigins.length === 0 ||
        configuredOrigins.includes("*") ||
        configuredOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS policy violation: Origin not allowed"), false);
    },
    credentials: true,
    exposedHeaders: [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
  })
);

// Route-specific payload limit: 10MB for bulk operations, 1MB safe limit for standard endpoints
const isBulkRoute = (url) => {
  if (!url) return false;
  const path = url.toLowerCase();
  return (
    path.includes('/generate-bulk') ||
    path.includes('/bulk') ||
    path.includes('/boarding-passes') ||
    path.includes('/certificates') ||
    path.includes('/announcement')
  );
};

const standardJson = express.json({ limit: "1mb" });
const standardUrlencoded = express.urlencoded({ extended: true, limit: "1mb" });
const bulkJson = express.json({ limit: "10mb" });
const bulkUrlencoded = express.urlencoded({ extended: true, limit: "10mb" });

app.use((req, res, next) => {
  const url = req.originalUrl || req.url;
  if (isBulkRoute(url)) {
    bulkJson(req, res, (err) => {
      if (err) return next(err);
      bulkUrlencoded(req, res, next);
    });
  } else {
    standardJson(req, res, (err) => {
      if (err) return next(err);
      standardUrlencoded(req, res, next);
    });
  }
});
app.use(express.static("public"));
app.use(cookieParser());

// Data Sanitization against NoSQL query injection (custom wrapper to bypass Express 4.19+ req.query getter bug)
app.use((req, res, next) => {
  ['body', 'params', 'headers', 'query'].forEach((k) => {
    if (req[k]) {
      const sanitized = mongoSanitize.sanitize(req[k]);
      if (k === 'query') {
        Object.defineProperty(req, 'query', {
          value: sanitized,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } else {
        req[k] = sanitized;
      }
    }
  });
  next();
});

// routes import
import healthcheckRouter from "./routes/healthcheck.routes.js";
import adminRouter from "./routes/admin.routes.js";
import studentRouter from "./routes/student.routes.js";
import registrationRouter from "./routes/registration.routes.js";
import eventRouter from "./routes/event.routes.js";
import teamRouter from "./routes/team.routes.js";
import certificateRouter from "./routes/certificate.routes.js";
import boardingPassRouter from "./routes/boardingPass.routes.js";
import contactRouter from "./routes/contact.routes.js";
import qrRouter from "./routes/qr.routes.js";
import blocklistRouter from "./routes/blocklist.routes.js";
import jobRouter from "./routes/job.routes.js";
import superAdminRouter from "./routes/superAdmin.routes.js";

// root & api v1 status endpoints
const apiStatusHandler = (req, res) => {
  res.status(200).json({
    success: true,
    message: "CodeX API v1 is running smoothly",
    version: "1.0.0",
    endpoints: {
      healthcheck: "/api/v1/healthcheck",
      events: "/api/v1/events",
      admin: "/api/v1/admin",
      superAdmin: "/api/v1/superAdmin",
      students: "/api/v1/students",
      registrations: "/api/v1/registrations",
      teams: "/api/v1/teams",
      certificates: "/api/v1/certificates",
      boardingPasses: "/api/v1/boarding-passes",
      contact: "/api/v1/contact",
      qr: "/api/v1/qr",
      blocklist: "/api/v1/admin/blocklist",
      jobs: "/api/v1/admin/jobs"
    }
  });
};

app.get("/", apiStatusHandler);
app.get("/api/v1", apiStatusHandler);

// routes declaration
app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/superAdmin", superAdminRouter);
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/registrations", registrationRouter);
app.use("/api/v1/events", eventRouter);
app.use("/api/v1/teams", teamRouter);
app.use("/api/v1/certificates", certificateRouter);
app.use("/api/v1/boarding-passes", boardingPassRouter);
app.use("/api/v1/contact", contactRouter);
app.use("/api/v1/qr", qrRouter);
app.use("/api/v1/admin/blocklist", blocklistRouter);
app.use("/api/v1/admin/jobs", jobRouter);

// swagger api documentation (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use("/docs", express.static("docs"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(null, {
    swaggerOptions: {
      url: '/docs/openapi.yaml'
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "CodeX API Documentation"
  }));
}

// error handling middleware (should be added after all routes)
app.use(errorHandler);

export default app;
