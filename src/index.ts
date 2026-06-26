import "./routes/api";
import "./routes/cup";

import { handleRequest } from "./router";
import { crawlMatches, saveMatchesToDB } from "./crawler";

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
		} catch (error) {
			console.error("Cron job failed:", error);
		}
	},
} satisfies ExportedHandler<Env>;