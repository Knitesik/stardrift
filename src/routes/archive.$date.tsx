import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CenteredLoading, DailyGame } from "#/components/game/DailyGame";
import { Panel, Shell, useToday } from "#/components/game/Shell";
import { dayNumber, EPOCH, isDateKey, latestOpenDate } from "#/game/engine";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/archive/$date")({
	beforeLoad: ({ params }) => {
		if (!isDateKey(params.date) || params.date < EPOCH) throw notFound();
	},
	head: ({ params }) =>
		seo({
			title: `Night #${dayNumber(params.date)}, ${formatNight(params.date)}`,
			path: `/archive/${params.date}`,
			description: `Play Stardrift night #${dayNumber(params.date)} from ${formatNight(params.date)}: a night of prompts where the rarest answers fly highest.`,
			// a night that hasn't started anywhere yet has nothing to index
			noindex: params.date > latestOpenDate(),
		}),
	component: ArchiveDay,
	notFoundComponent: () => (
		<Shell>
			<Panel className="text-center">
				<h1 className="font-display text-3xl text-[var(--sd-ink)]">
					No flight on that date
				</h1>
				<Link to="/archive" className="sd-btn sd-btn--primary mt-6 inline-flex">
					Back to the archive
				</Link>
			</Panel>
		</Shell>
	),
});

/** "November 17, 2026" for a yyyy-mm-dd key, independent of the server's zone. */
function formatNight(dateKey: string) {
	return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function ArchiveDay() {
	const { date } = Route.useParams();
	const today = useToday();
	return (
		<Shell immersive>
			{today ? <DailyGame dateKey={date} today={today} /> : <CenteredLoading />}
		</Shell>
	);
}
