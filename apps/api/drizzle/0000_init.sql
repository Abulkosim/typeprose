CREATE TABLE "authors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"birth_year" integer,
	"death_year" integer,
	"era" text,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_id" integer NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"char_count" integer NOT NULL,
	"word_count" integer NOT NULL,
	"difficulty" numeric(5, 2) NOT NULL,
	"band" text NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passages_text_hash_unique" UNIQUE("text_hash")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"passage_id" integer NOT NULL,
	"wpm" numeric(6, 2) NOT NULL,
	"raw_wpm" numeric(6, 2) NOT NULL,
	"accuracy" numeric(5, 2) NOT NULL,
	"consistency" numeric(5, 2) NOT NULL,
	"duration_ms" integer NOT NULL,
	"char_events" jsonb NOT NULL,
	"client_match" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"translator" text,
	"pub_year" integer,
	"source" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "works_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passages_band_idx" ON "passages" USING btree ("band");--> statement-breakpoint
CREATE INDEX "passages_themes_idx" ON "passages" USING gin ("themes");--> statement-breakpoint
CREATE INDEX "results_profile_id_created_at_idx" ON "results" USING btree ("profile_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "results_passage_id_idx" ON "results" USING btree ("passage_id");