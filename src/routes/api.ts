import { GET, POST } from "../router";

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
	const result = await env.DB.prepare("SELECT Id, CustomerName, OrderDate FROM [Order] ORDER BY ShippedDate DESC LIMIT 100").run() as OrderRow[];
	return Response.json({ message: "Hello World!", result: result });
});