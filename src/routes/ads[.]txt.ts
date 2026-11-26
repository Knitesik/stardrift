import { createFileRoute } from "@tanstack/react-router";
import { ADSENSE_CLIENT } from "#/lib/ads";

export const Route = createFileRoute("/ads.txt")({
	server: {
		handlers: {
			// authorises Google to sell our ad space; AdSense checks for it
			GET: () =>
				ADSENSE_CLIENT
					? new Response(
							`google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`,
							{
								headers: {
									"content-type": "text/plain; charset=utf-8",
									"cache-control": "public, max-age=86400",
								},
							},
						)
					: new Response("Not found", { status: 404 }),
		},
	},
});
