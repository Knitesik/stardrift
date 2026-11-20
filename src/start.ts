import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

/** Rejects cross-site calls to server functions. */
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * Gives every visitor a guest id on their first page load, so even pages that
 * never save (like a party room) can tell who played.
 */
const guestCookie = createMiddleware({ type: "request" }).server(
	async ({ request, handlerType, next }) => {
		const page =
			handlerType === "router" &&
			request.method === "GET" &&
			request.headers.get("accept")?.includes("text/html");
		if (page) {
			const { ensureGuestCookie } = await import("#/game/player.server");
			ensureGuestCookie(request.headers);
		}
		return next();
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware, guestCookie],
}));
