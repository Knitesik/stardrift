/**
 * Server-only access to challenges stored in Postgres:
 * prompts, their accepted answers, and the nightly schedule.
 *
 * Prompts and match indexes are cached in memory for a minute, so a new or
 * edited challenge shows up without a restart. Call invalidateChallenges()
 * after editing to see it immediately.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "#/db/index";
import { dailyRounds, promptAnswers, prompts } from "#/db/schema";
import { ROUND_SIZE_SINCE } from "./engine";
import { buildIndex, type MatchIndex, matchWith } from "./match.server";
import type { Prompt } from "./prompts";
import { nightSeed, seededPick } from "./seeded";

const CACHE_MS = 60_000;

interface Catalog {
	loadedAt: number;
	/** every non-draft prompt (ready + retired), so old nights still score */
	byId: Map<string, Prompt>;
	/** ids that can be picked for new rounds, in sort order */
	ready: string[];
	indexes: Map<string, MatchIndex>;
}

let catalog: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

async function load(): Promise<Catalog> {
	const rows = await db
		.select()
		.from(prompts)
		.where(ne(prompts.status, "draft"))
		.orderBy(asc(prompts.sortOrder), asc(prompts.id));
	const answers = await db
		.select({
			promptId: promptAnswers.promptId,
			canonical: promptAnswers.canonical,
			aliases: promptAnswers.aliases,
		})
		.from(promptAnswers)
		.orderBy(asc(promptAnswers.promptId), asc(promptAnswers.rank));

	const answersByPrompt = new Map<
		string,
		{ canonical: string; aliases: string[] }[]
	>();
	for (const a of answers) {
		const list = answersByPrompt.get(a.promptId) ?? [];
		list.push({ canonical: a.canonical, aliases: a.aliases });
		answersByPrompt.set(a.promptId, list);
	}

	const byId = new Map<string, Prompt>();
	const indexes = new Map<string, MatchIndex>();
	const ready: string[] = [];
	for (const p of rows) {
		byId.set(p.id, {
			id: p.id,
			text: p.text,
			category: p.category,
			example: p.example,
		});
		indexes.set(
			p.id,
			buildIndex({
				answers: answersByPrompt.get(p.id) ?? [],
				surnames: p.surnames,
				dropWords: p.dropWords,
			}),
		);
		if (p.status === "ready" && (answersByPrompt.get(p.id)?.length ?? 0) > 0) {
			ready.push(p.id);
		}
	}
	return { loadedAt: Date.now(), byId, ready, indexes };
}

async function getCatalog(): Promise<Catalog> {
	if (catalog && Date.now() - catalog.loadedAt < CACHE_MS) return catalog;
	loading ??= load()
		.then((c) => {
			catalog = c;
			return c;
		})
		.finally(() => {
			loading = null;
		});
	return loading;
}

/** Drop the cache so the next request reloads from the database. */
export function invalidateChallenges() {
	catalog = null;
}

export async function getPrompt(id: string): Promise<Prompt | undefined> {
	return (await getCatalog()).byId.get(id);
}

export async function getIndex(id: string): Promise<MatchIndex | undefined> {
	return (await getCatalog()).indexes.get(id);
}

/** Canonical answer for a typed guess, or null if not accepted. */
export async function matchAnswer(promptId: string, typed: string) {
	const idx = await getIndex(promptId);
	return idx ? matchWith(idx, typed) : null;
}

/** A round of `size` ready prompts for any seed (unlimited, party). */
export async function roundForSeed(
	seed: string,
	size: number,
): Promise<Prompt[]> {
	const c = await getCatalog();
	return seededPick(c.ready, seed, size).map((id) => c.byId.get(id) as Prompt);
}

/**
 * The prompts for one night. Uses the schedule in daily_rounds; a night that
 * isn't scheduled yet is picked from the ready prompts and saved, so it never
 * changes after someone has played it. A night from ROUND_SIZE_SINCE on that
 * was scheduled with fewer prompts is topped up to `size` in the same seeded
 * order, so its first prompts stay as they were.
 */
export async function nightRound(
	dateKey: string,
	size: number,
): Promise<Prompt[]> {
	const c = await getCatalog();
	const read = () =>
		db
			.select({ promptId: dailyRounds.promptId })
			.from(dailyRounds)
			.where(eq(dailyRounds.date, dateKey))
			.orderBy(asc(dailyRounds.position));

	let rows = await read();
	const topUp = rows.length === 0 || dateKey >= ROUND_SIZE_SINCE;
	if (topUp && rows.length < size) {
		const have = new Set(rows.map((r) => r.promptId));
		const picked = seededPick(c.ready, nightSeed(dateKey), c.ready.length)
			.filter((id) => !have.has(id))
			.slice(0, size - rows.length);
		if (picked.length) {
			const offset = rows.length;
			await db
				.insert(dailyRounds)
				.values(
					picked.map((promptId, i) => ({
						date: dateKey,
						position: offset + i,
						promptId,
					})),
				)
				.onConflictDoNothing();
		}
		rows = await read();
	}
	const round: Prompt[] = [];
	for (const r of rows) {
		const p = c.byId.get(r.promptId) ?? (await reloadAndGet(r.promptId));
		if (p) round.push(p);
	}
	return round;
}

/** A scheduled prompt may have been added after the cache loaded. */
async function reloadAndGet(id: string) {
	invalidateChallenges();
	return (await getCatalog()).byId.get(id);
}

/** Is this prompt scheduled on this night? (guards archive scoring) */
export async function isScheduled(dateKey: string, promptId: string) {
	const rows = await db
		.select({ p: dailyRounds.promptId })
		.from(dailyRounds)
		.where(
			and(eq(dailyRounds.date, dateKey), eq(dailyRounds.promptId, promptId)),
		)
		.limit(1);
	return rows.length > 0;
}
