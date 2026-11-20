/**
 * Server-only: who is playing, and their saved progress.
 *
 * A signed-in request plays as the account's player. Otherwise the player is
 * a guest identified by the sd_guest cookie, minted on first visit. A guest's
 * row is only written once they save something, so drive-by visits don't
 * create players. When a guest signs in, their progress is merged into the
 * account and the cookie is cleared.
 *
 * Every finished match is also logged to `matches` for the admin view.
 */
import {
	deleteCookie,
	getCookie,
	getRequestHeaders,
	setCookie,
} from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { dailyRuns, matches, players, unlimitedStats } from "#/db/schema";
import { auth } from "#/lib/auth";
import { type FlightStep, totalAltitude } from "./rarity";
import type { RunProgress, SaveData } from "./storage";

const GUEST_COOKIE = "sd_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function readGuestId() {
	const id = getCookie(GUEST_COOKIE);
	return id && UUID.test(id) ? id : null;
}

function mintGuestId() {
	const id = crypto.randomUUID();
	setCookie(GUEST_COOKIE, id, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60 * 24 * 400, // browsers cap cookies at 400 days
	});
	return id;
}

function cookieValue(headers: Headers, name: string) {
	return (headers.get("cookie") ?? "")
		.split(";")
		.map((c) => c.trim().split("="))
		.find(([k]) => k === name)?.[1];
}

/** Mints a guest cookie for a visitor with neither a session nor a guest id. */
export function ensureGuestCookie(headers: Headers) {
	const cookie = headers.get("cookie") ?? "";
	if (cookie.includes("better-auth.session_token=")) return;
	const guestId = cookieValue(headers, GUEST_COOKIE);
	if (!guestId || !UUID.test(guestId)) mintGuestId();
}

export interface Player {
	id: string;
	userId: string | null;
}

/** The current player. Guests get a cookie if they don't have one yet. */
export async function resolvePlayer(): Promise<Player> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) return { id: readGuestId() ?? mintGuestId(), userId: null };

	const userId = session.user.id;
	const guestId = readGuestId();
	const id = await db.transaction(async (tx) => {
		const mine = await accountPlayerId(tx, userId);
		if (guestId) await absorbGuest(tx, guestId, mine);
		return mine;
	});
	if (guestId) deleteCookie(GUEST_COOKIE, { path: "/" });
	return { id, userId };
}

/** The account's player id, creating the row on first use. */
async function accountPlayerId(q: Tx | typeof db, userId: string) {
	await q
		.insert(players)
		.values({ id: crypto.randomUUID(), userId })
		.onConflictDoNothing({ target: players.userId });
	const [mine] = await q
		.select({ id: players.id })
		.from(players)
		.where(eq(players.userId, userId));
	return mine.id;
}

/**
 * Player id for a request outside a server function (the party WebSocket),
 * from its headers alone. It never sets cookies, so it doesn't merge a guest
 * into an account; that happens on the player's next page load. null when the
 * request has neither a session nor a guest cookie.
 */
export async function identifyPlayer(headers: Headers): Promise<string | null> {
	const session = await auth.api.getSession({ headers });
	if (session) return accountPlayerId(db, session.user.id);
	const guestId = cookieValue(headers, GUEST_COOKIE);
	if (!guestId || !UUID.test(guestId)) return null;
	await db.insert(players).values({ id: guestId }).onConflictDoNothing();
	return guestId;
}

/** Make sure a guest's row exists before writing progress for it. */
async function ensurePlayer(tx: Tx, player: Player) {
	if (player.userId) return;
	await tx.insert(players).values({ id: player.id }).onConflictDoNothing();
}

/** Moves a guest's progress into an account and removes the guest. */
async function absorbGuest(tx: Tx, guestId: string, intoId: string) {
	// lock the guest so two requests right after sign-in can't both merge it
	const [guest] = await tx
		.select({ id: players.id })
		.from(players)
		.where(and(eq(players.id, guestId), isNull(players.userId)))
		.for("update");
	if (!guest) return;
	// their matches were already logged; they just change hands
	await tx
		.update(matches)
		.set({ playerId: intoId })
		.where(eq(matches.playerId, guestId));
	await mergeSave(tx, intoId, await readSave(guestId, tx), false);
	await tx.delete(players).where(eq(players.id, guestId));
}

/** Everything saved for one player, in the shape the client uses. */
export async function readSave(
	playerId: string,
	q: Tx | typeof db = db,
): Promise<SaveData> {
	const [runs, [unlimited]] = await Promise.all([
		q.select().from(dailyRuns).where(eq(dailyRuns.playerId, playerId)),
		q
			.select()
			.from(unlimitedStats)
			.where(eq(unlimitedStats.playerId, playerId)),
	]);
	const save: SaveData = {
		daily: {},
		inProgress: {},
		unlimited: {
			played: unlimited?.played ?? 0,
			correct: unlimited?.correct ?? 0,
			best: unlimited?.best ?? 0,
			bestKm: unlimited?.bestKm ?? 0,
		},
	};
	for (const r of runs) {
		const run = { marks: r.marks, flight: r.flight as FlightStep[] };
		if (r.finishedAt) {
			save.daily[r.date] = { ...run, finishedAt: r.finishedAt.getTime() };
		} else {
			save.inProgress[r.date] = run;
		}
	}
	return save;
}

