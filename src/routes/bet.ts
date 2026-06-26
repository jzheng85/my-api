import { GET, POST } from "../router";

function parseScore(score: string): { home: number; away: number } {
	const parts = score.split(":");
	return {
		home: parseInt(parts[0] || "0", 10),
		away: parseInt(parts[1] || "0", 10)
	};
}

function parseHandicap(handicap: string): number {
	if (!handicap) return 0;
	
	let value = handicap.replace(/[+-]/g, "");
	
	if (value.includes("/")) {
		const parts = value.split("/");
		const avg = (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
		return handicap.startsWith("-") ? -avg : avg;
	}
	
	return handicap.startsWith("-") ? -parseFloat(value) : parseFloat(value);
}

function parseTotalGoals(totalGoals: string): number {
	if (!totalGoals) return 0;
	
	if (totalGoals.includes("/")) {
		const parts = totalGoals.split("/");
		return (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
	}
	
	return parseFloat(totalGoals);
}

function determineMatchResult(score: string): string {
	const { home, away } = parseScore(score);
	if (home > away) return "win";
	if (home < away) return "lose";
	return "draw";
}

function isBetWon(betType: string, betValue: string, score: string, handicapAtBet: string, totalGoalsAtBet: string): boolean {
	const { home, away } = parseScore(score);
	
	if (betType === "1x2") {
		const result = determineMatchResult(score);
		return result === betValue;
	}
	
	if (betType === "ah") {
		const hc = parseHandicap(handicapAtBet);
		const adjustedHome = home + hc;
		
		if (betValue === "home") {
			return adjustedHome > away;
		} else if (betValue === "away") {
			return adjustedHome < away;
		}
	}
	
	if (betType === "ou") {
		const total = home + away;
		const line = parseTotalGoals(totalGoalsAtBet);
		
		if (betValue === "over") {
			return total > line;
		} else if (betValue === "under") {
			return total < line;
		}
	}
	
	return false;
}

POST("/api/bets", async (request, env) => {
	try {
		const { userId, matchId, betType, betValue, points } = await request.json();
		
		if (!userId || !matchId || !betType || !betValue || !points) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (points <= 0) {
			return Response.json({ error: "投注积分必须大于0" }, { status: 400 });
		}
		
		const user = await env.DB.prepare(
			"SELECT id, points FROM users WHERE id = ?"
		)
			.bind(userId)
			.first();
		
		if (!user) {
			return Response.json({ error: "用户不存在" }, { status: 404 });
		}
		
		if ((user.points as number) < points) {
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
		
		if ((match.match_status as string) !== 'live') {
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
		
		const batch = await env.DB.batch([
			env.DB.prepare("UPDATE users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
				.bind(points, userId),
			env.DB.prepare(
				"INSERT INTO bets (user_id, match_id, bet_type, bet_value, points, odds_at_bet, handicap_at_bet, total_goals_at_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
			)
				.bind(userId, matchId, betType, betValue, points, oddsAtBet, handicapAtBet, totalGoalsAtBet)
		]);
		
		const betResult = batch[1] as any;
		
		return Response.json({ 
			id: betResult.lastInsertRowid,
			userId,
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
});

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
		
		const batchOperations: any[] = [];
		
		for (const bet of bets) {
			const won = isBetWon(
				bet.bet_type,
				bet.bet_value,
				match.score,
				bet.handicap_at_bet,
				bet.total_goals_at_bet
			);
			
			const status = won ? "won" : "lost";
			const payout = won ? Math.floor((bet.points as number) * (bet.odds_at_bet as number)) : 0;
			
			batchOperations.push(
				env.DB.prepare(
					"UPDATE bets SET status = ?, payout = ?, settled_at = ?, match_result = ? WHERE id = ?"
				)
					.bind(status, payout, now, matchResult, bet.id)
			);
			
			if (won) {
				batchOperations.push(
					env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
						.bind(payout, bet.user_id)
				);
			}
		}
		
		batchOperations.push(
			env.DB.prepare("UPDATE matches SET match_status = 'ended' WHERE id = ?")
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
			const pendingBets = await env.DB.prepare(
				"SELECT * FROM bets WHERE match_id = ? AND status = 'pending'"
			)
				.bind(match.id)
				.all();
			
			const bets = pendingBets.results || [];
			
			if (bets.length === 0) continue;
			
			const matchResult = determineMatchResult(match.score);
			const now = new Date().toISOString();
			
			const batchOperations: any[] = [];
			
			for (const bet of bets) {
				const won = isBetWon(
					bet.bet_type,
					bet.bet_value,
					match.score,
					bet.handicap_at_bet,
					bet.total_goals_at_bet
				);
				
				const status = won ? "won" : "lost";
				const payout = won ? Math.floor((bet.points as number) * (bet.odds_at_bet as number)) : 0;
				
				batchOperations.push(
					env.DB.prepare(
						"UPDATE bets SET status = ?, payout = ?, settled_at = ?, match_result = ? WHERE id = ?"
					)
						.bind(status, payout, now, matchResult, bet.id)
				);
				
				if (won) {
					batchOperations.push(
						env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
							.bind(payout, bet.user_id)
					);
				}
			}
			
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

GET("/api/bets/:userId", async (request, env) => {
	try {
		const userId = (request as any).params.userId;
		
		const bets = await env.DB.prepare(
			"SELECT b.*, m.homeTeam, m.awayTeam, m.league, m.score FROM bets b LEFT JOIN matches m ON b.match_id = m.id WHERE b.user_id = ? ORDER BY b.created_at DESC"
		)
			.bind(userId)
			.all();
		
		return Response.json(bets.results || []);
	} catch (error) {
		console.error("查询投注记录失败:", error);
		return Response.json({ error: "查询投注记录失败" }, { status: 500 });
	}
});

GET("/api/bets", async (request, env) => {
	try {
		const url = new URL(request.url);
		const matchId = url.searchParams.get('matchId');
		
		let query = "SELECT b.*, m.homeTeam, m.awayTeam, m.league, m.score, m.match_status FROM bets b LEFT JOIN matches m ON b.match_id = m.id ORDER BY b.created_at DESC";
		const params: any[] = [];
		
		if (matchId) {
			query = "SELECT b.*, m.homeTeam, m.awayTeam, m.league, m.score, m.match_status FROM bets b LEFT JOIN matches m ON b.match_id = m.id WHERE b.match_id = ? ORDER BY b.created_at DESC";
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
});