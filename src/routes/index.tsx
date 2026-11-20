import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowIcon,
	ClimbIcon,
	InfinityIcon,
	KeyboardIcon,
	ShipIcon,
	TimerIcon,
} from "#/components/game/icons";
import { Shell, useToday } from "#/components/game/Shell";
import {
	addDays,
	dayNumber,
	orbitFor,
	ROUND_SIZE,
	SECONDS_PER_PROMPT,
} from "#/game/engine";
import { formatKm, TIERS } from "#/game/rarity";
import {
	type RunProgress,
	runAltitude,
	type SaveData,
	streaks,
	useSave,
} from "#/game/storage";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/")({
	head: () =>
		seo({
			path: "/",
			description:
				"Stardrift is a free daily word game. Answer ten prompts a night with anything that fits; the rarer your answer, the higher your ship flies. Play solo, unlimited, or with friends.",
		}),
	component: Home,
});

/** Tonight's run as the home page shows it. */
interface Tonight {
	night: number | null;
	status: "complete" | "flying" | "ready";
	run: RunProgress | undefined;
	km: number;
}

function tonightFrom(today: string | null, save: SaveData | null): Tonight {
	const done = today && save ? save.daily[today] : undefined;
	const flying = today && save ? save.inProgress[today] : undefined;
	const run = done ?? flying;
	return {
		night: today ? dayNumber(today) : null,
		status: done ? "complete" : flying ? "flying" : "ready",
		run,
		km: runAltitude(run),
	};
}

const pad3 = (n: number) => String(n).padStart(3, "0");

function Home() {
	const today = useToday();
	const save = useSave();
	const tonight = tonightFrom(today, save);

	return (
		<Shell wide>
			<Hero tonight={tonight} />
			<FlightLog tonight={tonight} today={today} save={save} />
			<HowToPlay />
			<RaritySpectrum />
		</Shell>
	);
}

/* ───────── hero ───────── */

function Hero({ tonight }: { tonight: Tonight }) {
	const cta =
		tonight.status === "complete"
			? "See tonight’s result"
			: tonight.status === "flying"
				? "Resume tonight’s flight"
				: "Fly tonight’s prompts";
	return (
		<section className="flex flex-wrap items-center gap-14 pt-14 pb-16 sm:pt-20 sm:pb-[72px]">
			<div className="flex min-w-0 flex-[1_1_480px] flex-col gap-7">
				<p className="flex items-center gap-3 font-mono-sd text-xs tracking-[0.26em] text-[var(--sd-gold)] uppercase">
					<span aria-hidden className="h-px w-7 bg-current" />A nightly flight
					of rare answers
				</p>
				<h1 className="m-0 font-display text-[clamp(64px,9.5vw,132px)] leading-[0.9] tracking-[-0.045em] text-[var(--sd-ink-strong)] [text-shadow:0_0_48px_rgb(169_139_255/0.35)]">
					Stardrift
				</h1>
				<p className="m-0 max-w-[500px] text-lg leading-[1.65] text-pretty text-[var(--sd-dim)]">
					{ROUND_SIZE} prompts a night. Type any answer that fits. The fewer
					players who say the same thing, the higher your ship flies.
				</p>
				<div className="flex flex-wrap gap-3.5">
					<Link to="/daily" className="sd-btn sd-btn--primary sd-btn--lg">
						{cta}
						<ArrowIcon />
					</Link>
					<Link to="/unlimited" className="sd-btn sd-btn--lg">
						<InfinityIcon />
						Play Unlimited
					</Link>
				</div>
				<p className="flex flex-wrap gap-x-6 gap-y-2 font-mono-sd text-xs tracking-[0.14em] text-[var(--sd-mute)] uppercase">
					<span>{ROUND_SIZE} prompts</span>
					<span aria-hidden className="text-white/20">
						/
					</span>
					<span>{SECONDS_PER_PROMPT} s each</span>
					<span aria-hidden className="text-white/20">
						/
					</span>
					<span>New sky every night</span>
				</p>
			</div>
			<div className="flex min-w-0 flex-[1_1_420px] justify-center">
				<OrbitScan tonight={tonight} />
			</div>
		</section>
	);
}

/** Altitude where the ship reaches the outermost ring (a near-perfect night). */
const SCAN_CEILING_KM = 15_000;

/**
 * Radar of tonight's flight: the ship circles on a ring that widens with
 * altitude, from just above the planet to the outer edge.
 */
