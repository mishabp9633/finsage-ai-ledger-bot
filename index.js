import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.js";
import ledgerRoutes from "./routes/ledger.js";

import { connectDB } from "./db/dbconnection.js";

import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", userRoutes);
app.use("/api/ledgers", ledgerRoutes);

await connectDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
