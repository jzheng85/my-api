import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, serial } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("API Tests", () => {
	function getRandomUsername() {
		return `testuser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

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
			CREATE TABLE IF NOT EXISTS point_transactions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				type TEXT NOT NULL CHECK(type IN ('register', 'bet', 'settle_win', 'settle_lose', 'recharge')),
				amount INTEGER NOT NULL,
				balance_after INTEGER NOT NULL,
				reference_id INTEGER,
				description TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
		const username = getRandomUsername();

		const noTokenResponse = await fetchApi("/api/matches");
		expect(noTokenResponse.status).toBe(401);
		const noTokenJson = await noTokenResponse.json();
		expect(noTokenJson.error).toBe("缺少认证令牌");

		const registerResponse = await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({
				username,
				password: "testpass123",
				inviteCode: "TEST2026",
			}),
		});
		expect(registerResponse.status).toBe(201);
		const registerJson = await registerResponse.json();
		expect(registerJson.username).toBe(username);
		expect(registerJson.points).toBe(1000);

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({
				username,
				password: "testpass123",
			}),
		});
		expect(loginResponse.status).toBe(200);
		const loginJson = await loginResponse.json();
		expect(loginJson.username).toBe(username);
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
		expect(pointsJson.username).toBe(username);
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

	it("should get point transactions", async () => {
		const username = getRandomUsername();

		await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});
		const loginJson = await loginResponse.json();
		const token = loginJson.token;

		const transactionsResponse = await fetchApi("/api/user/transactions", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		expect(transactionsResponse.status).toBe(200);
		const transactionsJson = await transactionsResponse.json();
		expect(Array.isArray(transactionsJson)).toBe(true);
		expect(transactionsJson.length).toBeGreaterThan(0);

		const registerTx = transactionsJson.find((tx: any) => tx.type === "register");
		expect(registerTx).toBeDefined();
		expect(registerTx.amount).toBe(1000);
		expect(registerTx.balance_after).toBe(1000);
	});

	it("should recharge points with valid secret", async () => {
		const username = getRandomUsername();

		await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});
		const loginJson = await loginResponse.json();
		const userId = loginJson.id;

		const rechargeResponse = await fetchApi("/api/user/recharge", {
			method: "POST",
			body: JSON.stringify({
				userId,
				amount: 500,
				secret: "helloworldcup",
			}),
		});
		expect(rechargeResponse.status).toBe(201);
		const rechargeJson = await rechargeResponse.json();
		expect(rechargeJson.userId).toBe(userId);
		expect(rechargeJson.amount).toBe(500);
		expect(rechargeJson.balanceAfter).toBe(1500);

		const pointsResponse = await fetchApi("/api/user/points", {
			headers: {
				Authorization: `Bearer ${loginJson.token}`,
			},
		});
		const pointsJson = await pointsResponse.json();
		expect(pointsJson.points).toBe(1500);
	});

	it("should reject recharge with invalid secret", async () => {
		const username = getRandomUsername();

		await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});
		const loginJson = await loginResponse.json();
		const userId = loginJson.id;

		const rechargeResponse = await fetchApi("/api/user/recharge", {
			method: "POST",
			body: JSON.stringify({
				userId,
				amount: 500,
				secret: "wrong-secret",
			}),
		});
		expect(rechargeResponse.status).toBe(401);
		const rechargeJson = await rechargeResponse.json();
		expect(rechargeJson.error).toBe("无效的密钥");
	});

	it("should reject recharge with missing parameters", async () => {
		const username = getRandomUsername();

		await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});
		const loginJson = await loginResponse.json();
		const userId = loginJson.id;

		const response1 = await fetchApi("/api/user/recharge", {
			method: "POST",
			body: JSON.stringify({
				userId,
				amount: 500,
			}),
		});
		expect(response1.status).toBe(400);

		const response2 = await fetchApi("/api/user/recharge", {
			method: "POST",
			body: JSON.stringify({
				userId,
				secret: "secret",
			}),
		});
		expect(response2.status).toBe(400);

		const response3 = await fetchApi("/api/user/recharge", {
			method: "POST",
			body: JSON.stringify({
				amount: 500,
				secret: "secret",
			}),
		});
		expect(response3.status).toBe(400);
	});

	it("should record settle_win transaction when bet wins", async () => {
		const username = getRandomUsername();

		await fetchApi("/api/register", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123", inviteCode: "TEST2026" }),
		});

		const loginResponse = await fetchApi("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password: "testpass123" }),
		});
		const loginJson = await loginResponse.json();
		const token = loginJson.token;

		await env.DB.prepare(`
			UPDATE matches SET score = '0:0', match_status = 'pending' WHERE id = 'ev_13870148'
		`).run();

		await fetchApi("/api/bets", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				matchId: "ev_13870148",
				betType: "1x2",
				betValue: "win",
				points: 100,
			}),
		});

		await env.DB.prepare(`
			UPDATE matches SET score = '2:1', match_status = 'ended' WHERE id = 'ev_13870148'
		`).run();

		const settleResponse = await fetchApi("/api/bets/settle/ev_13870148", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		expect(settleResponse.status).toBe(200);

		const transactionsResponse = await fetchApi("/api/user/transactions", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		const transactionsJson = await transactionsResponse.json();

		const settleWinTx = transactionsJson.find((tx: any) => tx.type === "settle_win");
		expect(settleWinTx).toBeDefined();
		expect(settleWinTx.amount).toBe(280);
	});
});