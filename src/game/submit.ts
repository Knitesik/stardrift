import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EPOCH, isDateKey, latestOpenDate, ROUND_SIZE } from "./engine";
import type { Prompt } from "./prompts";
import type { FlightStep } from "./rarity";

export type SubmitResult =
	| { status: "accepted"; step: FlightStep }
	| { status: "unknown" };

const submitInput = z.object({
	promptId: z.string().max(64),
	/** what the player typed; null when time ran out */
	answer: z.string().trim().max(80).nullable(),
});

/**
 * Checks a typed answer. If it's accepted, records it and returns how rare
 * it was. Unknown answers aren't recorded, so the player can try again.
 */
export const submitAnswer = createServerFn({ method: "POST" })
	.validator((data: unknown) => submitInput.parse(data))
	.handler(async ({ data }): Promise<SubmitResult> => {
		const [{ getPrompt, matchAnswer }, { stepFor }] = await Promise.all([
			import("./challenges.server"),
			import("./scoring.server"),
		]);
		if (!(await getPrompt(data.promptId))) throw new Error("Unknown prompt");
		if (data.answer === null || data.answer === "") {
			return {
				status: "accepted",
				step: await stepFor(data.promptId, null, {}),
			};
		}
		const canonical = await matchAnswer(data.promptId, data.answer);
		if (!canonical) return { status: "unknown" };
		const { recordAnswer } = await import("./tally.server");
		const { counts } = await recordAnswer(data.promptId, canonical);
		return {
			status: "accepted",
			step: await stepFor(data.promptId, canonical, counts),
		};
	});

/** The prompts for one night. Future nights stay secret. */
export const getNightRound = createServerFn({ method: "GET" })
	.validator((data: unknown) =>
		z
			.object({ date: z.string().refine(isDateKey, "Invalid date") })
			.parse(data),
	)
	.handler(async ({ data }): Promise<Prompt[] | null> => {
		if (data.date < EPOCH || data.date > latestOpenDate()) return null;
		const { nightRound } = await import("./challenges.server");
		return nightRound(data.date, ROUND_SIZE);
	});

/** A fresh random round for unlimited mode. */
export const getRandomRound = createServerFn({ method: "POST" }).handler(
	async (): Promise<Prompt[]> => {
		const { roundForSeed } = await import("./challenges.server");
		return roundForSeed(`free:${crypto.randomUUID()}`, ROUND_SIZE);
	},
);

export interface PromptReveal {
	promptId: string;
	players: number;
	acceptedCount: number;
	/** most common answers */
	top: { answer: string; share: number }[];
	/** rarest answers someone actually gave */
	rarest: { answer: string; share: number }[];
	/** a few accepted answers nobody has given yet */
	unclaimed: string[];
}

const revealInput = z.object({
	promptIds: z.array(z.string().max(64)).min(1).max(10),
});

/** What everyone else said, for the end-of-round reveal. */
export const getReveal = createServerFn({ method: "POST" })
	.validator((data: unknown) => revealInput.parse(data))
	.handler(async ({ data }): Promise<PromptReveal[]> => {
		const [{ getCounts }, { weightedShares }, { getPrompt }] =
			await Promise.all([
				import("./tally.server"),
				import("./scoring.server"),
				import("./challenges.server"),
			]);
		const ids: string[] = [];
		for (const id of data.promptIds) if (await getPrompt(id)) ids.push(id);
		const all = await getCounts(ids);
		return Promise.all(
			ids.map(async (promptId) => {
				const { rows, players } = await weightedShares(
					promptId,
					all[promptId] ?? {},
				);
				const byShare = [...rows].sort((a, b) => b.share - a.share);
				const top = byShare.slice(0, 3);
				const given = byShare.filter((r) => r.count > 0);
				return {
					promptId,
					players,
					acceptedCount: rows.length,
					top: top.map((r) => ({ answer: r.canonical, share: r.share })),
					rarest: given
						.slice(-3)
						.reverse()
						.filter((r) => !top.includes(r))
						.map((r) => ({ answer: r.canonical, share: r.share })),
					unclaimed: rows
						.filter((r) => r.count === 0)
						.slice(-3)
						.map((r) => r.canonical),
				};
			}),
		);
	});
