-- Código de verificação do e-mail no cadastro (só o hash fica gravado)
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'signup',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailCode_email_purpose_createdAt_idx" ON "EmailCode"("email", "purpose", "createdAt");
CREATE INDEX "EmailCode_ip_createdAt_idx" ON "EmailCode"("ip", "createdAt");
