import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
	// types only: lets the client see fields like user.role
	plugins: [inferAdditionalFields<typeof auth>()],
	basePath: process.env.BETTER_AUTH_URL as string,
	baseURL: process.env.BETTER_AUTH_URL as string,
	fetchOptions: {
		credentials: "include",
		headers: {
			Origin: import.meta.env.BETTER_AUTH_URL,
		},
	},
});
