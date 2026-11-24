import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { authClient } from "#/lib/auth-client";
import type { PartyEffect } from "#/party/protocol";
import type { TierId } from "./rarity";

export type MatchMode = "daily" | "unlimited" | "party";

export interface AdminAnswer {
	prompt: string;
	category: string | null;
	/** canonical answer; null when time ran out */
	answer: string | null;
	tier: TierId | null;
	share: number | null;
	climbKm: number;
	/** party only: how many in the room gave the same answer */
	sharedWith?: number;
	effect?: PartyEffect;
}

export interface AdminMatch {
	id: string;
	mode: MatchMode;
	finishedAt: number;
	night: string | null;
	partyCode: string | null;
	partyGame: string | null;
	player:
		| { kind: "account"; id: string; name: string; email: string }
		| { kind: "guest"; id: string; name: string | null }
		| { kind: "anonymous"; name: string | null };
	correct: number;
	total: number;
	altitudeKm: number;
	answers: AdminAnswer[];
}

export interface AdminMatchPage {
	matches: AdminMatch[];
	/** pass back as `before` for the next page; null on the last page */
	next: string | null;
	totals: Record<MatchMode | "all", number>;
}

const PAGE_SIZE = 40;

const listInput = z.object({
	mode: z.enum(["all", "daily", "unlimited", "party"]).default("all"),
	/** name, email, call sign, guest id or party code */
	search: z.string().trim().max(80).default(""),
	before: z.string().max(200).nullish(),
});

async function requireAdmin() {
	const [{ getRequestHeaders, setResponseStatus }, { auth }] =
		await Promise.all([
			import("@tanstack/react-start/server"),
			import("#/lib/auth"),
		]);
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (session?.user.role !== "admin") {
		setResponseStatus(session ? 403 : 401);
		throw new Error(session ? "Admins only" : "Sign in first");
	}
}

/**
 * Whether the viewer is an admin. On the server it reads the incoming
 * request's cookies (the auth client's fetch would carry none during SSR);
 * in the browser it asks the auth API, which gets the cookies itself.
 */
export const getIsAdmin = createIsomorphicFn()
	.server(async (): Promise<boolean> => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		return session?.user.role === "admin";
	})
	.client(async (): Promise<boolean> => {
		const { data } = await authClient.getSession();
		return data?.user.role === "admin";
	});

/** Every match played, newest first, for admins. */
export const listMatches = createServerFn({ method: "GET" })
	.validator((data: unknown) => listInput.parse(data))
	.handler(async ({ data }): Promise<AdminMatchPage> => {
		await requireAdmin();
		const [{ and, desc, eq, ilike, or, sql }, { db }, schema, { getPrompt }] =
			await Promise.all([
				import("drizzle-orm"),
				import("#/db/index"),
				import("#/db/schema"),
				import("./challenges.server"),
			]);
		const { matches, players, user } = schema;

		const filters = [];
		if (data.mode !== "all") filters.push(eq(matches.mode, data.mode));
		if (data.search) {
			const like = `%${data.search.replace(/[\\%_]/g, "\\$&")}%`;
			filters.push(
				or(
					ilike(user.name, like),
					ilike(user.email, like),
					ilike(matches.playerName, like),
					ilike(players.id, like),
					ilike(matches.partyCode, like),
				),
			);
		}
		if (data.before) {
			// the exact database timestamp: a JS Date would round off microseconds
			// and skip rows finished in the same millisecond
			const [at, id] = data.before.split("|");
			if (at && id && !Number.isNaN(Date.parse(at))) {
				filters.push(
					sql`(${matches.finishedAt}, ${matches.id}) < (${at}::timestamp, ${id})`,
				);
			}
		}

		const rows = await db
			.select({
				match: matches,
				cursorAt: sql<string>`${matches.finishedAt}::text`,
				guestId: players.id,
				userId: user.id,
				userName: user.name,
				userEmail: user.email,
			})
			.from(matches)
			.leftJoin(players, eq(players.id, matches.playerId))
			.leftJoin(user, eq(user.id, players.userId))
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(desc(matches.finishedAt), desc(matches.id))
			.limit(PAGE_SIZE + 1);

		const counts = await db
			.select({ mode: matches.mode, n: sql<number>`count(*)::int` })
			.from(matches)
			.groupBy(matches.mode);
		const totals = { all: 0, daily: 0, unlimited: 0, party: 0 };
		for (const c of counts) {
			totals[c.mode] = c.n;
			totals.all += c.n;
		}

		const page = rows.slice(0, PAGE_SIZE);
		const out: AdminMatch[] = [];
		for (const r of page) {
			const m = r.match;
			const flight = m.flight as (AdminAnswer & { promptId: string })[];
			const answers: AdminAnswer[] = [];
			for (const step of flight) {
				const prompt = await getPrompt(step.promptId);
				answers.push({
					prompt: prompt?.text ?? step.promptId,
					category: prompt?.category ?? null,
					answer: step.answer,
					tier: step.tier,
					share: step.share,
					climbKm: step.climbKm,
					sharedWith: step.sharedWith,
					effect: step.effect,
				});
			}
			out.push({
				id: m.id,
				mode: m.mode,
				finishedAt: m.finishedAt.getTime(),
				night: m.night,
				partyCode: m.partyCode,
				partyGame: m.partyGame,
				player: r.userId
					? {
							kind: "account",
							id: r.userId,
							name: r.userName ?? "",
							email: r.userEmail ?? "",
						}
					: r.guestId
						? { kind: "guest", id: r.guestId, name: m.playerName }
						: { kind: "anonymous", name: m.playerName },
				correct: m.correct,
				total: m.marks.length,
				altitudeKm: m.altitudeKm,
				answers,
			});
		}
		const last = page[page.length - 1];
		return {
			matches: out,
			next:
				rows.length > PAGE_SIZE && last
					? `${last.cursorAt}|${last.match.id}`
					: null,
			totals,
		};
	});
