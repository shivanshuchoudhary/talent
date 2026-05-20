function parseCsv(value) {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function readConfig() {
  const tenantId = process.env.AZURE_TENANT_ID?.trim() ?? "";
  const clientId = process.env.AZURE_CLIENT_ID?.trim() ?? "";
  const authDisabled = process.env.AUTH_DISABLED === "true";
  const allowedEmailDomains = parseCsv(process.env.AZURE_ALLOWED_EMAIL_DOMAINS);
  const adminEmails = new Set(parseCsv(process.env.AZURE_ADMIN_EMAILS));
  const superAdminEmails = new Set(parseCsv(process.env.AZURE_SUPER_ADMIN_EMAILS));
  const isConfigured = Boolean(tenantId && clientId);

  return {
    tenantId,
    clientId,
    authDisabled,
    isConfigured,
    issuer: tenantId
      ? `https://login.microsoftonline.com/${tenantId}/v2.0`
      : "",
    jwksUri: tenantId
      ? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
      : "",
    allowedEmailDomains,
    adminEmails,
    superAdminEmails
  };
}

/** Read on each access so dotenv / runtime env injection always apply. */
module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      return readConfig()[prop];
    }
  }
);
