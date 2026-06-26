import { GET, POST } from "../router";
import { launch } from "@cloudflare/playwright";

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

GET("/api/browser", async (_, env) => {
	const browser = await launch(env.MYBROWSER);
	const page = await browser.newPage();

	await page.goto("https://live.chuqi.com/football/");

	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(3000);

	const classicElement = page.locator('span.a0item[ai-value="-3"]');
	await classicElement.click({ timeout: 10000 });

	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(2000);

	const filterBtn = page.locator('div.a1select.a0pc[ai-title="赛事筛选"]');
	await filterBtn.click({ timeout: 10000 });
	await page.waitForTimeout(2000);

	const filterPanel = await page.locator('#live_filter_match');
	await filterPanel.waitFor({ timeout: 5000 });

	const inverseBtn = page.locator('#live_filter_match button.a0bt[ai-action="selInverse"]');
	await inverseBtn.click({ timeout: 5000 });
	await page.waitForTimeout(500);

	const worldCupBtn = page.locator('#live_filter_match button[ai-id="35152"]');
	await worldCupBtn.click({ timeout: 5000 });
	await page.waitForTimeout(500);

	const confirmBtn = page.locator('#live_filter_match button.a1bt[id="live_filter_match_submit"]');
	await confirmBtn.click({ timeout: 5000 });

	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(2000);

	

	const img = await page.screenshot();
	await browser.close();

	return new Response(img, {
		headers: {
			"Content-Type": "image/png",
		},
	});
});