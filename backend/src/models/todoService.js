const mongoose = require("mongoose");

const Priority = ["low", "medium", "high"];

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, trim: true, default: "" },
    completed: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: {
        values: Priority,
        message: "Priority must be one of: low, medium, high",
      },
      default: "medium",
    },
    dueDate: { type: Date, default: null },
    createdAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);

const Todo = mongoose.model("Todo", todoSchema);

module.exports = { attachmentSchema, todoSchema, Todo };
