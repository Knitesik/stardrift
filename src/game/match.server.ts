/**
 * Server-only fuzzy matching of typed answers to accepted answers.
 * Pure: indexes are built from answer lists loaded by challenges.server.ts.
 */

export interface AnswerListInput {
	/** in popularity order (rank 0 first) */
	answers: { canonical: string; aliases: string[] }[];
	/** accept a person's surname alone (e.g. "Curie") */
	surnames: boolean;
	/** filler words to ignore, e.g. "sea" in "Red Sea" */
	dropWords: string[];
}

export interface MatchIndex {
	/** canonical names in popularity order */
	canonicals: string[];
	/** normalized key → canonical */
	keys: Map<string, string>;
	dropWords: Set<string>;
}

const ARTICLES = new Set(["the", "a", "an"]);

function baseNormalize(s: string) {
	return s
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['’`]/g, "")
		.replace(/\+/g, " plus ")
		.replace(/#/g, " sharp ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function singular(word: string) {
	if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
	if (word.length > 4 && /(ches|shes|xes|ses|zes)$/.test(word))
		return word.slice(0, -2);
	if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
		return word.slice(0, -1);
	return word;
}

export function normalize(s: string, dropWords: Set<string>) {
	const words = baseNormalize(s)
		.split(" ")
		.filter((w) => w && !ARTICLES.has(w) && !dropWords.has(w))
		.map(singular);
	return words.join(" ");
}

export function buildIndex(list: AnswerListInput): MatchIndex {
	const dropWords = new Set(list.dropWords.map((w) => baseNormalize(w)));
	const keys = new Map<string, string>();
	const canonicals: string[] = [];
	for (const { canonical, aliases } of list.answers) {
		canonicals.push(canonical);
		for (const form of [canonical, ...aliases]) {
			const key = normalize(form, dropWords);
			if (key && !keys.has(key)) keys.set(key, canonical);
			// also match when filler words are kept ("Red Sea" vs "Red")
			const raw = baseNormalize(form);
			if (raw && !keys.has(raw)) keys.set(raw, canonical);
		}
		if (list.surnames) {
			const parts = baseNormalize(canonical).split(" ");
			const last = parts[parts.length - 1];
			if (parts.length > 1 && last.length > 2 && !keys.has(last))
				keys.set(last, canonical);
		}
	}
	return { canonicals, keys, dropWords };
}

/** Edit distance where swapping two adjacent letters counts as one typo. */
function editDistance(a: string, b: string, max: number) {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			let v = Math.min(
				prev[j] + 1,
				cur[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, prev2[j - 2] + 1);
			}
			cur.push(v);
			rowMin = Math.min(rowMin, v);
		}
		if (rowMin > max) return max + 1;
		prev2 = prev;
		prev = cur;
	}
	return prev[b.length];
}

function allowedTypos(len: number) {
	if (len <= 4) return 0;
	if (len <= 8) return 1;
	return 2;
}

/** Returns the canonical answer for a typed guess, or null if not accepted. */
export function matchWith(idx: MatchIndex, typed: string): string | null {
	const key = normalize(typed, idx.dropWords);
	if (!key) return null;
	const exact = idx.keys.get(key) ?? idx.keys.get(baseNormalize(typed));
	if (exact) return exact;

	const max = allowedTypos(key.length);
	if (max === 0) return null;
	let best: string | null = null;
	let bestDist = max + 1;
	let tie = false;
	for (const [k, canonical] of idx.keys) {
		const d = editDistance(key, k, max);
		if (d < bestDist) {
			bestDist = d;
			best = canonical;
			tie = false;
		} else if (d === bestDist && canonical !== best) {
			tie = true;
		}
	}
	return bestDist <= max && !tie ? best : null;
}
