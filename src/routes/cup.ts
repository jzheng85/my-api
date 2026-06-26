import { GET } from "../router";

GET("/cup", () => {
	return Response.json({ message: "Hello World Cup!" });
});
