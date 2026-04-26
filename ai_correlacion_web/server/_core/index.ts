import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { pingDatabaseIfConfigured } from "../db";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerAnalysisArtifactDownloadRoute } from "../analysisArtifactDownload";
import { registerReduceLogsUploadRoute } from "./reduceLogsUpload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV, validateProductionEnv } from "./env";
import { seedDefaultLocalAdminIfNeeded } from "../localAdminSeed";
import { applyPostgresSchemaIfNeeded } from "./postgresSchemaSync";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateProductionEnv();
  if (ENV.isProduction && ENV.authMode === "none") {
    console.warn(
      "[Auth] AUTH_MODE=none: a app não exige login (bypass de administrador). " +
        "Para ecrã de login, registo e contas: defina AUTH_MODE=local e VITE_AUTH_MODE=local, " +
        "garanta o mesmo VITE no build, e faça deploy de novo."
    );
  }
  await applyPostgresSchemaIfNeeded();

  const app = express();
  // PaaS (Render, etc.) terminam TLS no proxy; necessário para cookies Secure e req.secure.
  app.set("trust proxy", 1);

  const server = createServer(app);
  // Configure body parser with larger size limit for metadata and control payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerAnalysisArtifactDownloadRoute(app);
  registerReduceLogsUploadRoute(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  server.requestTimeout = 0;

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  // Em produção o host (Render, Fly, etc.) expõe só process.env.PORT — não procurar porta alternativa.
  const port =
    process.env.NODE_ENV === "production"
      ? preferredPort
      : await findAvailablePort(preferredPort);

  if (process.env.NODE_ENV !== "production" && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  try {
    await pingDatabaseIfConfigured();
    await seedDefaultLocalAdminIfNeeded();
  } catch (error) {
    console.error("[Database] Connection check failed:", error);
    console.error(
      "[Database] Confirma DATABASE_URL (PostgreSQL), firewall / rede do fornecedor, e DATABASE_SSL ou sslmode na URL se for necessário TLS."
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  const listenHost = process.env.NODE_ENV === "production" ? "0.0.0.0" : undefined;

  server.once("error", (err: NodeJS.ErrnoException) => {
    console.error("[Server] Failed to listen:", err);
    process.exit(1);
  });

  if (listenHost) {
    server.listen(port, listenHost, () => {
      console.log(`Server listening on http://${listenHost}:${port}/`);
    });
  } else {
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
}

startServer().catch((error: unknown) => {
  console.error("[Startup] Fatal error:", error);
  process.exit(1);
});
