import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loading, Panel, Shell } from "#/components/game/Shell";
import { getSupportStatus } from "#/game/support";
import { authClient } from "#/lib/auth-client";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/support")({
	validateSearch: z.object({
		/** set by Polar's success redirect */
		thanks: z.coerce.number().optional(),
	}),
	head: () =>
		seo({
			title: "Support Stardrift",
			path: "/support",
			description:
				"Chip in to keep the night sky running and get a supporter star on the leaderboard.",
		}),
	component: Support,
});

function Support() {
	const { thanks } = Route.useSearch();
	const status = useQuery({
		queryKey: ["support-status"],
		queryFn: () => getSupportStatus(),
		// right after checkout the webhook may still be on its way
		refetchInterval: (q) =>
			thanks && q.state.data?.signedIn && !q.state.data.supporter
				? 3000
				: false,
	});

	return (
		<Shell>
			<Panel className="mx-auto max-w-lg">
				<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
					Support Stardrift
				</p>
				<h1 className="font-display mt-2 text-4xl text-[var(--sd-ink)]">
					Keep the sky lit
				</h1>

				{thanks ? (
					<p className="mt-4 rounded-xl border border-[var(--sd-gold)]/30 bg-white/[0.04] p-4 text-[var(--sd-ink)]">
						Thank you! That genuinely means a lot.{" "}
						{status.data?.supporter
							? "Your ★ is on the leaderboard."
							: status.data?.signedIn
								? "Your ★ will show up on the leaderboard in a moment."
								: "Sign in with the email you paid with and your ★ will show up on the leaderboard."}
					</p>
				) : null}

				<div className="mt-4 grid gap-3 text-[var(--sd-dim)]">
					<p>
						Every night there’s a new sky to write, and servers to keep running
						so everyone’s answers can be counted together.
					</p>
					<p>
						The game is free: no limits. If you enjoy it, you can chip in
						whatever feels right.
					</p>
					<p>
						Supporters get a{" "}
						<span className="text-[var(--sd-gold)]">★ supporter star</span> next
						to their name on the leaderboard. That’s it, and thank you.
					</p>
				</div>

				<div className="mt-6">
					{status.isPending ? (
						<Loading />
					) : status.isError || !status.data.enabled ? (
						<p className="text-sm text-[var(--sd-dim)]">
							Support isn’t open just yet. Check back soon!
						</p>
					) : (
						<SupportActions
							signedIn={status.data.signedIn}
							supporter={status.data.supporter}
						/>
					)}
				</div>
			</Panel>
		</Shell>
	);
}

function SupportActions({
	signedIn,
	supporter,
}: {
	signedIn: boolean;
	supporter: boolean;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const checkout = async () => {
		setError(null);
		setBusy(true);
		// redirects to Polar; signed-in checkouts are tied to the account
		const res = await authClient.checkout({ slug: "support" });
		if (res?.error) {
			setBusy(false);
			setError("Couldn’t open checkout. Try again in a moment.");
		}
	};

	if (signedIn) {
		return (
			<>
				{supporter && (
					<p className="mb-3 text-sm text-[var(--sd-gold)]">
						★ You’re a supporter. Thank you!
					</p>
				)}
				<button
					type="button"
					className="sd-btn sd-btn--primary"
					disabled={busy}
					onClick={checkout}
				>
					{busy
						? "Opening checkout…"
						: supporter
							? "Chip in again"
							: "Support Stardrift"}
				</button>
				<ErrorLine error={error} />
			</>
		);
	}

	return (
		<>
			<p className="mb-3 text-sm text-[var(--sd-dim)]">
				Sign in first to get your supporter star on the leaderboard.
			</p>
			<div className="flex mt-10 flex-wrap items-center gap-3">
				<Link
					to="/account"
					search={{ next: "/support" }}
					className="sd-btn sd-btn--primary"
				>
					Sign in & support
				</Link>
				<button
					type="button"
					className="text-sm text-[var(--sd-dim)] underline"
					disabled={busy}
					onClick={checkout}
				>
					{busy ? "Opening checkout…" : "Support without an account"}
				</button>
			</div>
			<ErrorLine error={error} />
		</>
	);
}

function ErrorLine({ error }: { error: string | null }) {
	return (
		<p className="mt-3 min-h-5 text-sm text-[var(--sd-red)]" aria-live="polite">
			{error}
		</p>
	);
}
