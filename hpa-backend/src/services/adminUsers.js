const User = require("../models/User");
const {
  USER_ROLES,
  isAdminRole,
  isSuperAdminRole
} = require("../constants/userRoles");

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAdminRole(role) {
  if (role === USER_ROLES.SUPER_ADMIN) {
    return USER_ROLES.SUPER_ADMIN;
  }
  return USER_ROLES.ADMIN;
}

async function countSuperAdmins() {
  return User.countDocuments({ role: USER_ROLES.SUPER_ADMIN });
}

async function listAdminUsers(actorEmail) {
  const actor = normalizeEmail(actorEmail);
  const dbUsers = await User.find({
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN] }
  })
    .select("email name role createdAt updatedAt")
    .sort({ role: 1, email: 1 })
    .lean();

  return dbUsers.map((user) => {
    const email = normalizeEmail(user.email);
    const isSelf = email === actor;
    const isSuperAdmin = isSuperAdminRole(user.role);

    return {
      email,
      name: user.name ?? "",
      role: user.role,
      source: "database",
      canRemove: !isSelf,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isSuperAdmin
    };
  });
}

async function addAdminUser(email, actorEmail, requestedRole = USER_ROLES.ADMIN) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  const role = normalizeAdminRole(requestedRole);
  const existing = await User.findOne({ email: normalized }).select("role email");
  if (existing && isAdminRole(existing.role) && existing.role === role) {
    const label = role === USER_ROLES.SUPER_ADMIN ? "super admin" : "admin";
    const error = new Error(`This user is already a ${label}.`);
    error.statusCode = 400;
    throw error;
  }

  const displayName = normalized.split("@")[0] ?? "Admin";

  const user = await User.findOneAndUpdate(
    { email: normalized },
    {
      $set: { role },
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
    role,
    by: actorEmail
  });

  return {
    email: user.email,
    name: user.name,
    role: user.role,
    source: "database",
    canRemove: normalizeEmail(actorEmail) !== normalized
  };
}

async function removeAdminUser(email, actorEmail) {
  const normalized = normalizeEmail(email);
  const actor = normalizeEmail(actorEmail);

  if (!normalized) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalized === actor) {
    const error = new Error("You cannot remove your own admin access.");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: normalized });
  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!isAdminRole(user.role)) {
    const error = new Error("This user is not an admin.");
    error.statusCode = 400;
    throw error;
  }

  if (isSuperAdminRole(user.role)) {
    const superAdminCount = await countSuperAdmins();
    if (superAdminCount <= 1) {
      const error = new Error("Cannot remove the last super admin.");
      error.statusCode = 400;
      throw error;
    }
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
