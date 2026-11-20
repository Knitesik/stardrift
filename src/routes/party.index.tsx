import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel, Shell } from "#/components/game/Shell";
import { NameField, saveName, useSavedName } from "#/components/party/NameForm";
import { authClient } from "#/lib/auth-client";
import { seo } from "#/lib/seo";
import { CODE_ALPHABET, CODE_LENGTH } from "#/party/protocol";

export const Route = createFileRoute("/party/")({
	head: () =>
		seo({
			title: "Play with friends",
			path: "/party",
			description:
				"Start a Stardrift party and play live with friends. Share a code, answer the same prompts together, and see who finds the rarest answers.",
		}),
	component: PartyHome,
});

const codePattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

function PartyHome() {
	const navigate = useNavigate();
	const [saved] = useSavedName();
	const { data: session, isPending } = authClient.useSession();
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	useEffect(() => {
		if (saved) setName(saved);
	}, [saved]);

	const cleanCode = code.trim().toUpperCase();
	const nameOk = name.trim().length > 0;
	const codeOk = codePattern.test(cleanCode);

	const go = (target: string) => {
		saveName(name.trim());
		navigate({ to: "/party/$code", params: { code: target } });
	};

	return (
		<Shell>
			<h1 className="font-display text-5xl text-[var(--sd-ink)]">
				Party flight
			</h1>
			<p className="mt-2 max-w-lg text-[var(--sd-dim)]">
				Fly with friends in real time. Everyone gets the same ten prompts, and
				the rarer your answer, the higher your ship climbs. Match a friend and
				you split the climb.
			</p>

			<Panel className="mt-8 grid gap-6 sm:grid-cols-2">
				<div className="sm:col-span-2">
					<NameField value={name} onChange={setName} autoFocus={!saved} />
				</div>
				{name && (
					<>
						<div>
							<h2 className="font-display text-2xl text-[var(--sd-ink)]">
								Start a party
							</h2>
							{session || isPending ? (
								<>
									<p className="mt-1 text-sm text-[var(--sd-dim)]">
										You’ll get a code to share.
									</p>
									<button
										type="button"
										className="sd-btn sd-btn--primary mt-4"
										disabled={!nameOk || isPending}
										onClick={() => go("NEW")}
									>
										Create party ↑
									</button>
								</>
							) : (
								<>
									<p className="mt-1 text-sm text-[var(--sd-dim)]">
										Hosting needs an account. Joining doesn’t.
									</p>
									<Link
										to="/account"
										search={{ next: "/party" }}
										onClick={() => saveName(name.trim())}
										className="sd-btn sd-btn--primary mt-4 inline-flex"
									>
										Sign in to host ↑
									</Link>
								</>
							)}
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								if (nameOk && codeOk) go(cleanCode);
							}}
						>
							<h2 className="font-display text-2xl text-[var(--sd-ink)]">
								Join a party
							</h2>
							<p className="mt-1 text-sm text-[var(--sd-dim)]">
								Enter the 5-letter code.
							</p>
							<div className="mt-4 flex gap-2">
								<input
									value={code}
									onChange={(e) => setCode(e.target.value)}
									maxLength={CODE_LENGTH}
									placeholder="ABCDE"
									aria-label="Party code"
									autoCapitalize="characters"
									autoComplete="off"
									spellCheck={false}
									className="sd-input w-32 uppercase tracking-[0.3em]"
								/>
								<button
									type="submit"
									className="sd-btn"
									disabled={!nameOk || !codeOk}
								>
									Join
								</button>
							</div>
						</form>
					</>
				)}{" "}
			</Panel>
		</Shell>
	);
}
