const express = require("express");
const SurveyResponse = require("../models/SurveyResponse");
const User = require("../models/User");

const router = express.Router();

function hasCompleteProfilePayload(payload) {
  return (
    typeof payload?.employeeCode === "string" &&
    payload.employeeCode.trim() &&
    typeof payload?.Department === "string" &&
    payload.Department.trim() &&
    typeof payload?.Designation === "string" &&
    payload.Designation.trim() &&
    typeof payload?.entity === "string" &&
    payload.entity.trim()
  );
}

router.post("/users/session", async (req, res) => {
  const payload = req.body?.userData;
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!email) {
    return res.status(400).json({
      message: "userData.email is required."
    });
  }

  console.log("[Survey][POST] /users/session payload summary:", {
    email,
    name: payload?.name ?? null,
    isProfileSubmission: hasCompleteProfilePayload(payload)
  });

  try {
    if (!hasCompleteProfilePayload(payload)) {
      const existingUser = await User.findOne({ email });

      if (!existingUser) {
        return res.status(200).json({
          message: "User session not found.",
          data: {
            user: null,
            response: null
          }
        });
      }

      if (typeof payload?.name === "string" && payload.name.trim()) {
        existingUser.name = payload.name.trim();
        await existingUser.save();
      }

      const existingResponse = await SurveyResponse.findOne({ userId: existingUser._id }).sort({
        updatedAt: -1
      });

      return res.status(200).json({
        message: "User session restored.",
        data: {
          user: existingUser,
          response: existingResponse
        }
      });
    }

    const user = await User.findOneAndUpdate(
      { email },
      {
        employeeCode: payload?.employeeCode,
        name: payload?.name,
        email,
        Department: payload?.Department,
        Designation: payload?.Designation,
        entity: payload?.entity
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    const existingResponse = await SurveyResponse.findOne({ userId: user._id }).sort({
      updatedAt: -1
    });

    return res.status(200).json({
      message: "User session prepared.",
      data: {
        user,
        response: existingResponse
      }
    });
  } catch (error) {
    console.error("[Survey][POST] /users/session failed:", {
      error: error.message
    });
    return res.status(400).json({
      message: "Failed to prepare user session.",
      error: error.message
    });
  }
});

router.post("/responses", async (req, res) => {
  const userId = req.body?.userId;
  const isCompleted = Boolean(req.body?.isCompleted);
  const timedOut = Boolean(req.body?.timedOut);

  console.log("[Survey][POST] /responses payload summary:", {
    userId: userId ?? null,
    isCompleted,
    timedOut,
    answersCount: Array.isArray(req.body?.questionsAnswered) ? req.body.questionsAnswered.length : 0,
    categoryCount: Array.isArray(req.body?.categoryResults?.categories) ? req.body.categoryResults.categories.length : 0
  });

  if (!userId) {
    return res.status(400).json({
      message: "userId is required."
    });
  }

  try {
    const savedResponse = await SurveyResponse.findOneAndUpdate(
      { userId },
      {
        userId,
        categoryResults: req.body?.categoryResults,
        questionsAnswered: req.body?.questionsAnswered,
        isCompleted,
        timedOut,
        submittedAt: new Date()
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    await User.findByIdAndUpdate(
      userId,
      {
        hasCompletedQuestions: isCompleted,
        hasTimedOut: timedOut
      },
      {
        runValidators: true
      }
    );

    console.log("[Survey][POST] /responses saved to DB:", {
      id: savedResponse._id?.toString?.() ?? null,
      createdAt: savedResponse.createdAt ?? null,
      userId: savedResponse.userId?.toString?.() ?? null,
      isCompleted: savedResponse.isCompleted,
      timedOut: savedResponse.timedOut
    });

    return res.status(201).json({
      message: "Survey response saved.",
      data: savedResponse
    });
  } catch (error) {
    console.error("[Survey][POST] /responses failed:", {
      error: error.message,
      details: error?.errors
        ? Object.fromEntries(
            Object.entries(error.errors).map(([key, value]) => [
              key,
              value?.message ?? "Invalid value"
            ])
          )
        : undefined
    });

    return res.status(400).json({
      message: "Failed to save survey response.",
      error: error.message,
      details: error?.errors
        ? Object.fromEntries(
            Object.entries(error.errors).map(([key, value]) => [
              key,
              value?.message ?? "Invalid value"
            ])
          )
        : undefined
    });
  }
});

router.get("/responses", async (_req, res) => {
  try {
    const responses = await SurveyResponse.find().sort({ createdAt: -1 }).populate("userId");
    console.log("[Survey][GET] /responses fetched from DB:", {
      total: responses.length
    });
    return res.status(200).json({ data: responses });
  } catch (error) {
    console.error("[Survey][GET] /responses failed:", {
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to fetch survey responses.",
      error: error.message
    });
  }
});

router.get("/responses/status", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

  if (!email) {
    return res.status(400).json({
      message: "Query parameter 'email' is required."
    });
  }

  try {
    const existingUser = await User.findOne({
      email: email.toLowerCase()
    }).select("_id email hasCompletedQuestions hasTimedOut");

    if (!existingUser) {
      return res.status(200).json({
        hasCompleted: false,
        user: null,
        latestSubmission: null
      });
    }

    const existingResponse = await SurveyResponse.findOne({
      userId: existingUser._id
    })
      .sort({ createdAt: -1 })
      .select("_id createdAt userId isCompleted timedOut questionsAnswered");

    const hasCompleted = Boolean(existingUser.hasCompletedQuestions);
    const hasTimedOut = Boolean(existingUser.hasTimedOut);
    console.log("[Survey][GET] /responses/status checked:", {
      email: email.toLowerCase(),
      hasCompleted,
      hasTimedOut
    });

    return res.status(200).json({
      hasCompleted,
      hasTimedOut,
      user: {
        id: existingUser._id,
        email: existingUser.email
      },
      latestSubmission: existingResponse
        ? {
            id: existingResponse._id,
            createdAt: existingResponse.createdAt,
            userId: existingResponse.userId ?? null,
            isCompleted: existingResponse.isCompleted,
            timedOut: existingResponse.timedOut,
            questionsAnswered: existingResponse.questionsAnswered ?? []
          }
        : null
    });
  } catch (error) {
    console.error("[Survey][GET] /responses/status failed:", {
      email: email.toLowerCase(),
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to check survey status.",
      error: error.message
    });
  }
});

module.exports = router;
