import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { authClient } from "#/lib/auth-client";
import { type AnswerMark, addDays } from "./engine";
import { type FlightStep, totalAltitude } from "./rarity";
import * as api from "./save";

/** where progress lived before it moved to the server; imported once */
const LEGACY_KEY = "stardrift:v2";

export interface RunProgress {
	marks: AnswerMark[];
	flight: FlightStep[];
}

export interface DailyResult extends RunProgress {
	finishedAt: number;
}

export interface SaveData {
	daily: Record<string, DailyResult>;
	/** unfinished nightly runs, so a reload resumes mid-flight */
	inProgress: Record<string, RunProgress>;
	unlimited: { played: number; correct: number; best: number; bestKm: number };
}

const empty = (): SaveData => ({
	daily: {},
	inProgress: {},
	unlimited: { played: 0, correct: 0, best: 0, bestKm: 0 },
});

/** Altitude for a saved run (0 for results saved before flights existed). */
export function runAltitude(run: Partial<RunProgress> | undefined) {
	return run?.flight ? totalAltitude(run.flight) : 0;
}

function readLegacy(): SaveData | null {
	try {
		const raw = window.localStorage.getItem(LEGACY_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as Partial<SaveData>;
		const daily: Record<string, DailyResult> = {};
		for (const [k, v] of Object.entries(data.daily ?? {})) {
			daily[k] = { ...v, flight: v.flight ?? [] };
		}
		return {
			daily,
			inProgress: data.inProgress ?? {},
			unlimited: { ...empty().unlimited, ...data.unlimited },
		};
	} catch {
		return null;
	}
}

async function fetchSave(): Promise<SaveData> {
	const legacy = readLegacy();
	if (legacy) {
		try {
			const merged = await api.importLocalSave({ data: legacy });
			window.localStorage.removeItem(LEGACY_KEY);
			return merged;
		} catch (err) {
			console.warn("[stardrift] couldn't import on-device progress", err);
		}
	}
	return api.getSave();
}

/** Progress belongs to the signed-in account, else to this browser's guest. */
function useSaveKey() {
	const { data: session, isPending } = authClient.useSession();
	const owner = session?.user.id ?? "guest";
	const key = useMemo(() => ["save", owner] as const, [owner]);
	return { key, owner, ready: !isPending };
}

/** The player's saved progress (null while loading). */
export function useSave() {
	const qc = useQueryClient();
	const { key, owner, ready } = useSaveKey();
	// signing in absorbs the guest, signing out starts a new one: drop the rest
	useEffect(() => {
		qc.removeQueries({
			queryKey: ["save"],
			predicate: (q) => q.queryKey[1] !== owner,
		});
	}, [qc, owner]);
	const query = useQuery({
		queryKey: key,
		queryFn: fetchSave,
		enabled: ready,
		staleTime: 30_000,
	});
	if (query.data) return query.data;
	// don't leave pages spinning forever if the server can't be reached
	return query.isError ? empty() : null;
}

/* Local versions of the server's rules, so the UI updates before the round trip. */

function withProgress(data: SaveData, dateKey: string, run: RunProgress) {
	if (data.daily[dateKey]) return data;
	return { ...data, inProgress: { ...data.inProgress, [dateKey]: run } };
}

function withDaily(data: SaveData, dateKey: string, run: RunProgress) {
	const { [dateKey]: _, ...inProgress } = data.inProgress;
	const daily = data.daily[dateKey]
		? data.daily
		: { ...data.daily, [dateKey]: { ...run, finishedAt: Date.now() } };
	return { ...data, daily, inProgress };
}

function withUnlimited(data: SaveData, run: RunProgress) {
	const u = data.unlimited;
	const correct = run.marks.filter((m) => m === "hit").length;
	return {
		...data,
		unlimited: {
			played: u.played + 1,
			correct: u.correct + correct,
			best: Math.max(u.best, correct),
			bestKm: Math.max(u.bestKm, runAltitude(run)),
		},
	};
}

/** Save actions for the current player. */
export function useSaveActions() {
	const qc = useQueryClient();
	const { key } = useSaveKey();
	return useMemo(() => {
		const update = (
			local: (data: SaveData) => SaveData,
			remote: () => Promise<SaveData>,
		) => {
			qc.setQueryData<SaveData>(key, (d) => local(d ?? empty()));
			remote()
				.then((saved) => qc.setQueryData(key, saved))
				.catch((err) =>
					console.warn("[stardrift] progress not saved to server", err),
				);
		};
		return {
			saveProgress: (dateKey: string, run: RunProgress) =>
				update(
					(d) => withProgress(d, dateKey, run),
					() => api.saveProgress({ data: { date: dateKey, run } }),
				),
			recordDaily: (dateKey: string, run: RunProgress) =>
				update(
					(d) => withDaily(d, dateKey, run),
					() => api.recordDaily({ data: { date: dateKey, run } }),
				),
			recordUnlimited: (run: RunProgress) =>
				update(
					(d) => withUnlimited(d, run),
					() => api.recordUnlimited({ data: run }),
				),
		};
	}, [qc, key]);
}

export function streaks(data: SaveData, today: string) {
	const played = (k: string) => Boolean(data.daily[k]);
	// current streak may start today or yesterday (today not played yet)
	let cursor = played(today) ? today : addDays(today, -1);
	let current = 0;
	while (played(cursor)) {
		current++;
		cursor = addDays(cursor, -1);
	}
	const keys = Object.keys(data.daily).sort();
	let best = 0;
	let run = 0;
	let prev: string | null = null;
	for (const k of keys) {
		run = prev && addDays(prev, 1) === k ? run + 1 : 1;
		best = Math.max(best, run);
		prev = k;
	}
	return { current, best };
}
