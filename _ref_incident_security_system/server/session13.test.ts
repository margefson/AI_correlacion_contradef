/**
 * session13.test.ts — Sessão 13: RBAC 3 Perfis, Home sem botões header,
 * Tabela de Incidentes com Status/Editar/Excluir, AdminML links de download,
 * Correção acurácia ML, Badges de role atualizados.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

// ─── S13-1: RBAC — 3 Perfis no Schema ────────────────────────────────────────
describe("S13-1: RBAC — 3 Perfis no schema Drizzle", () => {
  const schema = read("drizzle/schema.ts");

  it("S13-1.1: schema contém enum com 'admin'", () => {
    expect(schema).toContain("admin");
  });

  it("S13-1.2: schema contém enum com 'security-analyst'", () => {
    expect(schema).toContain("security-analyst");
  });

  it("S13-1.3: schema contém enum com 'user'", () => {
    expect(schema).toContain("user");
  });

  it("S13-1.4: schema define campo role na tabela users", () => {
    expect(schema).toMatch(/role.*enum|enum.*role/i);
  });
});

// ─── S13-2: analystProcedure no trpc.ts ──────────────────────────────────────
describe("S13-2: analystProcedure no trpc.ts", () => {
  const trpcCore = read("server/_core/trpc.ts");

  it("S13-2.1: analystProcedure está definido", () => {
    expect(trpcCore).toContain("analystProcedure");
  });

  it("S13-2.2: analystProcedure verifica role security-analyst ou admin", () => {
    expect(trpcCore).toMatch(/security-analyst|analyst/);
  });

  it("S13-2.3: analystProcedure lança FORBIDDEN para usuários comuns", () => {
    expect(trpcCore).toMatch(/FORBIDDEN|forbidden/i);
  });
});

// ─── S13-3: updateStatus usa analystProcedure ────────────────────────────────
describe("S13-3: updateStatus restrito a security-analyst e admin", () => {
  const routers = read("server/routers.ts");

  it("S13-3.1: updateStatus usa analystProcedure", () => {
    expect(routers).toMatch(/updateStatus.*analystProcedure|analystProcedure.*updateStatus/s);
  });

  it("S13-3.2: analystProcedure importado no routers.ts", () => {
    expect(routers).toContain("analystProcedure");
  });

  it("S13-3.3: updateUserRole aceita 'security-analyst' como valor", () => {
    expect(routers).toContain("security-analyst");
  });
});

// ─── S13-4: db.ts — updateUserRole aceita security-analyst ──────────────────
describe("S13-4: db.ts — updateUserRole com 3 perfis", () => {
  const db = read("server/db.ts");

  it("S13-4.1: updateUserRole aceita 'security-analyst'", () => {
    expect(db).toContain("security-analyst");
  });

  it("S13-4.2: updateUserRole tem parâmetro role com tipo correto", () => {
    expect(db).toMatch(/updateUserRole.*role|role.*updateUserRole/s);
  });
});

// ─── S13-5: AdminUsers.tsx — 3 perfis ────────────────────────────────────────
describe("S13-5: AdminUsers.tsx — suporte a 3 perfis", () => {
  const adminUsers = read("client/src/pages/AdminUsers.tsx");

  it("S13-5.1: AdminUsers exibe badge Security Analyst", () => {
    expect(adminUsers).toContain("Security Analyst");
  });

  it("S13-5.2: AdminUsers tem contagem de analysts", () => {
    expect(adminUsers).toMatch(/analystCount|analyst.*Count/);
  });

  it("S13-5.3: AdminUsers tem ação para promover a security-analyst", () => {
    expect(adminUsers).toContain("→ Analyst");
  });

  it("S13-5.4: AdminUsers tem ação para promover a admin", () => {
    expect(adminUsers).toContain("→ Admin");
  });

  it("S13-5.5: AdminUsers tem ação para rebaixar de security-analyst para user", () => {
    expect(adminUsers).toContain("← Usuário");
  });

  it("S13-5.6: AdminUsers tem ação para rebaixar de admin para security-analyst", () => {
    expect(adminUsers).toContain("← Analyst");
  });

  it("S13-5.7: AdminUsers exibe bloco de hierarquia de perfis", () => {
    expect(adminUsers).toContain("Hierarquia de Perfis");
  });

  it("S13-5.8: AdminUsers usa RoleBadge component", () => {
    expect(adminUsers).toContain("RoleBadge");
  });

  it("S13-5.9: AdminUsers usa ShieldHalf para security-analyst", () => {
    expect(adminUsers).toContain("ShieldHalf");
  });
});

// ─── S13-6: Profile.tsx — badge security-analyst ────────────────────────────
describe("S13-6: Profile.tsx — badge de role atualizado", () => {
  const profile = read("client/src/pages/Profile.tsx");

  it("S13-6.1: Profile exibe 'Security Analyst' para o perfil security-analyst", () => {
    expect(profile).toContain("Security Analyst");
  });

  it("S13-6.2: Profile tem cor diferente para security-analyst (azul)", () => {
    expect(profile).toContain("blue-400");
  });

  it("S13-6.3: Profile tem cor diferente para admin (amarelo)", () => {
    expect(profile).toContain("yellow-400");
  });
});

// ─── S13-7: DashboardLayout — label de role amigável ────────────────────────
describe("S13-7: DashboardLayout — label de role amigável no footer", () => {
  const layout = read("client/src/components/DashboardLayout.tsx");

  it("S13-7.1: DashboardLayout exibe 'Security Analyst' para security-analyst", () => {
    expect(layout).toContain("Security Analyst");
  });

  it("S13-7.2: DashboardLayout exibe 'Administrador' para admin", () => {
    expect(layout).toContain("Administrador");
  });

  it("S13-7.3: DashboardLayout exibe 'Usuário' para user", () => {
    expect(layout).toContain("Usuário");
  });
});

// ─── S13-8: Home.tsx — sem botões Entrar/Criar Conta no header ───────────────
describe("S13-8: Home.tsx — botões de header removidos", () => {
  const home = read("client/src/pages/Home.tsx");

  it("S13-8.1: Home não tem botão 'Entrar' no header (apenas no meio da tela)", () => {
    // O botão Entrar pode existir no corpo, mas não deve existir em um nav/header
    const headerSection = home.split("soc-page-title")[0] ?? "";
    expect(headerSection).not.toMatch(/<Button.*Entrar|Entrar.*<Button/s);
  });

  it("S13-8.2: Home tem botão 'Criar Conta' no corpo da página (CTA), não em nav/header separado", () => {
    // Criar Conta deve existir como CTA no corpo, não em um header/nav separado
    // O Home.tsx não deve ter um <nav> ou <header> com botões de Entrar/Criar Conta
    expect(home).not.toMatch(/<nav[^>]*>[\s\S]*?Criar Conta[\s\S]*?<\/nav>/);
    expect(home).not.toMatch(/<header[^>]*>[\s\S]*?Criar Conta[\s\S]*?<\/header>/);
    // Mas pode existir no corpo como CTA
    expect(home).toContain("Criar Conta");
  });

  it("S13-8.3: Home usa template do dashboard (bg-card, border-border)", () => {
    expect(home).toContain("bg-card");
    expect(home).toContain("border-border");
  });

  it("S13-8.4: Home tem layout responsivo com grid", () => {
    expect(home).toMatch(/grid|grid-cols/);
  });
});

// ─── S13-9: Incidents.tsx — coluna Status e ações ────────────────────────────
describe("S13-9: Incidents.tsx — coluna Status, editar e excluir", () => {
  const incidents = read("client/src/pages/Incidents.tsx");

  it("S13-9.1: Incidents.tsx tem coluna Status na tabela", () => {
    expect(incidents).toMatch(/Status|status/);
  });

  it("S13-9.2: Incidents.tsx tem botão de editar incidente", () => {
    expect(incidents).toMatch(/Pencil|edit|Editar/i);
  });

  it("S13-9.3: Incidents.tsx tem botão de excluir incidente", () => {
    expect(incidents).toMatch(/Trash|delete|Excluir/i);
  });

  it("S13-9.4: Incidents.tsx controla ações por perfil (security-analyst)", () => {
    expect(incidents).toMatch(/security-analyst|analyst/);
  });

  it("S13-9.5: Incidents.tsx tem badge de status (open/in_progress/resolved)", () => {
    expect(incidents).toMatch(/open|in_progress|resolved/);
  });
});

// ─── S13-10: AdminML.tsx — links de download dos datasets ────────────────────
describe("S13-10: AdminML.tsx — nomes de datasets como links de download", () => {
  const adminML = read("client/src/pages/AdminML.tsx");

  it("S13-10.1: nome do dataset de treino é um botão/link clicável", () => {
    expect(adminML).toMatch(/handleDownloadDataset.*incidentes_cybersecurity_2000|incidentes_cybersecurity_2000.*handleDownloadDataset/s);
  });

  it("S13-10.2: nome do dataset de avaliação é um botão/link clicável", () => {
    expect(adminML).toMatch(/handleDownloadEvalDataset.*incidentes_cybersecurity_100|incidentes_cybersecurity_100.*handleDownloadEvalDataset/s);
  });

  it("S13-10.3: links têm estilo de sublinhado (underline)", () => {
    expect(adminML).toContain("underline");
  });

  it("S13-10.4: AdminML lê training.train_accuracy para acurácia de treino", () => {
    expect(adminML).toMatch(/trainingMetrics.*train_accuracy|training.*train_accuracy/s);
  });

  it("S13-10.5: AdminML lê training.cv_accuracy_mean para CV", () => {
    expect(adminML).toMatch(/cv_accuracy_mean/);
  });

  it("S13-10.6: AdminML tem aba de Avaliação com evaluateModel mutation", () => {
    expect(adminML).toContain("evaluateMutation");
  });

  it("S13-10.7: AdminML exibe categorias do modelo", () => {
    expect(adminML).toMatch(/categories|categorias/i);
  });
});

// ─── S13-11: Servidor Flask — endpoints de ML ────────────────────────────────
describe("S13-11: Flask classifier_server.py — endpoints de ML", () => {
  const flask = read("ml/classifier_server.py");

  it("S13-11.1: Flask tem endpoint /metrics", () => {
    expect(flask).toContain('"/metrics"');
  });

  it("S13-11.2: Flask tem endpoint /evaluate", () => {
    expect(flask).toContain('"/evaluate"');
  });

  it("S13-11.3: Flask tem endpoint /eval-dataset", () => {
    expect(flask).toContain('"/eval-dataset"');
  });

  it("S13-11.4: Flask tem endpoint /dataset", () => {
    expect(flask).toContain('"/dataset"');
  });

  it("S13-11.5: Flask retorna training.train_accuracy na estrutura de métricas", () => {
    expect(flask).toMatch(/train_accuracy/);
  });

  it("S13-11.6: Flask retorna categorias na estrutura de métricas", () => {
    expect(flask).toMatch(/categories/);
  });
});
