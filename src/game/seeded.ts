/** Small deterministic helpers so the same seed always picks the same prompts. */

export function hashString(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** mulberry32 */
export function rng(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffle<T>(items: T[], rand: () => number) {
	const a = items.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Picks `size` items for a seed. Callers pass items in a stable order. */
export function seededPick<T>(items: T[], seed: string, size: number) {
	return shuffle(items, rng(hashString(seed))).slice(0, size);
}

/** The seed a night's round has always used. */
export function nightSeed(dateKey: string) {
	return `stardrift:${dateKey}`;
}
