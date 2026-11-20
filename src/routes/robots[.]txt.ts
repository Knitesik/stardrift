import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "#/lib/seo";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(
					[
						"User-agent: *",
						"Allow: /",
						// endpoints only: private pages use noindex, which crawlers
						// can only see if they're allowed to fetch the page
						"Disallow: /api/",
						"Disallow: /_serverFn/",
						"Disallow: /_party",
						"Disallow: /mcp",
						"",
						`Sitemap: ${absoluteUrl("/sitemap.xml")}`,
						"",
					].join("\n"),
					{
						headers: {
							"content-type": "text/plain; charset=utf-8",
							"cache-control": "public, max-age=86400",
						},
					},
				),
		},
	},
});
