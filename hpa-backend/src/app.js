const express = require("express");
const cors = require("cors");

const surveyRoutes = require("./routes/surveyRoutes");

/** Browser origin allowed to call this API (production SPA). Override locally via CORS_ORIGIN if needed. */
const FRONTEND_ORIGIN =
  process.env.CORS_ORIGIN?.trim() || "https://sobhaascend.sobhaapps.com";

const app = express();

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

app.use((req, _res, next) => {
  const startedAt = Date.now();
  console.log(
    `[API] ${req.method} ${req.originalUrl} received at ${new Date(
      startedAt,
    ).toISOString()}`,
  );
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/surveys", surveyRoutes);

module.exports = app;
