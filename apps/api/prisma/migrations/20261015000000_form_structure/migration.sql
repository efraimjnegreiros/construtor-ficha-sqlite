-- Cadastro dos campos da ficha: seções, grupos (subseções) e campos,
-- com obrigatoriedade, condições, cálculo automático e vínculo com o Prontuário.

-- CreateTable
CREATE TABLE "form_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "form_sections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prontuarioComponent" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "form_groups_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "form_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "helpText" TEXT,
    "placeholder" TEXT,
    "unit" TEXT,
    "prontuarioCode" TEXT,
    "options" TEXT NOT NULL DEFAULT '[]',
    "config" TEXT NOT NULL DEFAULT '{}',
    "visibleWhen" TEXT,
    "requiredWhen" TEXT,
    "calculation" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "form_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_fields_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "form_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_fields_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "form_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "form_sections_templateId_idx" ON "form_sections"("templateId");

-- CreateIndex
CREATE INDEX "form_groups_sectionId_idx" ON "form_groups"("sectionId");

-- CreateIndex
CREATE INDEX "form_fields_sectionId_idx" ON "form_fields"("sectionId");

-- CreateIndex
CREATE INDEX "form_fields_groupId_idx" ON "form_fields"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_templateId_key_key" ON "form_fields"("templateId", "key");
