/**
 * WebSocket endpoint for party rooms (registered in vite.config.ts at /_party).
 *
 * Rooms live in this server process's memory; finished answers still go to
 * the global tallies in Postgres. One process = one set of rooms, so scaling
 * to several instances needs sticky sessions or a shared store.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { defineWebSocketHandler } from "nitro";
import { matchAnswer, roundForSeed } from "#/game/challenges.server";
import type { AnswerMark } from "#/game/engine";
import { identifyPlayer, writePartyGame } from "#/game/player.server";
import type { FlightStep } from "#/game/rarity";
import { stepFor } from "#/game/scoring.server";
import { getCounts, recordAnswer } from "#/game/tally.server";
import { auth } from "#/lib/auth";
import {
	ClientMessage,
	PARTY_ROUND_SIZE,
	type ServerMessage,
} from "./protocol";
import { makeCode, Room, type RoomDeps } from "./room.server";

type Handler = Parameters<typeof defineWebSocketHandler>[0];
/** the hooks-object form of the handler (it can also be a factory function) */
type Hooks = Exclude<Handler, (...args: never[]) => unknown>;
type Peer = Parameters<NonNullable<Hooks["open"]>>[0];

interface Binding {
	code: string;
	playerId: string;
}

interface PartyState {
	rooms: Map<string, Room>;
	/** peer id → which room/player it speaks for */
	bindings: Map<string, Binding>;
	/** `${code}:${playerId}` → live peer */
	peers: Map<string, Peer>;
	/** peer id → recent message timestamps (rate limit) */
	traffic: Map<string, number[]>;
	/** `${code}:${playerId}` → saved player (account or guest), for the match log */
	identities: Map<string, Promise<string | null>>;
	ticker: ReturnType<typeof setInterval> | null;
}

// survive dev hot-reloads
const g = globalThis as { __stardriftParty?: PartyState };
if (!g.__stardriftParty) {
	g.__stardriftParty = {
		rooms: new Map(),
		bindings: new Map(),
		peers: new Map(),
		traffic: new Map(),
		identities: new Map(),
		ticker: null,
	};
}
const state: PartyState = g.__stardriftParty;
// state from before identities existed (dev hot-reload)
state.identities ??= new Map();

const deps: RoomDeps = {
	now: () => Date.now(),
	newId: () => randomUUID(),
	newToken: () => randomBytes(18).toString("base64url"),
	pickRound: (seed) => roundForSeed(seed, PARTY_ROUND_SIZE),
	match: (promptId, text) => matchAnswer(promptId, text),
	async score(promptId, answers) {
		for (const a of answers) await recordAnswer(promptId, a);
		const counts = (await getCounts([promptId]))[promptId] ?? {};
		const out: Record<string, FlightStep> = {};
		for (const a of new Set(answers))
			out[a] = await stepFor(promptId, a, counts);
		return out;
	},
	gameOver(room) {
		logPartyGame(room).catch((err) =>
			console.warn("[stardrift] party game not logged", err),
		);
	},
};

async function logPartyGame(room: Room) {
	const results = await Promise.all(
		[...room.players.values()].map(async (p) => ({
			playerId:
				(await state.identities
					.get(`${room.code}:${p.id}`)
					?.catch(() => null)) ?? null,
			name: p.name,
			run: {
				marks: p.flight.map((s): AnswerMark => (s.answer ? "hit" : "timeout")),
				flight: p.flight,
			},
		})),
	);
	await writePartyGame({ code: room.code, game: randomUUID() }, results);
}

function send(peer: Peer, msg: ServerMessage) {
	try {
		peer.send(JSON.stringify(msg));
	} catch {
		// peer already gone
	}
}

function broadcast(room: Room) {
	for (const p of room.players.values()) {
		const peer = state.peers.get(`${room.code}:${p.id}`);
		if (peer) send(peer, { t: "room", room: room.view(p.id) });
	}
}

function bind(peer: Peer, room: Room, playerId: string) {
	const key = `${room.code}:${playerId}`;
	const previous = state.peers.get(key);
	if (previous && previous.id !== peer.id) {
		// same player opened another tab: the newest one wins
		state.bindings.delete(previous.id);
		try {
			previous.close(4000, "replaced");
		} catch {}
	}
	state.peers.set(key, peer);
	state.bindings.set(peer.id, { code: room.code, playerId });
	// who this is, from the socket's cookies (session or guest id)
	state.identities.set(
		key,
		identifyPlayer(peer.request.headers).catch(() => null),
	);
	room.setConnected(playerId, true);
}

