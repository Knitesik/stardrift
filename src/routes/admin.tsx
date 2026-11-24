import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loading, Panel, Shell } from "#/components/game/Shell";
import {
	type AdminAnswer,
	type AdminMatch,
	getIsAdmin,
	listMatches,
	type MatchMode,
} from "#/game/admin";
import { dayNumber } from "#/game/engine";
import { formatKm, formatShare, TIER_BY_ID } from "#/game/rarity";
import { authClient } from "#/lib/auth-client";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/admin")({
	head: () =>
		seo({
			title: "Match log",
			path: "/admin",
			description: "Every Stardrift match played.",
			noindex: true,
		}),
	beforeLoad: async () => {
		if (!(await getIsAdmin())) {
			throw notFound();
		}
	},
	component: Admin,
});

const MODES = [
	{ id: "all", label: "All" },
	{ id: "daily", label: "Nightly" },
	{ id: "unlimited", label: "Unlimited" },
	{ id: "party", label: "Party" },
] as const;

type ModeFilter = (typeof MODES)[number]["id"];

function Admin() {
	const { data: session, isPending } = authClient.useSession();
	if (isPending) {
		return (
			<Shell>
				<Loading />
			</Shell>
		);
	}
	if (session?.user.role !== "admin") {
		return (
			<Shell>
				<Panel className="mx-auto max-w-md text-center">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						Admins only
					</h1>
					<p className="mt-3 text-[var(--sd-dim)]">
						{session
							? "This account can’t see the match log."
							: "Sign in with an admin account to see the match log."}
					</p>
					{!session && (
						<Link
							to="/account"
							search={{ next: "/admin" }}
							className="sd-btn sd-btn--primary mt-6 inline-flex"
						>
							Sign in
						</Link>
					)}
				</Panel>
			</Shell>
		);
	}
	return <MatchLog />;
}

function MatchLog() {
	const [mode, setMode] = useState<ModeFilter>("all");
	const [typed, setTyped] = useState("");
	const search = useDebounced(typed.trim(), 300);

	const query = useInfiniteQuery({
		queryKey: ["admin-matches", mode, search],
		queryFn: ({ pageParam }) =>
			listMatches({ data: { mode, search, before: pageParam } }),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.next,
	});
	const matches = query.data?.pages.flatMap((p) => p.matches) ?? [];
	const totals = query.data?.pages[0]?.totals;

	return (
		<Shell>
			<h1 className="font-display text-4xl text-[var(--sd-ink)]">Match log</h1>
			<p className="mt-2 text-[var(--sd-dim)]">
				Every finished match, by accounts and guests alike. Newest first.
			</p>

			<div className="mt-6 flex flex-wrap items-center gap-2">
				{MODES.map((m) => (
					<button
						key={m.id}
						type="button"
						aria-pressed={mode === m.id}
						onClick={() => setMode(m.id)}
						className={`sd-btn !px-4 !py-2 text-sm ${mode === m.id ? "sd-btn--primary" : ""}`}
					>
						{m.label}
						{totals && (
							<span className="ml-1.5 opacity-70">
								{totals[m.id].toLocaleString("en-US")}
							</span>
						)}
					</button>
				))}
				<label className="ml-auto w-full sm:w-64">
					<span className="sr-only">Search matches</span>
					<input
						type="search"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						placeholder="Name, email, guest id, party code"
						className="sd-input w-full !py-2 text-sm"
					/>
				</label>
			</div>

			<div className="mt-5">
				{query.isPending ? (
					<Loading />
				) : query.isError ? (
					<Panel className="text-center">
						<p className="text-[var(--sd-red)]">
							{query.error.message || "Couldn’t load matches."}
						</p>
						<button
							type="button"
							className="sd-btn mt-4"
							onClick={() => query.refetch()}
						>
							Retry
						</button>
					</Panel>
				) : matches.length === 0 ? (
					<Panel className="text-center text-[var(--sd-dim)]">
						No matches{search ? ` for “${search}”` : ""} yet.
					</Panel>
				) : (
					<ul className="grid gap-2">
						{matches.map((m) => (
							<li key={m.id}>
								<MatchRow match={m} />
							</li>
						))}
					</ul>
				)}
			</div>

			{query.hasNextPage && (
				<div className="mt-5 text-center">
					<button
						type="button"
						className="sd-btn"
						disabled={query.isFetchingNextPage}
						onClick={() => query.fetchNextPage()}
					>
						{query.isFetchingNextPage ? "Loading…" : "Load more"}
					</button>
				</div>
			)}
		</Shell>
	);
}

