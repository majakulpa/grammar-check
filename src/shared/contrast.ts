/**
 * WCAG contrast maths.
 *
 * Lives in `shared` because both the extension and its tests need it: the
 * tests assert the palette meets AA, and keeping the calculation in one place
 * is what stops the assertion drifting from what ships.
 */

/** Relative luminance of `#rrggbb`, per WCAG 2.2. */
export function luminance(hex: string): number {
	const channels = [1, 3, 5]
		.map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

	const [r, g, b] = channels as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

/** AA thresholds. Large text is 18.66px bold or 24px regular. */
export const AA = {
	text: 4.5,
	largeText: 3,
	/** Graphics and the parts of a control that convey its state. */
	nonText: 3,
} as const;
