/**
 * Server-only: turns answer tallies into shares and tiers.
 */
import { getIndex } from "./challenges.server";
import {
	type FlightStep,
	TIER_BY_ID,
	type TierId,
	tierForShare,
} from "./rarity";

/**
 * Pseudo-counts by popularity rank, so the first players get sensible tiers.
 * The obvious answer starts around 30% (Stardust), the next few are Comet and
 * Nebula, and deep entries start under 1%. They total roughly 100 players,
 * so real tallies take over once a hundred or so people have answered.
 */
function priorForRank(rank: number) {
	return Math.max(0.2, 35 * 0.6 ** rank);
}

export interface Weighted {
	canonical: string;
	count: number;
	share: number;
}

/** Weighted share for every accepted answer of a prompt. */
export async function weightedShares(
	promptId: string,
	counts: Record<string, number>,
): Promise<{ rows: Weighted[]; players: number }> {
	const idx = await getIndex(promptId);
	if (!idx) return { rows: [], players: 0 };
	let total = 0;
	let players = 0;
	const raw = idx.canonicals.map((canonical, rank) => {
		const count = counts[canonical] ?? 0;
		const weight = count + priorForRank(rank);
		players += count;
		total += weight;
		return { canonical, count, weight };
	});
	return {
		players,
		rows: raw.map((r) => ({
			canonical: r.canonical,
			count: r.count,
			share: total ? r.weight / total : 0,
		})),
	};
}

export async function stepFor(
	promptId: string,
	canonical: string | null,
	counts: Record<string, number>,
): Promise<FlightStep> {
	if (canonical === null) {
		return {
			promptId,
			answer: null,
			share: null,
			tier: null,
			climbKm: 0,
			players: 0,
			estimated: false,
		};
	}
	const { rows, players } = await weightedShares(promptId, counts);
	const share = rows.find((r) => r.canonical === canonical)?.share ?? 0;
	const tier: TierId = tierForShare(share).id;
	return {
		promptId,
		answer: canonical,
		share,
		tier,
		climbKm: TIER_BY_ID[tier].climbKm,
		players,
		estimated: false,
	};
}
