import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("API Tests", () => {
	const randomUsername = `testuser_${Date.now()}`;

	beforeAll(async () => {
		await env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT UNIQUE NOT NULL,
				password_hash TEXT NOT NULL,
				points INTEGER DEFAULT 1000,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		await env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS matches (
				id TEXT PRIMARY KEY,
				league TEXT,
				homeTeam TEXT,
				awayTeam TEXT,
				score TEXT,
				handicap TEXT,
				winOdds TEXT,
				drawOdds TEXT,
				loseOdds TEXT,
				handicapHomeOdds TEXT,
				handicapAwayOdds TEXT,
				totalGoals TEXT,
				overOdds TEXT,
				underOdds TEXT,
				createdAt TEXT,
				d_st2 TEXT,
				d_st_ing TEXT,
				match_time TEXT,
				match_status TEXT DEFAULT 'pending'
			)
		`).run();

		await env.DB.prepare(`
			CREATE TABLE IF NOT EXISTS bets (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				match_id TEXT,
				bet_type TEXT,
				bet_value TEXT,
				points INTEGER,
				odds_at_bet REAL,
				handicap_at_bet TEXT,
				total_goals_at_bet TEXT,
				status TEXT DEFAULT 'pending',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				payout INTEGER DEFAULT 0,
				settled_at TEXT,
				match_result TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id),
				FOREIGN KEY (match_id) REFERENCES matches(id)
			)
		`).run();

		await env.DB.prepare(`
			INSERT OR REPLACE INTO matches (id, league, homeTeam, awayTeam, score, handicap, winOdds, drawOdds, loseOdds, handicapHomeOdds, handicapAwayOdds, totalGoals, overOdds, underOdds, match_status)
			VALUES ('ev_13870148', '测试联赛', '主队A', '客队B', '0:0', '0', '1.80', '3.20', '4.00', '1.90', '1.90', '2.5', '1.85', '1.95', 'pending')
		`).run();
	});

	async function fetchApi(path: string, options: RequestInit = {}) {
		const request = new IncomingRequest(`http://localhost:8788${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		return response;
	}

	it("should complete full API workflow", async () => {
		let token: string = "";
		let userId: number = 0;

		const noTokenResponse = await fetchApi("/api/matches");
		expect(noTokenResponse.status).toBe(401);
		const noTokenJson = await noTokenResponse.json();
		expect(noTokenJson.error).toBe("缺少认证令牌");

		const registerResponse = await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({
				username: randomUsername,
				password: "testpass123",
			}),
		});
		expect(registerResponse.status).toBe(201);
		const registerJson = await registerResponse.json();
		expect(registerJson.username).toBe(randomUsername);
		expect(registerJson.points).toBe(1000);

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({
				username: randomUsername,
				password: "testpass123",
			}),
		});
		expect(loginResponse.status).toBe(200);
		const loginJson = await loginResponse.json();
		expect(loginJson.username).toBe(randomUsername);
		expect(loginJson.points).toBe(1000);
		expect(loginJson.token).toBeDefined();
		expect(typeof loginJson.token).toBe("string");
		token = loginJson.token;
		userId = loginJson.id;

		const matchesResponse = await fetchApi("/api/matches", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		expect(matchesResponse.status).toBe(200);
		const matchesJson = await matchesResponse.json();
		expect(Array.isArray(matchesJson)).toBe(true);

		const pointsResponse = await fetchApi("/api/user/points", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		expect(pointsResponse.status).toBe(200);
		const pointsJson = await pointsResponse.json();
		expect(pointsJson.id).toBe(userId);
		expect(pointsJson.username).toBe(randomUsername);
		expect(pointsJson.points).toBe(1000);

		const betResponse = await fetchApi("/api/bets", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				matchId: "ev_13870148",
				betType: "1x2",
				betValue: "win",
				points: 100,
			}),
		});
		expect(betResponse.status).toBe(201);
		const betJson = await betResponse.json();
		expect(betJson.userId).toBe(userId);
		expect(betJson.matchId).toBe("ev_13870148");
		expect(betJson.betType).toBe("1x2");
		expect(betJson.betValue).toBe("win");
		expect(betJson.points).toBe(100);
		expect(betJson.status).toBe("pending");

		const betsResponse = await fetchApi("/api/bets", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		expect(betsResponse.status).toBe(200);
		const betsJson = await betsResponse.json();
		expect(Array.isArray(betsJson)).toBe(true);
		expect(betsJson.length).toBeGreaterThan(0);
		const bet = betsJson[0];
		expect(bet.user_id).toBe(userId);
		expect(bet.status).toBe("pending");

		const invalidTokenResponse = await fetchApi("/api/matches", {
			headers: {
				Authorization: "Bearer invalid_token_12345",
			},
		});
		expect(invalidTokenResponse.status).toBe(401);
		const invalidTokenJson = await invalidTokenResponse.json();
		expect(invalidTokenJson.error).toBe("无效的认证令牌");

		const incompleteParamsResponse = await fetchApi("/api/bets", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				matchId: "ev_13870148",
				betType: "1x2",
				betValue: "win",
			}),
		});
		expect(incompleteParamsResponse.status).toBe(400);
		const incompleteParamsJson = await incompleteParamsResponse.json();
		expect(incompleteParamsJson.error).toBe("参数不完整");

		const insufficientPointsResponse = await fetchApi("/api/bets", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				matchId: "ev_13870148",
				betType: "1x2",
				betValue: "win",
				points: 999999,
			}),
		});
		expect(insufficientPointsResponse.status).toBe(400);
		const insufficientPointsJson = await insufficientPointsResponse.json();
		expect(insufficientPointsJson.error).toBe("积分不足");
	});
});