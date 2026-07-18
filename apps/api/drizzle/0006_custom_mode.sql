ALTER TABLE "results" DROP CONSTRAINT "results_mode_shape";--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_mode_shape" CHECK (("results"."mode" = 'prose' AND "results"."passage_id" IS NOT NULL AND "results"."word_text" IS NULL)
        OR ("results"."mode" IN ('words', 'timed', 'custom') AND "results"."passage_id" IS NULL AND "results"."word_text" IS NOT NULL));