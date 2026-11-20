import { createFileRoute } from "@tanstack/react-router";
import { CenteredLoading, DailyGame } from "#/components/game/DailyGame";
import { Shell, useToday } from "#/components/game/Shell";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/daily")({
	head: () =>
		seo({
			title: "Tonight’s prompts",
			path: "/daily",
			description:
				"Play tonight’s ten Stardrift prompts. Type any answer that fits; the fewer players who say the same thing, the higher you fly. A new sky every night.",
		}),
	component: Daily,
});

function Daily() {
	const today = useToday();
	return (
		<Shell immersive>
			{today ? (
				<DailyGame dateKey={today} today={today} />
			) : (
				<CenteredLoading />
			)}
		</Shell>
	);
}
