import mongoose from "mongoose";
import { nanoid } from "nanoid";

const ledgerSchema = new mongoose.Schema({
  uid: {
    type: String,
    unique: true,
    default: () => nanoid()  // Generates IDs like: "V1StGXR8_Z5jdHi6B-myT"
  }, 
  title: {type: String, required: true, unique: true},
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("Ledger", ledgerSchema);
