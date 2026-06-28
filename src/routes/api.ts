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

POST("/api/admin/settle-match", withAuth(async (request, env, ctx, authUser) => {
	try {
		const { matchId, score } = await request.json();
		
		if (authUser.username !== 'admin') {
			return Response.json({ error: "权限不足" }, { status: 403 });
		}
		
		if (!matchId || !score) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		if (!score.includes(':')) {
			return Response.json({ error: "比分格式不正确，应为 2:1 格式" }, { status: 400 });
		}
		
		await env.DB.prepare(
			"UPDATE matches SET score = ?, match_status = 'ended', d_st2 = 'ok', d_st_ing = '0' WHERE id = ?"
		)
			.bind(score, matchId)
			.run();
		
		return Response.json({ success: true, message: "比赛比分已更新" });
	} catch (error) {
		console.error("更新比赛比分失败:", error);
		return Response.json({ error: "更新失败" }, { status: 500 });
	}
}));

POST("/api/admin/start-match", withAuth(async (request, env, ctx, authUser) => {
	try {
		const { matchId } = await request.json();
		
		if (authUser.username !== 'admin') {
			return Response.json({ error: "权限不足" }, { status: 403 });
		}
		
		if (!matchId) {
			return Response.json({ error: "参数不完整" }, { status: 400 });
		}
		
		const match = await env.DB.prepare("SELECT d_st2 FROM matches WHERE id = ?")
			.bind(matchId)
			.first();
		
		if (!match) {
			return Response.json({ error: "比赛不存在" }, { status: 404 });
		}
		
		if (match.d_st2 !== 'wait') {
			return Response.json({ error: "比赛状态不正确，只有未开始的比赛才能开始" }, { status: 400 });
		}
		
		await env.DB.prepare(
			"UPDATE matches SET d_st2 = 'ok', d_st_ing = '1', match_status = 'live' WHERE id = ?"
		)
			.bind(matchId)
			.run();
		
		return Response.json({ success: true, message: "比赛已开始" });
	} catch (error) {
		console.error("开始比赛失败:", error);
		return Response.json({ error: "更新失败" }, { status: 500 });
	}
}));