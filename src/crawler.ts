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
	totalGoals: string;
	overOdds: string;
	underOdds: string;
	dSt2: string;
	dStIng: string;
	matchTime: string;
}

async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 3, delayMs: number = 1000): Promise<T> {
	let lastError: Error | undefined;
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.error(`Attempt ${attempt} failed:`, lastError.message);
			
			if (attempt < maxRetries) {
				console.log(`Retrying in ${delayMs}ms...`);
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}
	}
	
	throw lastError || new Error("All retries failed");
}

export async function crawlMatches(browserBinding: Browser): Promise<MatchData[]> {
	return executeWithRetry(async () => {
		const browser = await launch(browserBinding);
		const page = await browser.newPage();
		
		try {
			page.setDefaultTimeout(30000);
			page.setDefaultNavigationTimeout(30000);
			
			page.on('error', err => {
				console.error('Page error:', err.message);
			});
			
			page.on('pageerror', err => {
				console.error('Page DOM error:', err.message);
			});
			
			await page.goto("https://live.chuqi.com/football/", { timeout: 30000 });
			
			const matchData = await page.evaluate((): MatchData[] => {
				return new Promise((resolve) => {
					const waitForEl = (selector: string, timeout: number = 10000): Promise<Element | null> => {
						return new Promise(res => {
							const start = Date.now();
							const check = () => {
								const el = document.querySelector(selector);
								if (el) {
									res(el);
								} else if (Date.now() - start < timeout) {
									setTimeout(check, 100);
								} else {
									res(null);
								}
							};
							check();
						});
					};
					
					const clickEl = (selector: string) => {
						const el = document.querySelector(selector) as HTMLElement;
						if (el) el.click();
					};
					
					const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
					
					(async () => {
						try {
							await sleep(3000);
							
							clickEl('span.a0item[ai-value="-3"]');
							await sleep(2000);
							
							clickEl('div.a1select.a0pc[ai-title="赛事筛选"]');
							await sleep(2000);
							
							await waitForEl('#live_filter_match', 5000);
							
							clickEl('#live_filter_match button.a0bt[ai-action="selInverse"]');
							await sleep(500);
							
							clickEl('#live_filter_match button[ai-id="35152"]');
							await sleep(500);
							
							clickEl('#live_filter_match button.a1bt[id="live_filter_match_submit"]');
							await sleep(2000);
							
							const container = document.getElementById('live_event_ing');
							if (!container) {
								resolve([]);
								return;
							}
							
							const uls = container.querySelectorAll('ul.r0item.r0data[data-ai-vis="1"]');
							const matches: MatchData[] = [];
							
							uls.forEach(ul => {
								const lis = ul.querySelectorAll('li');
								const matchId = ul.getAttribute('id') || '';
								const dSt2 = ul.getAttribute('d-st2') || '';
								const dStIng = ul.getAttribute('d-st-ing') || '';
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
								let totalGoals = '';
								let overOdds = '';
								let underOdds = '';
								let matchTime = '';
								
								lis.forEach((li) => {
									const text = li.textContent?.trim() || '';
									const className = li.className || '';
									
									if (className.includes('c0match')) {
										league = text;
									}
									
									if (className.includes('c0time')) {
										matchTime = text;
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
														handicapValue = '-' + handicapValue;
													} else if (pkValue < 0) {
														handicapValue = '+' + handicapValue;
													}
												}
												handicap = handicapValue;
												handicapAwayOdds = values[2];
											} else if (oddsType === 'ou' && values.length >= 3) {
												overOdds = values[0];
												totalGoals = values[1];
												underOdds = values[2];
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
										totalGoals,
										overOdds,
										underOdds,
										dSt2,
										dStIng,
										matchTime,
									});
								}
							});
							
							resolve(matches);
						} catch (err) {
							console.error('Evaluation error:', err);
							resolve([]);
						}
					})();
				});
			});
			
			return matchData;
		} finally {
			try {
				await browser.close();
			} catch (closeErr) {
				console.error('Error closing browser:', closeErr);
			}
		}
	});
}

function determineMatchStatus(dSt2: string, dStIng: string): string {
	if (dSt2 === 'wait') {
		return 'pending';
	}
	if (dSt2 === 'ok') {
		return dStIng === '1' ? 'live' : 'ended';
	}
	return 'pending';
}

export async function saveMatchesToDB(db: D1Database, matches: MatchData[]): Promise<void> {
	if (matches.length === 0) return;
	
	const now = new Date().toISOString();
	
	for (const match of matches) {
		const matchStatus = determineMatchStatus(match.dSt2, match.dStIng);
		
		await db.prepare(
			`INSERT OR REPLACE INTO matches (id, league, homeTeam, awayTeam, score, handicap, winOdds, drawOdds, loseOdds, handicapHomeOdds, handicapAwayOdds, totalGoals, overOdds, underOdds, d_st2, d_st_ing, match_time, match_status, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
			match.totalGoals,
			match.overOdds,
			match.underOdds,
			match.dSt2,
			match.dStIng,
			match.matchTime,
			matchStatus,
			now
		).run();
	}
}