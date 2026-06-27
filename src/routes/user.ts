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
	crypto.getRandomValues(salt);
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
		
		return Response.json({ 
			id: (result as any).lastInsertRowid, 
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