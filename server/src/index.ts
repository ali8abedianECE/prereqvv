import express from "express";
import { mountVizApi } from "./viz_api";
const app = express();

app.use(express.json());
mountVizApi(app);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API on :${PORT}`));
