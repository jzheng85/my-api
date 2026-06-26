// 导入路由文件（新增路由文件后在此添加一行即可）
import "./routes/api";
import "./routes/cup";

import { handleRequest } from "./router";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
