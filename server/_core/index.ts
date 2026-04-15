import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { registerAnalysisHttpRoutes } from "../analysisHttp";
import { createContext } from "./context";
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

const UPLOAD_REQUEST_LIMIT_MB = 64;

async function startServer() {
  const app = express();
  const server = createServer(app);
  // O arquivo bruto pode ter até 40 MB, mas o transporte em base64 cresce ~33%.
  // Mantemos uma margem segura para o payload JSON da mutation sem relaxar demais o limite.
  app.use(express.json({ limit: `${UPLOAD_REQUEST_LIMIT_MB}mb` }));
  app.use(express.urlencoded({ limit: `${UPLOAD_REQUEST_LIMIT_MB}mb`, extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerAnalysisHttpRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith("/api/")) {
      next(error);
      return;
    }

    if (res.headersSent) {
      next(error);
      return;
    }

    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const type = typeof error === "object" && error && "type" in error && typeof error.type === "string"
      ? error.type
      : "internal_error";
    const message = status === 413 || type === "entity.too.large"
      ? "O payload enviado excede o limite aceito pelo backend web. Reduza o arquivo ou use o fluxo multipart do formulário."
      : error instanceof Error
        ? error.message
        : "Falha inesperada ao processar a requisição da API.";

    res.status(status === 413 || type === "entity.too.large" ? 413 : status).json({
      message,
      code: type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "API_ERROR",
    });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
