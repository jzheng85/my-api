import { SignJWT, jwtVerify } from 'jose';

export interface UserPayload {
	id: number;
	username: string;
}

export async function signToken(user: UserPayload, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const secretKey = encoder.encode(secret);
	
	return new SignJWT(user)
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('24h')
		.sign(secretKey);
}

export async function verifyToken(token: string, secret: string): Promise<UserPayload> {
	const encoder = new TextEncoder();
	const secretKey = encoder.encode(secret);
	
	const { payload } = await jwtVerify(token, secretKey);
	return payload as UserPayload;
}

type AuthHandler = (request: Request, env: Env, ctx: ExecutionContext, user: UserPayload) => Promise<Response> | Response;

export function withAuth(handler: AuthHandler) {
	return async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
		const authHeader = request.headers.get('Authorization');
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return Response.json({ error: '缺少认证令牌' }, { status: 401 });
		}
		
		const token = authHeader.slice(7);
		
		try {
			const user = await verifyToken(token, env.JWT_SECRET);
			return handler(request, env, ctx, user);
		} catch (error) {
			return Response.json({ error: '无效的认证令牌' }, { status: 401 });
		}
	};
}