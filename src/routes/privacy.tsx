import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel, Shell } from "#/components/game/Shell";
import { ADSENSE_CLIENT } from "#/lib/ads";
import { seo } from "#/lib/seo";

/** Where privacy questions and data requests go. */
const CONTACT_EMAIL = "privacy@example.com";
const LAST_UPDATED = "26 November 2026";

declare global {
	interface Window {
		googlefc?: {
			callbackQueue?: unknown[];
			showRevocationMessage?: () => void;
		};
	}
}

export const Route = createFileRoute("/privacy")({
	head: () =>
		seo({
			title: "Privacy policy",
			path: "/privacy",
			description:
				"What Stardrift collects when you play, sign in, support the game or see an ad, and the choices you have.",
		}),
	component: Privacy,
});

/** Reopens Google's consent message so UK/EEA players can change their answer. */
function reopenConsent() {
	window.googlefc = window.googlefc || {};
	window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
	window.googlefc.callbackQueue.push(() =>
		window.googlefc?.showRevocationMessage?.(),
	);
}

function Privacy() {
	const mail = (
		<a
			href={`mailto:${CONTACT_EMAIL}`}
			className="text-[var(--sd-gold)] underline"
		>
			{CONTACT_EMAIL}
		</a>
	);
	return (
		<Shell>
			<Panel className="mx-auto max-w-2xl">
				<p className="text-xs uppercase tracking-[0.3em] text-[var(--sd-gold)]">
					Privacy
				</p>
				<h1 className="font-display mt-2 text-4xl text-[var(--sd-ink)]">
					Privacy policy
				</h1>
				<p className="mt-2 text-sm text-[var(--sd-dim)]">
					Last updated {LAST_UPDATED}
				</p>

				<div className="mt-6 grid gap-6 text-[var(--sd-dim)] [&_strong]:text-[var(--sd-ink)] [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
					<Section title="Who we are">
						<p>
							Stardrift is a small word game made and run by an independent
							developer based in Bhutan. For anything about your data, email{" "}
							{mail}.
						</p>
					</Section>

					<Section title="What we collect">
						<ul>
							<li>
								<strong>Playing as a guest.</strong> A cookie called{" "}
								<code>sd_guest</code> holds a random id (no name or email) so
								your progress and streaks are saved. It lasts up to 400 days.
							</li>
							<li>
								<strong>Your answers and results.</strong> Every flight’s
								answers, score and time are stored against your player id.
								Answers are also counted together with everyone else’s to decide
								how rare each answer is.
							</li>
							<li>
								<strong>Signing in with Google.</strong> We get your name, email
								address, profile picture and Google account id. Your first name
								is your call sign. While you’re signed in, a session cookie
								keeps you signed in for up to 30 days, and we store the IP
								address and browser it was created from, for security.
							</li>
							<li>
								<strong>Party games.</strong> The call sign you choose, the room
								code and your answers, which other players in the room see.
							</li>
							<li>
								<strong>Leaderboards.</strong> Other players see your initials,
								your score and a ★ if you’re a supporter. Only you see your full
								name.
							</li>
							<li>
								<strong>Supporting the game.</strong> Payments are handled by{" "}
								<a href="https://polar.sh/legal/privacy" className="underline">
									Polar
								</a>
								. We receive your email, the amount and an order id, never your
								card details.
							</li>
							<li>
								<strong>Small preferences</strong>, like a dismissed “Not now”
								card, are kept in your browser’s session storage and never sent
								to us.
							</li>
						</ul>
					</Section>

					<Section title="Analytics">
						<p>
							We use Google Analytics to see which pages are used, on what kind
							of device and roughly where in the world, so we can improve the
							game. It sets cookies in your browser. In the UK, the EEA and
							Switzerland it only does so after you agree.
						</p>
					</Section>

					<Section title="Advertising">
						<p>
							Players who haven’t supported the game may see an ad after a
							flight, served by Google AdSense. Supporters see no ads.
						</p>
						<p>
							Third-party vendors, including Google, use cookies to serve ads
							based on your prior visits to this website or other websites.
							Google’s use of advertising cookies enables it and its partners to
							serve ads to you based on your visits to this and other sites on
							the internet. Read{" "}
							<a
								href="https://policies.google.com/technologies/partner-sites"
								className="underline"
							>
								how Google uses information from sites that use its services
							</a>
							.
						</p>
						<p>
							You can turn off personalised ads in{" "}
							<a href="https://myadcenter.google.com" className="underline">
								Google’s My Ad Center
							</a>
							, or opt out of other vendors’ personalised ads at{" "}
							<a href="https://www.aboutads.info/choices" className="underline">
								aboutads.info
							</a>
							.
						</p>
					</Section>

					<Section title="Your consent in the UK, EEA and Switzerland">
						<p>
							Before any analytics or advertising cookies are set, Google’s
							consent message asks whether you agree. If you don’t, you’ll still
							see ads, but they won’t be personalised and won’t use advertising
							cookies.
						</p>
						{ADSENSE_CLIENT && (
							<button
								type="button"
								className="sd-btn mt-1 !px-4 !py-2 text-sm"
								onClick={reopenConsent}
							>
								Change cookie choices
							</button>
						)}
					</Section>

					<Section title="How we use it">
						<ul>
							<li>
								To run the game: save progress, score answers, run leaderboards
								and party rooms.
							</li>
							<li>To keep accounts secure and stop abuse and cheating.</li>
							<li>To show the supporter star and hide ads for supporters.</li>
							<li>
								To understand how the game is used, and to show ads that pay for
								the servers.
							</li>
						</ul>
						<p>
							We don’t sell your personal information. In the UK and EEA we rely
							on providing the service you asked for (your account and games),
							our legitimate interest in keeping it secure and working, and your
							consent for analytics and advertising cookies.
						</p>
					</Section>

					<Section title="Who else handles it">
						<p>
							Our hosting and database providers store the data on our behalf,
							which may be outside your country, including in the United States.
							Google provides sign-in, analytics and ads; Polar handles
							payments. Each has its own privacy policy.
						</p>
					</Section>

					<Section title="How long we keep it">
						<p>
							Account and game data is kept while your account exists or until
							you ask us to delete it. Guest progress tied to a cookie nobody
							uses again is kept as long as the game runs. Payment records are
							kept as long as tax and accounting rules require. Answer counts
							are anonymous and kept indefinitely.
						</p>
					</Section>

					<Section title="Your choices and rights">
						<p>
							You can ask to see, correct or delete your data, or object to how
							we use it, by emailing {mail}. Clearing your cookies removes a
							guest’s link to their progress. Depending on where you live, you
							can also complain to your local data protection authority.
						</p>
					</Section>

					<Section title="Children">
						<p>
							Stardrift isn’t aimed at children under 13, and we don’t knowingly
							collect their data. If you think a child has given us personal
							information, email us and we’ll delete it.
						</p>
					</Section>

					<Section title="Changes">
						<p>
							If this policy changes, we’ll update it here and change the date
							at the top.
						</p>
					</Section>
				</div>

				<Link to="/" className="sd-btn sd-btn--primary mt-8 inline-flex">
					Back to Stardrift
				</Link>
			</Panel>
		</Shell>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-2">
			<h2 className="font-display text-xl text-[var(--sd-ink)]">{title}</h2>
			{children}
		</section>
	);
}
