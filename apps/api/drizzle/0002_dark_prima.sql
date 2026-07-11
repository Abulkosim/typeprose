ALTER TABLE "results" ALTER COLUMN "passage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "mode" text DEFAULT 'prose' NOT NULL;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "word_text" text;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_mode_shape" CHECK (("results"."mode" = 'prose' AND "results"."passage_id" IS NOT NULL AND "results"."word_text" IS NULL)
        OR ("results"."mode" = 'words' AND "results"."passage_id" IS NULL AND "results"."word_text" IS NOT NULL));