import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CenteredLoading } from "#/components/game/DailyGame";
import { Game } from "#/components/game/Game";
import { Panel, Shell } from "#/components/game/Shell";
import { useSaveActions } from "#/game/storage";
import { getRandomRound } from "#/game/submit";
import { seo } from "#/lib/seo";

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
				/>
			) : (
				<CenteredLoading />
			)}
		</Shell>
	);
}
