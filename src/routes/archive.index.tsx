import { createFileRoute, Link } from "@tanstack/react-router";
import { Loading, Shell, useToday } from "#/components/game/Shell";
import { archiveKeys, dayNumber, ROUND_SIZE } from "#/game/engine";
import { useSave } from "#/game/storage";
import { seo } from "#/lib/seo";

export const Route = createFileRoute("/archive/")({
	head: () =>
		seo({
			title: "Archive of past nights",
			path: "/archive",
			description:
				"Missed a night? Every past Stardrift sky is kept in the archive. Pick any date and play its prompts.",
		}),
	component: Archive,
});

function Archive() {
	const today = useToday();
	const save = useSave();

	return (
		<Shell>
			<h1 className="font-display text-4xl text-[var(--sd-ink)]">
				Past orbits
			</h1>
			<p className="mt-2 text-[var(--sd-dim)]">
				Every night’s sky, kept for late launches.
			</p>
			{!today || !save ? (
				<div className="mt-6">
					<Loading />
				</div>
			) : (
				<ul className="mt-6 grid gap-2 sm:grid-cols-2">
					{archiveKeys(today).map((key) => {
						const result = save.daily[key];
						const score = result?.marks.filter((m) => m === "hit").length;
						return (
							<li key={key}>
								<Link
									to="/archive/$date"
									params={{ date: key }}
									className="sd-panel flex min-h-14 items-center justify-between px-4 py-3 transition-colors hover:border-[var(--sd-gold)]/50"
								>
									<span>
										<span className="font-display text-lg text-[var(--sd-ink)]">
											#{dayNumber(key)}
										</span>
										<span className="ml-3 text-sm text-[var(--sd-dim)]">
											{key === today ? "Tonight" : key}
										</span>
									</span>
									<span
										className={`text-sm ${result ? "text-[var(--sd-gold)]" : "text-[var(--sd-dim)]"}`}
									>
										{result
											? `${score}/${result.marks.length || ROUND_SIZE}`
											: "Unplayed"}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</Shell>
	);
}
