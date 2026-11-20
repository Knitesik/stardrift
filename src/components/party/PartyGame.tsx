import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import crossIcon from "#/assets/icon_crossSmall.png";
import { orbitFor } from "#/game/engine";
import { formatKm, formatShare, TIER_BY_ID } from "#/game/rarity";
import {
	LONE_MIN_PLAYERS,
	PARTY_ROUND_SIZE,
	type PlayerView,
	PROMPT_MS,
	REVEAL_MS,
} from "#/party/protocol";
import { usePartySocket } from "#/party/usePartySocket";
import { FlightCanvas } from "../game/FlightCanvas";
import { Loading, Panel } from "../game/Shell";
import { SPRITE_URL } from "../game/sprites";

/** Milliseconds until a server deadline, on the local clock. */
function useRemaining(endsAt: number | null, offset: number) {
	const [left, setLeft] = useState(0);
	useEffect(() => {
		if (endsAt === null) return;
		const update = () => setLeft(Math.max(0, endsAt - (Date.now() + offset)));
		update();
		const t = window.setInterval(update, 100);
		return () => window.clearInterval(t);
	}, [endsAt, offset]);
	return endsAt === null ? 0 : left;
}

function ShipIcon({ ship, size = 22 }: { ship: string; size?: number }) {
	return (
		<img
			src={SPRITE_URL[ship]}
			alt=""
			aria-hidden
			width={size}
			height={size}
			className="shrink-0"
		/>
	);
}

