import * as express from "express";
import * as helmet from "helmet";
import * as cors from "cors";
import { MongoClient } from "mongodb";
import * as path from "path";
import {v4 as generateUUID } from "uuid";
import multer = require("multer");

interface Item {
	name: string;
	id: string;
	modelPath: string;
	iconPath: string;
}

(async () => {
	const client = new MongoClient(process.env.MONGO_URI);
	await client.connect();

	const collection = client.db().collection("posts");

	const storage = multer.diskStorage({
		destination: (req, file, callback) => {
			switch (file.mimetype) {
				case "image/png":
				case "image/svg+xml":
					callback(null, path.join(__dirname, "../icons"));
					return;
				case "model/gltf-binary":
					callback(null, path.join(__dirname, "../models"));
					return;
				default:
					callback(new Error("Invalid file provided."), null);
					return;
			}
		},
	});

	const allowedTypes = ["model/gltf-binary", "image/png", "image/svg+xml"];
	const upload = multer({
		storage,
		fileFilter: (req, file, callback) => {
			if (allowedTypes.indexOf(file.mimetype) === -1 || file.size > (1024 * 1000 * 200)) {
				callback(null, false);
				return;
			}
			callback(null, true);
		}
	});


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
			return item;
		});

		res.status(200).json(array);
	});

	app.post("/", async (req, res) => {
		const name = req.body.name;
		const found = await collection.findOne({ name: name });
		if (found) {
			res.status(409).json({ error: "A model by that name already exists." });
			return;
		};
		upload.fields([{name: "icon", maxCount: 1}, {name: "model", maxCount: 1}])(req, res, (error: any) => {
			res.status(500).json({ error: "Something went wrong when uploading your file." });
			throw error;
		});
		const iconFile: any | undefined = req.files["icon"][0];
		const modelFile: any | undefined = req.files["model"][0];

		if (!iconFile || !modelFile) {
			res.status(400).json({ error: "Invalid input" });
			return;
		}

		const iconFileName = iconFile.filename;
		const modelFileName = modelFile.filename;

		let item: Item = {
			name: name,
			id: generateUUID(),
			modelPath: `/models/${modelFileName}/`,
			iconPath: `/icons/${iconFileName}/`,
		}
		
		await collection.insertOne(item);
		res.status(200).json({ item });
	});

	app.listen(process.env.PORT, () => {
		console.log(`Listening to port ${process.env.PORT} 🔥`);
	});

})().catch(err => { throw err });