ALTER TABLE "profiles" ADD COLUMN "daily_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "daily_best_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_daily_date" date;