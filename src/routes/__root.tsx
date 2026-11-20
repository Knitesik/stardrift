import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Panel, Shell } from "#/components/game/Shell";
import {
	absoluteUrl,
	OG_IMAGE,
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_TITLE,
	SITE_URL,
} from "#/lib/seo";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	// site-wide defaults; each page's seo() overrides title, description and
	// the share tags, and adds its own canonical link
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ name: "theme-color", content: "#0b0d22" },
			{ name: "color-scheme", content: "dark" },
			{ name: "application-name", content: SITE_NAME },
			{ name: "apple-mobile-web-app-title", content: SITE_NAME },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:image", content: absoluteUrl(OG_IMAGE.path) },
			{ name: "twitter:card", content: "summary_large_image" },
			{
				"script:ld+json": {
					"@context": "https://schema.org",
					"@graph": [
						{
							"@type": "WebSite",
							"@id": `${SITE_URL}/#website`,
							name: SITE_NAME,
							url: `${SITE_URL}/`,
							description: SITE_DESCRIPTION,
							inLanguage: "en",
						},
						{
							"@type": ["VideoGame", "WebApplication"],
							"@id": `${SITE_URL}/#game`,
							name: SITE_NAME,
							url: `${SITE_URL}/`,
							description: SITE_DESCRIPTION,
							image: absoluteUrl(OG_IMAGE.path),
							genre: ["Word game", "Trivia", "Puzzle"],
							gamePlatform: "Web browser",
							applicationCategory: "GameApplication",
							operatingSystem: "Any",
							playMode: ["SinglePlayer", "MultiPlayer"],
							isAccessibleForFree: true,
							offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
							inLanguage: "en",
						},
					],
				},
			},
		],
		links: [
			{ rel: "icon", href: "/favicon.ico", sizes: "32x32" },
			{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
			// fonts load from a <link> rather than a CSS @import, so they don't
			// hold up the first paint
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
});

function NotFound() {
	return (
		<Shell>
			<Panel className="text-center">
				<h1 className="font-display text-3xl text-[var(--sd-ink)]">
					Lost in space
				</h1>
				<p className="mt-3 text-[var(--sd-dim)]">
					There’s nothing at this address.
				</p>
				<Link to="/" className="sd-btn sd-btn--primary mt-6 inline-flex">
					Back to Stardrift
				</Link>
			</Panel>
		</Shell>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
