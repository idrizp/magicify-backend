import * as dotenv from "dotenv";
dotenv.config();

import * as express from "express";
import * as helmet from "helmet";
import * as cors from "cors";
import { MongoClient } from "mongodb";
import * as path from "path";
import { v4 as generateUUID } from "uuid";
import multer = require("multer");
import * as fs from "fs";
import * as FileType from "file-type";

interface Item {
	name: string;
	id: string;
	modelPath: string;
	iconPath: string;
}

const extensions = {
	"image/png": ".png",
	"image/svg+xml": ".svg",
	"model/gltf-binary": ".gltb",
	"model/gltf+json": ".gltf",
	"application/octet-stream": ""
};

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
				case "model/gltf+json":
				case "application/octet-stream":
				case "model/gltf-binary":
					callback(null, path.join(__dirname, "../models"));
					return;
				default:
					callback(new Error("Invalid file provided."), null);
					return;
			}
		},
		filename: (req, file, callback) => {
			callback(null, generateUUID() + extensions[file.mimetype]);
		}
	});

	const allowedTypes = ["model/gltf-binary", "model/gltf+json", "image/png", "image/svg+xml"];
	const upload = multer({
		storage,
		fileFilter: async (req, file, callback) => {
			console.log("FILTERING NOW");
			let type: string = file.mimetype;
			console.log("TYPE IS " + type);
			if (type === "application/octet-stream") {
				// Seriously not secure but yea, fuck multer ig
				if (file.originalname.endsWith(".gltf") || file.originalname.endsWith(".glb")) {
					callback(null, true);
					return;
				}
			}
			if (allowedTypes.indexOf(type) === -1) {
				callback(null, false);
				return;
			}
			callback(null, true);
		},
	});


	const app = express();
	app.use(helmet());
	app.use(cors());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	app.use("/models", express.static(path.join(__dirname, "../models")));
	app.use("/icons", express.static(path.join(__dirname, "../icons")));

	app.get("/", async (req, res) => {
		const items = collection.find();
		const array = (await items.toArray()).map(item => {
			delete item._id;
			return item;
		});

		res.status(200).json(array);
	});

	app.post("/", upload.fields([{ name: "icon", maxCount: 1 }, { name: "model", maxCount: 1 }]), async (req, res) => {
		const name = req.body.name;
		const found = await collection.findOne({ name: name });

		console.log(req.files);

		const iconFile: Express.Multer.File | undefined = req.files["icon"][0];
		const modelFile: Express.Multer.File | undefined = req.files["model"][0];

		if (found) {
			res.status(409).json({ error: "A model by that name already exists." });
			fs.unlinkSync(iconFile.path);
			fs.unlinkSync(modelFile.path);
			return;
		};

		if (!iconFile || !modelFile) {
			res.status(400).json({ error: "Invalid input" });
			return;
		}

		const iconFileName = iconFile.filename;
		const modelFileName = modelFile.filename;

		let item: Item = {
			name: name,
			id: generateUUID(),
			modelPath: `/models/${modelFileName}`,
			iconPath: `/icons/${iconFileName}`,
		}


		await collection.insertOne(item);
		res.status(200).json({ item });
	});

	app.listen(process.env.PORT, () => {
		console.log(`Listening to port ${process.env.PORT} 🔥`);
	});

})().catch(err => { throw err });