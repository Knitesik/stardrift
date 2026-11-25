import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import planetFar from "#/assets/planets/planet00.png";
import planetMid from "#/assets/planets/planet04.png";
import planetNear from "#/assets/planets/planet09.png";
import { dayNumber, localDateKey } from "#/game/engine";
import { authClient } from "#/lib/auth-client";
import { ShipIcon } from "./icons";

/** "Sign in", or the signed-in call sign, linking to /account. */
function AccountLink() {
	const { data: session, isPending } = authClient.useSession();
	if (isPending) return <span className="h-11 w-24" aria-hidden />;
	if (!session) {
		return (
			<Link to="/account" className="sd-chip-link px-4">
				Sign in
			</Link>
		);
	}
	const name = session.user.name;
	return (
		<Link
			to="/account"
			aria-label={`Your profile: ${name}`}
			className="sd-chip-link max-w-[14rem] py-1 pr-4 pl-1"
		>
			<span
				aria-hidden
				className="flex size-[34px] flex-none items-center justify-center rounded-full border border-[var(--sd-gold)] bg-[#1b1840] font-display text-sm font-semibold text-[var(--sd-gold)]"
			>
				{name.trim().charAt(0).toUpperCase() || "?"}
			</span>
			<span className="truncate">{name}</span>
		</Link>
	);
}

/** Today's local date key, or null until mounted (keeps SSR and client in sync). */
export function useToday() {
	const [today, setToday] = useState<string | null>(null);
	useEffect(() => setToday(localDateKey()), []);
	return today;
}

const NAV = [
	{ to: "/daily", label: "Tonight", live: true },
	{ to: "/unlimited", label: "Unlimited" },
	{ to: "/party", label: "Party" },
	{ to: "/archive", label: "Archive" },
	{ to: "/stats", label: "Stats" },
] as const;

export function Shell({
	children,
	immersive = false,
	wide = false,
}: {
	children: React.ReactNode;
	/** the page draws its own full-screen scene behind the content */
	immersive?: boolean;
	/** full 1200px column (the home page) instead of the reading column */
	wide?: boolean;
}) {
	return (
		<div
			className={`sd-root relative flex min-h-dvh flex-col overflow-x-hidden ${immersive ? "sd-root--immersive" : ""}`}
		>
			{!immersive && <Backdrop />}
			<header className="relative z-20 mx-auto w-full max-w-[1264px] px-4 sm:px-8">
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--sd-line)] py-4 sm:py-[22px]">
					<Link
						to="/"
						className="flex min-h-11 items-center gap-3 text-[var(--sd-ink-strong)]"
						aria-label="Stardrift home"
					>
						<span className="sd-brand-mark">
							<ShipIcon trail="var(--sd-gold)" />
						</span>
						<span className="sd-brand" aria-hidden>
							STARDRIFT
						</span>
					</Link>
					<nav
						className="sd-nav order-last w-full md:order-none md:w-auto"
						aria-label="Main"
					>
						{NAV.map((n) => (
							<Link key={n.to} to={n.to}>
								{"live" in n && (
									<span className="sd-live-dot text-[var(--sd-gold)]" />
								)}
								{n.label}
							</Link>
						))}
					</nav>
					<AccountLink />
				</div>
			</header>
			<main
				className={
					immersive
						? "relative z-10 flex-1"
						: `relative z-10 mx-auto w-full flex-1 px-4 pb-16 sm:px-8 ${wide ? "max-w-[1264px]" : "max-w-3xl pt-10"}`
				}
			>
				{children}
			</main>
			{!immersive && <Footer />}
		</div>
	);
}

/** Stars, the violet bloom, drifting planets and the horizon grid. */
function Backdrop() {
	return (
		<>
			<div aria-hidden className="sd-stars" />
			<div aria-hidden className="sd-stars sd-stars--far" />
			<div aria-hidden className="sd-glow" />
			<img
				src={planetFar}
				alt=""
				aria-hidden
				decoding="async"
				className="sd-planet sd-planet--far"
			/>
			<img
				src={planetMid}
				alt=""
				aria-hidden
				decoding="async"
				className="sd-planet sd-planet--mid"
			/>
			<img
				src={planetNear}
				alt=""
				aria-hidden
				decoding="async"
				className="sd-planet sd-planet--near"
			/>
			<div aria-hidden className="sd-horizon" />
		</>
	);
}

function Footer() {
	const today = useToday();
	return (
		<footer className="relative z-10 mx-auto w-full max-w-[1264px] px-4 sm:px-8">
			<div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--sd-line)] pt-7 pb-10 font-mono-sd text-xs tracking-[0.16em] text-[var(--sd-mute)] uppercase">
				<span>
					Stardrift
					{today && ` · Night ${String(dayNumber(today)).padStart(3, "0")}`}
				</span>
				<span className="flex items-center gap-5">
					<Link to="/support" className="hover:text-[var(--sd-gold)]">
						Support
					</Link>
					<span className="flex items-center gap-2">
						<span className="sd-live-dot text-[var(--sd-cyan)]" />
						New sky at nightfall
					</span>
				</span>
			</div>
		</footer>
	);
}

export function Panel({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={`sd-panel hud p-5 sm:p-7 ${className}`}>{children}</div>
	);
}

export function Loading() {
	return (
		<Panel className="text-center text-[var(--sd-dim)]">
			<p className="animate-pulse">Aligning telescopes…</p>
		</Panel>
	);
}
