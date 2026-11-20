import { useCallback, useEffect, useRef, useState } from "react";
import crossIcon from "#/assets/icon_crossSmall.png";
import warnIcon from "#/assets/icon_exclamationSmall.png";
import plusIcon from "#/assets/icon_plusSmall.png";
import {
	type AnswerMark,
	orbitFor,
	SECONDS_PER_PROMPT,
	shareText,
} from "#/game/engine";
import type { Prompt } from "#/game/prompts";
import {
	type FlightStep,
	formatKm,
	formatShare,
	TIER_BY_ID,
	TIERS,
	totalAltitude,
} from "#/game/rarity";
import type { RunProgress } from "#/game/storage";
import { getReveal, type PromptReveal, submitAnswer } from "#/game/submit";
import { FlightCanvas } from "./FlightCanvas";

type Phase = "ready" | "asking" | "revealed" | "done";

interface GameProps {
	label: string;
	round: Prompt[];
	onFinish?: (run: RunProgress) => void;
	onProgress?: (run: RunProgress) => void;
	finished?: RunProgress;
	resume?: RunProgress;
	onPlayAgain?: () => void;
	playAgainLabel?: string;
}

/** Eased number for the altitude readout. */
function useCountUp(target: number, ms = 1400) {
	const [value, setValue] = useState(target);
	const from = useRef(target);
	useEffect(() => {
		if (from.current === target) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			from.current = target;
			setValue(target);
			return;
		}
		const start = performance.now();
		const begin = from.current;
		let raf = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			const v = begin + (target - begin) * (1 - (1 - t) ** 3);
			from.current = v;
			setValue(v);
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return value;
}

export function Game({
	label,
	round,
	onFinish,
	onProgress,
	finished,
	resume,
	onPlayAgain,
	playAgainLabel = "Fly again",
}: GameProps) {
	const start = finished ?? resume;
	const [phase, setPhase] = useState<Phase>(finished ? "done" : "ready");
	const [index, setIndex] = useState(start?.flight.length ?? 0);
	const [flight, setFlight] = useState<FlightStep[]>(start?.flight ?? []);
	const flightRef = useRef(flight);
	const [typed, setTyped] = useState("");
	const [rejected, setRejected] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [remaining, setRemaining] = useState(SECONDS_PER_PROMPT);
	const inputRef = useRef<HTMLInputElement>(null);
	const nextRef = useRef<HTMLButtonElement>(null);
	const deadline = useRef(0);
	/** which prompt `deadline` belongs to */
	const deadlineIndex = useRef(-1);
	const done = useRef(Boolean(finished));

	const prompt = round[Math.min(index, round.length - 1)];
	const altitude = totalAltitude(flight);
	const shownKm = useCountUp(altitude);
	const resuming = Boolean(resume && resume.flight.length > 0);

	const land = useCallback(
		(step: FlightStep) => {
			const next = [...flightRef.current, step];
			flightRef.current = next;
			setFlight(next);
			setPhase("revealed");
			const marks: AnswerMark[] = next.map((s) =>
				s.answer ? "hit" : "timeout",
			);
			onProgress?.({ marks, flight: next });
		},
		[onProgress],
	);

	const send = useCallback(
		async (answer: string | null) => {
			if (phase !== "asking" || pending) return;
			if (answer !== null && !answer.trim()) return;
			setPending(true);
			setError(null);
			try {
				const res = await submitAnswer({
					data: { promptId: prompt.id, answer },
				});
				if (res.status === "accepted") {
					land(res.step);
				} else {
					setRejected(answer);
					setTyped("");
					inputRef.current?.focus();
				}
			} catch {
				if (answer === null) {
					land({
						promptId: prompt.id,
						answer: null,
						share: null,
						tier: null,
						climbKm: 0,
						players: 0,
						estimated: true,
					});
				} else {
					setError("Signal lost. Try sending again.");
				}
			} finally {
				setPending(false);
			}
		},
		[phase, pending, prompt, land],
	);

	const next = useCallback(() => {
		if (phase !== "revealed") return;
		if (index + 1 >= round.length) {
			setPhase("done");
			if (!done.current) {
				done.current = true;
				const marks: AnswerMark[] = flightRef.current.map((s) =>
					s.answer ? "hit" : "timeout",
				);
				onFinish?.({ marks, flight: flightRef.current });
			}
			return;
		}
		setIndex((i) => i + 1);
		setTyped("");
		setRejected(null);
		setError(null);
		// fresh clock before the next prompt renders, so a leftover 0 from a
		// timed-out prompt can't time this one out too
		setRemaining(SECONDS_PER_PROMPT);
		setPhase("asking");
	}, [phase, index, round.length, onFinish]);

	// focus management
	useEffect(() => {
		if (phase === "asking") inputRef.current?.focus();
		if (phase === "revealed") nextRef.current?.focus();
	}, [phase]);

	// countdown per prompt
	useEffect(() => {
		if (phase !== "asking") return;
		deadline.current = Date.now() + SECONDS_PER_PROMPT * 1000;
		deadlineIndex.current = index;
		setRemaining(SECONDS_PER_PROMPT);
		const t = window.setInterval(() => {
			const left = Math.max(0, (deadline.current - Date.now()) / 1000);
			setRemaining(left);
			if (left <= 0) window.clearInterval(t);
		}, 100);
		return () => window.clearInterval(t);
	}, [phase, index]);

	useEffect(() => {
		if (phase !== "asking" || remaining > 0 || pending) return;
		// only time out against this prompt's own deadline
		if (deadlineIndex.current !== index || Date.now() < deadline.current)
			return;
		send(null);
	}, [phase, remaining, pending, send, index]);

	// Enter launches from the ready screen
	useEffect(() => {
		if (phase !== "ready") return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Enter") setPhase("asking");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [phase]);

	const mode =
		phase === "done"
			? "overview"
			: phase === "ready" && !resuming
				? "idle"
				: "play";
	const step = phase === "revealed" ? flight[index] : undefined;
	const stepTier = step?.tier ? TIER_BY_ID[step.tier] : null;

	return (
		<>
			<FlightCanvas steps={flight} mode={mode} pending={pending} />

			{phase !== "done" && (
				<div className="sd-hud" aria-live="off">
					<div>
						<p className="sd-hud__label">Altitude</p>
						<p className="sd-hud__km">{formatKm(shownKm)}</p>
					</div>
					<ol className="sd-hud__dots" aria-label="progress">
						{round.map((p, i) => {
							const s = flight[i];
							const t = s?.tier ? TIER_BY_ID[s.tier] : null;
							return (
								<li
									key={p.id}
									className={
										i === index && phase !== "ready" ? "is-current" : ""
									}
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
						})}
					</ol>
					<div className="text-right">
						<p className="sd-hud__label">{label}</p>
						<p className="sd-hud__km text-base">
							{Math.min(index + 1, round.length)}/{round.length}
						</p>
					</div>
				</div>
			)}

			{phase === "ready" && (
				<div className="sd-dock sd-dock--center">
					<div className="sd-card text-center">
						<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
							{label}
						</p>
						<h1 className="font-display mt-3 text-4xl text-[var(--sd-ink)] sm:text-5xl">
							{resuming ? "Resume your flight" : "Ready for launch"}
						</h1>
						<p className="mx-auto mt-3 max-w-md text-[var(--sd-dim)]">
							{resuming
								? `You're ${formatKm(altitude)} up, ${flight.length} of ${round.length} answered.`
								: `${round.length} prompts, ${SECONDS_PER_PROMPT} seconds each. Type any answer that fits. The fewer players who say the same thing, the higher you fly.`}
						</p>
						<ul className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-[var(--sd-dim)]">
							{TIERS.map((t) => (
								<li key={t.id} className="flex items-center gap-1.5">
									<span
										className="inline-block size-2 animate-pulse rounded-full"
										style={{
											background: t.color,
											boxShadow: `0 0 8px ${t.color}`,
										}}
									/>
									{t.name} +{t.climbKm}
								</li>
							))}
						</ul>
						<button
							type="button"
							className="sd-btn sd-btn--primary sd-btn--lg mt-7"
							onClick={() => setPhase("asking")}
						>
							{resuming ? "Re-ignite ↑" : "Launch ↑"}
						</button>
					</div>
				</div>
			)}

			{(phase === "asking" || phase === "revealed") && (
				<div className="sd-dock">
					<div className="sd-card">
						<div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
							<span className="text-[var(--sd-gold)]">{prompt.category}</span>
							<span className="flex items-center gap-1.5">
								{phase === "asking" && remaining < 8 && (
									<img
										src={warnIcon}
										alt=""
										aria-hidden
										className="sd-icon sd-icon--warn"
									/>
								)}
								{phase === "asking" ? `${Math.ceil(remaining)}s` : ""}
							</span>
						</div>
						<div
							className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
							aria-hidden
						>
							<div
								className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
									remaining < 8 ? "bg-[var(--sd-red)]" : "bg-[var(--sd-gold)]"
								}`}
								style={{
									width: `${phase === "asking" ? (remaining / SECONDS_PER_PROMPT) * 100 : 0}%`,
								}}
							/>
						</div>
						<h2 className="font-display mt-4 text-2xl leading-snug text-[var(--sd-ink)] sm:text-3xl">
							{prompt.text}
						</h2>

						{phase === "asking" && (
							<form
								className="mt-4 flex gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									send(typed);
								}}
							>
								<input
									ref={inputRef}
									value={typed}
									onChange={(e) => {
										setTyped(e.target.value);
										setRejected(null);
									}}
									maxLength={80}
									placeholder={prompt.example}
									aria-label={prompt.text}
									autoComplete="off"
									autoCapitalize="off"
									spellCheck={false}
									enterKeyHint="send"
									className={`sd-input ${rejected ? "is-rejected" : ""}`}
									disabled={pending}
								/>
								<button
									type="submit"
									className="sd-btn sd-btn--primary shrink-0"
									disabled={pending || !typed.trim()}
								>
									{pending ? "…" : "Send"}
								</button>
							</form>
						)}
						{phase === "asking" && (
							<p
								className="mt-2 flex min-h-5 items-center gap-1.5 text-sm text-[var(--sd-dim)]"
								aria-live="polite"
							>
								{(error || rejected) && (
									<img
										src={crossIcon}
										alt=""
										aria-hidden
										className="sd-icon sd-icon--bad"
									/>
								)}
								{error ??
									(rejected
										? `“${rejected}” isn’t on our star chart. Try another.`
										: "")}
							</p>
						)}

						{phase === "revealed" && step && (
							<div className="sd-reveal mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
								<div aria-live="polite">
									{stepTier ? (
										<>
											<p className="text-lg font-semibold text-[var(--sd-ink)]">
												{step.answer}{" "}
												<span
													className="inline-flex items-center gap-1"
													style={{ color: stepTier.color }}
												>
													· {stepTier.name}
													<img src={plusIcon} alt="plus" className="sd-icon" />
													{stepTier.climbKm} km
												</span>
											</p>
											<p className="mt-1 text-sm text-[var(--sd-dim)]">
												{step.players <= 1
													? "You're the first to say this tonight."
													: `${formatShare(step.share ?? 0)} of answers matched yours.`}{" "}
												{stepTier.blurb}
											</p>
										</>
									) : (
										<p className="text-lg font-semibold text-[var(--sd-ink)]">
											Out of time. No climb.
										</p>
									)}
								</div>
								<button
									ref={nextRef}
									type="button"
									className="sd-btn sd-btn--primary shrink-0"
									onClick={next}
								>
									{index + 1 >= round.length ? "See your flight" : "Next ↑"}
								</button>
							</div>
						)}
					</div>
				</div>
			)}

			{phase === "done" && (
				<Results
					label={label}
					round={round}
					flight={flight}
					onPlayAgain={onPlayAgain}
					playAgainLabel={playAgainLabel}
				/>
			)}
		</>
	);
}

function Results({
	label,
	round,
	flight,
	onPlayAgain,
	playAgainLabel,
}: {
	label: string;
	round: Prompt[];
	flight: FlightStep[];
	onPlayAgain?: () => void;
	playAgainLabel: string;
}) {
	const [copied, setCopied] = useState(false);
	const [reveal, setReveal] = useState<PromptReveal[] | null>(null);
	const km = totalAltitude(flight);

	useEffect(() => {
		let alive = true;
		getReveal({ data: { promptIds: round.map((p) => p.id) } })
			.then((r) => alive && setReveal(r))
			.catch(() => alive && setReveal([]));
		return () => {
			alive = false;
		};
	}, [round]);

	const share = async () => {
		const text = shareText({ label, flight, url: window.location.origin });
		try {
			if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
				await navigator.share({ text });
			} else {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 2000);
			}
		} catch {
			// cancelled or blocked
		}
	};

	return (
		<aside className="sd-results" aria-label="Flight results">
			<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
				{label}
			</p>
			<p className="mt-3 text-sm text-[var(--sd-dim)]">You reached</p>
			<h1 className="font-display text-5xl leading-none text-[var(--sd-ink)]">
				{orbitFor(km)}
			</h1>
			<p className="mt-2 text-lg text-[var(--sd-ink)]">{formatKm(km)}</p>

			<div className="mt-5 flex flex-wrap gap-2">
				<button
					type="button"
					className="sd-btn sd-btn--primary"
					onClick={share}
				>
					{copied ? "Copied!" : "Share flight"}
				</button>
				{onPlayAgain && (
					<button type="button" className="sd-btn" onClick={onPlayAgain}>
						{playAgainLabel}
					</button>
				)}
			</div>

			<ol className="mt-6 grid gap-3">
				{round.map((p, i) => {
					const s = flight[i];
					const tier = s?.tier ? TIER_BY_ID[s.tier] : null;
					const r = reveal?.find((x) => x.promptId === p.id);
					return (
						<li key={p.id} className="rounded-xl bg-white/[0.04] p-3.5">
							<p className="text-xs text-[var(--sd-dim)]">{p.text}</p>
							<p className="mt-1 flex items-baseline justify-between gap-3">
								<span className="font-semibold text-[var(--sd-ink)]">
									{s?.answer ?? "—"}
								</span>
								{tier ? (
									<span
										className="shrink-0 text-sm"
										style={{ color: tier.color }}
									>
										{tier.name} +{tier.climbKm}
										{s?.share != null && (
											<span className="ml-1.5 text-xs text-[var(--sd-dim)]">
												{formatShare(s.share)}
											</span>
										)}
									</span>
								) : (
									<span className="text-sm text-[var(--sd-dim)]">
										timed out
									</span>
								)}
							</p>
							{r && (
								<div className="mt-2 grid gap-1 text-xs text-[var(--sd-dim)]">
									<p>
										<span className="text-[var(--sd-ink)]/80">Most said: </span>
										{r.top
											.map((t) => `${t.answer} ${formatShare(t.share)}`)
											.join(" · ")}
									</p>
									{r.rarest.length > 0 && (
										<p>
											<span className="text-[var(--sd-ink)]/80">
												Rarest given:{" "}
											</span>
											{r.rarest.map((t) => t.answer).join(" · ")}
										</p>
									)}
									{r.unclaimed.length > 0 && (
										<p>
											<span className="text-[var(--sd-ink)]/80">
												Nobody yet:{" "}
											</span>
											{r.unclaimed.join(" · ")}
										</p>
									)}
								</div>
							)}
						</li>
					);
				})}
			</ol>
			{!reveal && (
				<p className="mt-3 animate-pulse text-xs text-[var(--sd-dim)]">
					Listening for the rest of the fleet…
				</p>
			)}
		</aside>
	);
}