function unbind(peer: Peer) {
	const b = state.bindings.get(peer.id);
	state.bindings.delete(peer.id);
	state.traffic.delete(peer.id);
	if (!b) return;
	const key = `${b.code}:${b.playerId}`;
	if (state.peers.get(key)?.id === peer.id) state.peers.delete(key);
	const room = state.rooms.get(b.code);
	if (room) {
		room.setConnected(b.playerId, false);
		broadcast(room);
	}
}

function rateLimited(peer: Peer) {
	const now = Date.now();
	const recent = (state.traffic.get(peer.id) ?? []).filter(
		(t) => now - t < 5_000,
	);
	recent.push(now);
	state.traffic.set(peer.id, recent);
	return recent.length > 20;
}

function ensureTicker() {
	if (state.ticker) return;
	state.ticker = setInterval(async () => {
		for (const [code, room] of state.rooms) {
			if (room.isAbandoned()) {
				state.rooms.delete(code);
				for (const id of room.players.keys()) {
					state.identities.delete(`${code}:${id}`);
				}
				continue;
			}
			try {
				if (await room.tick()) broadcast(room);
			} catch (err) {
				console.error("[party] tick failed", code, err);
			}
		}
		if (state.rooms.size === 0 && state.ticker) {
			clearInterval(state.ticker);
			state.ticker = null;
		}
	}, 250);
}

function newRoom() {
	let code = makeCode();
	while (state.rooms.has(code)) code = makeCode();
	const room = new Room(code, deps);
	state.rooms.set(code, room);
	ensureTicker();
	return room;
}

/** Puts the peer in the room as a player, or tells it why it can't board. */
function seat(peer: Peer, room: Room, name: string, token?: string) {
	const res = room.join(name, token);
	if (!res.ok) {
		send(peer, {
			t: "error",
			code: res.code,
			message:
				res.code === "full"
					? "That party is full."
					: "That party has already launched. Wait for the next round.",
		});
		return;
	}
	bind(peer, room, res.player.id);
	send(peer, {
		t: "joined",
		code: room.code,
		playerId: res.player.id,
		token: res.player.token,
	});
	broadcast(room);
}

export default defineWebSocketHandler({
	message(peer, raw) {
		if (rateLimited(peer)) {
			send(peer, { t: "error", code: "rate", message: "Slow down a little." });
			return;
		}
		let parsed: ClientMessage;
		try {
			parsed = ClientMessage.parse(JSON.parse(raw.text()));
		} catch {
			send(peer, {
				t: "error",
				code: "invalid",
				message: "That message didn't make sense.",
			});
			return;
		}

		const msg = parsed;
		if (msg.t === "ping") {
			send(peer, { t: "pong", serverNow: Date.now() });
			return;
		}

		if (msg.t === "create") {
			// only signed-in players can host; guests can still join with a code
			auth.api
				.getSession({ headers: peer.request.headers })
				.catch(() => null)
				.then((session) => {
					if (!session) {
						send(peer, {
							t: "error",
							code: "auth",
							message: "Sign in to host a party.",
						});
						return;
					}
					seat(peer, newRoom(), msg.name, msg.token);
				});
			return;
		}

		if (msg.t === "join") {
			const room = state.rooms.get(msg.code);
			if (!room) {
				send(peer, {
					t: "error",
					code: "not_found",
					message: "No party with that code.",
				});
				return;
			}
			seat(peer, room, msg.name, msg.token);
			return;
		}

		const b = state.bindings.get(peer.id);
		const room = b && state.rooms.get(b.code);
		if (!b || !room) {
			send(peer, {
				t: "error",
				code: "not_found",
				message: "Join a party first.",
			});
			return;
		}

		switch (msg.t) {
			case "start":
			case "again": {
				room
					.start(b.playerId)
					.then((r) => {
						if (r === "not_host") {
							send(peer, {
								t: "error",
								code: "not_host",
								message: "Only the host can launch.",
							});
						} else if (r === "ok") {
							broadcast(room);
						}
					})
					.catch((err) => console.error("[party] start failed", err));
				return;
			}
			case "answer": {
				room
					.answer(b.playerId, msg.index, msg.text)
					.then(async (r) => {
						if (r === "rejected") {
							send(peer, { t: "rejected", index: msg.index, text: msg.text });
						} else if (r !== "ignored") {
							broadcast(room);
							// everyone may have answered: reveal right away
							if (await room.tick()) broadcast(room);
						}
					})
					.catch((err) => console.error("[party] answer failed", err));
				return;
			}
			case "leave": {
				state.bindings.delete(peer.id);
				state.peers.delete(`${room.code}:${b.playerId}`);
				state.identities.delete(`${room.code}:${b.playerId}`);
				room.leave(b.playerId);
				broadcast(room);
				return;
			}
		}
	},

	close(peer) {
		unbind(peer);
	},

	error(peer) {
		unbind(peer);
	},
});
