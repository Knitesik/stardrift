/**
 * Sprite sheet for the flight scene, loaded from src/assets.
 * Images load lazily in the browser; callers fall back to vector drawing
 * until a sprite is ready.
 */
const urls = import.meta.glob("../../assets/*.png", {
	eager: true,
	import: "default",
}) as Record<string, string>;

/** "ship_J" → URL */
export const SPRITE_URL: Record<string, string> = Object.fromEntries(
	Object.entries(urls).map(([path, url]) => [
		path
			.split("/")
			.pop()
			?.replace(/\.png$/, "") ?? path,
		url,
	]),
);

export const SHIP = "ship_J";
export const EXHAUST = "effect_yellow";
export const EXHAUST_PENDING = "effect_purple";
export const METEORS = [
	"meteor_large",
	"meteor_small",
	"meteor_detailedLarge",
	"meteor_detailedSmall",
	"meteor_squareLarge",
	"meteor_squareSmall",
	"meteor_squareDetailedLarge",
	"meteor_squareDetailedSmall",
];
export const SPARKLES = [
	"star_tiny",
	"star_small",
	"star_medium",
	"star_large",
];
export const SATELLITES = [
	"satellite_A",
	"satellite_B",
	"satellite_C",
	"satellite_D",
];
export const STATIONS = ["station_A", "station_B", "station_C"];
export const MARKER = "star_large";
export const MARKER_MISS = "icon_crossSmall";

const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();

/** Starts loading every sprite (browser only). */
export function preloadSprites() {
	if (typeof window === "undefined") return;
	for (const [name, url] of Object.entries(SPRITE_URL)) {
		if (images.has(name)) continue;
		const img = new Image();
		img.decoding = "async";
		img.src = url;
		images.set(name, img);
	}
}

/** The loaded image, or null while it's still loading. */
export function sprite(name: string): HTMLImageElement | null {
	const img = images.get(name);
	return img?.complete && img.naturalWidth > 0 ? img : null;
}

/** A copy of the sprite recoloured to `color` (cached). */
export function tintedSprite(
	name: string,
	color: string,
): HTMLCanvasElement | null {
	const key = `${name}|${color}`;
	const hit = tinted.get(key);
	if (hit) return hit;
	const img = sprite(name);
	if (!img) return null;
	const c = document.createElement("canvas");
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const g = c.getContext("2d");
	if (!g) return null;
	g.drawImage(img, 0, 0);
	g.globalCompositeOperation = "source-in";
	g.fillStyle = color;
	g.fillRect(0, 0, c.width, c.height);
	tinted.set(key, c);
	return c;
}
