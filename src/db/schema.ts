import {
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
	id: serial().primaryKey(),
	title: text().notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});

/** How many players gave each accepted answer to each prompt. */
export const answerTallies = pgTable(
	"answer_tallies",
	{
		questionId: text("question_id").notNull(),
		choice: text().notNull(),
		count: integer().notNull().default(0),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.questionId, t.choice] })],
);

/** A Stardrift challenge, e.g. "Name a chemical element". */
export const prompts = pgTable("prompts", {
	id: text().primaryKey(),
	text: text().notNull(),
	category: text().notNull(),
	/** placeholder shown in the answer box */
	example: text().notNull().default(""),
	/** accept a person's surname alone ("Curie") */
	surnames: boolean().notNull().default(false),
	/** filler words ignored when matching ("sea" in "Red Sea") */
	dropWords: text("drop_words").array().notNull().default([]),
	/** draft = being written, ready = can be scheduled, retired = kept for history */
	status: text({ enum: ["draft", "ready", "retired"] })
		.notNull()
		.default("draft"),
	/** stable order used when no night is scheduled */
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Accepted answers for a prompt, ranked from most to least common. */
export const promptAnswers = pgTable(
	"prompt_answers",
	{
		id: serial().primaryKey(),
		promptId: text("prompt_id")
			.notNull()
			.references(() => prompts.id, { onDelete: "cascade" }),
		canonical: text().notNull(),
		aliases: text().array().notNull().default([]),
		/** 0 = the obvious answer; seeds the rarity prior */
		rank: integer().notNull(),
	},
	(t) => [
		unique("prompt_answers_prompt_canonical").on(t.promptId, t.canonical),
		index("prompt_answers_prompt_idx").on(t.promptId),
	],
);

/** Which prompts play on which night. */
export const dailyRounds = pgTable(
	"daily_rounds",
	{
		/** yyyy-mm-dd */
		date: text().notNull(),
		position: integer().notNull(),
		promptId: text("prompt_id")
			.notNull()
			.references(() => prompts.id),
	},
	(t) => [primaryKey({ columns: [t.date, t.position] })],
);

/* ───────── Better Auth (property names must match Better Auth's fields) ───────── */

export const user = pgTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text(),
	/** "admin" can see every match; grant with `pnpm admin:grant <email>` */
	role: text({ enum: ["user", "admin"] }).notNull().default("user"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
	"session",
	{
		id: text().primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text().notNull().unique(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text().primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text(),
		password: text(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text().primaryKey(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────── Player progress ───────── */

/**
 * Whoever is playing: a guest (id held in the sd_guest cookie, userId null)
 * or a signed-in account (one row per user). A guest's progress is merged
 * into the account when they sign in.
 */
export const players = pgTable("players", {
	id: text().primaryKey(),
	userId: text("user_id")
		.unique()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** One nightly run per player and date; finishedAt null while mid-flight. */
export const dailyRuns = pgTable(
	"daily_runs",
	{
		playerId: text("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		/** yyyy-mm-dd */
		date: text().notNull(),
		marks: jsonb().$type<("hit" | "timeout")[]>().notNull(),
		flight: jsonb().$type<unknown[]>().notNull(),
		finishedAt: timestamp("finished_at"),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.playerId, t.date] })],
);

/** Running totals for unlimited mode. */
export const unlimitedStats = pgTable("unlimited_stats", {
	playerId: text("player_id")
		.primaryKey()
		.references(() => players.id, { onDelete: "cascade" }),
	played: integer().notNull().default(0),
	correct: integer().notNull().default(0),
	best: integer().notNull().default(0),
	bestKm: doublePrecision("best_km").notNull().default(0),
});

/**
 * Every finished match, one row per player, for the admin log. Daily, unlimited
 * and party games all land here. A party player who had neither an account nor
 * a guest cookie has no playerId, only their call sign.
 */
export const matches = pgTable(
	"matches",
	{
		id: text().primaryKey(),
		playerId: text("player_id").references(() => players.id, {
			onDelete: "set null",
		}),
		mode: text({ enum: ["daily", "unlimited", "party"] }).notNull(),
		/** yyyy-mm-dd for daily matches */
		night: text(),
		/** party room code and the game number within that room */
		partyCode: text("party_code"),
		partyGame: text("party_game"),
		/** call sign shown in a party */
		playerName: text("player_name"),
		marks: jsonb().$type<("hit" | "timeout")[]>().notNull(),
		flight: jsonb().$type<unknown[]>().notNull(),
		correct: integer().notNull(),
		altitudeKm: doublePrecision("altitude_km").notNull(),
		finishedAt: timestamp("finished_at").notNull().defaultNow(),
	},
	(t) => [
		index("matches_finished_idx").on(t.finishedAt),
		index("matches_player_idx").on(t.playerId),
		index("matches_party_idx").on(t.partyGame),
	],
);
