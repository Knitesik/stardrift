import { useEffect, useRef } from "react";
import { type FlightStep, TIER_BY_ID, totalAltitude } from "#/game/rarity";
import {
	MARKER,
	MARKER_MISS,
	METEORS,
	preloadSprites,
	SATELLITES,
	SHIP,
	SPARKLES,
	STATIONS,
	sprite,
	tintedSprite,
} from "./sprites";

export type FlightMode = "idle" | "play" | "overview";

/** Another player's ship in a party. */
export interface FleetShip {
	id: string;
	name: string;
	/** sprite name from src/assets, e.g. "ship_H" */
	ship: string;
	altitude: number;
	connected: boolean;
}

interface FlightCanvasProps {
	steps: FlightStep[];
	mode: FlightMode;
	/** waiting on the server: the ship idles nervously */
	pending?: boolean;
	/** sprite for your own ship (defaults to SHIP) */
	shipSprite?: string;
	/** your name tag, shown when other ships are around */
	shipName?: string;
	/** other players flying alongside you */
	fleet?: FleetShip[];
}

/* ───────── scenery data ───────── */

/** Sky colours by altitude (km): [alt, top, bottom] */
const SKY: [number, string, string][] = [
	[0, "#3f6fc2", "#f2b58a"],
	[60, "#27479a", "#7a83c9"],
	[200, "#141d55", "#2b3a86"],
	[600, "#080b2a", "#141a4a"],
	[1500, "#04051a", "#090b26"],
	[4000, "#03030f", "#0a0718"],
	[7000, "#07031a", "#150a2e"],
];

const BANDS: [number, string][] = [
	[100, "Kármán line"],
	[400, "Low orbit"],
	[2000, "High orbit"],
	[3400, "The drift"],
	[6000, "Deep field"],
	[9000, "Nebula reach"],
];

const DRIFT_FROM = 3000;
const DRIFT_TO = 4200;

function hexToRgb(hex: string) {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
	const x = hexToRgb(a);
	const y = hexToRgb(b);
	const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function skyAt(alt: number): [string, string] {
	if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
	for (let i = 1; i < SKY.length; i++) {
		if (alt <= SKY[i][0]) {
			const [a0, t0, b0] = SKY[i - 1];
			const [a1, t1, b1] = SKY[i];
			const t = (alt - a0) / (a1 - a0);
			return [mix(t0, t1, t), mix(b0, b1, t)];
		}
	}
	const last = SKY[SKY.length - 1];
	return [last[1], last[2]];
}

/** Deterministic pseudo-random so scenery is stable between renders. */
function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

interface Star {
	x: number;
	y: number;
	r: number;
	/** twinkle group: stars in a group share a phase so they draw as one path */
	tw: number;
	/** index into SPARKLES for the bright ones, -1 for plain dots */
	sparkle: number;
}
interface Rock {
	x: number;
	alt: number;
	r: number;
	spin: number;
	speed: number;
	sides: number[];
	sprite: string;
}
interface Decor {
	x: number;
	alt: number;
	size: number;
	sprite: string;
	speed: number;
}
interface Blob {
	x: number;
	alt: number;
	r: number;
	color: string;
}
interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	max: number;
	size: number;
}