function OrbitScan({ tonight }: { tonight: Tonight }) {
	const reach = Math.min(1, Math.sqrt(tonight.km / SCAN_CEILING_KM));
	const ring = 40 - reach * 36; // inset %, 40 = hugging the planet
	const orbit = orbitFor(tonight.km);
	const label =
		tonight.status === "ready"
			? "Orbit display: tonight’s flight hasn’t launched yet"
			: `Orbit display: your ship in ${orbit.toLowerCase()} at ${formatKm(tonight.km)}${tonight.night ? ` for night ${tonight.night}` : ""}`;
	return (
		<div
			role="img"
			aria-label={label}
			className="relative aspect-square w-[min(480px,100%)]"
		>
			<span
				aria-hidden
				className="absolute inset-x-0 top-1/2 h-px bg-white/6"
			/>
			<span
				aria-hidden
				className="absolute inset-y-0 left-1/2 w-px bg-white/6"
			/>
			<span
				aria-hidden
				className="sd-sweep absolute inset-[2%] rounded-full bg-[conic-gradient(from_0deg,rgb(125_227_244/0)_0deg,rgb(125_227_244/0)_300deg,rgb(125_227_244/0.14)_360deg)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[2%] rounded-full border border-[rgb(245_198_107/0.28)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[11%] rounded-full border border-dashed border-[rgb(255_125_193/0.45)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[20%] rounded-full border border-[rgb(169_139_255/0.3)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[29%] rounded-full border border-[rgb(125_227_244/0.28)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[37%] rounded-full border border-[rgb(201_206_230/0.22)]"
			/>
			<span
				aria-hidden
				className="absolute inset-[43%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#8e7cff_0%,#3c2c8f_55%,#160f3a_100%)] shadow-[0_0_60px_rgb(142_124_255/0.55),inset_-8px_-10px_18px_rgb(0_0_0/0.45)]"
			/>
			<span
				aria-hidden
				className="sd-orbit absolute rounded-full transition-[inset] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
				style={{ inset: `${ring}%` }}
			>
				<span className="absolute top-0 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 rotate-90 items-center justify-center rounded-full border border-[var(--sd-gold)] bg-[rgb(5_6_15/0.85)] text-[#fff6e0] shadow-[0_0_24px_var(--sd-gold)]">
					<ShipIcon />
				</span>
			</span>
			<span
				aria-hidden
				className="absolute top-[4%] right-0 text-right font-mono-sd text-[11px] leading-[1.7] tracking-[0.16em] text-[var(--sd-mute)]"
			>
				ORBIT SCAN
				<br />
				NIGHT {tonight.night ? pad3(tonight.night) : "———"}
			</span>
			<div className="hud absolute bottom-[2%] left-0 flex flex-col gap-1.5 border border-white/10 bg-[rgb(10_12_28/0.82)] px-[18px] py-3.5 font-mono-sd text-[11px] tracking-[0.14em] text-[var(--sd-mute)] uppercase backdrop-blur-sm">
				<span>Altitude</span>
				<span className="font-display text-[28px] tracking-[-0.01em] text-[var(--sd-ink-strong)] normal-case">
					{Math.round(tonight.km).toLocaleString("en-US")}{" "}
					<span className="text-[15px] text-[var(--sd-dim)]">km</span>
				</span>
				<span className="text-[#ff9ad0]">
					<span aria-hidden>● </span>
					{tonight.status === "ready" ? "Awaiting launch" : orbit}
				</span>
			</div>
		</div>
	);
}

/* ───────── flight log ───────── */

function SectionRule({ id, children }: { id: string; children: string }) {
	return (
		<div className="flex items-center gap-4">
			<h2
				id={id}
				className="m-0 font-mono-sd text-xs font-medium tracking-[0.26em] text-[var(--sd-mute)] uppercase"
			>
				{"// "}
				{children}
			</h2>
			<span
				aria-hidden
				className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent"
			/>
		</div>
	);
}

const STATUS = {
	complete: {
		text: "Complete",
		className: "border-[rgb(125_227_244/0.4)] text-[var(--sd-cyan)]",
	},
	flying: {
		text: "In flight",
		className: "border-[rgb(245_198_107/0.45)] text-[var(--sd-gold)]",
	},
	ready: {
		text: "Ready",
		className: "border-white/15 text-[var(--sd-dim)]",
	},
} as const;

const logCard =
	"sd-panel hud flex min-w-0 flex-[1_1_300px] flex-col gap-[18px] p-7";

