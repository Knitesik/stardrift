import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isDateKey } from "./engine";
import type { SaveData } from "./storage";

const step = z.object({
	promptId: z.string().max(64),
	answer: z.string().max(120).nullable(),
	share: z.number().min(0).max(1).nullable(),
	tier: z
		.enum(["stardust", "comet", "nebula", "pulsar", "supernova"])
		.nullable(),
	climbKm: z.number().min(0).max(100_000),
	players: z.number().int().min(0),
	estimated: z.boolean(),
});

const run = z.object({
	marks: z.array(z.enum(["hit", "timeout"])).max(20),
	flight: z.array(step).max(20),
});

const dateKey = z.string().refine(isDateKey, "Invalid date");

const datedRun = z.object({ date: dateKey, run });

const counter = z.number().int().min(0).max(1_000_000);

const saveData = z.object({
	daily: z.record(dateKey, run.extend({ finishedAt: z.number() })),
	inProgress: z.record(dateKey, run),
	unlimited: z.object({
		played: counter,
		correct: counter,
		best: counter,
		bestKm: z.number().min(0),
	}),
});

const server = () => import("./player.server");

/** The current player's saved progress (account, or guest cookie). */
export const getSave = createServerFn({ method: "GET" }).handler(
	async (): Promise<SaveData> => {
		const { resolvePlayer, readSave } = await server();
		const player = await resolvePlayer();
		return readSave(player.id);
	},
);

/** Saves an unfinished nightly run so a reload resumes mid-flight. */
export const saveProgress = createServerFn({ method: "POST" })
	.validator((data: unknown) => datedRun.parse(data))
	.handler(async ({ data }): Promise<SaveData> => {
		const { resolvePlayer, readSave, writeProgress } = await server();
		const player = await resolvePlayer();
		await writeProgress(player, data.date, data.run);
		return readSave(player.id);
	});

/** Records a finished night. The first finished run for a date is kept. */
export const recordDaily = createServerFn({ method: "POST" })
	.validator((data: unknown) => datedRun.parse(data))
	.handler(async ({ data }): Promise<SaveData> => {
		const { resolvePlayer, readSave, writeDaily } = await server();
		const player = await resolvePlayer();
		await writeDaily(player, data.date, data.run);
		return readSave(player.id);
	});

/** Adds a finished unlimited round to the running totals. */
export const recordUnlimited = createServerFn({ method: "POST" })
	.validator((data: unknown) => run.parse(data))
	.handler(async ({ data }): Promise<SaveData> => {
		const { resolvePlayer, readSave, writeUnlimited } = await server();
		const player = await resolvePlayer();
		await writeUnlimited(player, data);
		return readSave(player.id);
	});

/** One-time import of progress saved on this device before accounts existed. */
export const importLocalSave = createServerFn({ method: "POST" })
	.validator((data: unknown) => saveData.parse(data))
	.handler(async ({ data }): Promise<SaveData> => {
		const { resolvePlayer, readSave, importSave } = await server();
		const player = await resolvePlayer();
		await importSave(player, data);
		return readSave(player.id);
	});
