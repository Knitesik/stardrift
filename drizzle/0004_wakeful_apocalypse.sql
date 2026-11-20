CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text,
	"mode" text NOT NULL,
	"night" text,
	"party_code" text,
	"party_game" text,
	"player_name" text,
	"marks" jsonb NOT NULL,
	"flight" jsonb NOT NULL,
	"correct" integer NOT NULL,
	"altitude_km" double precision NOT NULL,
	"finished_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_finished_idx" ON "matches" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "matches_player_idx" ON "matches" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_party_idx" ON "matches" USING btree ("party_game");--> statement-breakpoint
-- backfill: nights finished before the match log existed
INSERT INTO "matches" ("id", "player_id", "mode", "night", "marks", "flight", "correct", "altitude_km", "finished_at")
SELECT
	gen_random_uuid()::text,
	r."player_id",
	'daily',
	r."date",
	r."marks",
	r."flight",
	(SELECT count(*) FROM jsonb_array_elements_text(r."marks") m WHERE m = 'hit')::int,
	COALESCE((SELECT sum((s->>'climbKm')::double precision) FROM jsonb_array_elements(r."flight") s), 0),
	r."finished_at"
FROM "daily_runs" r
WHERE r."finished_at" IS NOT NULL;
