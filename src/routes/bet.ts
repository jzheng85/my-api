import { GET, POST } from "../router";
import { withAuth } from "../auth";

function parseScore(score: string): { home: number; away: number } {
	const parts = score.split(":");
	return {
		home: parseInt(parts[0] || "0", 10),
		away: parseInt(parts[1] || "0", 10)
	};
}

function parseHandicapValues(handicap: string): number[] {
	if (!handicap) return [0];
	
	const sign = handicap.startsWith("-") ? -1 : 1;
	const value = handicap.replace(/[+-]/g, "");
	
	if (value.includes("/")) {
		const parts = value.split("/");
		return parts.map(p => sign * parseFloat(p));
	}
	
	return [sign * parseFloat(value)];
}

function parseTotalGoalsValues(totalGoals: string): number[] {
	if (!totalGoals) return [0];
	
	if (totalGoals.includes("/")) {
		const parts = totalGoals.split("/");
		return parts.map(p => parseFloat(p));
	}
	
	return [parseFloat(totalGoals)];
}

function determineMatchResult(score: string): string {
	const { home, away } = parseScore(score);
	if (home > away) return "win";
	if (home < away) return "lose";
	return "draw";
}

type SettleResult = 'won' | 'lost' | 'half_win' | 'half_lose' | 'push';

function evaluateAHBet(value: number, adjustedHome: number, away: number): SettleResult {
	if (adjustedHome > away) return 'won';
	if (adjustedHome < away) return 'lost';
	return 'push';
}

function evaluateOUBet(value: number, total: number, betValue: string): SettleResult {
	if (betValue === 'over') {
		if (total > value) return 'won';
		if (total < value) return 'lost';
		return 'push';
	} else {
		if (total < value) return 'won';
		if (total > value) return 'lost';
		return 'push';
	}
}

function settleBet(betType: string, betValue: string, score: string, handicapAtBet: string, totalGoalsAtBet: string): { status: SettleResult; payoutMultiplier: number } {
	const { home, away } = parseScore(score);
	
	if (betType === "1x2") {
		const result = determineMatchResult(score);
		if (result === betValue) {
			return { status: 'won', payoutMultiplier: 1 };
		} else {
			return { status: 'lost', payoutMultiplier: 0 };
		}
	}
	
	if (betType === "ah") {
		const hcValues = parseHandicapValues(handicapAtBet);
		let wonCount = 0;
		let pushCount = 0;
		let lostCount = 0;
		
		for (const hc of hcValues) {
			const adjustedHome = home + hc;
			const result = evaluateAHBet(hc, adjustedHome, away);
			
			if (betValue === "home") {
				if (result === 'won') wonCount++;
				else if (result === 'push') pushCount++;
				else lostCount++;
			} else if (betValue === "away") {
				if (result === 'lost') wonCount++;
				else if (result === 'push') pushCount++;
				else lostCount++;
			}
		}
		
		const total = hcValues.length;
		
		if (wonCount === total) {
			return { status: 'won', payoutMultiplier: 1 };
		} else if (lostCount === total) {
			return { status: 'lost', payoutMultiplier: 0 };
		} else if (pushCount === total) {
			return { status: 'push', payoutMultiplier: 0.5 };
		} else if (wonCount > 0 && lostCount === 0) {
			return { status: 'half_win', payoutMultiplier: wonCount / total };
		} else if (lostCount > 0 && wonCount === 0) {
			return { status: 'half_lose', payoutMultiplier: pushCount / total };
		} else {
			return { status: 'half_win', payoutMultiplier: wonCount / total };
		}
	}
	
	if (betType === "ou") {
		const total = home + away;
		const lineValues = parseTotalGoalsValues(totalGoalsAtBet);
		let wonCount = 0;
		let pushCount = 0;
		let lostCount = 0;
		
		for (const line of lineValues) {
			const result = evaluateOUBet(line, total, betValue);
			if (result === 'won') wonCount++;
			else if (result === 'push') pushCount++;
			else lostCount++;
		}
		
		const totalLines = lineValues.length;
		
		if (wonCount === totalLines) {
			return { status: 'won', payoutMultiplier: 1 };
		} else if (lostCount === totalLines) {
			return { status: 'lost', payoutMultiplier: 0 };
		} else if (pushCount === totalLines) {
			return { status: 'push', payoutMultiplier: 0.5 };
		} else if (wonCount > 0 && lostCount === 0) {
			return { status: 'half_win', payoutMultiplier: wonCount / totalLines };
		} else if (lostCount > 0 && wonCount === 0) {
			return { status: 'half_lose', payoutMultiplier: pushCount / totalLines };
		} else {
			return { status: 'half_win', payoutMultiplier: wonCount / totalLines };
		}
	}
	
	return { status: 'lost', payoutMultiplier: 0 };
}

