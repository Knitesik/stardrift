import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { getLeaderboard } from "#/game/leaderboard";
import { formatKm } from "#/game/rarity";

/** Who flew highest on one night, shown under the nightly results. */
export function NightLeaderboard({ dateKey }: { dateKey: string }) {
	const board = useQuery({
		queryKey: ["leaderboard", dateKey],
		queryFn: () => getLeaderboard({ data: { date: dateKey } }),
		staleTime: 30_000,
	});

	return (
		<section className="mt-6" aria-labelledby="leaderboard-title">
			<div className="flex items-baseline justify-between gap-3">
				<h2
					id="leaderboard-title"
					className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]"
				>
					Tonight’s highest
				</h2>
				{board.data && board.data.total > 0 && (
					<span className="text-xs text-[var(--sd-dim)]">
						{board.data.total.toLocaleString("en-US")}{" "}
						{board.data.total === 1 ? "pilot" : "pilots"}
					</span>
				)}
			</div>

			{board.isPending ? (
				<p className="mt-3 animate-pulse text-xs text-[var(--sd-dim)]">
					Charting the fleet…
				</p>
			) : board.isError ? (
				<p className="mt-3 text-xs text-[var(--sd-dim)]">
					Couldn’t load the leaderboard.{" "}
					<button
						type="button"
						className="underline"
						onClick={() => board.refetch()}
					>
						Retry
					</button>
				</p>
			) : board.data.entries.length === 0 ? (
				<p className="mt-3 text-xs text-[var(--sd-dim)]">
					No one has landed yet tonight.
				</p>
			) : (
				<ol className="mt-3 grid gap-1">
					{board.data.entries.map((e, i) => {
						const prev = board.data.entries[i - 1];
						// the viewer's own row can sit far below the top ten
						const gap = prev && e.rank > prev.rank + 1 && e.isYou;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: server-ordered, replaced whole
							<Fragment key={i}>
								{gap && (
									<li
										aria-hidden
										className="text-center text-xs text-[var(--sd-dim)]"
									>
										⋯
									</li>
								)}
								<li
									className={`grid grid-cols-[2rem_1fr_auto_auto] items-baseline gap-x-3 rounded-lg px-3 py-1.5 text-sm ${
										e.isYou
											? "bg-[var(--sd-gold)]/10 text-[var(--sd-ink)]"
											: "text-[var(--sd-ink)]/85"
									}`}
								>
									<span className="text-[var(--sd-dim)]">{e.rank}</span>
									<span className="min-w-0 truncate font-semibold">
										{e.name}
										{e.isYou && (
											<span className="ml-1.5 text-xs text-[var(--sd-gold)]">
												(YOU)
											</span>
										)}
									</span>
									<span className="text-xs text-[var(--sd-dim)]">
										{e.correct} hit{e.correct === 1 ? "" : "s"}
									</span>
									<span className="text-right text-[var(--sd-gold)]">
										{formatKm(e.km)}
									</span>
								</li>
							</Fragment>
						);
					})}
				</ol>
			)}
		</section>
	);
}
