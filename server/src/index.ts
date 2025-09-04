// server/src/index.ts
import express from "express";
import Database from "better-sqlite3";
import createVizRouter from "./viz_api.js";

const app = express();
const db = new Database(process.env.DB_PATH || "./prereqs.db");

app.use(express.json());
app.use("/api/viz", createVizRouter(db));

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API on :${PORT}`));