/**
 * Stores a nightly run. A finished night never changes; an unfinished one is
 * replaced only by a run that got further (or finished). Returns true when
 * this call finished the night.
 */
async function upsertRun(
	tx: Tx,
	playerId: string,
	date: string,
	run: RunProgress,
	finishedAt: Date | null,
) {
	const changed = await tx
		.insert(dailyRuns)
		.values({ playerId, date, ...run, finishedAt })
		.onConflictDoUpdate({
			target: [dailyRuns.playerId, dailyRuns.date],
			set: {
				marks: sql`excluded.marks`,
				flight: sql`excluded.flight`,
				finishedAt: sql`excluded.finished_at`,
				updatedAt: sql`now()`,
			},
			setWhere: sql`${dailyRuns.finishedAt} IS NULL AND (
				excluded.finished_at IS NOT NULL
				OR jsonb_array_length(excluded.flight) >= jsonb_array_length(${dailyRuns.flight})
			)`,
		})
		.returning({ finishedAt: dailyRuns.finishedAt });
	return finishedAt !== null && changed.length > 0;
}

interface MatchLog {
	playerId: string | null;
	mode: "daily" | "unlimited" | "party";
	run: RunProgress;
	night?: string;
	partyCode?: string;
	partyGame?: string;
	playerName?: string;
	finishedAt?: Date;
}

async function logMatches(q: Tx | typeof db, logs: MatchLog[]) {
	if (!logs.length) return;
	await q.insert(matches).values(
		logs.map(({ run, ...m }) => ({
			...m,
			id: crypto.randomUUID(),
			marks: run.marks,
			flight: run.flight,
			correct: run.marks.filter((x) => x === "hit").length,
			altitudeKm: totalAltitude(run.flight),
		})),
	);
}

async function addUnlimited(
	tx: Tx,
	playerId: string,
	add: SaveData["unlimited"],
) {
	await tx
		.insert(unlimitedStats)
		.values({ playerId, ...add })
		.onConflictDoUpdate({
			target: unlimitedStats.playerId,
			set: {
				played: sql`${unlimitedStats.played} + excluded.played`,
				correct: sql`${unlimitedStats.correct} + excluded.correct`,
				best: sql`greatest(${unlimitedStats.best}, excluded.best)`,
				bestKm: sql`greatest(${unlimitedStats.bestKm}, excluded.best_km)`,
			},
		});
}

/**
 * Folds another save (a guest's, or old on-device data) into a player's.
 * `log` adds its finished nights to the match log; a guest's are there already.
 */
async function mergeSave(
	tx: Tx,
	playerId: string,
	from: SaveData,
	log: boolean,
) {
	for (const [date, run] of Object.entries(from.inProgress)) {
		await upsertRun(tx, playerId, date, run, null);
	}
	for (const [date, { finishedAt, ...run }] of Object.entries(from.daily)) {
		const at = new Date(finishedAt);
		const finished = await upsertRun(tx, playerId, date, run, at);
		if (finished && log) {
			await logMatches(tx, [
				{ playerId, mode: "daily", night: date, run, finishedAt: at },
			]);
		}
	}
	if (from.unlimited.played > 0) {
		await addUnlimited(tx, playerId, from.unlimited);
	}
}

export async function writeProgress(
	player: Player,
	date: string,
	run: RunProgress,
) {
	await db.transaction(async (tx) => {
		await ensurePlayer(tx, player);
		await upsertRun(tx, player.id, date, run, null);
	});
}

export async function writeDaily(
	player: Player,
	date: string,
	run: RunProgress,
) {
	await db.transaction(async (tx) => {
		await ensurePlayer(tx, player);
		if (await upsertRun(tx, player.id, date, run, new Date())) {
			await logMatches(tx, [
				{ playerId: player.id, mode: "daily", night: date, run },
			]);
		}
	});
}

export async function writeUnlimited(player: Player, run: RunProgress) {
	const correct = run.marks.filter((m) => m === "hit").length;
	await db.transaction(async (tx) => {
		await ensurePlayer(tx, player);
		await addUnlimited(tx, player.id, {
			played: 1,
			correct,
			best: correct,
			bestKm: totalAltitude(run.flight),
		});
		await logMatches(tx, [{ playerId: player.id, mode: "unlimited", run }]);
	});
}

/** Logs one finished party game: a match per player. */
export async function writePartyGame(
	game: { code: string; game: string },
	results: { playerId: string | null; name: string; run: RunProgress }[],
) {
	await logMatches(
		db,
		results.map((r) => ({
			playerId: r.playerId,
			mode: "party" as const,
			partyCode: game.code,
			partyGame: game.game,
			playerName: r.name,
			run: r.run,
		})),
	);
}

export async function importSave(player: Player, save: SaveData) {
	await db.transaction(async (tx) => {
		await ensurePlayer(tx, player);
		await mergeSave(tx, player.id, save, true);
	});
}