function makeScenery() {
	const rand = seeded(42);
	const stars: Star[][] = [0.15, 0.4, 0.8].map(() =>
		Array.from({ length: 110 }, () => ({
			x: rand(),
			y: rand(),
			r: 0.4 + rand() * 1.1,
			tw: Math.floor(rand() * TWINKLE_GROUPS),
			sparkle: rand() < 0.07 ? Math.floor(rand() * SPARKLES.length) : -1,
		})),
	);
	const rocks: Rock[] = Array.from({ length: 70 }, () => ({
		x: rand(),
		alt: DRIFT_FROM + rand() * (DRIFT_TO - DRIFT_FROM),
		r: 3 + rand() ** 3 * 22,
		spin: rand() * Math.PI * 2,
		speed: (rand() - 0.5) * 0.02,
		sides: Array.from({ length: 7 }, () => 0.7 + rand() * 0.35),
		sprite: METEORS[Math.floor(rand() * METEORS.length)],
	}));
	const decor: Decor[] = [
		...SATELLITES.map((name, i) => ({
			x: [0.18, 0.78, 0.3, 0.86][i],
			alt: 280 + i * 110,
			size: 30,
			sprite: name,
			speed: (i % 2 ? 1 : -1) * 0.006,
		})),
		...STATIONS.map((name, i) => ({
			x: [0.2, 0.8, 0.5][i],
			alt: 1700 + i * 260,
			size: 54,
			sprite: name,
			speed: (i % 2 ? -1 : 1) * 0.003,
		})),
	];
	const palette = ["#7a4dff", "#ff5fa8", "#3fc4d8", "#ffb35c"];
	const blobs: Blob[] = Array.from({ length: 14 }, (_, i) => ({
		x: rand(),
		alt: 6200 + rand() * 9000,
		r: 180 + rand() * 320,
		color: palette[i % palette.length],
	}));
	return { stars, rocks, blobs, decor };
}

/** Stars twinkle in this many shared phases (one fill per group, not per star). */
const TWINKLE_GROUPS = 4;

/** Highest pixel ratio we draw at: the scene is soft, and Retina 2x quadruples the fill cost. */
const MAX_DPR = 1.5;

/** Frame budgets: full rate while something moves, a calm rate otherwise. */
const BUSY_MS = 1000 / 40;
const CALM_MS = 1000 / 30;
const STILL_MS = 250;

/** One soft radial glow per colour, drawn once and stamped as an image. */
function makeBlobSprites(colors: string[]) {
	const out = new Map<string, HTMLCanvasElement>();
	for (const color of colors) {
		const c = document.createElement("canvas");
		c.width = c.height = 128;
		const g = c.getContext("2d");
		if (!g) continue;
		const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		grad.addColorStop(0, `${color}33`);
		grad.addColorStop(1, `${color}00`);
		g.fillStyle = grad;
		g.fillRect(0, 0, 128, 128);
		out.set(color, c);
	}
	return out;
}

/* ───────── component ───────── */

