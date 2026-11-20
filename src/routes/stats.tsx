import { createFileRoute } from "@tanstack/react-router";
import { Loading, Panel, Shell, useToday } from "#/components/game/Shell";
import { ROUND_SIZE } from "#/game/engine";
import { formatKm } from "#/game/rarity";
import { runAltitude, streaks, useSave } from "#/game/storage";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/stats")({
	head: () =>
		seo({
			title: "Your flight log",
			path: "/stats",
			description: "Your Stardrift streaks, altitudes and results.",
			noindex: true,
		}),
	component: Stats,
});

function Stats() {
	const today = useToday();
	const save = useSave();

	if (!today || !save) {
		return (
			<Shell>
				<Loading />
			</Shell>
		);
	}

	const results = Object.values(save.daily);
	const scores = results.map((r) => r.marks.filter((m) => m === "hit").length);
	const { current, best } = streaks(save, today);
	const dist = Array.from(
		{ length: ROUND_SIZE + 1 },
		(_, n) => scores.filter((s) => s === n).length,
	);
	const max = Math.max(1, ...dist);

	const altitudes = results.map(runAltitude);
	const highest = Math.max(0, ...altitudes, save.unlimited.bestKm);
	const tiles = [
		{ label: "Nights played", value: results.length },
		{ label: "Current streak", value: current },
		{ label: "Best streak", value: best },
		{
			label: "Avg altitude",
			value: altitudes.length
				? formatKm(altitudes.reduce((a, b) => a + b, 0) / altitudes.length)
				: "—",
		},
		{ label: "Highest flight", value: formatKm(highest), wide: true },
	];

	return (
		<Shell>
			<h1 className="font-display text-4xl text-[var(--sd-ink)]">Flight log</h1>
			<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				{tiles.map((t) => (
					<Panel
						key={t.label}
						className={`!p-4 ${t.wide ? "col-span-2 sm:col-span-4" : ""}`}
					>
						<p className="text-xs uppercase tracking-[0.15em] text-[var(--sd-dim)]">
							{t.label}
						</p>
						<p className="font-display mt-1 text-3xl text-[var(--sd-ink)]">
							{t.value}
						</p>
					</Panel>
				))}
			</div>

			<Panel className="mt-4">
				<p className="text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
					Answers landed per night
				</p>
				<ul className="mt-4 grid gap-2">
					{dist
						.map((count, n) => ({ count, n }))
						.reverse()
						.map(({ count, n }) => (
							<li
								key={n}
								className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm"
							>
								<span className="truncate text-[var(--sd-dim)]">
									{n} landed
								</span>
								<span className="h-3 overflow-hidden rounded-full bg-white/5">
									<span
										className="block h-full rounded-full bg-[var(--sd-gold)]"
										style={{ width: `${(count / max) * 100}%` }}
									/>
								</span>
								<span className="text-right text-[var(--sd-ink)]">{count}</span>
							</li>
						))}
				</ul>
			</Panel>

			<Panel className="mt-4">
				<p className="text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
					Unlimited
				</p>
				<p className="mt-2 text-[var(--sd-ink)]">
					{save.unlimited.played} rounds · best {save.unlimited.best}/
					{ROUND_SIZE} ·{" "}
					{save.unlimited.played
						? `${Math.round((save.unlimited.correct / (save.unlimited.played * ROUND_SIZE)) * 100)}% accuracy`
						: "no rounds yet"}
				</p>
			</Panel>
		</Shell>
	);
}
