CREATE TABLE "answer_tallies" (
	"question_id" text NOT NULL,
	"choice" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "answer_tallies_question_id_choice_pk" PRIMARY KEY("question_id","choice")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
