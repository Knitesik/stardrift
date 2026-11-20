import {
	type FlightStep,
	formatKm,
	type TierId,
	totalAltitude,
} from "./rarity";

export const ROUND_SIZE = 10;
/** Nights before this date were five prompts and stay that way. */
export const ROUND_SIZE_SINCE = "2026-11-17";
export const SECONDS_PER_PROMPT = 30;
/** First nightly flight. Archive goes back to here. */
export const EPOCH = "2026-11-01";

/** Names for how high a run reached. */
export const ORBITS = [
	"Launchpad",
	"Low orbit",
	"Moonrise",
	"High orbit",
	"The drift",
	"Outer reach",
	"Deep field",
	"Nebula reach",
] as const;

/** Minimum altitude (km) for each orbit name, scaled to a ten-prompt flight. */
const ORBIT_FLOORS = [0, 300, 1200, 3000, 6000, 9000, 12000, 15000];

export function orbitFor(km: number) {
	let name: (typeof ORBITS)[number] = ORBITS[0];
	ORBIT_FLOORS.forEach((floor, i) => {
		if (km >= floor) name = ORBITS[i];
	});
	return name;
}

/** yyyy-mm-dd for the viewer's local calendar day. */
export function localDateKey(d = new Date()) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function isDateKey(s: string) {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`))
	);
}

export function dayNumber(dateKey: string) {
	const ms =
		Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`);
	return Math.floor(ms / 86_400_000) + 1;
}

export function addDays(dateKey: string, delta: number) {
	const d = new Date(`${dateKey}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + delta);
	return d.toISOString().slice(0, 10);
}

/** The newest date that has started anywhere on Earth (UTC+14). */
export function latestOpenDate() {
	return new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10);
}

/** Every daily key from EPOCH up to and including `today`, newest first. */
export function archiveKeys(today: string) {
	const keys: string[] = [];
	for (let k = today; k >= EPOCH; k = addDays(k, -1)) keys.push(k);
	return keys;
}

export type AnswerMark = "hit" | "timeout";

const TIER_GLYPH: Record<TierId, string> = {
	stardust: "⚪",
	comet: "🔵",
	nebula: "🟣",
	pulsar: "🩷",
	supernova: "🌟",
};

export function shareText(opts: {
	label: string;
	flight: FlightStep[];
	url?: string;
}) {
	const km = totalAltitude(opts.flight);
	const glyphs = opts.flight
		.map((s) => (s.tier ? TIER_GLYPH[s.tier] : "⏳"))
		.join("");
	return [
		`Stardrift ${opts.label} — ${formatKm(km)} · ${orbitFor(km)}`,
		glyphs,
		opts.url,
	]
		.filter(Boolean)
		.join("\n");
}
