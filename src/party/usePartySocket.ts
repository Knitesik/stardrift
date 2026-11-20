/**
 * Browser side of a party: one WebSocket, automatic reconnects, and the
 * latest room snapshot from the server.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PARTY_PATH, type RoomView, type ServerMessage } from "./protocol";

export type PartyStatus = "connecting" | "open" | "reconnecting" | "closed";
export type PartyError = Extract<ServerMessage, { t: "error" }>;

const tokenKey = (code: string) => `stardrift:party:${code}`;

function readToken(code: string) {
	try {
		return window.sessionStorage.getItem(tokenKey(code)) ?? undefined;
	} catch {
		return undefined;
	}
}

function saveToken(code: string, token: string) {
	try {
		window.sessionStorage.setItem(tokenKey(code), token);
	} catch {
		// private mode: reconnect-after-refresh just won't work
	}
}

export function usePartySocket(opts: {
	/** a room code, or "NEW" to create one */
	code: string;
	name: string;
	/** called once the server has assigned the room code */
	onJoined?: (code: string) => void;
}) {
	const [status, setStatus] = useState<PartyStatus>("connecting");
	const [room, setRoom] = useState<RoomView | null>(null);
	const [error, setError] = useState<PartyError | null>(null);
	const [rejected, setRejected] = useState<{
		index: number;
		text: string;
	} | null>(null);
	/** serverNow − clientNow, to read deadlines on the local clock */
	const [clockOffset, setClockOffset] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const codeRef = useRef(opts.code.toUpperCase());
	const nameRef = useRef(opts.name);
	const onJoinedRef = useRef(opts.onJoined);
	onJoinedRef.current = opts.onJoined;

	useEffect(() => {
		let stopped = false;
		let attempt = 0;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let ping: ReturnType<typeof setInterval> | undefined;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss" : "ws";
			const ws = new WebSocket(
				`${proto}://${window.location.host}${PARTY_PATH}`,
			);
			wsRef.current = ws;

			ws.onopen = () => {
				attempt = 0;
				setStatus("open");
				const code = codeRef.current;
				if (code === "NEW") {
					ws.send(JSON.stringify({ t: "create", name: nameRef.current }));
				} else {
					ws.send(
						JSON.stringify({
							t: "join",
							code,
							name: nameRef.current,
							token: readToken(code),
						}),
					);
				}
				ping = setInterval(() => {
					if (ws.readyState === WebSocket.OPEN)
						ws.send(JSON.stringify({ t: "ping" }));
				}, 20_000);
			};

			ws.onmessage = (event) => {
				let msg: ServerMessage;
				try {
					msg = JSON.parse(String(event.data));
				} catch {
					return;
				}
				switch (msg.t) {
					case "joined":
						codeRef.current = msg.code;
						saveToken(msg.code, msg.token);
						setError(null);
						onJoinedRef.current?.(msg.code);
						break;
					case "room":
						setRoom(msg.room);
						setClockOffset(msg.room.serverNow - Date.now());
						break;
					case "rejected":
						setRejected({ index: msg.index, text: msg.text });
						break;
					case "pong":
						setClockOffset(msg.serverNow - Date.now());
						break;
					case "error":
						setError(msg);
						if (["not_found", "full", "started", "auth"].includes(msg.code)) {
							stopped = true;
							ws.close();
						}
						break;
				}
			};

			ws.onclose = (event) => {
				clearInterval(ping);
				if (stopped || event.code === 4000) {
					setStatus("closed");
					return;
				}
				setStatus("reconnecting");
				attempt += 1;
				retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
			};
		};

		connect();
		return () => {
			stopped = true;
			clearTimeout(retry);
			clearInterval(ping);
			wsRef.current?.close();
		};
	}, []);

	const send = useCallback((msg: object) => {
		const ws = wsRef.current;
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
	}, []);

	return {
		status,
		room,
		error,
		rejected,
		clockOffset,
		clearRejected: () => setRejected(null),
		start: () => send({ t: "start" }),
		again: () => send({ t: "again" }),
		answer: (index: number, text: string) => send({ t: "answer", index, text }),
		leave: () => {
			send({ t: "leave" });
			wsRef.current?.close();
		},
	};
}
