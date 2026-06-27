import { GET, POST } from "../router";
import { signToken, withAuth } from "../auth";

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
	const encoder = new TextEncoder();
	const passwordKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"]
	);
	const derivedBits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
		passwordKey,
		256
	);
	return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
}

function generateSalt(): Uint8Array {
	const salt = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		crypto.getRandomValues(salt);
	} else {
		for (let i = 0; i < 16; i++) {
			salt[i] = Math.floor(Math.random() * 256);
		}
	}
	return salt;
}

function saltToString(salt: Uint8Array): string {
	return btoa(String.fromCharCode(...salt));
}

function stringToSalt(str: string): Uint8Array {
	const binary = atob(str);
	const salt = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		salt[i] = binary.charCodeAt(i);
	}
	return salt;
}

const INVITE_CODES = ['INVITE2026', 'VIP2026', 'TEST2026'];

POST("/api/register", async (request, env) => {
	try {
		const { username, password, inviteCode } = await request.json();
		
		if (!username || !password || !inviteCode) {
			return Response.json({ error: "用户名、密码和邀请码不能为空" }, { status: 400 });
		}
		
		if (!INVITE_CODES.includes(inviteCode.toUpperCase())) {
			return Response.json({ error: "无效的邀请码" }, { status: 400 });
		}
		
		const existingUser = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
			.bind(username)
			.first();
		
		if (existingUser) {
			return Response.json({ error: "用户名已存在" }, { status: 409 });
		}
		
		const salt = generateSalt();
		const passwordHash = await hashPassword(password, salt);
		const saltStr = saltToString(salt);
		const fullHash = `${saltStr}:${passwordHash}`;
		
		const result = await env.DB.prepare(
			"INSERT INTO users (username, password_hash, points) VALUES (?, ?, ?)"
		)
			.bind(username, fullHash, 1000)
			.run();
		
		const userId = (result as any).meta.last_row_id;
		
		await env.DB.prepare(
			"INSERT INTO point_transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)"
		)
			.bind(userId, 'register', 1000, 1000, '注册赠送')
			.run();
		
		return Response.json({ 
			id: userId, 
			username, 
			points: 1000 
		}, { status: 201 });
	} catch (error) {
		console.error("注册失败:", error);
		return Response.json({ error: "注册失败" }, { status: 500 });
	}
});

POST("/api/login", async (request, env) => {
	try {
		const { username, password } = await request.json();
		
		if (!username || !password) {
			return Response.json({ error: "用户名和密码不能为空" }, { status: 400 });
		}
		
		const user = await env.DB.prepare(
			"SELECT id, username, password_hash, points FROM users WHERE username = ?"
		)
			.bind(username)
			.first();
		
		if (!user) {
			return Response.json({ error: "用户名或密码错误" }, { status: 401 });
		}
		
		const [saltStr, storedHash] = (user.password_hash as string).split(":");
		const salt = stringToSalt(saltStr);
		const passwordHash = await hashPassword(password, salt);
		
		if (passwordHash !== storedHash) {
			return Response.json({ error: "用户名或密码错误" }, { status: 401 });
		}
		
		const token = await signToken({ id: user.id, username: user.username }, env.JWT_SECRET);
		
		return Response.json({ 
			id: user.id, 
			username: user.username, 
			points: user.points,
			token 
		});
	} catch (error) {
		console.error("登录失败:", error);
		return Response.json({ error: "登录失败" }, { status: 500 });
	}
});

GET("/api/user/points", withAuth(async (request, env, ctx, user) => {
	try {
		const dbUser = await env.DB.prepare(
			"SELECT id, username, points FROM users WHERE id = ?"
		)
			.bind(user.id)
			.first();
		
		if (!dbUser) {
			return Response.json({ error: "用户不存在" }, { status: 404 });
		}
		
		return Response.json({ id: dbUser.id, username: dbUser.username, points: dbUser.points });
	} catch (error) {
		console.error("查询积分失败:", error);
		return Response.json({ error: "查询积分失败" }, { status: 500 });
	}
}));

