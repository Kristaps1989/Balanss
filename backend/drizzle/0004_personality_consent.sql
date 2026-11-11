ALTER TABLE "personalities" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
-- Existing profiles were stored only after the consent step; record that moment as the test time.
UPDATE "personalities" SET "consent_at" = "tested_at" WHERE "consent_at" IS NULL;
