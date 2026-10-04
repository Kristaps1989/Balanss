CREATE TABLE "leisure_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leisure_usage" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "leisure_usage_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "pantry" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leisure_city" text;--> statement-breakpoint
ALTER TABLE "leisure_usage" ADD CONSTRAINT "leisure_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry" ADD CONSTRAINT "pantry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;