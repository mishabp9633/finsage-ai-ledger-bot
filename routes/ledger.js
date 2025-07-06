import express from "express";
import { authenticate } from "../middlewares/auth.js";
import { getLedgers } from "../controllers/ledger.js";

const router = express.Router();

router.get("/", authenticate, getLedgers);
// router.get("/:id", authenticate, getTicket);
// router.post("/", authenticate, createTicket);

export default router;
