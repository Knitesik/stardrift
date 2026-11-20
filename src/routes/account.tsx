import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loading, Panel, Shell } from "#/components/game/Shell";
import { authClient } from "#/lib/auth-client";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/account")({
	validateSearch: z.object({
		next: z.string().startsWith("/").optional(),
		/** set by Better Auth when the Google sign-in fails */
		error: z.string().optional(),
	}),
	head: () =>
		seo({
			title: "Sign in",
			path: "/account",
			description:
				"Sign in or create a Stardrift account to keep your streaks and stats across devices.",
			noindex: true,
		}),
	component: Account,
});

function Account() {
	const { data: session, isPending } = authClient.useSession();
	// The session can briefly go back to "pending" when it refetches (e.g. on
	// window focus). Only show the spinner on the first check.
	const [checked, setChecked] = useState(false);
	useEffect(() => {
		if (!isPending) setChecked(true);
	}, [isPending]);

	return (
		<Shell>
			{isPending && !checked ? (
				<Loading />
			) : session ? (
				<Profile
					name={session.user.name}
					email={session.user.email}
					admin={session.user.role === "admin"}
				/>
			) : (
				<AuthForm />
			)}
		</Shell>
	);
}

function Profile({
	name,
	email,
	admin,
}: {
	name: string;
	email: string;
	admin: boolean;
}) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	return (
		<Panel className="mx-auto max-w-md text-center">
			<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
				Signed in
			</p>
			<h1 className="font-display mt-2 text-4xl text-[var(--sd-ink)]">
				{name}
			</h1>
			<p className="mt-1 text-[var(--sd-dim)]">{email}</p>
			{admin && (
				<Link
					to="/admin"
					className="sd-btn mr-4 sd-btn--primary mt-6 inline-flex"
				>
					Match log
				</Link>
			)}
			<button
				type="button"
				className="sd-btn mt-6"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					await authClient.signOut();
					navigate({ to: "/" });
				}}
			>
				{busy ? "Signing out…" : "Sign out"}
			</button>
		</Panel>
	);
}

function AuthForm() {
	const search = Route.useSearch();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(
		search.error ? "Google sign-in didn’t go through. Try again." : null,
	);

	const signIn = async () => {
		setError(null);
		setBusy(true);
		const res = await authClient.signIn.social({
			provider: "google",
			callbackURL: search.next ?? "/",
			errorCallbackURL: "/account",
		});
		// on success the browser is already heading to Google
		if (res.error) {
			setBusy(false);
			setError(res.error.message ?? "Something went wrong. Try again.");
		}
	};

	return (
		<Panel className="mx-auto max-w-md text-center">
			<h1 className="font-display text-4xl text-[var(--sd-ink)]">Sign in</h1>
			<p className="mt-2 text-[var(--sd-dim)]">
				Keep your streaks and stats across devices, and host parties.
			</p>

			<button
				type="button"
				className="sd-btn sd-btn--primary mt-6"
				disabled={busy}
				onClick={signIn}
			>
				{busy ? "One moment…" : "Continue with Google ↑"}
			</button>

			<p
				className="mt-4 min-h-5 text-sm text-[var(--sd-red)]"
				aria-live="polite"
			>
				{error}
			</p>
		</Panel>
	);
}
