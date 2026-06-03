const azureAuth = require("../config/azureAuth");
const User = require("../models/User");
const { USER_ROLES, isSuperAdminRole } = require("../constants/userRoles");

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isEnvProtectedAdmin(email) {
  return (
    azureAuth.superAdminEmails.has(email) || azureAuth.adminEmails.has(email)
  );
}

function isEnvSuperAdmin(email) {
  return azureAuth.superAdminEmails.has(email);
}

async function listAdminUsers() {
  const dbUsers = await User.find({
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN] }
  })
    .select("email name role createdAt updatedAt")
    .sort({ role: 1, email: 1 })
    .lean();

  const byEmail = new Map();

  for (const user of dbUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    byEmail.set(email, {
      email,
      name: user.name ?? "",
      role: user.role,
      source: "database",
      canRemove: !isEnvProtectedAdmin(email) && !isSuperAdminRole(user.role),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  }

  for (const email of azureAuth.superAdminEmails) {
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: "",
        role: USER_ROLES.SUPER_ADMIN,
        source: "environment",
        canRemove: false,
        createdAt: null,
        updatedAt: null
      });
    } else {
      const entry = byEmail.get(email);
      entry.source = "environment";
      entry.canRemove = false;
      entry.role = USER_ROLES.SUPER_ADMIN;
    }
  }

  for (const email of azureAuth.adminEmails) {
    if (azureAuth.superAdminEmails.has(email)) {
      continue;
    }
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: "",
        role: USER_ROLES.ADMIN,
        source: "environment",
        canRemove: false,
        createdAt: null,
        updatedAt: null
      });
    } else {
      const entry = byEmail.get(email);
      if (entry.source !== "environment") {
        entry.source = "database";
      }
      entry.canRemove = false;
    }
  }

  return [...byEmail.values()].sort((a, b) => {
    if (a.role !== b.role) {
      if (a.role === USER_ROLES.SUPER_ADMIN) return -1;
      if (b.role === USER_ROLES.SUPER_ADMIN) return 1;
    }
    return a.email.localeCompare(b.email);
  });
}

async function addAdminUser(email, actorEmail) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  const existing = await User.findOne({ email: normalized }).select("role email");
  if (existing && isSuperAdminRole(existing.role)) {
    const error = new Error("This user is already a super admin.");
    error.statusCode = 400;
    throw error;
  }

  const displayName = normalized.split("@")[0] ?? "Admin";

  const user = await User.findOneAndUpdate(
    { email: normalized },
    {
      $set: { role: USER_ROLES.ADMIN },
      $setOnInsert: {
        employeeCode: "ADMIN",
        name: displayName,
        email: normalized,
        Department: "Administration",
        Designation: "Administrator",
        entity: "Sobha"
      }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  console.log("[Admin] Granted admin role:", {
    email: normalized,
    by: actorEmail
  });

  return {
    email: user.email,
    name: user.name,
    role: user.role,
    source: "database",
    canRemove: !isEnvProtectedAdmin(normalized)
  };
}

async function removeAdminUser(email, actorEmail) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalized === normalizeEmail(actorEmail)) {
    const error = new Error("You cannot remove your own admin access.");
    error.statusCode = 400;
    throw error;
  }

  if (isEnvProtectedAdmin(normalized)) {
    const error = new Error(
      "This admin is defined in server environment variables and cannot be removed here."
    );
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: normalized });
  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  if (isSuperAdminRole(user.role) || isEnvSuperAdmin(normalized)) {
    const error = new Error("Super admin users cannot be removed via this screen.");
    error.statusCode = 400;
    throw error;
  }

  if (user.role !== USER_ROLES.ADMIN) {
    const error = new Error("This user is not an admin.");
    error.statusCode = 400;
    throw error;
  }

  user.role = USER_ROLES.USER;
  await user.save();

  console.log("[Admin] Revoked admin role:", {
    email: normalized,
    by: actorEmail
  });

  return { email: normalized, role: USER_ROLES.USER };
}

module.exports = {
  listAdminUsers,
  addAdminUser,
  removeAdminUser
};