GET("/api/user/transactions", withAuth(async (request, env, ctx, user) => {
	try {
		const transactions = await env.DB.prepare(
			"SELECT * FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC"
		)
			.bind(user.id)
			.all();
		
		return Response.json(transactions.results || []);
	} catch (error) {
		console.error("查询积分明细失败:", error);
		return Response.json({ error: "查询积分明细失败" }, { status: 500 });
	}
}));

POST("/api/user/recharge", async (request, env) => {
	try {
		const { userId, amount, secret } = await request.json();
		
		if (!userId || !amount || !secret) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (secret !== env.RECHARGE_SECRET) {
			return Response.json({ error: "无效的密钥" }, { status: 401 });
		}
		
		if (amount <= 0) {
			return Response.json({ error: "充值积分必须大于0" }, { status: 400 });
		}
		
		const user = await env.DB.prepare("SELECT id, points FROM users WHERE id = ?")
			.bind(userId)
			.first();
		
		if (!user) {
			return Response.json({ error: "用户不存在" }, { status: 404 });
		}
		
		const newBalance = (user.points as number) + amount;
		
		const batch = await env.DB.batch([
			env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
				.bind(amount, userId),
			env.DB.prepare(
				"INSERT INTO point_transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)"
			)
				.bind(userId, 'recharge', amount, newBalance, '充值')
		]);
		
		return Response.json({ 
			userId,
			amount,
			balanceAfter: newBalance,
			transactionId: (batch[1] as any).lastInsertRowid
		}, { status: 201 });
	} catch (error) {
		console.error("充值失败:", error);
		return Response.json({ error: "充值失败" }, { status: 500 });
	}
});

GET("/api/admin/users", withAuth(async (request, env, ctx, authUser) => {
	try {
		if (authUser.username !== 'admin') {
			return Response.json({ error: "权限不足" }, { status: 403 });
		}
		
		const url = new URL(request.url);
		const username = url.searchParams.get('username');
		
		let query = "SELECT id, username, points, created_at FROM users";
		const params: any[] = [];
		
		if (username) {
			query += " WHERE username LIKE ?";
			params.push(`%${username}%`);
		}
		
		query += " ORDER BY created_at DESC LIMIT 20";
		
		const users = await env.DB.prepare(query)
			.bind(...params)
			.all();
		
		return Response.json(users.results || []);
	} catch (error) {
		console.error("查询用户失败:", error);
		return Response.json({ error: "查询用户失败" }, { status: 500 });
	}
}));

POST("/api/admin/recharge", withAuth(async (request, env, ctx, authUser) => {
	try {
		const { username, amount } = await request.json();
		
		if (authUser.username !== 'admin') {
			return Response.json({ error: "权限不足" }, { status: 403 });
		}
		
		if (!username || !amount) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (amount <= 0) {
			return Response.json({ error: "充值积分必须大于0" }, { status: 400 });
		}
		
		const user = await env.DB.prepare("SELECT id, points FROM users WHERE username = ?")
			.bind(username)
			.first();
		
		if (!user) {
			return Response.json({ error: "用户不存在" }, { status: 404 });
		}
		
		const userId = user.id;
		const newBalance = (user.points as number) + amount;
		
		const batch = await env.DB.batch([
			env.DB.prepare("UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
				.bind(amount, userId),
			env.DB.prepare(
				"INSERT INTO point_transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)"
			)
				.bind(userId, 'recharge', amount, newBalance, '管理后台充值')
		]);
		
		return Response.json({ 
			userId,
			username,
			amount,
			balanceAfter: newBalance,
			transactionId: (batch[1] as any).lastInsertRowid
		}, { status: 201 });
	} catch (error) {
		console.error("管理后台充值失败:", error);
		return Response.json({ error: "充值失败" }, { status: 500 });
	}
}));
