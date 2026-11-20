/** Line icons drawn for Stardrift: 24px grid, 1.6–2px strokes, currentColor. */

type IconProps = { size?: number; className?: string };

const stroke = {
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

/** The ship silhouette used for the logo and the orbiting marker. */
export function ShipIcon({
	size = 20,
	className,
	trail,
}: IconProps & { trail?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={className}
		>
			<path
				d="M12 2.5 L14.6 13.2 L20.5 17.5 L12 15.6 L3.5 17.5 L9.4 13.2 Z"
				fill="currentColor"
			/>
			{trail && (
				<path
					d="M10.6 17.2 L12 21.5 L13.4 17.2"
					fill="none"
					stroke={trail}
					strokeWidth="1.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
		</svg>
	);
}

export function ArrowIcon({ size = 18, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			strokeWidth="2"
			aria-hidden="true"
			className={className}
			{...stroke}
		>
			<path d="M5 12h14" />
			<path d="M13 6l6 6-6 6" />
		</svg>
	);
}

export function InfinityIcon({ size = 18, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			strokeWidth="2"
			aria-hidden="true"
			className={className}
			{...stroke}
		>
			<path d="M18.2 8.5a5 5 0 1 0 0 7c-1.6 1.6-3.6-.2-6.2-3.5S7.4 6.9 5.8 8.5a5 5 0 1 0 0 7c1.6 1.6 3.6-.2 6.2-3.5s4.6-5.1 6.2-3.5z" />
		</svg>
	);
}

export function TimerIcon({ size = 20, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			strokeWidth="1.6"
			aria-hidden="true"
			className={className}
			{...stroke}
		>
			<circle cx="12" cy="13" r="8" />
			<path d="M12 9v4l2.5 2" />
			<path d="M9.5 2.5h5" />
		</svg>
	);
}

export function KeyboardIcon({ size = 20, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			strokeWidth="1.6"
			aria-hidden="true"
			className={className}
			{...stroke}
		>
			<rect x="3" y="6" width="18" height="12" rx="1" />
			<path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
		</svg>
	);
}

export function ClimbIcon({ size = 20, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			strokeWidth="1.6"
			aria-hidden="true"
			className={className}
			{...stroke}
		>
			<path d="M12 3l3 9 5 3.5-8-1.5-8 1.5L9 12z" />
			<path d="M10 17.5l2 3.5 2-3.5" />
		</svg>
	);
}
