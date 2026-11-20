/**
 * Server-only answer tallies.
 *
 * Uses Postgres (answer_tallies) when DATABASE_URL works. If the database is
 * unreachable, falls back to an in-process tally so the game still plays in
 * development; that fallback resets on server restart and is per-instance.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { answerTallies } from "#/db/schema";

type Counts = Record<string, number>;

const memory = new Map<string, Counts>();
let mode: "unknown" | "db" | "memory" = "unknown";
let retryDbAt = 0;
let tableReady: Promise<void> | null = null;

function ensureTable() {
	tableReady ??= db
		.execute(sql`
			CREATE TABLE IF NOT EXISTS answer_tallies (
				question_id TEXT NOT NULL,
				choice TEXT NOT NULL,
				count INTEGER NOT NULL DEFAULT 0,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (question_id, choice)
			)`)
		.then(() => undefined)
		.catch((err) => {
			tableReady = null;
			throw err;
		});
	return tableReady;
}

async function recordInDb(questionId: string, choice: string): Promise<Counts> {
	await ensureTable();
	await db
		.insert(answerTallies)
		.values({ questionId, choice, count: 1 })
		.onConflictDoUpdate({
			target: [answerTallies.questionId, answerTallies.choice],
			set: { count: sql`${answerTallies.count} + 1`, updatedAt: sql`now()` },
		});
	const rows = await db
		.select({ choice: answerTallies.choice, count: answerTallies.count })
		.from(answerTallies)
		.where(and(eq(answerTallies.questionId, questionId)));
	return Object.fromEntries(rows.map((r) => [r.choice, r.count]));
}

function recordInMemory(questionId: string, choice: string): Counts {
	const counts = memory.get(questionId) ?? {};
	counts[choice] = (counts[choice] ?? 0) + 1;
	memory.set(questionId, counts);
	return { ...counts };
}

async function countsInDb(questionIds: string[]) {
	await ensureTable();
	const rows = await db
		.select({
			questionId: answerTallies.questionId,
			choice: answerTallies.choice,
			count: answerTallies.count,
		})
		.from(answerTallies)
		.where(inArray(answerTallies.questionId, questionIds));
	const out: Record<string, Counts> = {};
	for (const r of rows) {
		out[r.questionId] ??= {};
		out[r.questionId][r.choice] = r.count;
	}
	return out;
}

/** Current counts for several questions (read-only). */
export async function getCounts(
	questionIds: string[],
): Promise<Record<string, Counts>> {
	const tryDb = mode !== "memory" || Date.now() >= retryDbAt;
	if (tryDb && process.env.DATABASE_URL) {
		try {
			const counts = await countsInDb(questionIds);
			mode = "db";
			return counts;
		} catch {
			mode = "memory";
			retryDbAt = Date.now() + 60_000;
		}
	}
	return Object.fromEntries(
		questionIds.map((id) => [id, { ...(memory.get(id) ?? {}) }]),
	);
}

/** Adds one answer and returns the updated counts for that question. */
export async function recordAnswer(
	questionId: string,
	choice: string,
): Promise<{ counts: Counts; source: "db" | "memory" }> {
	const tryDb = mode !== "memory" || Date.now() >= retryDbAt;
	if (tryDb && process.env.DATABASE_URL) {
		try {
			const counts = await recordInDb(questionId, choice);
			mode = "db";
			return { counts, source: "db" };
		} catch (err) {
			if (mode !== "memory") {
				console.warn(
					"[stardrift] answer tallies: database unavailable, using in-memory tallies.",
					(err as Error).message,
				);
			}
			mode = "memory";
			retryDbAt = Date.now() + 60_000;
		}
	}
	return { counts: recordInMemory(questionId, choice), source: "memory" };
}
