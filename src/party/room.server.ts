/**
 * Server-side party room: a small state machine.
 *
 * lobby → countdown → prompt → reveal → prompt … → results → (again) countdown
 *
 * The room never talks to sockets directly. The WebSocket handler calls its
 * methods, then sends each player `view(playerId)`. Matching, scoring and the
 * clock are injected so the room can be tested without a database.
 */
import type { Prompt } from "#/game/prompts";
import type { FlightStep } from "#/game/rarity";
import {
	CODE_ALPHABET,
	CODE_LENGTH,
	COUNTDOWN_MS,
	LONE_BONUS,
	LONE_MIN_PLAYERS,
	MAX_PLAYERS,
	PARTY_SHIPS,
	type PartyPhase,
	type PartyStep,
	PROMPT_MS,
	REVEAL_MS,
	type RoomView,
} from "./protocol";

export interface RoomDeps {
	now(): number;
	newId(): string;
	newToken(): string;
	pickRound(seed: string): Promise<Prompt[]>;
	/** canonical answer, or null if not accepted */
	match(promptId: string, text: string): Promise<string | null>;
	/**
	 * Records every answer in the global tallies and returns the global
	 * rarity step for each distinct canonical answer.
	 */
	score(
		promptId: string,
		answers: string[],
	): Promise<Record<string, FlightStep>>;
	/** a game just reached its results (for the match log) */
	gameOver?(room: Room): void;
}

interface PlayerState {
	id: string;
	token: string;
	name: string;
	ship: string;
	connected: boolean;
	disconnectedAt: number | null;
	flight: PartyStep[];
}

/** hand the host role over after the host has been gone this long */
const HOST_GRACE_MS = 10_000;
/** forget rooms nobody has been connected to for this long */
const EMPTY_TTL_MS = 5 * 60_000;

export type JoinResult =
	| { ok: true; player: PlayerState; reconnected: boolean }
	| { ok: false; code: "full" | "started" };

export function makeCode(rand: () => number = Math.random) {
	let s = "";
	for (let i = 0; i < CODE_LENGTH; i++) {
		s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
	}
	return s;
}

export class Room {
	readonly code: string;
	phase: PartyPhase = "lobby";
	game = 0;
	hostId: string | null = null;
	readonly players = new Map<string, PlayerState>();
	round: Prompt[] = [];
	index = 0;
	phaseEndsAt: number | null = null;
	/** accepted answers for the current prompt: playerId → canonical */
	private answers = new Map<string, string>();
	private busy = false;
	private emptySince: number | null = null;

	constructor(
		code: string,
		private deps: RoomDeps,
	) {
		this.code = code;
	}

	/* ───────── membership ───────── */

	join(name: string, token?: string): JoinResult {
		if (token) {
			for (const p of this.players.values()) {
				if (p.token === token) {
					p.name = name || p.name;
					return { ok: true, player: p, reconnected: true };
				}
			}
		}
		if (this.phase !== "lobby" && this.phase !== "results") {
			return { ok: false, code: "started" };
		}
		if (this.players.size >= MAX_PLAYERS) return { ok: false, code: "full" };

		const used = new Set([...this.players.values()].map((p) => p.ship));
		const ship = PARTY_SHIPS.find((s) => !used.has(s)) ?? PARTY_SHIPS[0];
		const player: PlayerState = {
			id: this.deps.newId(),
			token: this.deps.newToken(),
			name,
			ship,
			connected: false,
			disconnectedAt: null,
			flight: [],
		};
		this.players.set(player.id, player);
		this.hostId ??= player.id;
		return { ok: true, player, reconnected: false };
	}

	setConnected(playerId: string, connected: boolean) {
		const p = this.players.get(playerId);
		if (!p) return;
		p.connected = connected;
		p.disconnectedAt = connected ? null : this.deps.now();
		if (connected && !this.hostConnected()) this.hostId = p.id;
	}

	leave(playerId: string) {
		this.players.delete(playerId);
		this.answers.delete(playerId);
		if (this.hostId === playerId) this.handOffHost();
	}

	private hostConnected() {
		return this.hostId
			? Boolean(this.players.get(this.hostId)?.connected)
			: false;
	}

	private handOffHost() {
		const next =
			[...this.players.values()].find((p) => p.connected) ??
			[...this.players.values()][0];
		this.hostId = next?.id ?? null;
	}

	private connectedPlayers() {
		return [...this.players.values()].filter((p) => p.connected);
	}

	/* ───────── game flow ───────── */

	async start(byId: string): Promise<"ok" | "not_host" | "wrong_phase"> {
		if (byId !== this.hostId) return "not_host";
		const startable = () =>
			!this.busy && (this.phase === "lobby" || this.phase === "results");
		if (!startable()) return "wrong_phase";
		this.busy = true;
		let round: Prompt[];
		try {
			round = await this.deps.pickRound(`party:${this.code}:${this.game + 1}`);
		} finally {
			this.busy = false;
		}
		if (!startable() || round.length === 0) return "wrong_phase";
		this.game += 1;
		this.round = round;
		this.index = 0;
		this.answers.clear();
		for (const p of this.players.values()) p.flight = [];
		this.phase = "countdown";
		this.phaseEndsAt = this.deps.now() + COUNTDOWN_MS;
		return "ok";
	}

