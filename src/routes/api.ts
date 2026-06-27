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