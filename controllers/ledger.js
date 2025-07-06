// import { inngest } from "../inngest/client.js";
import Ledger from "../models/ledger.js";

export const getLedgers = async (req, res) => {
  try {
    const user = req.user;
    let ledgers = await Ticket.find({ createdBy: user._id })
      .select("title description createdAt")
      .populate("createdBy", ["email", "_id"])
      .sort({ createdAt: -1 });

    return res.status(200).json(ledgers);
  } catch (error) {
    console.error("Error fetching ledgers", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const createLedger = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required" });
    }
    const newLedger = Ledger.create({
      title,
      description,
      createdBy: req.user._id.toString(),
    });

    return res.status(201).json({
      message: "Ticket created and processing started",
      ledger: newLedger,
    });
  } catch (error) {
    console.error("Error creating ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
