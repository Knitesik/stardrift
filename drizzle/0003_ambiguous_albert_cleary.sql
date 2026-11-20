CREATE TABLE "daily_runs" (
	"player_id" text NOT NULL,
	"date" text NOT NULL,
	"marks" jsonb NOT NULL,
	"flight" jsonb NOT NULL,
	"finished_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_runs_player_id_date_pk" PRIMARY KEY("player_id","date")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "unlimited_stats" (
	"player_id" text PRIMARY KEY NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"best_km" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_runs" ADD CONSTRAINT "daily_runs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlimited_stats" ADD CONSTRAINT "unlimited_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;