/**
 * Party protocol shared by the browser and the room server.
 */
import { z } from "zod";
import type { FlightStep } from "#/game/rarity";

export const PARTY_PATH = "/_party";
export const MAX_PLAYERS = 10;
export const COUNTDOWN_MS = 3_000;
export const PROMPT_MS = 30_000;
export const REVEAL_MS = 7_000;
export const PARTY_ROUND_SIZE = 10;
/** a lone answer in a room this size or bigger earns the bonus */
export const LONE_MIN_PLAYERS = 3;
export const LONE_BONUS = 1.25;

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 5;

/** Ship sprites handed out in join order. */
export const PARTY_SHIPS = [
	"ship_J",
	"ship_H",
	"ship_E",
	"ship_A",
	"ship_I",
	"ship_B",
	"ship_C",
	"ship_D",
	"ship_F",
	"ship_G",
	"ship_K",
	"ship_L",
];

/* ───────── client → server ───────── */

const name = z
	.string()
	.trim()
	.min(1)
	.max(20)
	.transform((s) =>
		[...s].filter((ch) => (ch.codePointAt(0) ?? 0) >= 32).join(""),
	);
const code = z
	.string()
	.trim()
	.toUpperCase()
	.regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));

export const ClientMessage = z.discriminatedUnion("t", [
	z.object({
		t: z.literal("create"),
		name,
		token: z.string().max(64).optional(),
	}),
	z.object({
		t: z.literal("join"),
		code,
		name,
		token: z.string().max(64).optional(),
	}),
	z.object({ t: z.literal("start") }),
	z.object({
		t: z.literal("answer"),
		index: z.number().int().min(0).max(20),
		text: z.string().trim().min(1).max(80),
	}),
	z.object({ t: z.literal("again") }),
	z.object({ t: z.literal("leave") }),
	z.object({ t: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ───────── server → client ───────── */

export type PartyPhase =
	| "lobby"
	| "countdown"
	| "prompt"
	| "reveal"
	| "results";

/** How the party changed a player's climb this prompt. */
export type PartyEffect = "lone" | "shared" | null;

export interface PartyStep extends FlightStep {
	/** players in the room who gave the same answer (including this one) */
	sharedWith: number;
	effect: PartyEffect;
	/** climb before the party adjustment */
	baseClimbKm: number;
}

export interface PlayerView {
	id: string;
	name: string;
	ship: string;
	connected: boolean;
	isHost: boolean;
	/** revealed steps only */
	flight: PartyStep[];
	altitude: number;
	/** answered the current prompt (answer itself stays hidden until reveal) */
	lockedIn: boolean;
}

export interface PromptView {
	index: number;
	total: number;
	id: string;
	text: string;
	category: string;
	example: string;
}

export interface RoomView {
	code: string;
	phase: PartyPhase;
	you: string;
	players: PlayerView[];
	prompt: PromptView | null;
	/** epoch ms when the current phase ends (countdown / prompt / reveal) */
	phaseEndsAt: number | null;
	serverNow: number;
	/** your accepted answer for the current prompt, if any */
	yourAnswer: string | null;
	game: number;
}

export type ServerMessage =
	| { t: "joined"; code: string; playerId: string; token: string }
	| { t: "room"; room: RoomView }
	| { t: "rejected"; index: number; text: string }
	| {
			t: "error";
			code:
				| "not_found"
				| "full"
				| "started"
				| "invalid"
				| "rate"
				| "not_host"
				| "auth";
			message: string;
	  }
	| { t: "pong"; serverNow: number };