function FlightLog({
	tonight,
	today,
	save,
}: {
	tonight: Tonight;
	today: string | null;
	save: SaveData | null;
}) {
	const flight = tonight.run?.flight ?? [];
	const hits = flight.filter((s) => s.answer).length;
	const streak = today && save ? streaks(save, today).current : 0;
	const week = Array.from({ length: 7 }, (_, i) =>
		today && save ? Boolean(save.daily[addDays(today, i - 6)]) : false,
	);
	const status = STATUS[tonight.status];

	return (
		<section aria-labelledby="log-h" className="flex flex-col gap-5 pb-24">
			<SectionRule id="log-h">Flight log</SectionRule>
			<div className="flex flex-wrap gap-5">
				<div className={logCard}>
					<div className="sd-label flex items-center justify-between">
						<span>Tonight</span>
						<span className={`border px-2.5 py-1 ${status.className}`}>
							{status.text}
						</span>
					</div>
					<p className="flex items-baseline gap-3.5">
						<span className="font-display text-[52px] leading-none">
							{tonight.night ? `#${tonight.night}` : "—"}
						</span>
						{tonight.status !== "ready" && (
							<span className="font-mono-sd text-sm text-[var(--sd-dim)]">
								{hits}/{ROUND_SIZE}
							</span>
						)}
					</p>
					<div aria-hidden className="flex gap-1">
						{Array.from({ length: ROUND_SIZE }, (_, i) => {
							const step = flight[i];
							const cls = !step
								? "border border-white/12"
								: step.answer
									? "bg-[var(--sd-gold)] shadow-[0_0_8px_rgb(245_198_107/0.4)]"
									: "bg-white/18";
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
							return <span key={i} className={`h-1.5 flex-1 ${cls}`} />;
						})}
					</div>
					<p className="flex justify-between text-sm text-[var(--sd-dim)]">
						{tonight.status === "ready" ? (
							<>
								<span>Not flown yet</span>
								<Link to="/daily" className="sd-link">
									Launch <ArrowIcon size={14} />
								</Link>
							</>
						) : (
							<>
								<span>{formatKm(tonight.km)}</span>
								<span>{orbitFor(tonight.km)}</span>
							</>
						)}
					</p>
				</div>

				<div className={logCard}>
					<p className="sd-label">Streak</p>
					<p className="flex items-baseline gap-3">
						<span className="font-display text-[52px] leading-none">
							{streak}
						</span>
						<span className="text-lg text-[var(--sd-dim)]">
							{streak === 1 ? "night" : "nights"}
						</span>
					</p>
					<div
						role="img"
						aria-label={`Played ${week.filter(Boolean).length} of the last 7 nights`}
						className="flex h-[22px] items-end gap-1.5"
					>
						{week.map((lit, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: one slot per weekday
								key={i}
								className={`flex-1 ${lit ? "h-full bg-[var(--sd-gold)] shadow-[0_0_10px_var(--sd-gold)]" : "h-[40%] bg-white/12"}`}
							/>
						))}
					</div>
					<Link to="/stats" className="sd-link">
						All stats <ArrowIcon size={14} />
					</Link>
				</div>

				<div className={logCard}>
					<p className="sd-label">Missed a night?</p>
					<p className="font-display text-[52px] leading-none">Archive</p>
					<p className="text-sm leading-normal text-[var(--sd-dim)]">
						Every past sky stays open. Fly any night you missed.
					</p>
					<Link to="/archive" className="sd-link mt-auto">
						Browse past orbits <ArrowIcon size={14} />
					</Link>
				</div>
			</div>
		</section>
	);
}

/* ───────── how to play ───────── */

const STEPS = [
	{
		color: "var(--sd-cyan)",
		border: "rgb(125 227 244 / 0.35)",
		Icon: TimerIcon,
		title: "Read the prompt",
		body: `Each night brings ${ROUND_SIZE} prompts, like “Name a chemical element”. You get ${SECONDS_PER_PROMPT} seconds for each.`,
		demo: (
			<div className="flex justify-between border border-dashed border-white/14 px-3.5 py-3 font-mono-sd text-[13px] text-[#c9cee6]">
				<span>Name a chemical element</span>
				<span className="text-[var(--sd-cyan)]">
					00:{String(SECONDS_PER_PROMPT).padStart(2, "0")}
				</span>
			</div>
		),
	},
	{
		color: "var(--sd-violet)",
		border: "rgb(169 139 255 / 0.35)",
		Icon: KeyboardIcon,
		title: "Answer anything that fits",
		body: "Type any valid answer. Small typos are forgiven, and an answer we don’t recognise can be tried again.",
		demo: (
			<div className="flex items-center gap-0.5 border border-dashed border-white/14 px-3.5 py-3 font-mono-sd text-[13px] text-[var(--sd-ink-strong)]">
				<span>Ytterbium</span>
				<span aria-hidden className="sd-caret h-4 w-2 bg-[var(--sd-violet)]" />
			</div>
		),
	},
	{
		color: "var(--sd-gold)",
		border: "rgb(245 198 107 / 0.4)",
		Icon: ClimbIcon,
		title: "Fly on rare answers",
		body: "The fewer players who gave the same answer, the rarer it is and the higher your ship climbs.",
		demo: (
			<div aria-hidden className="flex h-[46px] items-end gap-1.5">
				{TIERS.map((t, i) => (
					<span
						key={t.id}
						className="flex-1"
						style={{
							height: `${20 + i * 20}%`,
							background: t.color,
							opacity: 0.5 + i * 0.125,
							boxShadow:
								i === TIERS.length - 1 ? `0 0 14px ${t.color}` : undefined,
						}}
					/>
				))}
			</div>
		),
	},
];

