import { createFileRoute } from "@tanstack/react-router";
import { archiveKeys, latestOpenDate } from "#/game/engine";
import { absoluteUrl } from "#/lib/seo";

interface Entry {
	path: string;
	lastmod?: string;
	changefreq: "daily" | "weekly" | "monthly" | "never";
	priority: number;
}

function sitemap() {
	const today = latestOpenDate();
	const entries: Entry[] = [
		{ path: "/", lastmod: today, changefreq: "daily", priority: 1 },
		{ path: "/daily", lastmod: today, changefreq: "daily", priority: 0.9 },
		{ path: "/unlimited", changefreq: "monthly", priority: 0.7 },
		{ path: "/party", changefreq: "monthly", priority: 0.7 },
		{ path: "/archive", lastmod: today, changefreq: "daily", priority: 0.6 },
		{ path: "/support", changefreq: "monthly", priority: 0.3 },
		{ path: "/privacy", changefreq: "monthly", priority: 0.1 },
		// a night's prompts never change once it has opened
		...archiveKeys(today).map(
			(date): Entry => ({
				path: `/archive/${date}`,
				lastmod: date,
				changefreq: date === today ? "daily" : "never",
				priority: 0.4,
			}),
		),
	];
	const urls = entries.map(
		(e) =>
			`<url><loc>${absoluteUrl(e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}<changefreq>${e.changefreq}</changefreq><priority>${e.priority.toFixed(1)}</priority></url>`,
	);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(sitemap(), {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				}),
		},
	},
});