POST("/api/bets", withAuth(async (request, env, ctx, user) => {
	try {
		const { matchId, betType, betValue, points } = await request.json();
		
		if (!matchId || !betType || !betValue || !points) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (points <= 0) {
			return Response.json({ error: "投注积分必须大于0" }, { status: 400 });
		}
		
		const dbUser = await env.DB.prepare(
			"SELECT id, points FROM users WHERE id = ?"
		)
			.bind(user.id)
			.first();
		
		if (!dbUser) {
			return Response.json({ error: "用户不存在" }, { status: 404 });
		}
		
		if ((dbUser.points as number) < points) {
			return Response.json({ error: "积分不足" }, { status: 400 });
		}
		
		const match = await env.DB.prepare(
			"SELECT * FROM matches WHERE id = ?"
		)
			.bind(matchId)
			.first();
		
		if (!match) {
			return Response.json({ error: "比赛不存在" }, { status: 404 });
		}
		
		if ((match.d_st2 as string) !== 'wait') {
			return Response.json({ error: "比赛已开场，无法投注" }, { status: 400 });
		}
		
		if ((match.match_status as string) === 'ended') {
			return Response.json({ error: "比赛已结束，无法投注" }, { status: 400 });
		}
		
		let oddsAtBet = 0;
		let handicapAtBet = '';
		let totalGoalsAtBet = '';
		
		if (betType === '1x2') {
			if (betValue === 'win') {
				oddsAtBet = parseFloat(match.winOdds as string) || 0;
			} else if (betValue === 'draw') {
				oddsAtBet = parseFloat(match.drawOdds as string) || 0;
			} else if (betValue === 'lose') {
				oddsAtBet = parseFloat(match.loseOdds as string) || 0;
			}
		} else if (betType === 'ah') {
			if (betValue === 'home') {
				oddsAtBet = parseFloat(match.handicapHomeOdds as string) || 0;
			} else if (betValue === 'away') {
				oddsAtBet = parseFloat(match.handicapAwayOdds as string) || 0;
			}
			handicapAtBet = match.handicap as string || '';
		} else if (betType === 'ou') {
			if (betValue === 'over') {
				oddsAtBet = parseFloat(match.overOdds as string) || 0;
			} else if (betValue === 'under') {
				oddsAtBet = parseFloat(match.underOdds as string) || 0;
			}
			totalGoalsAtBet = match.totalGoals as string || '';
		}
		
		if (oddsAtBet <= 0) {
			return Response.json({ error: "无效的赔率" }, { status: 400 });
		}
		
		const newBalance = (dbUser.points as number) - points;
		
		const batch = await env.DB.batch([
			env.DB.prepare("UPDATE users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
				.bind(points, user.id),
			env.DB.prepare(
				"INSERT INTO bets (user_id, match_id, bet_type, bet_value, points, odds_at_bet, handicap_at_bet, total_goals_at_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
			)
				.bind(user.id, matchId, betType, betValue, points, oddsAtBet, handicapAtBet, totalGoalsAtBet),
			env.DB.prepare(
				"INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)"
			)
				.bind(user.id, 'bet', -points, newBalance, null, `投注 ${match.homeTeam} vs ${match.awayTeam}`)
		]);
		
		const betResult = batch[1] as any;
		
		return Response.json({ 
			id: betResult.lastInsertRowid,
			userId: user.id,
			matchId,
			betType,
			betValue,
			points,
			oddsAtBet,
			handicapAtBet,
			totalGoalsAtBet,
			status: 'pending'
		}, { status: 201 });
	} catch (error) {
		console.error("投注失败:", error);
		return Response.json({ error: "投注失败" }, { status: 500 });
	}
}));

POST("/api/bets/settle/:matchId", async (request, env) => {
	try {
		const matchId = (request as any).params.matchId;
		
		const match = await env.DB.prepare(
			"SELECT * FROM matches WHERE id = ?"
		)
			.bind(matchId)
			.first();
		
		if (!match) {
			return Response.json({ error: "比赛不存在" }, { status: 404 });
		}
		
		if (!match.score || (match.score as string) === "") {
			return Response.json({ error: "比赛尚未结束或没有比分" }, { status: 400 });
		}
		
		const pendingBets = await env.DB.prepare(
			"SELECT * FROM bets WHERE match_id = ? AND status = 'pending'"
		)
			.bind(matchId)
			.all();
		
		const bets = pendingBets.results || [];
		
		if (bets.length === 0) {
			return Response.json({ message: "没有待结算的投注", settledCount: 0 });
		}
		
		const matchResult = determineMatchResult(match.score as string);
		const now = new Date().toISOString();
		
		const userPointsMap = new Map<number, number>();
		for (const bet of bets) {
			if (!userPointsMap.has(bet.user_id)) {
				const user = await env.DB.prepare("SELECT points FROM users WHERE id = ?")
					.bind(bet.user_id)
					.first();
				userPointsMap.set(bet.user_id, (user?.points as number) || 0);
			}
		}
		
		const batchOperations: any[] = [];
		
		for (const bet of bets) {
			const settleResult = settleBet(
				bet.bet_type,
				bet.bet_value,
				match.score,
				bet.handicap_at_bet,
				bet.total_goals_at_bet
			);
			
			const status = settleResult.status;
			let payout = 0;
			let transactionType = 'settle_lose';
			
			if (status === 'won') {
				payout = Math.round((bet.points as number) * ((bet.odds_at_bet as number) + 1));
				transactionType = 'settle_win';
			} else if (status === 'half_win') {
				const stake = bet.points as number;
				const halfStake = stake / 2;
				const winPart = Math.round(halfStake * ((bet.odds_at_bet as number) + 1));
				const pushPart = halfStake;
				payout = Math.round(winPart + pushPart);
				transactionType = 'settle_half_win';
			} else if (status === 'push') {
				payout = bet.points as number;
				transactionType = 'settle_win';
			} else if (status === 'half_lose') {
				payout = Math.round((bet.points as number) / 2);
				transactionType = 'settle_half_lose';
			}
			
			batchOperations.push(
				env.DB.prepare(
					"UPDATE bets SET status = ?, payout = ?, settled_at = ?, match_result = ? WHERE id = ?"
				)
					.bind(status, payout, now, matchResult, bet.id)
			);
			
			if (payout > 0) {
				const currentBalance = userPointsMap.get(bet.user_id) || 0;
				const newBalance = currentBalance + payout;
				userPointsMap.set(bet.user_id, newBalance);
				
				batchOperations.push(
					env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
						.bind(payout, bet.user_id)
				);
			}
			
			batchOperations.push(
				env.DB.prepare(
					"INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)"
				)
					.bind(bet.user_id, transactionType, payout, userPointsMap.get(bet.user_id) || 0, bet.id, `结算${status === 'won' ? '赢' : status === 'half_win' ? '赢半' : status === 'push' ? '走水' : status === 'half_lose' ? '输半' : '输'} ${match.homeTeam} vs ${match.awayTeam}`)
			);
		}
		
		batchOperations.push(
			env.DB.prepare("UPDATE matches SET match_status = 'ended', settled = 1 WHERE id = ?")
				.bind(matchId)
		);
		
		await env.DB.batch(batchOperations);
		
		return Response.json({ 
			message: `成功结算 ${bets.length} 笔投注`,
			settledCount: bets.length,
			matchResult,
			matchScore: match.score
		});
	} catch (error) {
		console.error("结算失败:", error);
		return Response.json({ error: "结算失败" }, { status: 500 });
	}
});

POST("/api/bets/settle-all", async (request, env) => {
	try {
		const endedMatches = await env.DB.prepare(
			"SELECT id, score FROM matches WHERE match_status = 'ended' AND score IS NOT NULL AND score != ''"
		)
			.all();
		
		const matches = endedMatches.results || [];
		
		let totalSettled = 0;
		
		for (const match of matches) {
			const matchDetail = await env.DB.prepare("SELECT homeTeam, awayTeam FROM matches WHERE id = ?")
				.bind(match.id)
				.first();
			
			const pendingBets = await env.DB.prepare(
				"SELECT * FROM bets WHERE match_id = ? AND status = 'pending'"
			)
				.bind(match.id)
				.all();
			
			const bets = pendingBets.results || [];
			
			if (bets.length === 0) continue;
			
			const matchResult = determineMatchResult(match.score);
			const now = new Date().toISOString();
			
			const userPointsMap = new Map<number, number>();
			for (const bet of bets) {
				if (!userPointsMap.has(bet.user_id)) {
					const user = await env.DB.prepare("SELECT points FROM users WHERE id = ?")
						.bind(bet.user_id)
						.first();
					userPointsMap.set(bet.user_id, (user?.points as number) || 0);
				}
			}
			
			const batchOperations: any[] = [];
			
			for (const bet of bets) {
				const settleResult = settleBet(
					bet.bet_type,
					bet.bet_value,
					match.score,
					bet.handicap_at_bet,
					bet.total_goals_at_bet
				);
				
				const status = settleResult.status;
				let payout = 0;
				let transactionType = 'settle_lose';
				
				if (status === 'won') {
					payout = Math.round((bet.points as number) * ((bet.odds_at_bet as number) + 1));
					transactionType = 'settle_win';
				} else if (status === 'half_win') {
					const stake = bet.points as number;
					const halfStake = stake / 2;
					const winPart = Math.round(halfStake * ((bet.odds_at_bet as number) + 1));
					const pushPart = halfStake;
					payout = Math.round(winPart + pushPart);
					transactionType = 'settle_half_win';
				} else if (status === 'push') {
					payout = bet.points as number;
					transactionType = 'settle_win';
				} else if (status === 'half_lose') {
					payout = Math.round((bet.points as number) / 2);
					transactionType = 'settle_half_lose';
				}
				
				batchOperations.push(
					env.DB.prepare(
						"UPDATE bets SET status = ?, payout = ?, settled_at = ?, match_result = ? WHERE id = ?"
					)
						.bind(status, payout, now, matchResult, bet.id)
				);
				
				if (payout > 0) {
					const currentBalance = userPointsMap.get(bet.user_id) || 0;
					const newBalance = currentBalance + payout;
					userPointsMap.set(bet.user_id, newBalance);
					
					batchOperations.push(
						env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
							.bind(payout, bet.user_id)
					);
				}
				
				batchOperations.push(
					env.DB.prepare(
						"INSERT INTO point_transactions (user_id, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)"
					)
						.bind(bet.user_id, transactionType, payout, userPointsMap.get(bet.user_id) || 0, bet.id, `结算${status === 'won' ? '赢' : status === 'half_win' ? '赢半' : status === 'push' ? '走水' : status === 'half_lose' ? '输半' : '输'} ${matchDetail?.homeTeam} vs ${matchDetail?.awayTeam}`)
				);
			}
			
			batchOperations.push(
				env.DB.prepare("UPDATE matches SET settled = 1 WHERE id = ?")
					.bind(match.id)
			);
			
			await env.DB.batch(batchOperations);
			totalSettled += bets.length;
		}
		
		return Response.json({ 
			message: `成功结算 ${totalSettled} 笔投注`,
			settledCount: totalSettled
		});
	} catch (error) {
		console.error("批量结算失败:", error);
		return Response.json({ error: "批量结算失败" }, { status: 500 });
	}
});

GET("/api/bets", withAuth(async (request, env, ctx, user) => {
	try {
		const url = new URL(request.url);
		const matchId = url.searchParams.get('matchId');
		
		let query = "SELECT b.*, m.homeTeam, m.awayTeam, m.league, m.score, m.match_status FROM bets b LEFT JOIN matches m ON b.match_id = m.id WHERE b.user_id = ? ORDER BY b.created_at DESC";
		const params: any[] = [user.id];
		
		if (matchId) {
			query = "SELECT b.*, m.homeTeam, m.awayTeam, m.league, m.score, m.match_status FROM bets b LEFT JOIN matches m ON b.match_id = m.id WHERE b.user_id = ? AND b.match_id = ? ORDER BY b.created_at DESC";
			params.push(matchId);
		}
		
		const bets = await env.DB.prepare(query)
			.bind(...params)
			.all();
		
		return Response.json(bets.results || []);
	} catch (error) {
		console.error("查询投注记录失败:", error);
		return Response.json({ error: "查询投注记录失败" }, { status: 500 });
	}
}));
