import { GET, POST } from "../router";
import { crawlMatches, saveMatchesToDB } from "../crawler";
import { withAuth } from "../auth";

type OrderRow = {
	Id: string;
	CustomerName: string;
	OrderDate: number;
};

GET("/api/matches", withAuth(async (request, env, ctx, user) => {
	const result = await env.DB.prepare("SELECT * FROM matches ORDER BY createdAt DESC LIMIT 100").all();
	return Response.json(result.results || []);
}));

GET("/api/crawl", withAuth(async (request, env, ctx, user) => {
	const matches = await crawlMatches(env.MYBROWSER);
	await saveMatchesToDB(env.DB, matches);
	return Response.json({ count: matches.length, matches });
}));

POST("/api/admin/settle-match", async (request, env) => {
	try {
		const { matchId, score, secret } = await request.json();
		
		if (!matchId || !score || !secret) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (secret !== env.RECHARGE_SECRET) {
			return Response.json({ error: "无效的密钥" }, { status: 401 });
		}
		
		if (!score.includes(':')) {
			return Response.json({ error: "比分格式不正确，应为 2:1 格式" }, { status: 400 });
		}
		
		await env.DB.prepare(
			"UPDATE matches SET score = ?, match_status = 'ended' WHERE id = ?"
		)
			.bind(score, matchId)
			.run();
		
		return Response.json({ success: true, message: "比赛比分已更新" });
	} catch (error) {
		console.error("更新比赛比分失败:", error);
		return Response.json({ error: "更新失败" }, { status: 500 });
	}
});