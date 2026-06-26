import { GET, POST } from "../router";
import { crawlMatches, saveMatchesToDB } from "../crawler";

type OrderRow = {
	Id: string;
	CustomerName: string;
	OrderDate: number;
};

GET("/api", (_, env) => {
	const apiKey = env.API_KEY;
	return Response.json({ message: "Hello World!", apiKey: apiKey });
});

POST("/post", async (request) => {
	const body = await request.json();
	return Response.json({ message: "Hello World!", body: body });
});

GET("/api/db", async (_, env) => {
	const result = await env.DB.prepare("SELECT Id, CustomerName, OrderDate FROM [Order] LIMIT 100").run() as OrderRow[];
	return Response.json({ message: "Hello World!", result: result });
});

GET("/api/matches", async (_, env) => {
	const result = await env.DB.prepare("SELECT * FROM matches ORDER BY createdAt DESC LIMIT 100").all();
	return Response.json(result.results || []);
});

GET("/api/crawl", async (_, env) => {
	const matches = await crawlMatches(env.MYBROWSER);
	await saveMatchesToDB(env.DB, matches);
	return Response.json({ count: matches.length, matches });
});