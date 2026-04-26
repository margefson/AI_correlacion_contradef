import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const defaultCategories = [
  { name: "Phishing", description: "Ataques de engenharia social via e-mail ou mensagens falsas para roubo de credenciais", color: "#f87171" },
  { name: "Malware", description: "Software malicioso incluindo vírus, trojans, ransomware e spyware", color: "#fb923c" },
  { name: "Força Bruta", description: "Tentativas repetidas de login para adivinhar senhas ou chaves de criptografia", color: "#fbbf24" },
  { name: "DDoS", description: "Ataques de negação de serviço distribuído para tornar sistemas indisponíveis", color: "#a78bfa" },
  { name: "Vazamento de Dados", description: "Exposição não autorizada de dados sensíveis ou confidenciais", color: "#f472b6" },
];

for (const cat of defaultCategories) {
  try {
    await conn.execute(
      "INSERT IGNORE INTO categories (name, description, color, isActive, createdAt, updatedAt) VALUES (?, ?, ?, 1, NOW(), NOW())",
      [cat.name, cat.description, cat.color]
    );
    console.log(`Seeded: ${cat.name}`);
  } catch (e) {
    console.log(`Skip (exists): ${cat.name} - ${e.message}`);
  }
}

await conn.end();
console.log("Seed complete!");
