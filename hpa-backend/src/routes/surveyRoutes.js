const express = require("express");
const SurveyResponse = require("../models/SurveyResponse");
const User = require("../models/User");
const { requireMicrosoftAuth, requireAdmin } = require("../middleware/authMicrosoft");
const { resolveSurveyUser, loadSurveyUserDocument } = require("../middleware/resolveSurveyUser");
const azureAuth = require("../config/azureAuth");
const { resolveBootstrapRole } = require("../constants/userRoles");
const { resolveAdminAccess } = require("../services/resolveAdminAccess");
const {
  buildSurveyExportBuffer,
  buildExportFilename,
  buildAdminParticipants
} = require("../services/surveyExport");

const router = express.Router();

router.use(requireMicrosoftAuth);

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

function rejectMismatchedEmail(req, res, payloadEmail) {
  if (azureAuth.authDisabled || !payloadEmail) {
    return false;
  }
  if (payloadEmail !== req.auth.email) {
    res.status(403).json({
      message: "Email in request does not match signed-in Microsoft account."
    });
    return true;
  }
  return false;
}

router.post("/users/session", resolveSurveyUser, async (req, res) => {
  const payload = req.body?.userData;
  const payloadEmail =
    typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const email = req.surveyUserEmail;

  if (rejectMismatchedEmail(req, res, payloadEmail)) {
    return;
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

      const tokenName = req.auth?.name?.trim();
      if (tokenName) {
        existingUser.name = tokenName;
        await existingUser.save();
      } else if (typeof payload?.name === "string" && payload.name.trim()) {
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

    const bootstrapRole = resolveBootstrapRole(email, {
      superAdminEmails: azureAuth.superAdminEmails,
      adminEmails: azureAuth.adminEmails
    });

    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          employeeCode: payload?.employeeCode,
          name: payload?.name || req.auth?.name || email,
          email,
          Department: payload?.Department,
          Designation: payload?.Designation,
          entity: payload?.entity
        },
        $setOnInsert: {
          role: bootstrapRole
        }
      },
      {
        upsert: true,
        new: true,
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

router.post(
  "/responses",
  resolveSurveyUser,
  loadSurveyUserDocument,
  async (req, res) => {
    const isCompleted = Boolean(req.body?.isCompleted);
    const timedOut = Boolean(req.body?.timedOut);
    const user = req.surveyUser;

    if (!user) {
      return res.status(404).json({
        message: "User profile not found. Complete employee details before saving responses."
      });
    }

    const userId = user._id.toString();
    const bodyUserId = req.body?.userId?.toString?.() ?? req.body?.userId;
    if (bodyUserId && bodyUserId !== userId) {
      return res.status(403).json({
        message: "Cannot save responses for another user."
      });
    }

    console.log("[Survey][POST] /responses payload summary:", {
      userId,
      isCompleted,
      timedOut,
      answersCount: Array.isArray(req.body?.questionsAnswered)
        ? req.body.questionsAnswered.length
        : 0,
      categoryCount: Array.isArray(req.body?.categoryResults?.categories)
        ? req.body.categoryResults.categories.length
        : 0
    });

    try {
      const update = {
        userId: user._id,
        categoryResults: req.body?.categoryResults,
        questionsAnswered: req.body?.questionsAnswered,
        isCompleted,
        timedOut,
        submittedAt: new Date()
      };

      const rawRemainingSeconds = req.body?.remainingSeconds;
      if (
        rawRemainingSeconds !== undefined &&
        rawRemainingSeconds !== null &&
        Number.isFinite(Number(rawRemainingSeconds))
      ) {
        update.remainingSeconds = Math.max(0, Math.floor(Number(rawRemainingSeconds)));
      }

      const savedResponse = await SurveyResponse.findOneAndUpdate(
        { userId: user._id },
        update,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      );

      await User.findByIdAndUpdate(
        user._id,
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
  }
);

router.get("/me", async (req, res) => {
  const email = req.auth?.email;
  if (!email && !azureAuth.authDisabled) {
    return res.status(401).json({
      message: "Authenticated user email is required."
    });
  }

  try {
    const access = await resolveAdminAccess(email);
    return res.status(200).json({
      data: {
        email: email || null,
        name: req.auth?.name ?? null,
        isAdmin: access.isAdmin,
        isSuperAdmin: access.isSuperAdmin,
        role: access.role
      }
    });
  } catch (error) {
    console.error("[Survey][GET] /me failed:", {
      email,
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to resolve user access.",
      error: error.message
    });
  }
});

router.get("/admin/participants", requireAdmin, async (_req, res) => {
  try {
    const participants = await buildAdminParticipants();
    return res.status(200).json({ data: participants });
  } catch (error) {
    console.error("[Survey][GET] /admin/participants failed:", {
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to fetch participants.",
      error: error.message
    });
  }
});

router.get("/responses/export", requireAdmin, async (_req, res) => {
  try {
    const buffer = await buildSurveyExportBuffer();
    const filename = buildExportFilename();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("[Survey][GET] /responses/export failed:", {
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to export survey responses.",
      error: error.message
    });
  }
});

router.get("/responses", requireAdmin, async (_req, res) => {
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

router.get("/responses/status", resolveSurveyUser, async (req, res) => {
  const email = req.surveyUserEmail;

  try {
    const existingUser = await User.findOne({
      email
    }).select("_id email hasCompletedQuestions hasTimedOut");

    if (!existingUser) {
      return res.status(200).json({
        hasCompleted: false,
        hasTimedOut: false,
        user: null,
        latestSubmission: null
      });
    }

    const existingResponse = await SurveyResponse.findOne({
      userId: existingUser._id
    })
      .sort({ createdAt: -1 })
      .select("_id createdAt userId isCompleted timedOut remainingSeconds questionsAnswered");

    const hasCompleted = Boolean(existingUser.hasCompletedQuestions);
    const hasTimedOut = Boolean(existingUser.hasTimedOut);
    console.log("[Survey][GET] /responses/status checked:", {
      email,
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
            remainingSeconds: existingResponse.remainingSeconds ?? null,
            questionsAnswered: existingResponse.questionsAnswered ?? []
          }
        : null
    });
  } catch (error) {
    console.error("[Survey][GET] /responses/status failed:", {
      email,
      error: error.message
    });
    return res.status(500).json({
      message: "Failed to check survey status.",
      error: error.message
    });
  }
});

module.exports = router;
