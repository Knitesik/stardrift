import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CenteredLoading } from "#/components/game/DailyGame";
import { Game } from "#/components/game/Game";
import { Panel, Shell } from "#/components/game/Shell";
import { useSave, useSaveActions } from "#/game/storage";
import { getRandomRound } from "#/game/submit";
import { getSupportStatus } from "#/game/support";
import { authClient } from "#/lib/auth-client";
import { seo } from "#/lib/seo";

/** Guests are asked to sign in from this many finished flights on. */
const SIGN_IN_NUDGE_AFTER = 3;
const NUDGE_DISMISSED_KEY = "sd_signin_nudge_dismissed";
/** Anyone is asked to support Stardrift from this many finished flights on. */
const SUPPORT_NUDGE_AFTER = 5;
const SUPPORT_DISMISSED_KEY = "sd_support_nudge_dismissed";

export const Route = createFileRoute("/unlimited")({
	head: () =>
		seo({
			title: "Unlimited play",
			path: "/unlimited",
			description:
				"Play as many Stardrift rounds as you like. Fresh random prompts every flight: find the rare answers nobody else thinks of.",
		}),
	component: Unlimited,
});

function Unlimited() {
	const [flight, setFlight] = useState(0);
	const { recordUnlimited } = useSaveActions();
	const round = useMutation({ mutationFn: () => getRandomRound() });
	const { mutate } = round;

	// a fresh random round on mount and on every "New flight"
	// biome-ignore lint/correctness/useExhaustiveDependencies: `flight` triggers a new round
	useEffect(() => {
		mutate();
	}, [flight, mutate]);

	return (
		<Shell immersive>
			{round.isError ? (
				<div className="sd-dock sd-dock--center">
					<Panel className="text-center">
						<h1 className="font-display text-3xl text-[var(--sd-ink)]">
							Couldn’t load prompts
						</h1>
						<button
							type="button"
							className="sd-btn sd-btn--primary mt-6"
							onClick={() => setFlight((n) => n + 1)}
						>
							Retry
						</button>
					</Panel>
				</div>
			) : round.data && !round.isPending ? (
				<Game
					key={flight}
					label="Unlimited"
					round={round.data}
					onFinish={recordUnlimited}
					onPlayAgain={() => setFlight((n) => n + 1)}
					playAgainLabel="New flight"
					notice={<Nudges />}
				/>
			) : (
				<CenteredLoading />
			)}
		</Shell>
	);
}

/**
 * At most one card under the results: the sign-in ask for guests first, then
 * the support ask. Dismissing either hides it for the rest of the browser
 * session.
 */
function Nudges() {
	const { data: session, isPending } = authClient.useSession();
	const save = useSave();
	const signIn = useSessionDismissal(NUDGE_DISMISSED_KEY);
	const support = useSessionDismissal(SUPPORT_DISMISSED_KEY);

	const played = save?.unlimited.played ?? 0;
	if (isPending) return null;
	if (!session && !signIn.dismissed && played >= SIGN_IN_NUDGE_AFTER) {
		return <SignInNudge played={played} onDismiss={signIn.dismiss} />;
	}
	if (!support.dismissed && played >= SUPPORT_NUDGE_AFTER) {
		return <SupportNudge played={played} onDismiss={support.dismiss} />;
	}
	return null;
}

function useSessionDismissal(key: string) {
	const [dismissed, setDismissed] = useState(() => {
		try {
			return window.sessionStorage.getItem(key) === "1";
		} catch {
			return false;
		}
	});
	const dismiss = () => {
		setDismissed(true);
		try {
			window.sessionStorage.setItem(key, "1");
		} catch {
			// storage blocked: it stays hidden until the page reloads
		}
	};
	return { dismissed, dismiss };
}

interface NudgeProps {
	played: number;
	onDismiss: () => void;
}

/** Asks guests who keep playing to sign in, so their progress follows them. */
function SignInNudge({ played, onDismiss }: NudgeProps) {
	return (
		<div className="mt-5 rounded-xl border border-[var(--sd-gold)]/30 bg-white/[0.04] p-4">
			<p className="font-semibold text-[var(--sd-ink)]">
				{played} flights in. Keep them.
			</p>
			<p className="mt-1 text-sm text-[var(--sd-dim)]">
				Your progress is tied to this browser. Sign in to keep it on every
				device.
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<Link
					to="/account"
					search={{ next: "/unlimited" }}
					className="sd-btn sd-btn--primary !px-4 !py-2 text-sm"
				>
					Sign in
				</Link>
				<button
					type="button"
					className="sd-btn !px-4 !py-2 text-sm"
					onClick={onDismiss}
				>
					Not now
				</button>
			</div>
		</div>
	);
}

/** Asks players who keep coming back to chip in, unless they already have. */
function SupportNudge({ played, onDismiss }: NudgeProps) {
	const status = useQuery({
		queryKey: ["support-status"],
		queryFn: () => getSupportStatus(),
		staleTime: 5 * 60_000,
	});
	if (!status.data?.enabled || status.data.supporter) return null;

	return (
		<div className="mt-5 rounded-xl border border-[var(--sd-gold)]/30 bg-white/[0.04] p-4">
			<p className="font-semibold text-[var(--sd-ink)]">
				{played} flights and counting.
			</p>
			<p className="mt-1 text-sm text-[var(--sd-dim)]">
				Stardrift is free with no ads. If you’re enjoying it, you can help keep
				the night sky running.
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<Link
					to="/support"
					className="sd-btn sd-btn--primary !px-4 !py-2 text-sm"
				>
					Support Stardrift
				</Link>
				<button
					type="button"
					className="sd-btn !px-4 !py-2 text-sm"
					onClick={onDismiss}
				>
					Not now
				</button>
			</div>
		</div>
	);
}