export function FlightCanvas({
	steps,
	mode,
	pending = false,
	shipSprite,
	shipName,
	fleet,
}: FlightCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const props = useRef({ steps, mode, pending, shipSprite, shipName, fleet });
	props.current = { steps, mode, pending, shipSprite, shipName, fleet };

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
		preloadSprites();
		const scenery = makeScenery();
		const blobSprites = makeBlobSprites([
			...new Set(scenery.blobs.map((b) => b.color)),
		]);
		const particles: Particle[] = [];
		const markerBirth = new Map<string, number>();
		/** eased altitude of each other ship */
		const fleetAlt = new Map<string, number>();

		let W = 0;
		let H = 0;
		let dpr = 1;
		const resize = () => {
			dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
			W = canvas.clientWidth;
			H = canvas.clientHeight;
			canvas.width = Math.round(W * dpr);
			canvas.height = Math.round(H * dpr);
		};
		resize();
		window.addEventListener("resize", resize);

		// camera + ship state (eased each frame)
		let shipAlt = totalAltitude(props.current.steps);
		let groundY = 0;
		let scale = 0;
		let first = true;
		let last = performance.now();
		let raf = 0;
		/** whether the last drawn frame had anything moving fast (see `frame`) */
		let busy = true;
		/** fractional particles owed, so emission is per second, not per frame */
		let spawnDebt = 0;

		const targets = () => {
			const { mode: m, steps: s, fleet: f } = props.current;
			const total = Math.max(
				totalAltitude(s),
				...(f ?? []).map((x) => x.altitude),
			);
			const playScale = H / 2600;
			if (m === "overview") {
				const sc = (H * 0.62) / Math.max(total, 700);
				return { scale: sc, groundY: H * 0.88 };
			}
			if (m === "idle") return { scale: playScale, groundY: H * 0.8 };
			return { scale: playScale, groundY: H * 0.6 + shipAlt * playScale };
		};

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			const still = reduce.matches;
			// The display may refresh at 120 Hz; we don't need to. Draw at 60 fps
			// while the ship, camera or effects are moving, 30 fps when only the
			// scenery drifts, and a few times a second with reduced motion (just
			// enough to pick up new answers).
			const budget = still ? STILL_MS : busy ? BUSY_MS : CALM_MS;
			if (now - last < budget - 2) return;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const { steps: s, pending: isPending, mode: m } = props.current;
			const total = totalAltitude(s);

			// ship climbs toward its total altitude
			const prevAlt = shipAlt;
			shipAlt = still
				? total
				: shipAlt + (total - shipAlt) * (1 - Math.exp(-dt * 2.2));
			if (Math.abs(total - shipAlt) < 0.5) shipAlt = total;
			const climbRate = (shipAlt - prevAlt) / Math.max(dt, 1e-3);

			const tg = targets();
			if (first || still) {
				groundY = tg.groundY;
				scale = tg.scale;
				first = false;
			} else {
				const k = 1 - Math.exp(-dt * (m === "overview" ? 1.6 : 4));
				scale += (tg.scale - scale) * k;
				groundY += (tg.groundY - groundY) * k;
			}
			const yOf = (alt: number) => groundY - alt * scale;
			const viewAlt = Math.max(0, (groundY - H * 0.5) / scale);

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// sky
			const [top, bottom] = skyAt(viewAlt);
			const sky = ctx.createLinearGradient(0, 0, 0, H);
			sky.addColorStop(0, top);
			sky.addColorStop(1, bottom);
			ctx.fillStyle = sky;
			ctx.fillRect(0, 0, W, H);

			// nebula blobs
			for (const b of scenery.blobs) {
				const y = yOf(b.alt);
				const r = b.r * Math.max(0.6, Math.min(1.4, scale * 600));
				if (y < -r || y > H + r) continue;
				const glow = blobSprites.get(b.color);
				if (glow) ctx.drawImage(glow, b.x * W - r, y - r, r * 2, r * 2);
			}

			// stars (parallax layers fade in as the air thins)
			const starAlpha = Math.min(1, Math.max(0, (viewAlt - 15) / 400));
			if (starAlpha > 0) {
				ctx.fillStyle = "#fff";
				scenery.stars.forEach((layer, li) => {
					const f = [0.15, 0.4, 0.8][li];
					const yAt = (st: Star) =>
						(((st.y * H + groundY * f + now * 0.004 * f) % H) + H) % H;
					for (let g = 0; g < TWINKLE_GROUPS; g++) {
						const tw = still
							? 1
							: 0.6 +
								0.4 *
									Math.sin(now / 700 + (g * Math.PI * 2) / TWINKLE_GROUPS + li);
						ctx.globalAlpha = starAlpha * tw * (0.5 + li * 0.25);
						// plain dots in this group: one path, one fill
						ctx.beginPath();
						for (const st of layer) {
							if (st.tw !== g || st.sparkle >= 0) continue;
							const x = st.x * W;
							const y = yAt(st);
							const r = st.r * (0.7 + li * 0.3);
							ctx.moveTo(x + r, y);
							ctx.arc(x, y, r, 0, Math.PI * 2);
						}
						ctx.fill();
						// the few bright sparkles are sprites
						for (const st of layer) {
							if (st.tw !== g || st.sparkle < 0) continue;
							const spark = sprite(SPARKLES[st.sparkle]);
							if (!spark) continue;
							const size = 10 + li * 6;
							ctx.drawImage(
								spark,
								st.x * W - size / 2,
								yAt(st) - size / 2,
								size,
								size,
							);
						}
					}
				});
				ctx.globalAlpha = 1;
			}

			// altitude bands
			ctx.font = "600 10px Inter, system-ui, sans-serif";
			ctx.textAlign = "right";
			for (const [alt, label] of BANDS) {
				const y = yOf(alt);
				if (y < -20 || y > H + 20) continue;
				ctx.strokeStyle = "rgba(255,255,255,0.08)";
				ctx.setLineDash([4, 8]);
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(W, y);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.fillStyle = "rgba(200,205,240,0.55)";
				ctx.fillText(
					`${label.toUpperCase()} · ${alt.toLocaleString("en-US")} KM`,
					W - 14,
					y - 6,
				);
			}

			// satellites and stations along the way
			for (const d of scenery.decor) {
				const y = yOf(d.alt);
				const img = sprite(d.sprite);
				if (!img || y < -60 || y > H + 60) continue;
				const x = (((d.x + (still ? 0 : now * d.speed * 0.001)) % 1) + 1) % 1;
				ctx.globalAlpha = 0.85;
				ctx.drawImage(img, x * W - d.size / 2, y - d.size / 2, d.size, d.size);
				ctx.globalAlpha = 1;
			}

			// asteroid drift
			for (const r of scenery.rocks) {
				const y = yOf(r.alt);
				if (y < -40 || y > H + 40) continue;
				const x = (((r.x + (still ? 0 : now * r.speed * 0.001)) % 1) + 1) % 1;
				ctx.save();
				ctx.translate(x * W, y);
				ctx.rotate(r.spin + (still ? 0 : now * r.speed * 0.01));
				const rockImg = sprite(r.sprite);
				if (rockImg) {
					const size = r.r * 3;
					ctx.globalAlpha = 0.9;
					ctx.drawImage(rockImg, -size / 2, -size / 2, size, size);
					ctx.globalAlpha = 1;
					ctx.restore();
					continue;
				}
				ctx.fillStyle = "#4b4466";
				ctx.strokeStyle = "#6e6690";
				ctx.lineWidth = 1;
				ctx.beginPath();
				r.sides.forEach((k, i) => {
					const a = (i / r.sides.length) * Math.PI * 2;
					const px = Math.cos(a) * r.r * k;
					const py = Math.sin(a) * r.r * k;
					if (i === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				});
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			// home planet below
			const g0 = yOf(0);
			if (g0 < H + 600) {
				const R = Math.max(W, 900) * 2.2;
				const cx = W / 2;
				const cy = g0 + R;
				const glow = ctx.createRadialGradient(
					cx,
					cy,
					R * 0.98,
					cx,
					cy,
					R * 1.08,
				);
				glow.addColorStop(0, "rgba(120,180,255,0.55)");
				glow.addColorStop(1, "rgba(120,180,255,0)");
				ctx.fillStyle = glow;
				ctx.beginPath();
				ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
				ctx.fill();
				const land = ctx.createLinearGradient(0, g0, 0, g0 + 260);
				land.addColorStop(0, "#3d6fd1");
				land.addColorStop(0.25, "#1f3f8a");
				land.addColorStop(1, "#0b1838");
				ctx.fillStyle = land;
				ctx.beginPath();
				ctx.arc(cx, cy, R, 0, Math.PI * 2);
				ctx.fill();
				// launch pad
				ctx.fillStyle = "#1a2550";
				ctx.fillRect(cx - 46, g0 - 6, 92, 8);
				ctx.fillStyle = "#2b3a75";
				ctx.fillRect(cx + 26, g0 - 70, 6, 66);
				for (let i = 0; i < 6; i++)
					ctx.fillRect(cx + 18, g0 - 64 + i * 11, 14, 2);
			}

			// contrail from the pad up to the ship
			const shipY = yOf(shipAlt);
			const trail = ctx.createLinearGradient(0, Math.max(g0, 0), 0, shipY);
			trail.addColorStop(0, "rgba(245,198,107,0)");
			trail.addColorStop(1, "rgba(245,198,107,0.45)");
			ctx.strokeStyle = trail;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(W / 2, Math.min(g0, H + 10));
			ctx.lineTo(W / 2, shipY + 30);
			ctx.stroke();

			// answer markers
			let running = 0;
			s.forEach((step, i) => {
				running += step.climbKm;
				if (running > shipAlt + 1) return; // appears as the ship passes
				const key = `${step.promptId}:${i}`;
				if (!markerBirth.has(key)) markerBirth.set(key, now);
				const age = (now - (markerBirth.get(key) ?? now)) / 1000;
				const pop = still ? 1 : Math.min(1, age / 0.5);
				const y = yOf(running);
				if (y < -40 || y > H + 40) return;
				const side = i % 2 === 0 ? -1 : 1;
				const reach = Math.min(W * 0.28, 90 + (i % 3) * 26);
				const x = W / 2 + side * reach;
				const tier = step.tier ? TIER_BY_ID[step.tier] : null;
				const color = tier?.color ?? "#6b6f99";

				ctx.globalAlpha = pop;
				ctx.strokeStyle = `${color}66`;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(W / 2, y);
				ctx.lineTo(x, y);
				ctx.stroke();

				const pulse = still ? 1 : 1 + 0.15 * Math.sin(now / 400 + i);
				const r = (tier ? 7 : 4) * pulse * (0.4 + 0.6 * pop);
				if (tier) {
					const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
					halo.addColorStop(0, `${color}88`);
					halo.addColorStop(1, `${color}00`);
					ctx.fillStyle = halo;
					ctx.beginPath();
					ctx.arc(x, y, r * 4, 0, Math.PI * 2);
					ctx.fill();
				}
				const icon = tintedSprite(tier ? MARKER : MARKER_MISS, color);
				if (icon) {
					const size = (tier ? 34 : 20) * pulse * (0.4 + 0.6 * pop);
					ctx.drawImage(icon, x - size / 2, y - size / 2, size, size);
				} else {
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.fill();
				}

				ctx.textAlign = side < 0 ? "right" : "left";
				ctx.font = "700 12px Inter, system-ui, sans-serif";
				ctx.fillStyle = "#f3eedf";
				const tx = x + side * 14;
				ctx.fillText(step.answer ?? "out of time", tx, y - 2);
				if (tier) {
					ctx.font = "600 10px Inter, system-ui, sans-serif";
					ctx.fillStyle = color;
					ctx.fillText(
						`${tier.name.toUpperCase()} +${tier.climbKm}`,
						tx,
						y + 12,
					);
				}
				ctx.globalAlpha = 1;
			});

			// engine particles
			const burning = climbRate > 15 || isPending;
			if (!still) {
				// 360/s while burning, a 60/s idle trickle (6 and 1 per frame at 60 fps)
				spawnDebt += (burning ? 360 : m === "idle" ? 0 : 60) * dt;
				const spawn = Math.floor(spawnDebt);
				spawnDebt -= spawn;
				for (let i = 0; i < spawn; i++) {
					particles.push({
						x: W / 2 + (Math.random() - 0.5) * 8,
						y: shipY + 26,
						vx: (Math.random() - 0.5) * 40,
						vy: 80 + Math.random() * (burning ? 220 : 60),
						life: 0,
						max: 0.5 + Math.random() * 0.6,
						size: 2 + Math.random() * (burning ? 4 : 2),
					});
				}
			}
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.life += dt;
				if (p.life > p.max) {
					particles.splice(i, 1);
					continue;
				}
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				const t = p.life / p.max;
				ctx.globalAlpha = (1 - t) * 0.9;
				ctx.fillStyle = t < 0.3 ? "#fff3cf" : t < 0.6 ? "#ffb547" : "#ff6a3d";
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;

			// other players' ships, in lanes either side of yours
			const others = props.current.fleet ?? [];
			if (others.length) {
				const gap = Math.min(110, W / (others.length + 2));
				others.forEach((o, i) => {
					const target = o.altitude;
					const prev = fleetAlt.get(o.id) ?? target;
					const alt = still
						? target
						: prev + (target - prev) * (1 - Math.exp(-dt * 2.2));
					fleetAlt.set(o.id, Math.abs(target - alt) < 0.5 ? target : alt);
					const lane = Math.floor(i / 2) + 1;
					const x = W / 2 + (i % 2 === 0 ? -1 : 1) * lane * gap;
					const y = yOf(alt);
					if (y < -60 || y > H + 60) return;
					ctx.globalAlpha = o.connected ? 1 : 0.35;
					const img = sprite(o.ship);
					if (img) ctx.drawImage(img, x - 20, y - 24, 40, 40);
					ctx.font = "700 11px Inter, system-ui, sans-serif";
					ctx.textAlign = "center";
					ctx.fillStyle = "rgba(243,238,223,0.9)";
					ctx.fillText(o.name, x, y + 32);
					ctx.font = "600 10px Inter, system-ui, sans-serif";
					ctx.fillStyle = "rgba(163,166,196,0.9)";
					ctx.fillText(
						`${Math.round(alt).toLocaleString("en-US")} km`,
						x,
						y + 45,
					);
					ctx.globalAlpha = 1;
				});
				for (const id of fleetAlt.keys()) {
					if (!others.some((o) => o.id === id)) fleetAlt.delete(id);
				}
			}

			// Anything moving fast enough to need 60 fps next frame?
			busy =
				burning ||
				Math.abs(total - shipAlt) > 0.5 ||
				Math.abs(tg.groundY - groundY) > 0.5 ||
				Math.abs(tg.scale - scale) > tg.scale * 0.002 ||
				[...markerBirth.values()].some((t) => now - t < 600) ||
				[...fleetAlt.entries()].some(
					([id, a]) =>
						Math.abs((others.find((o) => o.id === id)?.altitude ?? a) - a) >
						0.5,
				);

			// the ship
			const wobble = still ? 0 : Math.sin(now / 600) * (isPending ? 2.5 : 1);
			const tilt = still ? 0 : Math.sin(now / 900) * 0.03;
			ctx.save();
			ctx.translate(W / 2 + wobble, shipY);
			ctx.rotate(tilt);
			const shipImg = sprite(props.current.shipSprite ?? SHIP);
			if (shipImg) {
				ctx.drawImage(shipImg, -28, -34, 56, 56);
				if (others.length && props.current.shipName) {
					ctx.font = "800 12px Inter, system-ui, sans-serif";
					ctx.textAlign = "center";
					ctx.fillStyle = "#f5c66b";
					ctx.fillText(`${props.current.shipName} (you)`, 0, 40);
				}
				ctx.restore();
				return;
			}
			const flame = still ? 10 : (burning ? 34 : 12) + Math.random() * 6;
			const fg = ctx.createLinearGradient(0, 18, 0, 18 + flame);
			fg.addColorStop(0, "#fff6d8");
			fg.addColorStop(0.4, "#ffb547");
			fg.addColorStop(1, "rgba(255,90,60,0)");
			ctx.fillStyle = fg;
			ctx.beginPath();
			ctx.moveTo(-7, 18);
			ctx.quadraticCurveTo(0, 18 + flame * 1.2, 7, 18);
			ctx.fill();
			// fins
			ctx.fillStyle = "#e0a347";
			ctx.beginPath();
			ctx.moveTo(-11, 4);
			ctx.lineTo(-19, 20);
			ctx.lineTo(-10, 17);
			ctx.closePath();
			ctx.moveTo(11, 4);
			ctx.lineTo(19, 20);
			ctx.lineTo(10, 17);
			ctx.closePath();
			ctx.fill();
			// body
			ctx.fillStyle = "#f3eedf";
			ctx.beginPath();
			ctx.moveTo(0, -30);
			ctx.bezierCurveTo(13, -18, 12, 4, 10, 18);
			ctx.lineTo(-10, 18);
			ctx.bezierCurveTo(-12, 4, -13, -18, 0, -30);
			ctx.fill();
			// nose
			ctx.fillStyle = "#f5c66b";
			ctx.beginPath();
			ctx.moveTo(0, -30);
			ctx.bezierCurveTo(6, -25, 8, -20, 8.5, -17);
			ctx.lineTo(-8.5, -17);
			ctx.bezierCurveTo(-8, -20, -6, -25, 0, -30);
			ctx.fill();
			// window
			ctx.fillStyle = "#26306e";
			ctx.strokeStyle = "#f5c66b";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(0, -4, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		};

		const onVisibility = () => {
			cancelAnimationFrame(raf);
			if (!document.hidden) {
				// draw on the very next frame, then resume normal pacing
				last = performance.now() - STILL_MS;
				raf = requestAnimationFrame(frame);
			}
		};
		document.addEventListener("visibilitychange", onVisibility);
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="fixed inset-0 h-full w-full"
			role="img"
			aria-label={`Your ship at ${Math.round(totalAltitude(steps)).toLocaleString("en-US")} km, with ${steps.length} answer markers`}
		/>
	);
}
