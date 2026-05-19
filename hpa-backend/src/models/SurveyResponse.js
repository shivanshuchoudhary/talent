const mongoose = require("mongoose");

const questionAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true,
      min: 1
    },
    answer: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    }
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: Number,
      required: true,
      min: 1
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    totalScore: {
      type: Number,
      required: true
    },
    averageScore: {
      type: Number,
      required: true
    },
    weightedScore: {
      type: Number,
      required: true
    },
    scoreLevel: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const surveyResponseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    categoryResults: {
      categories: {
        type: [categorySchema],
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length > 0,
          message: "categories must contain at least one item."
        }
      },
      letterGrade: {
        type: String,
        required: true,
        trim: true
      }
    },
    questionsAnswered: {
      type: [questionAnswerSchema],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value),
        message: "questionsAnswered must be an array."
      }
    },
    isCompleted: {
      type: Boolean,
      required: true,
      default: false
    },
    timedOut: {
      type: Boolean,
      required: true,
      default: false
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SurveyResponse", surveyResponseSchema);
