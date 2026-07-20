-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('ACTIF', 'SUSPENDU', 'BANNI', 'SUPPRIME');

-- CreateEnum
CREATE TYPE "TypeJeton" AS ENUM ('VERIFICATION_EMAIL', 'REINITIALISATION_MOT_DE_PASSE');

-- CreateEnum
CREATE TYPE "TypeCompte" AS ENUM ('COURANT', 'EPARGNE', 'CARTE_CREDIT', 'ESPECES', 'INVESTISSEMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeCategorie" AS ENUM ('DEPENSE', 'REVENU');

-- CreateEnum
CREATE TYPE "TypeTransaction" AS ENUM ('DEPENSE', 'REVENU', 'TRANSFERT');

-- CreateEnum
CREATE TYPE "PeriodeBudget" AS ENUM ('HEBDOMADAIRE', 'MENSUEL', 'ANNUEL');

-- CreateEnum
CREATE TYPE "StatutObjectif" AS ENUM ('EN_COURS', 'ATTEINT', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "Frequence" AS ENUM ('HEBDOMADAIRE', 'MENSUELLE', 'TRIMESTRIELLE', 'ANNUELLE');

-- CreateTable
CREATE TABLE "Personne" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT,
    "statut" "StatutCompte" NOT NULL DEFAULT 'ACTIF',
    "emailVerifieLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JetonAuthentification" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "type" "TypeJeton" NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonAuthentification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRefresh" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "revoqueLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteFinancier" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeCompte" NOT NULL DEFAULT 'COURANT',
    "soldeInitial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "devise" CHAR(3) NOT NULL DEFAULT 'EUR',
    "institution" TEXT,
    "couleur" TEXT,
    "archiveLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompteFinancier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categorie" (
    "id" UUID NOT NULL,
    "personneId" UUID,
    "nom" TEXT NOT NULL,
    "type" "TypeCategorie" NOT NULL,
    "parentId" UUID,
    "icone" TEXT,
    "couleur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Categorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "compteId" UUID NOT NULL,
    "categorieId" UUID,
    "montant" DECIMAL(14,2) NOT NULL,
    "type" "TypeTransaction" NOT NULL,
    "libelle" TEXT NOT NULL,
    "note" TEXT,
    "dateOperation" DATE NOT NULL,
    "pointee" BOOLEAN NOT NULL DEFAULT false,
    "transactionLieeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "categorieId" UUID NOT NULL,
    "montantPlafond" DECIMAL(12,2) NOT NULL,
    "periode" "PeriodeBudget" NOT NULL DEFAULT 'MENSUEL',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectifEpargne" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "montantCible" DECIMAL(12,2) NOT NULL,
    "montantActuel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dateEcheance" DATE,
    "compteId" UUID,
    "statut" "StatutObjectif" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectifEpargne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRecurrente" (
    "id" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "compteId" UUID,
    "categorieId" UUID,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "type" "TypeTransaction" NOT NULL DEFAULT 'DEPENSE',
    "frequence" "Frequence" NOT NULL,
    "prochaineEcheance" DATE NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionRecurrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Personne_email_key" ON "Personne"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JetonAuthentification_jetonHash_key" ON "JetonAuthentification"("jetonHash");

-- CreateIndex
CREATE INDEX "JetonAuthentification_personneId_type_idx" ON "JetonAuthentification"("personneId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRefresh_jetonHash_key" ON "SessionRefresh"("jetonHash");

-- CreateIndex
CREATE INDEX "SessionRefresh_personneId_idx" ON "SessionRefresh"("personneId");

-- CreateIndex
CREATE INDEX "CompteFinancier_personneId_idx" ON "CompteFinancier"("personneId");

-- CreateIndex
CREATE INDEX "Categorie_personneId_type_idx" ON "Categorie"("personneId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionLieeId_key" ON "Transaction"("transactionLieeId");

-- CreateIndex
CREATE INDEX "Transaction_compteId_dateOperation_idx" ON "Transaction"("compteId", "dateOperation");

-- CreateIndex
CREATE INDEX "Transaction_categorieId_idx" ON "Transaction"("categorieId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_personneId_categorieId_periode_key" ON "Budget"("personneId", "categorieId", "periode");

-- CreateIndex
CREATE INDEX "ObjectifEpargne_personneId_statut_idx" ON "ObjectifEpargne"("personneId", "statut");

-- CreateIndex
CREATE INDEX "TransactionRecurrente_personneId_actif_idx" ON "TransactionRecurrente"("personneId", "actif");

-- AddForeignKey
ALTER TABLE "JetonAuthentification" ADD CONSTRAINT "JetonAuthentification_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRefresh" ADD CONSTRAINT "SessionRefresh_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompteFinancier" ADD CONSTRAINT "CompteFinancier_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categorie" ADD CONSTRAINT "Categorie_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categorie" ADD CONSTRAINT "Categorie_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteFinancier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transactionLieeId_fkey" FOREIGN KEY ("transactionLieeId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectifEpargne" ADD CONSTRAINT "ObjectifEpargne_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectifEpargne" ADD CONSTRAINT "ObjectifEpargne_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteFinancier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecurrente" ADD CONSTRAINT "TransactionRecurrente_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecurrente" ADD CONSTRAINT "TransactionRecurrente_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteFinancier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecurrente" ADD CONSTRAINT "TransactionRecurrente_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