export function PartyGame({ code, name }: { code: string; name: string }) {
	const navigate = useNavigate();
	const party = usePartySocket({
		code,
		name,
		onJoined: (assigned) => {
			if (code.toUpperCase() !== assigned) {
				navigate({
					to: "/party/$code",
					params: { code: assigned },
					replace: true,
				});
			}
		},
	});
	const { room, error, status } = party;
	const remaining = useRemaining(room?.phaseEndsAt ?? null, party.clockOffset);

	const [typed, setTyped] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const promptIndex = room?.prompt?.index ?? -1;

	// clear the box for each new prompt
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on prompt change
	useEffect(() => {
		setTyped("");
		party.clearRejected();
		inputRef.current?.focus();
	}, [promptIndex, room?.game]);

	if (error?.code === "auth") {
		return (
			<div className="sd-dock sd-dock--center">
				<Panel className="max-w-md text-center">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						Sign in to host
					</h1>
					<p className="mt-3 text-[var(--sd-dim)]">
						Hosting a party needs an account. Friends can still join yours with
						just the code.
					</p>
					<Link
						to="/account"
						search={{ next: "/party" }}
						className="sd-btn sd-btn--primary mt-6 inline-flex"
					>
						Sign in ↑
					</Link>
				</Panel>
			</div>
		);
	}

	if (error && ["not_found", "full", "started"].includes(error.code)) {
		return (
			<div className="sd-dock sd-dock--center">
				<Panel className="max-w-md text-center">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						{error.code === "not_found" ? "No such party" : "Can’t board"}
					</h1>
					<p className="mt-3 text-[var(--sd-dim)]">{error.message}</p>
					<Link to="/party" className="sd-btn sd-btn--primary mt-6 inline-flex">
						Back to parties
					</Link>
				</Panel>
			</div>
		);
	}

	if (!room) {
		return (
			<div className="sd-dock sd-dock--center">
				<Loading />
			</div>
		);
	}

	const me = room.players.find((p) => p.id === room.you);
	const others = room.players.filter((p) => p.id !== room.you);
	const host = room.players.find((p) => p.isHost);
	const iAmHost = me?.isHost ?? false;
	const mode =
		room.phase === "results"
			? "overview"
			: room.phase === "lobby"
				? "idle"
				: "play";

	return (
		<>
			<FlightCanvas
				steps={me?.flight ?? []}
				mode={mode}
				shipSprite={me?.ship}
				shipName={me?.name}
				fleet={others.map((o) => ({
					id: o.id,
					name: o.name,
					ship: o.ship,
					altitude: o.altitude,
					connected: o.connected,
				}))}
			/>

			{status === "reconnecting" && (
				<p className="fixed left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-[var(--sd-red)]/90 px-4 py-1.5 text-sm font-semibold text-[#1c1402]">
					Signal lost. Reconnecting…
				</p>
			)}

			{room.phase !== "lobby" && room.phase !== "results" && me && (
				<div className="sd-hud">
					<div>
						<p className="sd-hud__label">Altitude</p>
						<p className="sd-hud__km">{formatKm(me.altitude)}</p>
					</div>
					<ol className="sd-hud__dots" aria-label="progress">
						{Array.from(
							{ length: room.prompt?.total ?? PARTY_ROUND_SIZE },
							(_, i) => {
								const s = me.flight[i];
								const t = s?.tier ? TIER_BY_ID[s.tier] : null;
								return (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed prompt slots
										key={i}
										className={i === promptIndex ? "is-current" : ""}
										style={
											t
												? {
														background: t.color,
														boxShadow: `0 0 10px ${t.color}`,
													}
												: s
													? { background: "#4a4e75" }
													: undefined
										}
									/>
								);
							},
						)}
					</ol>
					<div className="text-right">
						<p className="sd-hud__label">Party {room.code}</p>
						<p className="sd-hud__km text-base">
							{room.prompt
								? `${room.prompt.index + 1}/${room.prompt.total}`
								: ""}
						</p>
					</div>
				</div>
			)}

			{room.phase === "lobby" && (
				<Lobby
					code={room.code}
					players={room.players}
					you={room.you}
					iAmHost={iAmHost}
					hostName={host?.name}
					onStart={party.start}
					onLeave={() => {
						party.leave();
						navigate({ to: "/party" });
					}}
				/>
			)}

			{room.phase === "countdown" && (
				<div className="sd-dock sd-dock--center">
					<p
						key={Math.ceil(remaining / 1000)}
						className="sd-countdown font-display text-[9rem] leading-none text-[var(--sd-ink)]"
					>
						{Math.max(1, Math.ceil(remaining / 1000))}
					</p>
				</div>
			)}

			{room.phase === "prompt" && room.prompt && (
				<div className="sd-dock">
					<div className="sd-card">
						<div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
							<span className="text-[var(--sd-gold)]">
								{room.prompt.category}
							</span>
							<span>{Math.ceil(remaining / 1000)}s</span>
						</div>
						<div
							className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
							aria-hidden
						>
							<div
								className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
									remaining < 8000
										? "bg-[var(--sd-red)]"
										: "bg-[var(--sd-gold)]"
								}`}
								style={{ width: `${(remaining / PROMPT_MS) * 100}%` }}
							/>
						</div>
						<h2 className="font-display mt-4 text-2xl leading-snug text-[var(--sd-ink)] sm:text-3xl">
							{room.prompt.text}
						</h2>

						{room.yourAnswer ? (
							<p className="mt-4 text-lg text-[var(--sd-ink)]">
								Locked in:{" "}
								<span className="font-semibold">{room.yourAnswer}</span>
								<span className="ml-2 text-sm text-[var(--sd-dim)]">
									waiting for the others…
								</span>
							</p>
						) : (
							<>
								<form
									className="mt-4 flex gap-2"
									onSubmit={(e) => {
										e.preventDefault();
										if (!typed.trim()) return;
										party.answer(room.prompt?.index ?? 0, typed);
										party.clearRejected();
									}}
								>
									<input
										ref={inputRef}
										value={typed}
										onChange={(e) => {
											setTyped(e.target.value);
											party.clearRejected();
										}}
										maxLength={80}
										placeholder={room.prompt.example}
										aria-label={room.prompt.text}
										autoComplete="off"
										autoCapitalize="off"
										spellCheck={false}
										enterKeyHint="send"
										className={`sd-input ${party.rejected ? "is-rejected" : ""}`}
									/>
									<button
										type="submit"
										className="sd-btn sd-btn--primary shrink-0"
										disabled={!typed.trim()}
									>
										Send
									</button>
								</form>
								<p
									className="mt-2 flex min-h-5 items-center gap-1.5 text-sm text-[var(--sd-dim)]"
									aria-live="polite"
								>
									{party.rejected && (
										<>
											<img
												src={crossIcon}
												alt=""
												aria-hidden
												className="sd-icon sd-icon--bad"
											/>
											“{party.rejected.text}” isn’t on our star chart. Try
											another.
										</>
									)}
								</p>
							</>
						)}

						<ul
							className="mt-3 flex flex-wrap gap-2"
							aria-label="who has answered"
						>
							{room.players.map((p) => (
								<li
									key={p.id}
									className={`sd-chip ${p.lockedIn ? "is-in" : ""} ${p.connected ? "" : "opacity-40"}`}
								>
									<ShipIcon ship={p.ship} size={16} />
									{p.name}
									{p.lockedIn ? " ✓" : ""}
								</li>
							))}
						</ul>
					</div>
				</div>
			)}

			{room.phase === "reveal" && room.prompt && (
				<div className="sd-dock">
					<div className="sd-card">
						<div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
							<span className="text-[var(--sd-gold)]">The reveal</span>
							<span>
								{room.prompt.index + 1 >= room.prompt.total
									? "Final orbit"
									: "Next prompt soon"}
							</span>
						</div>
						<div
							className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
							aria-hidden
						>
							<div
								className="h-full rounded-full bg-[var(--sd-gold)] transition-[width] duration-100 ease-linear"
								style={{ width: `${(remaining / REVEAL_MS) * 100}%` }}
							/>
						</div>
						<h2 className="font-display mt-3 text-xl text-[var(--sd-ink)]">
							{room.prompt.text}
						</h2>
						<ul className="mt-3 grid gap-1.5" aria-live="polite">
							{[...room.players]
								.sort(
									(a, b) =>
										(b.flight[room.prompt?.index ?? 0]?.climbKm ?? 0) -
										(a.flight[room.prompt?.index ?? 0]?.climbKm ?? 0),
								)
								.map((p) => (
									<RevealRow
										key={p.id}
										player={p}
										index={room.prompt?.index ?? 0}
										you={room.you}
									/>
								))}
						</ul>
					</div>
				</div>
			)}

			{room.phase === "results" && (
				<Podium
					players={room.players}
					you={room.you}
					iAmHost={iAmHost}
					hostName={host?.name}
					onAgain={party.again}
					onLeave={() => {
						party.leave();
						navigate({ to: "/party" });
					}}
				/>
			)}
		</>
	);
}

function RevealRow({
	player,
	index,
	you,
}: {
	player: PlayerView;
	index: number;
	you: string;
}) {
	const s = player.flight[index];
	const tier = s?.tier ? TIER_BY_ID[s.tier] : null;
	return (
		<li
			className={`flex items-center gap-3 rounded-lg px-3 py-2 ${player.id === you ? "bg-white/[0.08]" : "bg-white/[0.03]"}`}
		>
			<ShipIcon ship={player.ship} />
			<span className="w-20 shrink-0 truncate text-sm text-[var(--sd-dim)]">
				{player.name}
			</span>
			<span className="min-w-0 flex-1 truncate font-semibold text-[var(--sd-ink)]">
				{s?.answer ?? "—"}
			</span>
			<span className="shrink-0 text-right text-sm">
				{tier ? (
					<>
						<span style={{ color: tier.color }}>{tier.name}</span>
						{s?.effect === "shared" && (
							<span className="sd-tag sd-tag--shared">
								shared ×{s.sharedWith}
							</span>
						)}
						{s?.effect === "lone" && (
							<span className="sd-tag sd-tag--lone">lone +25%</span>
						)}
						<span className="ml-2 font-semibold text-[var(--sd-ink)]">
							+{s?.climbKm}
						</span>
						{s?.share != null && (
							<span className="ml-1.5 text-xs text-[var(--sd-dim)]">
								{formatShare(s.share)}
							</span>
						)}
					</>
				) : (
					<span className="text-[var(--sd-dim)]">no answer</span>
				)}
			</span>
		</li>
	);
}

function Lobby({
	code,
	players,
	you,
	iAmHost,
	hostName,
	onStart,
	onLeave,
}: {
	code: string;
	players: PlayerView[];
	you: string;
	iAmHost: boolean;
	hostName?: string;
	onStart: () => void;
	onLeave: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const invite = async () => {
		const url = `${window.location.origin}/party/${code}`;
		try {
			if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
				await navigator.share({ title: "Join my Stardrift party", url });
			} else {
				await navigator.clipboard.writeText(url);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 2000);
			}
		} catch {
			// cancelled
		}
	};

	return (
		<div className="sd-dock sd-dock--center">
			<div className="sd-card text-center">
				<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
					Party code
				</p>
				<p className="font-display mt-1 text-6xl tracking-[0.2em] text-[var(--sd-ink)]">
					{code}
				</p>
				<button type="button" className="sd-btn mt-3" onClick={invite}>
					{copied ? "Link copied!" : "Copy invite link"}
				</button>

				<ul className="mx-auto mt-6 grid max-w-sm gap-1.5 text-left">
					{players.map((p) => (
						<li
							key={p.id}
							className={`flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 ${p.connected ? "" : "opacity-40"}`}
						>
							<ShipIcon ship={p.ship} />
							<span className="flex-1 truncate font-semibold text-[var(--sd-ink)]">
								{p.name}
								{p.id === you && (
									<span className="ml-1.5 text-xs text-[var(--sd-dim)]">
										(you)
									</span>
								)}
							</span>
							{p.isHost && <span className="sd-tag sd-tag--lone">host</span>}
							{!p.connected && (
								<span className="text-xs text-[var(--sd-dim)]">offline</span>
							)}
						</li>
					))}
				</ul>

				<p className="mx-auto mt-4 max-w-sm text-sm text-[var(--sd-dim)]">
					Rarer answers fly higher. Say the same thing as a friend and you split
					the climb.
					{players.length >= LONE_MIN_PLAYERS
						? " A lone answer earns +25%."
						: ` With ${LONE_MIN_PLAYERS}+ players, a lone answer earns +25%.`}
				</p>

				<div className="mt-6 flex flex-wrap justify-center gap-3">
					{iAmHost ? (
						<button
							type="button"
							className="sd-btn sd-btn--primary sd-btn--lg"
							onClick={onStart}
						>
							Launch party ↑
						</button>
					) : (
						<p className="animate-pulse text-[var(--sd-dim)]">
							Waiting for {hostName ?? "the host"} to launch…
						</p>
					)}
					<button type="button" className="sd-btn" onClick={onLeave}>
						Leave
					</button>
				</div>
			</div>
		</div>
	);
}

function Podium({
	players,
	you,
	iAmHost,
	hostName,
	onAgain,
	onLeave,
}: {
	players: PlayerView[];
	you: string;
	iAmHost: boolean;
	hostName?: string;
	onAgain: () => void;
	onLeave: () => void;
}) {
	const ranked = [...players].sort((a, b) => b.altitude - a.altitude);
	return (
		<aside className="sd-results" aria-label="Party results">
			<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
				Party results
			</p>
			<h1 className="font-display mt-2 text-4xl leading-none text-[var(--sd-ink)]">
				{ranked[0]?.id === you
					? "You flew highest!"
					: `${ranked[0]?.name ?? "—"} flew highest`}
			</h1>
			<ol className="mt-5 grid gap-2">
				{ranked.map((p, i) => (
					<li
						key={p.id}
						className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.id === you ? "bg-white/[0.09]" : "bg-white/[0.04]"}`}
					>
						<span className="font-display w-6 text-2xl text-[var(--sd-gold)]">
							{i + 1}
						</span>
						<ShipIcon ship={p.ship} size={26} />
						<span className="min-w-0 flex-1">
							<span className="block truncate font-semibold text-[var(--sd-ink)]">
								{p.name}
							</span>
							<span className="text-xs text-[var(--sd-dim)]">
								{orbitFor(p.altitude)}
							</span>
						</span>
						<span className="font-semibold text-[var(--sd-ink)]">
							{formatKm(p.altitude)}
						</span>
					</li>
				))}
			</ol>
			<div className="mt-6 flex flex-wrap gap-2">
				{iAmHost ? (
					<button
						type="button"
						className="sd-btn sd-btn--primary"
						onClick={onAgain}
					>
						Fly again ↑
					</button>
				) : (
					<p className="text-sm text-[var(--sd-dim)]">
						{hostName ?? "The host"} can start another round.
					</p>
				)}
				<button type="button" className="sd-btn" onClick={onLeave}>
					Leave party
				</button>
			</div>
		</aside>
	);
}
