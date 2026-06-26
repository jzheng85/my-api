import "./routes/api";
import "./routes/cup";
import "./routes/user";
import "./routes/bet";

import { handleRequest } from "./router";
import { crawlMatches, saveMatchesToDB } from "./crawler";

function parseScore(score: string): { home: number; away: number } {
	if (!score || score === "") return { home: 0, away: 0 };
	const parts = score.split(":");
	return {
		home: parseInt(parts[0] || "0", 10),
		away: parseInt(parts[1] || "0", 10)
	};
}

function determineMatchResult(score: string): string {
	const { home, away } = parseScore(score);
	if (home > away) return "win";
	if (home < away) return "lose";
	return "draw";
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

function isBetWon(betType: string, betValue: string, score: string, handicap: string, totalGoals: string): boolean {
	const { home, away } = parseScore(score);
	
	if (betType === "1x2") {
		const result = determineMatchResult(score);
		return result === betValue;
	}
	
	if (betType === "ah") {
		const hc = parseHandicap(handicap);
		const adjustedHome = home + hc;
		
		if (betValue === "home") {
			return adjustedHome > away;
		} else if (betValue === "away") {
			return adjustedHome < away;
		}
	}
	
	if (betType === "ou") {
		const total = home + away;
		const line = parseTotalGoals(totalGoals);
		
		if (betValue === "over") {
			return total > line;
		} else if (betValue === "under") {
			return total < line;
		}
	}
	
	return false;
}

async function settleCompletedMatches(db: D1Database): Promise<void> {
	try {
		const endedMatches = await db.prepare(
			"SELECT id, score, handicap, totalGoals FROM matches WHERE match_status = 'live' AND score IS NOT NULL AND score != '0:0' AND score != ''"
		).all();
		
		const matches = endedMatches.results || [];
		
		for (const match of matches) {
			const pendingBets = await db.prepare(
				"SELECT * FROM bets WHERE match_id = ? AND status = 'pending'"
			).bind(match.id).all();
			
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
					match.handicap,
					match.totalGoals
				);
				
				const status = won ? "won" : "lost";
				const payout = won ? Math.floor((bet.points as number) * (bet.odds_at_bet as number)) : 0;
				
				batchOperations.push(
					db.prepare(
						"UPDATE bets SET status = ?, payout = ?, settled_at = ?, match_result = ? WHERE id = ?"
					).bind(status, payout, now, matchResult, bet.id)
				);
				
				if (won) {
					batchOperations.push(
						db.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
							.bind(payout, bet.user_id)
					);
				}
			}
			
			batchOperations.push(
				db.prepare("UPDATE matches SET match_status = 'ended' WHERE id = ?")
					.bind(match.id)
			);
			
			await db.batch(batchOperations);
			console.log(`Settled ${bets.length} bets for match ${match.id}`);
		}
	} catch (error) {
		console.error("Auto settlement failed:", error);
	}
}

interface Env {
	API_KEY: string;
	DB: D1Database;
	MYBROWSER: Browser;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleRequest(request, env, ctx);
	},

	async scheduled(event, env, ctx): Promise<void> {
		console.log(`Cron trigger started at ${new Date().toISOString()}`);
		
		try {
			const matches = await crawlMatches(env.MYBROWSER);
			await saveMatchesToDB(env.DB, matches);
			console.log(`Successfully crawled and saved ${matches.length} matches`);
			
			await settleCompletedMatches(env.DB);
			console.log("Auto settlement completed");
		} catch (error) {
			console.error("Cron job failed:", error);
		}
	},
} satisfies ExportedHandler<Env>;