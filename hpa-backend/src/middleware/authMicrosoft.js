const azureAuth = require("../config/azureAuth");
const User = require("../models/User");
const {
  USER_ROLES,
  isAdminRole,
  isSuperAdminRole
} = require("../constants/userRoles");

/** jose v5+ is ESM-only — load via dynamic import from CommonJS. */
let joseModulePromise;

function loadJose() {
  if (!joseModulePromise) {
    joseModulePromise = import("jose");
  }
  return joseModulePromise;
}

const jwksByTenant = new Map();

async function getJwksForTenant(tenantId) {
  const { createRemoteJWKSet } = await loadJose();
  if (!tenantId) {
    return null;
  }
  if (!jwksByTenant.has(tenantId)) {
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
    jwksByTenant.set(tenantId, createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksByTenant.get(tenantId);
}

function getIssuersForTenant(tenantId) {
  return [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://login.microsoftonline.com/${tenantId}/`,
    `https://sts.windows.net/${tenantId}/`
  ];
}

function audienceMatches(payload, clientId) {
  const aud = payload.aud;
  if (typeof aud === "string") {
    return aud === clientId;
  }
  if (Array.isArray(aud)) {
    return aud.includes(clientId);
  }
  return false;
}

function extractEmail(payload) {
  const raw =
    payload.preferred_username ||
    payload.email ||
    payload.upn ||
    payload.unique_name ||
    "";

  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function extractName(payload) {
  const raw = payload.name || payload.given_name || "";
  return typeof raw === "string" ? raw.trim() : "";
}

function isEmailDomainAllowed(email) {
  if (azureAuth.allowedEmailDomains.length === 0) {
    return true;
  }
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }
  const domain = email.slice(atIndex + 1);
  return azureAuth.allowedEmailDomains.includes(domain);
}

function logTokenDebug(unverified, reason) {
  console.error("[Auth] Token debug:", {
    reason,
    iss: unverified?.iss ?? null,
    aud: unverified?.aud ?? null,
    azp: unverified?.azp ?? null,
    tid: unverified?.tid ?? null,
    exp: unverified?.exp ?? null,
    configuredTenantId: azureAuth.tenantId || null,
    configuredClientId: azureAuth.clientId || null
  });
}

async function verifyBearerToken(token) {
  const { jwtVerify, decodeJwt } = await loadJose();
  const clientId = azureAuth.clientId;

  let unverified;
  try {
    unverified = decodeJwt(token);
  } catch (error) {
    throw new Error("Malformed token.");
  }

  const tokenTenantId =
    typeof unverified.tid === "string" && unverified.tid.trim()
      ? unverified.tid.trim()
      : azureAuth.tenantId;

  if (!tokenTenantId) {
    throw new Error("Token is missing tenant id (tid).");
  }

  if (azureAuth.tenantId && tokenTenantId !== azureAuth.tenantId) {
    logTokenDebug(unverified, "tenant mismatch");
    throw new Error(
      "Token tenant does not match AZURE_TENANT_ID. Use the same tenant id as VITE_MSAL_TENANT_ID on the backend."
    );
  }

  const keySet = await getJwksForTenant(tokenTenantId);
  if (!keySet) {
    throw new Error("Could not load Microsoft signing keys.");
  }

  const verifyOptions = {
    issuer: getIssuersForTenant(tokenTenantId),
    clockTolerance: "60s"
  };

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      ...verifyOptions,
      audience: clientId
    }));
  } catch (firstError) {
    try {
      ({ payload } = await jwtVerify(token, keySet, verifyOptions));
    } catch (secondError) {
      logTokenDebug(unverified, secondError.message);
      throw secondError;
    }

    const azp = typeof payload.azp === "string" ? payload.azp : "";
    if (!audienceMatches(payload, clientId) && azp !== clientId) {
      logTokenDebug(unverified, "audience mismatch");
      throw new Error(
        "Token audience mismatch. Set AZURE_CLIENT_ID to the same value as VITE_MSAL_CLIENT_ID."
      );
    }
  }

  const email = extractEmail(payload);
  if (!email) {
    throw new Error("Token does not contain a user email.");
  }
  if (!isEmailDomainAllowed(email)) {
    throw new Error("Email domain is not allowed.");
  }

  return {
    oid: typeof payload.oid === "string" ? payload.oid : "",
    email,
    name: extractName(payload),
    claims: payload
  };
}

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function requireMicrosoftAuth(req, res, next) {
  if (azureAuth.authDisabled) {
    req.auth = {
      oid: "",
      email: "",
      name: "",
      isAdmin: false,
      claims: null,
      bypassed: true
    };
    return next();
  }

  if (!azureAuth.isConfigured) {
    return res.status(503).json({
      message: "Authentication is not configured on the server."
    });
  }

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({
      message: "Authorization Bearer token is required."
    });
  }

  try {
    req.auth = await verifyBearerToken(token);
    return next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", {
      message: error.message
    });
    return res.status(401).json({
      message: error.message || "Invalid or expired token.",
      error: error.message
    });
  }
}

async function requireAdmin(req, res, next) {
  if (azureAuth.authDisabled) {
    return next();
  }

  const email = req.auth?.email;
  if (!email) {
    return res.status(401).json({
      message: "Authenticated user email is required."
    });
  }

  try {
    const user = await User.findOne({ email }).select("role");
    const role = user?.role ?? USER_ROLES.USER;
    const isDbAdmin = isAdminRole(role);
    const isEnvBootstrapAdmin =
      azureAuth.adminEmails.has(email) || azureAuth.superAdminEmails.has(email);

    if (!isDbAdmin && !isEnvBootstrapAdmin) {
      return res.status(403).json({
        message: "Admin access required."
      });
    }

    req.auth.isAdmin = true;
    req.auth.isSuperAdmin =
      isSuperAdminRole(role) || azureAuth.superAdminEmails.has(email);
    req.auth.role = role;
    return next();
  } catch (error) {
    console.error("[Auth] Failed to resolve admin role:", {
      email,
      message: error.message
    });
    return res.status(500).json({
      message: "Failed to verify admin access.",
      error: error.message
    });
  }
}

/** Super-admin-only routes — wire when you define what super_admin can do. */
async function requireSuperAdmin(req, res, next) {
  if (azureAuth.authDisabled) {
    return next();
  }

  const email = req.auth?.email;
  if (!email) {
    return res.status(401).json({
      message: "Authenticated user email is required."
    });
  }

  try {
    const user = await User.findOne({ email }).select("role");
    const role = user?.role ?? USER_ROLES.USER;
    const isDbSuperAdmin = isSuperAdminRole(role);
    const isEnvBootstrapSuperAdmin = azureAuth.superAdminEmails.has(email);

    if (!isDbSuperAdmin && !isEnvBootstrapSuperAdmin) {
      return res.status(403).json({
        message: "Super admin access required."
      });
    }

    req.auth.isSuperAdmin = true;
    req.auth.isAdmin = true;
    req.auth.role = role;
    return next();
  } catch (error) {
    console.error("[Auth] Failed to resolve super admin role:", {
      email,
      message: error.message
    });
    return res.status(500).json({
      message: "Failed to verify super admin access.",
      error: error.message
    });
  }
}

module.exports = {
  requireMicrosoftAuth,
  requireAdmin,
  requireSuperAdmin,
  verifyBearerToken
};
