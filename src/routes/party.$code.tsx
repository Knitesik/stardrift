import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CenteredLoading } from "#/components/game/DailyGame";
import { Panel, Shell } from "#/components/game/Shell";
import { NameField, saveName, useSavedName } from "#/components/party/NameForm";
import { PartyGame } from "#/components/party/PartyGame";
import { seo } from "#/lib/seo";
import { CODE_ALPHABET, CODE_LENGTH } from "#/party/protocol";

const codePattern = new RegExp(`^([${CODE_ALPHABET}]{${CODE_LENGTH}}|NEW)$`);

export const Route = createFileRoute("/party/$code")({
	beforeLoad: ({ params }) => {
		if (!codePattern.test(params.code.toUpperCase())) throw notFound();
	},
	head: ({ params }) =>
		seo({
			title: `Party ${params.code.toUpperCase()}`,
			path: `/party/${params.code.toUpperCase()}`,
			description:
				"You’re invited to a Stardrift party. Join to play the same prompts live with friends.",
			noindex: true,
		}),
	component: PartyRoom,
	notFoundComponent: () => (
		<Shell>
			<Panel className="text-center">
				<h1 className="font-display text-3xl text-[var(--sd-ink)]">
					That’s not a party code
				</h1>
				<Link to="/party" className="sd-btn sd-btn--primary mt-6 inline-flex">
					Back to parties
				</Link>
			</Panel>
		</Shell>
	),
});

function PartyRoom() {
	const { code } = Route.useParams();
	const [name, setName] = useSavedName();
	const [draft, setDraft] = useState("");

	// null = still reading storage; "" = need a call sign first
	if (name === null) {
		return (
			<Shell immersive>
				<CenteredLoading />
			</Shell>
		);
	}

	if (!name) {
		return (
			<Shell>
				<Panel className="mx-auto max-w-md">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						Joining party {code.toUpperCase()}
					</h1>
					<form
						className="mt-5 grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							const n = draft.trim();
							if (!n) return;
							saveName(n);
							setName(n);
						}}
					>
						<NameField value={draft} onChange={setDraft} autoFocus />
						<button
							type="submit"
							className="sd-btn sd-btn--primary"
							disabled={!draft.trim()}
						>
							Board ship ↑
						</button>
					</form>
				</Panel>
			</Shell>
		);
	}

	return (
		<Shell immersive>
			{/* keyed on the call sign only: the code changing from NEW → real code keeps the socket */}
			<PartyGame key={name} code={code.toUpperCase()} name={name} />
		</Shell>
	);
}
