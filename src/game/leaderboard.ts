import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isDateKey } from "./engine";

export interface LeaderboardEntry {
	rank: number;
	/** initials for other players; the viewer's own name in full */
	name: string;
	isYou: boolean;
	km: number;
	correct: number;
}

export interface Leaderboard {
	/** everyone who finished that night */
	total: number;
	/** the top ten, plus the viewer's row when they're further down */
	entries: LeaderboardEntry[];
}

const input = z.object({
	date: z.string().refine(isDateKey, "Invalid date"),
});

/** Who flew highest on one night. */
export const getLeaderboard = createServerFn({ method: "GET" })
	.validator((data: unknown) => input.parse(data))
	.handler(async ({ data }): Promise<Leaderboard> => {
		const { readLeaderboard } = await import("./leaderboard.server");
		return readLeaderboard(data.date);
	});
