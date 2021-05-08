import * as express from "express";
import * as helmet from "helmet";
import * as cors from "cors";
import { MongoClient } from "mongodb";
import * as path from "path";

interface Item {
	name: string;
	id: string;
}

(async () => {
	const client = new MongoClient(process.env.MONGO_URI);
	await client.connect();

	const collection = client.db().collection("posts");

	const app = express();
	app.use(helmet());
	app.use(cors());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	app.use("/models", express.static(path.join(__dirname, "../models")));
	app.use("/icons", express.static(path.join(__dirname, "../icons")));
	app.get("/", async (req, res) => {
		let page: number = Number.parseInt(req.query.page as string, 10) || 1;
		if (page === NaN) page = 1;

		const items = collection.find()
			.skip((page - 1) * 10)
			.limit(page);
		
		const array = (await items.toArray()).map(item => {
			delete item._id;
			delete item.iconPath;
			delete item.filePath;
			item.modelPath = `/models/${item.id}.gltf`;
			item.iconPath = `/icons/${item.id}.gltf`;
			return item;
		});

		res.status(200).json(array);
	});

	app.listen(process.env.PORT, () => {
		console.log(`Listening to port ${process.env.PORT} 🔥`);
	});

})().catch(err => { throw err });