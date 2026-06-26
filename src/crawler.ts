import { launch, Browser } from "@cloudflare/playwright";

export interface MatchData {
	id: string;
	league: string;
	homeTeam: string;
	awayTeam: string;
	score: string;
	handicap: string;
	winOdds: string;
	drawOdds: string;
	loseOdds: string;
	handicapHomeOdds: string;
	handicapAwayOdds: string;
}

export async function crawlMatches(browserBinding: Browser): Promise<MatchData[]> {
	const browser = await launch(browserBinding);
	const page = await browser.newPage();

	try {
		await page.goto("https://live.chuqi.com/football/");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(3000);

		const classicElement = page.locator('span.a0item[ai-value="-3"]');
		await classicElement.click({ timeout: 10000 });

		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		const filterBtn = page.locator('div.a1select.a0pc[ai-title="赛事筛选"]');
		await filterBtn.click({ timeout: 10000 });
		await page.waitForTimeout(2000);

		const filterPanel = await page.locator('#live_filter_match');
		await filterPanel.waitFor({ timeout: 5000 });

		const inverseBtn = page.locator('#live_filter_match button.a0bt[ai-action="selInverse"]');
		await inverseBtn.click({ timeout: 5000 });
		await page.waitForTimeout(500);

		const worldCupBtn = page.locator('#live_filter_match button[ai-id="35152"]');
		await worldCupBtn.click({ timeout: 5000 });
		await page.waitForTimeout(500);

		const confirmBtn = page.locator('#live_filter_match button.a1bt[id="live_filter_match_submit"]');
		await confirmBtn.click({ timeout: 5000 });

		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		const matchData = await page.evaluate((): MatchData[] => {
			const container = document.getElementById('live_event_ing');
			if (!container) return [];

			const uls = container.querySelectorAll('ul.r0item.r0data[d-st="0"]');
			const matches: MatchData[] = [];

			uls.forEach(ul => {
				const lis = ul.querySelectorAll('li');
				const matchId = ul.getAttribute('id') || '';
				let league = '';
				let homeTeam = '';
				let awayTeam = '';
				let score = '';
				let handicap = '';
				let winOdds = '';
				let drawOdds = '';
				let loseOdds = '';
				let handicapHomeOdds = '';
				let handicapAwayOdds = '';

				lis.forEach((li) => {
					const text = li.textContent?.trim() || '';
					const className = li.className || '';

					if (className.includes('c0match')) {
						league = text;
					}

					if (className.includes('c0home')) {
						const teamNameEl = li.querySelector('.team-name');
						homeTeam = teamNameEl?.textContent?.trim() || text;
					}

					if (className.includes('c0away')) {
						const teamNameEl = li.querySelector('.team-name');
						awayTeam = teamNameEl?.textContent?.trim() || text;
					}

					if (className.includes('c0score')) {
						const scoreSpans = li.querySelectorAll('span');
						const scoreParts: string[] = [];
						for (let i = 0; i < 3 && i < scoreSpans.length; i++) {
							const value = scoreSpans[i].getAttribute('value') || scoreSpans[i].textContent?.trim() || '';
							scoreParts.push(value);
						}
						score = scoreParts.join('');
					}

					if (className.includes('c0odds')) {
						const divs = li.querySelectorAll('div');
						divs.forEach(div => {
							const oddsType = div.getAttribute('z0-odds');
							const spans = div.querySelectorAll('span');
							const values: string[] = [];
							spans.forEach(span => {
								const spanText = span.textContent?.trim() || '';
								if (spanText) {
									values.push(spanText);
								}
							});
							if (oddsType === '1x2' && values.length >= 3) {
								winOdds = values[0];
								drawOdds = values[1];
								loseOdds = values[2];
							} else if (oddsType === 'ah' && values.length >= 3) {
								handicapHomeOdds = values[0];
								let handicapValue = values[1];
								const pkSpan = div.querySelector('span[d-pk]');
								if (pkSpan) {
									const pkValue = parseFloat(pkSpan.getAttribute('d-pk') || '0');
									if (pkValue > 0) {
										handicapValue = '+' + handicapValue;
									} else if (pkValue < 0) {
										handicapValue = '-' + handicapValue;
									}
								}
								handicap = handicapValue;
								handicapAwayOdds = values[2];
							}
						});
					}
				});

				if (homeTeam && awayTeam) {
					matches.push({
						id: matchId,
						league,
						homeTeam,
						awayTeam,
						score,
						handicap,
						winOdds,
						drawOdds,
						loseOdds,
						handicapHomeOdds,
						handicapAwayOdds,
					});
				}
			});

			return matches;
		});

		return matchData;
	} finally {
		await browser.close();
	}
}

export async function saveMatchesToDB(db: D1Database, matches: MatchData[]): Promise<void> {
	if (matches.length === 0) return;

	const now = new Date().toISOString();

	for (const match of matches) {
		await db.prepare(
			`INSERT OR REPLACE INTO matches (id, league, homeTeam, awayTeam, score, handicap, winOdds, drawOdds, loseOdds, handicapHomeOdds, handicapAwayOdds, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			match.id,
			match.league,
			match.homeTeam,
			match.awayTeam,
			match.score,
			match.handicap,
			match.winOdds,
			match.drawOdds,
			match.loseOdds,
			match.handicapHomeOdds,
			match.handicapAwayOdds,
			now
		).run();
	}
}