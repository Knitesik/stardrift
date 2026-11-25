import { polarClient } from "@polar-sh/better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
	// inferAdditionalFields is types only (lets the client see user.role);
	// polarClient adds authClient.checkout
	plugins: [inferAdditionalFields<typeof auth>(), polarClient()],
	basePath: process.env.VITE_SITE_URL as string,
	baseURL: process.env.VITE_SITE_URL as string,
	fetchOptions: {
		credentials: "include",
		headers: {
			Origin: import.meta.env.VITE_SITE_URL,
		},
	},
});