function HowToPlay() {
	return (
		<section aria-labelledby="how-h" className="flex flex-col gap-9 pb-24">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-3">
					<p className="font-mono-sd text-xs tracking-[0.26em] text-[var(--sd-gold)] uppercase">
						{"// Flight protocol"}
					</p>
					<h2 id="how-h" className="m-0 font-display text-[44px] leading-tight">
						How to play
					</h2>
				</div>
				<p className="font-mono-sd text-xs tracking-[0.14em] text-[var(--sd-mute)] uppercase">
					3 steps · ~5 minutes
				</p>
			</div>
			<ol className="flex flex-wrap gap-5">
				{STEPS.map(({ Icon, ...step }, i) => (
					<li
						key={step.title}
						className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 border border-[var(--sd-line)] bg-[rgb(12_14_32/0.6)] p-7 backdrop-blur-sm"
						style={{ borderTop: `2px solid ${step.color}` }}
					>
						<div className="flex items-center justify-between">
							<span
								className="font-mono-sd text-[40px] font-medium tracking-[-0.02em]"
								style={{ color: step.color }}
							>
								{String(i + 1).padStart(2, "0")}
							</span>
							<span
								className="flex size-11 items-center justify-center border"
								style={{ color: step.color, borderColor: step.border }}
							>
								<Icon />
							</span>
						</div>
						<h3 className="m-0 font-display text-2xl tracking-[-0.01em]">
							{step.title}
						</h3>
						<p className="m-0 text-[15px] leading-relaxed text-[var(--sd-dim)]">
							{step.body}
						</p>
						<div className="mt-auto">{step.demo}</div>
					</li>
				))}
			</ol>
		</section>
	);
}

/* ───────── rarity spectrum ───────── */

function RaritySpectrum() {
	const rarest = TIERS[TIERS.length - 1];
	return (
		<section
			aria-labelledby="tier-h"
			className="sd-panel hud mb-28 flex flex-col gap-7 p-6 sm:p-10"
		>
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div className="flex max-w-[560px] flex-col gap-3">
					<p className="sd-label text-xs tracking-[0.26em]">
						{"// Rarity spectrum"}
					</p>
					<h2
						id="tier-h"
						className="m-0 font-display text-[32px] leading-[1.15] tracking-[-0.02em]"
					>
						The rarer the answer, the higher you climb.
					</h2>
				</div>
				<p className="sd-label flex gap-2.5 tracking-[0.16em]">
					<span>Common</span>
					<span aria-hidden>→</span>
					<span style={{ color: rarest.color }}>Rarest</span>
				</p>
			</div>
			<ol className="flex flex-wrap gap-2">
				{TIERS.map((t, i) => (
					<li
						key={t.id}
						className="flex flex-[1_1_150px] flex-col gap-2.5 p-4"
						style={{
							borderTop: `3px solid ${t.color}`,
							background: `color-mix(in srgb, ${t.color} 7%, transparent)`,
							boxShadow:
								t === rarest
									? `0 -10px 30px -12px color-mix(in srgb, ${t.color} 50%, transparent)`
									: undefined,
						}}
					>
						<span className="font-mono-sd text-[11px] text-[var(--sd-mute)]">
							T{i + 1} · +{formatKm(t.climbKm)}
						</span>
						<span className="font-display text-xl" style={{ color: t.color }}>
							{t.name}
						</span>
					</li>
				))}
			</ol>
			<p className="sd-prose m-0 text-[15px] leading-[1.7] text-[var(--sd-dim)]">
				Play tonight’s sky, catch up on past nights in the{" "}
				<Link to="/archive">archive</Link>, keep going in{" "}
				<Link to="/unlimited">unlimited mode</Link>, or{" "}
				<Link to="/party">start a party with friends</Link>.
			</p>
		</section>
	);
}
