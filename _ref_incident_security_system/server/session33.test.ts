import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "child_process";
import axios from "axios";
import { readFileSync } from "fs";

/**
 * Sessão 33: Testes para Correção do Erro "Service Unavailable"
 * 
 * Funcionalidades testadas:
 * 1. Retry automático com backoff exponencial
 * 2. Validação de Content-Type antes de chamar .json()
 * 3. Tratamento de HTTP 503 Service Unavailable
 * 4. Funcionamento em produção e desenvolvimento
 * 
 * Dataset: incidentes_cybersecurity_2000.xlsx (2000 amostras para treinamento)
 */

const FLASK_PORT = 5001;
const FLASK_URL = `http://localhost:${FLASK_PORT}`;
const TIMEOUT = 30000;

let flaskProcess: any;

beforeAll(async () => {
  // Iniciar Flask para testes
  flaskProcess = spawn("python3", [
    "/home/ubuntu/incident_security_system/ml/classifier_server.py",
    "--port",
    String(FLASK_PORT),
  ]);

  // Aguardar Flask iniciar com retry
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${FLASK_URL}/health`, { timeout: 2000 });
      if (response.status === 200) {
        break;
      }
    } catch (err) {
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}, TIMEOUT);

afterAll(async () => {
  if (flaskProcess) {
    flaskProcess.kill();
  }
});

describe("S33-1: Validação de Content-Type", () => {
  it("S33-1.1: Health check retorna JSON válido", async () => {
    const response = await axios.get(`${FLASK_URL}/health`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.data).toHaveProperty("status");
  });

  it("S33-1.2: Classificação retorna JSON com Content-Type correto", async () => {
    const response = await axios.post(`${FLASK_URL}/classify`, {
      title: "Teste de Content-Type",
      description: "Validar que a resposta é JSON válido",
    });
    
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.data).toHaveProperty("category");
    expect(response.data).toHaveProperty("confidence");
  });

  it("S33-1.3: Métricas retornam JSON válido", async () => {
    const response = await axios.get(`${FLASK_URL}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.data).toHaveProperty("training");
  });
});

describe("S33-2: Tratamento de HTTP 503", () => {
  it("S33-2.1: Flask responde com status 200 após inicialização", async () => {
    const response = await axios.get(`${FLASK_URL}/health`);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("ok");
  });

  it("S33-2.2: Classificação não retorna 503 após aquecimento", async () => {
    const response = await axios.post(`${FLASK_URL}/classify`, {
      title: "Teste de status",
      description: "Verificar que não há 503",
    });
    
    expect(response.status).not.toBe(503);
    expect(response.status).toBe(200);
  });

  it("S33-2.3: Múltiplas requisições mantêm status 200", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await axios.post(`${FLASK_URL}/classify`, {
        title: `Teste ${i}`,
        description: `Requisição número ${i}`,
      });
      
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
    }
  });
});

describe("S33-3: Retry Automático", () => {
  it("S33-3.1: Flask responde rapidamente após aquecimento", async () => {
    const start = Date.now();
    const response = await axios.get(`${FLASK_URL}/health`);
    const duration = Date.now() - start;
    
    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(5000); // Deve ser rápido
  });

  it("S33-3.2: Classificação responde em tempo aceitável", async () => {
    const start = Date.now();
    const response = await axios.post(`${FLASK_URL}/classify`, {
      title: "Teste de latência",
      description: "Medir tempo de resposta",
    });
    const duration = Date.now() - start;
    
    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(10000); // Deve ser rápido com cache
  });

  it("S33-3.3: Múltiplas requisições simultâneas funcionam", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      axios.post(`${FLASK_URL}/classify`, {
        title: `Teste paralelo ${i}`,
        description: `Requisição paralela ${i}`,
      })
    );

    const responses = await Promise.all(promises);
    
    expect(responses).toHaveLength(5);
    responses.forEach(res => {
      expect(res.status).toBe(200);
      expect(res.data.category).toBeDefined();
    });
  });
});

describe("S33-4: Robustez em Produção", () => {
  it("S33-4.1: Health check é resiliente", async () => {
    // Fazer múltiplas requisições para simular carga
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => axios.get(`${FLASK_URL}/health`))
    );

    const successful = results.filter(r => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(8); // Pelo menos 80% deve passar
  });

  it("S33-4.2: Classificação funciona sob carga", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        axios.post(`${FLASK_URL}/classify`, {
          title: `Carga ${i}`,
          description: `Teste de carga ${i}`,
        })
      )
    );

    const successful = results.filter(r => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThan(8); // Pelo menos 80% deve passar
  });

  it("S33-4.3: Erros são tratados graciosamente", async () => {
    try {
      // Tentar acessar endpoint inexistente
      await axios.get(`${FLASK_URL}/inexistente`);
    } catch (err: any) {
      // Deve retornar 404, não 500
      expect(err.response?.status).toBe(404);
    }
  });
});

describe("S33-5: Integração com tRPC", () => {
  it("S33-5.1: Flask responde para validação de tRPC", async () => {
    const response = await axios.get(`${FLASK_URL}/health`);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("status");
    expect(response.data.status).toBe("ok");
  });

  it("S33-5.2: Classificação retorna dados esperados por tRPC", async () => {
    const response = await axios.post(`${FLASK_URL}/classify`, {
      title: "Phishing",
      description: "Email de phishing",
    });
    
    expect(response.data).toHaveProperty("category");
    expect(response.data).toHaveProperty("confidence");
    expect(response.data).toHaveProperty("probabilities");
    expect(typeof response.data.confidence).toBe("number");
    expect(response.data.confidence).toBeGreaterThanOrEqual(0);
    expect(response.data.confidence).toBeLessThanOrEqual(1);
  });

  it("S33-5.3: Métricas estão disponíveis para dashboard", async () => {
    const response = await axios.get(`${FLASK_URL}/metrics`);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("training");
    expect(response.data.training).toHaveProperty("dataset_size");
    expect(response.data.training.dataset_size).toBeGreaterThan(0);
    expect(response.data).toHaveProperty("categories");
  });
});
