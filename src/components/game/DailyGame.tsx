import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { dayNumber } from "#/game/engine";
import { useSave, useSaveActions } from "#/game/storage";
import { getNightRound } from "#/game/submit";
import { Game } from "./Game";
import { Loading, Panel } from "./Shell";

export function DailyGame({
	dateKey,
	today,
}: {
	dateKey: string;
	today: string;
}) {
	const save = useSave();
	const { saveProgress, recordDaily } = useSaveActions();
	const future = dateKey > today;
	const round = useQuery({
		queryKey: ["night", dateKey],
		queryFn: () => getNightRound({ data: { date: dateKey } }),
		enabled: !future,
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (future) {
		return (
			<div className="sd-dock sd-dock--center">
				<Panel className="text-center">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						That sky hasn’t risen yet
					</h1>
					<p className="mt-3 text-[var(--sd-dim)]">Come back on {dateKey}.</p>
					<Link to="/daily" className="sd-btn sd-btn--primary mt-6 inline-flex">
						Fly tonight’s
					</Link>
				</Panel>
			</div>
		);
	}

	if (round.isError || (round.isSuccess && !round.data?.length)) {
		return (
			<div className="sd-dock sd-dock--center">
				<Panel className="text-center">
					<h1 className="font-display text-3xl text-[var(--sd-ink)]">
						No prompts in the sky
					</h1>
					<p className="mt-3 text-[var(--sd-dim)]">
						We couldn’t load this night’s prompts. Try again in a moment.
					</p>
					<button
						type="button"
						className="sd-btn sd-btn--primary mt-6"
						onClick={() => round.refetch()}
					>
						Retry
					</button>
				</Panel>
			</div>
		);
	}

	if (!save || !round.data) return <CenteredLoading />;

	const prompts = round.data;
	const existing = save.daily[dateKey];
	const unfinished = save.inProgress[dateKey];
	// a saved run that already answered every prompt just needs closing out
	const complete =
		existing ??
		(unfinished && unfinished.flight.length >= prompts.length
			? unfinished
			: undefined);

	return (
		<Game
			key={dateKey}
			label={`#${dayNumber(dateKey)}`}
			round={prompts}
			finished={complete}
			resume={complete ? undefined : unfinished}
			onProgress={(run) => saveProgress(dateKey, run)}
			onFinish={(run) => recordDaily(dateKey, run)}
		/>
	);
}

export function CenteredLoading() {
	return (
		<div className="sd-dock sd-dock--center">
			<Loading />
		</div>
	);
}
