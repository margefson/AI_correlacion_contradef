-- Apaga um job e linhas dependentes (mesma ordem que deleteAnalysisJobAndRelatedData no servidor).
-- Uso: substituir o placeholder pelo jobId exato, por exemplo: ctr-xxxxxxxx
-- Tabelas conforme drizzle/schema.ts (nomes com aspas — camelCase no Postgres).
--
-- ATENÇÃO: operação destrutiva. Faça backup ou confirme o jobId em SELECT antes.
--
-- BEGIN;
--   \set job_id 'SEU-JOB-ID-AQUI'
--   (ou editar a linha WHERE abaixo)
--
-- DELETE ... WHERE "jobId" = 'SEU-JOB-ID';
-- COMMIT;

BEGIN;

DELETE FROM "analysisEvents" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';
DELETE FROM "analysisArtifacts" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';
DELETE FROM "analysisInsights" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';
DELETE FROM "analysisCommits" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';
DELETE FROM "analysisJobs" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';

-- Opcional: verificar
-- SELECT 'analysisJobs remanescente' AS check_name, count(*) FROM "analysisJobs" WHERE "jobId" = 'REPLACE_WITH_JOB_ID';

COMMIT;

-- Nota: apagar da BD não interrompe um processo Node já a correr em memória;
-- se um job estiver preso, pode ser necessário reiniciar o serviço. No servidor,
-- apague também a pasta de workspace local do job em ARTEFACTO_ROOT, se existir
-- (ex.: <root>/ctr-<id>/), ou use o botão "Remover lote" na UI (chama o endpoint TRPC deleteJob).
