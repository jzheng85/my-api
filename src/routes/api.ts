import { GET } from "../router";

GET("/api", () => {
	return Response.json({ message: "Hello World!" });
});
