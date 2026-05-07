-- AlterTable: add reason column to audit_logs for PERIOD_REOPEN and other actions that require a logged rationale
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
