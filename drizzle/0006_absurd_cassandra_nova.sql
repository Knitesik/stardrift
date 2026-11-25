CREATE TABLE "supporters" (
	"order_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"refunded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supporters" ADD CONSTRAINT "supporters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supporters_user_idx" ON "supporters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supporters_email_idx" ON "supporters" USING btree (lower("email"));