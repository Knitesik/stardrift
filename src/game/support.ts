import { createServerFn } from "@tanstack/react-start";

export interface SupportStatus {
	/** false until the Polar env vars are set */
	enabled: boolean;
	signedIn: boolean;
	supporter: boolean;
}

/** Whether checkout is available and the viewer already has the badge. */
export const getSupportStatus = createServerFn({ method: "GET" }).handler(
	async (): Promise<SupportStatus> => {
		const { readSupportStatus } = await import("./support.server");
		return readSupportStatus();
	},
);
