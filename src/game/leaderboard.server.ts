/**
 * Server-only: the nightly leaderboard. Other players' names never leave the
 * server in full; only the viewer's own name does.
 */
import { getCookie, getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { dailyRuns, players, user } from "#/db/schema";
import { auth } from "#/lib/auth";
import type { Leaderboard } from "./leaderboard";

const TOP = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The viewer's player id without creating anything: unlike resolvePlayer it
 * mints no guest cookie and merges no guest, since this is only a read.
 */
async function viewerId(): Promise<string | null> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (session) {
		const [mine] = await db
			.select({ id: players.id })
			.from(players)
			.where(eq(players.userId, session.user.id));
		return mine?.id ?? null;
	}
	const guestId = getCookie("sd_guest");
	return guestId && UUID.test(guestId) ? guestId : null;
}

/** "Ada Lovelace" → "A. L."; guests have no name. */
function initials(name: string | null) {
	if (!name?.trim()) return "Guest";
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 3)
		.map((word) => `${Array.from(word)[0].toUpperCase()}.`)
		.join(" ");
}

export async function readLeaderboard(date: string): Promise<Leaderboard> {
	return rankNight(date, await viewerId());
}

/** One night's board as seen by player `me` (null: a viewer with no player). */
export async function rankNight(
	date: string,
	me: string | null,
): Promise<Leaderboard> {
	const km = sql<number>`coalesce((
		select sum((step->>'climbKm')::float8)
		from jsonb_array_elements(${dailyRuns.flight}) step
	), 0)`;
	const correct = sql<number>`(
		select count(*)::int
		from jsonb_array_elements_text(${dailyRuns.marks}) mark
		where mark = 'hit'
	)`;

	const ranked = db.$with("ranked").as(
		db
			.select({
				playerId: dailyRuns.playerId,
				name: user.name,
				finishedAt: dailyRuns.finishedAt,
				total: sql<number>`count(*) over ()::int`.as("total"),
				km: km.as("km"),
				correct: correct.as("correct"),
				rank: sql<number>`rank() over (order by ${km} desc, ${correct} desc)::int`.as(
					"rank",
				),
			})
			.from(dailyRuns)
			.innerJoin(players, eq(players.id, dailyRuns.playerId))
			.leftJoin(user, eq(user.id, players.userId))
			.where(and(eq(dailyRuns.date, date), isNotNull(dailyRuns.finishedAt))),
	);

	const rows = await db
		.with(ranked)
		.select()
		.from(ranked)
		.where(
			me
				? or(lte(ranked.rank, TOP), eq(ranked.playerId, me))
				: lte(ranked.rank, TOP),
		)
		// ties share a rank; whoever finished first is listed first
		.orderBy(ranked.rank, ranked.finishedAt)
		// a tie at the cutoff could run long
		.limit(TOP * 3);

	return {
		total: rows[0]?.total ?? 0,
		entries: rows.map((r) => {
			const isYou = r.playerId === me;
			return {
				rank: r.rank,
				name: isYou ? r.name?.trim() || "Guest" : initials(r.name),
				isYou,
				km: r.km,
				correct: r.correct,
			};
		}),
	};
}
