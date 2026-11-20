/**
 * Rarity model shared by client and server.
 *
 * Rarity = the share of all accepted answers to a prompt that match yours.
 * The fewer players who said the same thing, the higher the ship climbs.
 */

export type TierId = "stardust" | "comet" | "nebula" | "pulsar" | "supernova";

export interface Tier {
	id: TierId;
	name: string;
	/** kilometres climbed */
	climbKm: number;
	/** upper bound (exclusive) on the share of players who gave this answer */
	maxShare: number;
	color: string;
	blurb: string;
}

/** Ordered from most common to rarest. */
export const TIERS: Tier[] = [
	{
		id: "stardust",
		name: "Stardust",
		climbKm: 120,
		maxShare: 1.01,
		color: "#c9cbe6",
		blurb: "The answer on everyone’s lips.",
	},
	{
		id: "comet",
		name: "Comet",
		climbKm: 300,
		maxShare: 0.25,
		color: "#7fd8e8",
		blurb: "Popular, but not the obvious pick.",
	},
	{
		id: "nebula",
		name: "Nebula",
		climbKm: 600,
		maxShare: 0.1,
		color: "#b48cff",
		blurb: "Off the beaten orbit.",
	},
	{
		id: "pulsar",
		name: "Pulsar",
		climbKm: 1000,
		maxShare: 0.04,
		color: "#ff8fc7",
		blurb: "A rare signal. Few players went here.",
	},
	{
		id: "supernova",
		name: "Supernova",
		climbKm: 1600,
		maxShare: 0.01,
		color: "#ffd36b",
		blurb: "Almost nobody else said this.",
	},
];

export const TIER_BY_ID = Object.fromEntries(
	TIERS.map((t) => [t.id, t]),
) as Record<TierId, Tier>;

export function tierForShare(share: number): Tier {
	let found = TIERS[0];
	for (const t of TIERS) if (share < t.maxShare) found = t;
	return found;
}

/** One prompt's outcome on the flight path. */
export interface FlightStep {
	promptId: string;
	/** the accepted answer as canonically spelled; null on timeout */
	answer: string | null;
	/** share of answers matching this one (0–1); null on timeout */
	share: number | null;
	tier: TierId | null;
	climbKm: number;
	/** real players counted for this prompt, including this answer */
	players: number;
	/** true when the server couldn't be reached */
	estimated: boolean;
}

export function totalAltitude(steps: FlightStep[]) {
	return steps.reduce((km, s) => km + s.climbKm, 0);
}

export function formatKm(km: number) {
	return `${Math.round(km).toLocaleString("en-US")} km`;
}

export function formatShare(share: number) {
	const pct = share * 100;
	if (pct < 1) return "<1%";
	return `${Math.round(pct)}%`;
}
