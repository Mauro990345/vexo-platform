-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "vexoBg" TEXT NOT NULL DEFAULT '#0b0f17',
    "vexoSurface" TEXT NOT NULL DEFAULT '#141a24',
    "vexoSurface2" TEXT NOT NULL DEFAULT '#1b222e',
    "vexoBorder" TEXT NOT NULL DEFAULT '#232c3a',
    "vexoBorderStrong" TEXT NOT NULL DEFAULT '#33404f',
    "vexoMuted" TEXT NOT NULL DEFAULT '#8b96a8',
    "vexoFg" TEXT NOT NULL DEFAULT '#f1f4f8',
    "vexoAccent" TEXT NOT NULL DEFAULT '#3b82f6',
    "vexoAccentFg" TEXT NOT NULL DEFAULT '#ffffff',
    "vexoPetrol" TEXT NOT NULL DEFAULT '#0B2436',
    "vexoPetrolBorder" TEXT NOT NULL DEFAULT '#1e4459',
    "vexoSuccess" TEXT NOT NULL DEFAULT '#34d399',
    "vexoError" TEXT NOT NULL DEFAULT '#f87171',
    "vexoWarning" TEXT NOT NULL DEFAULT '#fbbf24',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeSettings_pkey" PRIMARY KEY ("id")
);
