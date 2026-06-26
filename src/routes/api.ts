import { GET, POST } from "../router";
import { launch } from "@cloudflare/playwright";

type OrderRow = {
  Id: string;
  CustomerName: string;
  OrderDate: number;
};

GET("/api", (_,env) => {
	const apiKey = env.API_KEY;
	return Response.json({ message: "Hello World!", apiKey: apiKey });
});

POST("/post", async (request) => {
	const body = await request.json();
	return Response.json({ message: "Hello World!", body: body });
});

GET("/api/db", async (_,env) => {
	const result = await env.DB.prepare("SELECT Id, CustomerName, OrderDate FROM [Order] LIMIT 100").run() as OrderRow[];
	return Response.json({ message: "Hello World!", result: result });
});

GET("/api/browser", async (_,env) => {
	const browser = await launch(env.MYBROWSER);
	const page = await browser.newPage();

    await page.goto("https://demo.playwright.dev/todomvc");

    const TODO_ITEMS = [
      "buy some cheese",
      "feed the cat",
      "book a doctors appointment",
    ];

    const newTodo = page.getByPlaceholder("What needs to be done?");
    for (const item of TODO_ITEMS) {
      await newTodo.fill(item);
      await newTodo.press("Enter");
    }

    const img = await page.screenshot();
    await browser.close();

    return new Response(img, {
      headers: {
        "Content-Type": "image/png",
      },
    });
});