const MODE_LABEL: Record<MatchMode, string> = {
	daily: "Nightly",
	unlimited: "Unlimited",
	party: "Party",
};

function MatchRow({ match: m }: { match: AdminMatch }) {
	return (
		<details className="sd-panel group transition-colors open:border-[var(--sd-gold)]/30">
			<summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[9rem_1fr_auto_auto]">
				<span className="text-xs text-[var(--sd-dim)] sm:text-sm">
					{formatWhen(m.finishedAt)}
				</span>
				<span className="order-first col-span-2 min-w-0 sm:order-none sm:col-span-1">
					<PlayerLabel player={m.player} />
					<span className="ml-2 text-xs text-[var(--sd-dim)]">
						{MODE_LABEL[m.mode]}
						{m.night && ` · #${dayNumber(m.night)} (${m.night})`}
						{m.partyCode && ` · room ${m.partyCode}`}
					</span>
				</span>
				<span className="text-sm text-[var(--sd-ink)]">
					{m.correct}/{m.total}
				</span>
				<span className="hidden text-right text-sm text-[var(--sd-gold)] sm:inline">
					{formatKm(m.altitudeKm)}
				</span>
			</summary>
			<div className="border-t border-[var(--sd-line)] px-4 py-3">
				<PlayerDetail match={m} />
				<ol className="mt-3 grid gap-2">
					{m.answers.map((a, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed order
						<AnswerRow key={i} n={i + 1} answer={a} />
					))}
				</ol>
			</div>
		</details>
	);
}

function PlayerLabel({ player }: { player: AdminMatch["player"] }) {
	if (player.kind === "account") {
		return (
			<span className="font-semibold text-[var(--sd-ink)]">{player.name}</span>
		);
	}
	return (
		<span className="text-[var(--sd-ink)]">
			{player.name ? `${player.name} ` : ""}
			<span className="text-[var(--sd-dim)]">
				{player.kind === "guest"
					? `(guest ${player.id.slice(0, 8)})`
					: "(unknown guest)"}
			</span>
		</span>
	);
}

function PlayerDetail({ match: m }: { match: AdminMatch }) {
	const p = m.player;
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-[var(--sd-dim)]">
			<dt>Player</dt>
			<dd className="break-all text-[var(--sd-ink)]">
				{p.kind === "account"
					? `${p.name} · ${p.email} · account ${p.id}`
					: p.kind === "guest"
						? `Guest ${p.id}`
						: "No account or guest cookie"}
			</dd>
			{m.partyGame && (
				<>
					<dt>Party game</dt>
					<dd className="break-all">{m.partyGame}</dd>
				</>
			)}
			<dt>Altitude</dt>
			<dd>{formatKm(m.altitudeKm)}</dd>
			<dt>Finished</dt>
			<dd>{new Date(m.finishedAt).toLocaleString()}</dd>
		</dl>
	);
}

function AnswerRow({ n, answer: a }: { n: number; answer: AdminAnswer }) {
	const tier = a.tier ? TIER_BY_ID[a.tier] : null;
	return (
		<li className="grid grid-cols-[1.5rem_1fr] gap-x-2 text-sm">
			<span className="text-[var(--sd-dim)]">{n}.</span>
			<div className="min-w-0">
				<p className="text-[var(--sd-dim)]">{a.prompt}</p>
				<p className="mt-0.5 flex flex-wrap items-center gap-x-2">
					{a.answer ? (
						<span className="font-semibold text-[var(--sd-ink)]">
							{a.answer}
						</span>
					) : (
						<span className="italic text-[var(--sd-red)]">No answer</span>
					)}
					{tier && (
						<span className="text-xs" style={{ color: tier.color }}>
							{tier.name}
						</span>
					)}
					{a.share !== null && (
						<span className="text-xs text-[var(--sd-dim)]">
							{formatShare(a.share)} of players
						</span>
					)}
					<span className="text-xs text-[var(--sd-gold)]">
						+{formatKm(a.climbKm)}
					</span>
					{a.effect === "shared" && (
						<span className="text-xs text-[var(--sd-dim)]">
							shared by {a.sharedWith} in the room
						</span>
					)}
					{a.effect === "lone" && (
						<span className="text-xs text-[var(--sd-green)]">
							only one in the room
						</span>
					)}
				</p>
			</div>
		</li>
	);
}

function formatWhen(ms: number) {
	return new Date(ms).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function useDebounced<T>(value: T, ms: number) {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}