	/** Returns the canonical answer, "rejected", or "ignored" (late/duplicate/wrong prompt). */
	async answer(
		byId: string,
		index: number,
		text: string,
	): Promise<string | "rejected" | "ignored"> {
		const open = () =>
			this.phase === "prompt" &&
			index === this.index &&
			this.players.has(byId) &&
			!this.answers.has(byId);
		if (!open()) return "ignored";
		const prompt = this.round[this.index];
		const canonical = await this.deps.match(prompt.id, text);
		if (!canonical) return "rejected";
		// the prompt may have closed while we were matching
		if (!open()) return "ignored";
		this.answers.set(byId, canonical);
		return canonical;
	}

	/** Advances timers. Resolves true when the room changed. */
	async tick(): Promise<boolean> {
		if (this.busy) return false;
		const now = this.deps.now();
		let changed = false;

		// host hand-off
		if (this.hostId) {
			const host = this.players.get(this.hostId);
			if (
				host &&
				!host.connected &&
				host.disconnectedAt !== null &&
				now - host.disconnectedAt > HOST_GRACE_MS &&
				this.connectedPlayers().length > 0
			) {
				this.handOffHost();
				changed = true;
			}
		}

		const ended = this.phaseEndsAt !== null && now >= this.phaseEndsAt;
		if (this.phase === "countdown" && ended) {
			this.beginPrompt();
			return true;
		}
		if (this.phase === "prompt") {
			const waiting = this.connectedPlayers().filter(
				(p) => !this.answers.has(p.id),
			);
			if (
				ended ||
				(waiting.length === 0 && this.connectedPlayers().length > 0)
			) {
				this.busy = true;
				try {
					await this.reveal();
				} finally {
					this.busy = false;
				}
				return true;
			}
		}
		if (this.phase === "reveal" && ended) {
			if (this.index + 1 >= this.round.length) {
				this.phase = "results";
				this.phaseEndsAt = null;
				this.deps.gameOver?.(this);
			} else {
				this.index += 1;
				this.beginPrompt();
			}
			return true;
		}
		return changed;
	}

	private beginPrompt() {
		this.answers.clear();
		this.phase = "prompt";
		this.phaseEndsAt = this.deps.now() + PROMPT_MS;
	}

	private async reveal() {
		const prompt = this.round[this.index];
		const answered = [...this.answers.values()];
		const global = answered.length
			? await this.deps.score(prompt.id, answered)
			: {};

		const sharedCount = new Map<string, number>();
		for (const c of answered) sharedCount.set(c, (sharedCount.get(c) ?? 0) + 1);
		const roomSize = this.players.size;

		for (const p of this.players.values()) {
			const canonical = this.answers.get(p.id);
			const base = canonical ? global[canonical] : undefined;
			if (!canonical || !base) {
				p.flight.push({
					promptId: prompt.id,
					answer: null,
					share: null,
					tier: null,
					climbKm: 0,
					players: 0,
					estimated: false,
					sharedWith: 0,
					effect: null,
					baseClimbKm: 0,
				});
				continue;
			}
			const k = sharedCount.get(canonical) ?? 1;
			let climb = base.climbKm;
			let effect: PartyStep["effect"] = null;
			if (k > 1) {
				climb = Math.round(base.climbKm / k);
				effect = "shared";
			} else if (roomSize >= LONE_MIN_PLAYERS) {
				climb = Math.round(base.climbKm * LONE_BONUS);
				effect = "lone";
			}
			p.flight.push({
				...base,
				climbKm: climb,
				sharedWith: k,
				effect,
				baseClimbKm: base.climbKm,
			});
		}
		this.phase = "reveal";
		this.phaseEndsAt = this.deps.now() + REVEAL_MS;
	}

	/* ───────── views ───────── */

	view(forId: string): RoomView {
		const showPrompt = this.phase === "prompt" || this.phase === "reveal";
		const prompt = showPrompt ? this.round[this.index] : null;
		return {
			code: this.code,
			phase: this.phase,
			you: forId,
			game: this.game,
			players: [...this.players.values()].map((p) => {
				const altitude = p.flight.reduce((km, s) => km + s.climbKm, 0);
				return {
					id: p.id,
					name: p.name,
					ship: p.ship,
					connected: p.connected,
					isHost: p.id === this.hostId,
					flight: p.flight,
					altitude,
					lockedIn: this.phase === "prompt" && this.answers.has(p.id),
				};
			}),
			prompt: prompt
				? {
						index: this.index,
						total: this.round.length,
						id: prompt.id,
						text: prompt.text,
						category: prompt.category,
						example: prompt.example,
					}
				: null,
			phaseEndsAt: this.phaseEndsAt,
			serverNow: this.deps.now(),
			yourAnswer:
				this.phase === "prompt" ? (this.answers.get(forId) ?? null) : null,
		};
	}

	/** true when the room can be forgotten */
	isAbandoned(): boolean {
		const now = this.deps.now();
		if (this.connectedPlayers().length > 0) {
			this.emptySince = null;
			return false;
		}
		this.emptySince ??= now;
		return this.players.size === 0 || now - this.emptySince > EMPTY_TTL_MS;
	}
}
