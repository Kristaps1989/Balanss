CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type" text NOT NULL,
	"prefs_key" text NOT NULL,
	"position" integer NOT NULL,
	"recipe" jsonb NOT NULL,
	"serving_grams" integer NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_summaries" (
	"user_id" uuid NOT NULL,
	"week" date NOT NULL,
	"date" date NOT NULL,
	"summary" jsonb NOT NULL,
	"findings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_summaries_user_id_week_date_pk" PRIMARY KEY("user_id","week","date")
);
--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "report_reason" text;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb DEFAULT '{"diet":"any","avoid":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_personalization" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_questions" ADD COLUMN "based_on" text;--> statement-breakpoint
ALTER TABLE "weekly_questions" ADD COLUMN "based_on_kind" text;--> statement-breakpoint
ALTER TABLE "weekly_questions" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_user_date_idx" ON "recipes" USING btree ("user_id","date");