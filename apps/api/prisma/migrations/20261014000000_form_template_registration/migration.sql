-- Cadastro da ficha dentro do modelo (governança do protótipo):
-- código FC-xxxx, área clínica, SIGTAP, responsável, complexidade, versão,
-- status do ciclo de vida, componentes do Prontuário, derivação e histórico de versões.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_form_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clinicalArea" TEXT NOT NULL,
    "sigtapCode" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "complexity" TEXT NOT NULL DEFAULT 'SIMPLES',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "prontuarioComponents" TEXT NOT NULL DEFAULT '[]',
    "derivedFromId" TEXT,
    "ownerId" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "form_templates_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_templates_derivedFromId_fkey" FOREIGN KEY ("derivedFromId") REFERENCES "form_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Modelos já existentes: recebem código sequencial pela ordem de criação e valores
-- provisórios de cadastro (área/SIGTAP/responsável) para serem revisados em Rascunho.
INSERT INTO "new_form_templates" (
    "id", "code", "name", "description", "clinicalArea", "sigtapCode", "responsibleName",
    "ownerId", "deletedAt", "createdAt", "updatedAt"
)
SELECT
    t."id",
    'FC-' || substr('0000' || (SELECT COUNT(*) FROM "form_templates" o
        WHERE o."createdAt" < t."createdAt" OR (o."createdAt" = t."createdAt" AND o."id" <= t."id")), -4, 4),
    t."name",
    t."description",
    'CLINICA_MEDICA',
    '00.00.00.000-0',
    COALESCE((SELECT u."name" FROM "user_profiles" u WHERE u."id" = t."ownerId"), 'A definir'),
    t."ownerId",
    t."deletedAt",
    t."createdAt",
    t."updatedAt"
FROM "form_templates" t;
DROP TABLE "form_templates";
ALTER TABLE "new_form_templates" RENAME TO "form_templates";
CREATE UNIQUE INDEX "form_templates_code_key" ON "form_templates"("code");
CREATE INDEX "form_templates_ownerId_idx" ON "form_templates"("ownerId");
CREATE INDEX "form_templates_deletedAt_idx" ON "form_templates"("deletedAt");
CREATE INDEX "form_templates_status_idx" ON "form_templates"("status");
CREATE INDEX "form_templates_clinicalArea_idx" ON "form_templates"("clinicalArea");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "form_template_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Histórico inicial para os modelos já existentes.
INSERT INTO "form_template_versions" ("id", "templateId", "version", "kind", "toStatus", "note", "authorId", "authorName", "createdAt")
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' ||
        substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
    t."id", '1.0.0', 'CRIACAO', 'RASCUNHO', 'Modelo migrado: revise área, SIGTAP e responsável',
    t."ownerId", t."responsibleName", t."createdAt"
FROM "form_templates" t;

-- CreateIndex
CREATE INDEX "form_template_versions_templateId_idx" ON "form_template_versions"("templateId");
