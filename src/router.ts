type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;

interface Route {
	method: string;
	path: string;
	handler: RouteHandler;
}

const routes: Route[] = [];

export function GET(path: string, handler: RouteHandler) {
	routes.push({ method: "GET", path, handler });
}

export function POST(path: string, handler: RouteHandler) {
	routes.push({ method: "POST", path, handler });
}

export function PUT(path: string, handler: RouteHandler) {
	routes.push({ method: "PUT", path, handler });
}

export function DELETE(path: string, handler: RouteHandler) {
	routes.push({ method: "DELETE", path, handler });
}

export function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
	const url = new URL(request.url);

	for (const route of routes) {
		if (route.method !== request.method && route.method !== "*") continue;

		// 支持精确匹配和简单的参数匹配 (e.g. /users/:id)
		const routeParts = route.path.split("/");
		const urlParts = url.pathname.split("/");

		if (routeParts.length !== urlParts.length) continue;

		const params: Record<string, string> = {};
		let match = true;

		for (let i = 0; i < routeParts.length; i++) {
			if (routeParts[i].startsWith(":")) {
				params[routeParts[i].slice(1)] = urlParts[i];
			} else if (routeParts[i] !== urlParts[i]) {
				match = false;
				break;
			}
		}

		if (match) {
			// 将 params 附加到 request 上供 handler 使用
			(request as any).params = params;
			return route.handler(request, env, ctx);
		}
	}

	return new Response("Not Found", { status: 404 });
}
