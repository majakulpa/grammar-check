import { describe, expect, it } from 'vitest';
import { AA, contrastRatio, luminance } from '../src/shared/contrast';
import { SEVERITY_COLORS, SEVERITY_TEXT_COLORS } from '../src/content/render/styles';

/** The card's own backgrounds, from `card.ts`. */
const CARD = { light: '#ffffff', dark: '#1c1f24' };
/** A white and a near-black page, the extremes the underlines must survive. */
const PAGES = ['#ffffff', '#121212'];

describe('contrast maths', () => {
	it('matches the known anchors', () => {
		expect(luminance('#ffffff')).toBeCloseTo(1, 5);
		expect(luminance('#000000')).toBeCloseTo(0, 5);
		expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
		expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(4.47);
	});

	it('does not care which way round the colours are given', () => {
		expect(contrastRatio('#ce4145', '#ffffff')).toBeCloseTo(
			contrastRatio('#ffffff', '#ce4145'),
			10,
		);
	});
});

describe('the palette meets AA', () => {
	it.each(Object.entries(SEVERITY_COLORS))(
		'underlines a %s issue visibly on a light and a dark page',
		(_kind, color) => {
			for (const page of PAGES) {
				expect(contrastRatio(color, page)).toBeGreaterThanOrEqual(AA.nonText);
			}
		},
	);

	it.each(['light', 'dark'] as const)('reads the issue kind clearly in %s mode', (theme) => {
		for (const color of Object.values(SEVERITY_TEXT_COLORS[theme])) {
			expect(contrastRatio(color, CARD[theme])).toBeGreaterThanOrEqual(AA.text);
		}
	});

	it('keeps the three kinds distinguishable from each other, not just from the page', () => {
		const [error, style, repetition] = Object.values(SEVERITY_COLORS) as [string, string, string];
		// Someone who cannot separate these hues still has the written kind on
		// the card; this only guards against two of them rendering identically.
		expect(error).not.toBe(style);
		expect(style).not.toBe(repetition);
		expect(error).not.toBe(repetition);
	});
});
