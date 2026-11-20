CREATE TABLE "daily_rounds" (
	"date" text NOT NULL,
	"position" integer NOT NULL,
	"prompt_id" text NOT NULL,
	CONSTRAINT "daily_rounds_date_position_pk" PRIMARY KEY("date","position")
);
--> statement-breakpoint
CREATE TABLE "prompt_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL,
	"canonical" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "prompt_answers_prompt_canonical" UNIQUE("prompt_id","canonical")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"example" text DEFAULT '' NOT NULL,
	"surnames" boolean DEFAULT false NOT NULL,
	"drop_words" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_rounds" ADD CONSTRAINT "daily_rounds_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_answers" ADD CONSTRAINT "prompt_answers_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_answers_prompt_idx" ON "prompt_answers" USING btree ("prompt_id");