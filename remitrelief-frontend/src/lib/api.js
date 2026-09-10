const API_URL = `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api`;

// Cookies are canonical. This token exists only for older verify responses.
let sessionToken = "";
let onUnauthorized = null;

export function setSessionToken(token) {
  sessionToken = token || "";
}

export function getSessionToken() {
  return sessionToken;
}

export function clearSessionToken() {
  setSessionToken("");
}

/** @deprecated use setSessionToken */
export function setAuthToken(token) {
  setSessionToken(token);
}
export function getAuthToken() {
  return getSessionToken();
}
export function clearAuthToken() {
  clearSessionToken();
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const payload = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSessionToken();
    if (typeof onUnauthorized === "function") onUnauthorized(payload);
  }
  if (!res.ok) {
    const errorBody = payload?.error;
    const err = new Error(
      (typeof errorBody === "object" ? errorBody?.message : errorBody) ||
        payload?.message ||
        `Request failed (${res.status})`
    );
    err.code = errorBody?.code || payload?.code;
    err.status = res.status;
    throw err;
  }
  if (options.envelope) return payload || { success: true, data: null };
  return payload?.success === true ? payload.data : payload;
}

export function fetchAuthChallenge(publicKey) {
  return request("/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ publicKey }),
  });
}

export function verifyAuthChallenge(body) {
  return request("/auth/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logoutAuth() {
  return request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function fetchMe() {
  return request("/auth/me");
}

export function fetchCampaigns(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/campaigns${qs ? `?${qs}` : ""}`, { envelope: true });
}

export function fetchCampaign(id) {
  return request(`/campaigns/${id}`);
}

export function createCampaign(body) {
  return request("/campaigns", { method: "POST", body: JSON.stringify(body) });
}

export function updateCampaign(id, body) {
  return request(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCampaign(id) {
  return request(`/campaigns/${id}`, { method: "DELETE" });
}

export function fetchMyCampaigns(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, value]) => value != null && value !== ""))
  ).toString();
  return request(`/campaigns/mine${qs ? `?${qs}` : ""}`, { envelope: true });
}

export function submitCampaign(id) {
  return request(`/campaigns/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
}

export function transitionCampaign(id, status, reason) {
  return request(`/campaigns/${id}/transitions/${status}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function addCampaignMilestone(id, body) {
  return request(`/campaigns/${id}/milestones`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCampaignMilestone(id, milestoneId, body) {
  return request(`/campaigns/${id}/milestones/${milestoneId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchCampaignUpdates(id) {
  return request(`/campaigns/${id}/updates`);
}

export function createCampaignUpdate(id, body) {
  return request(`/campaigns/${id}/updates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addCampaignMedia(id, body) {
  return request(`/campaigns/${id}/media`, { method: "POST", body: JSON.stringify(body) });
}

export function deleteCampaignMedia(id, mediaId) {
  return request(`/campaigns/${id}/media/${mediaId}`, { method: "DELETE" });
}

export function fetchStats() {
  return request("/campaigns/meta/stats");
}

export function fetchLedger(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/ledger${qs ? `?${qs}` : ""}`);
}

export function fetchDonations(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/donations${qs ? `?${qs}` : ""}`);
}

export function recordDonation(body) {
  return request("/donations", { method: "POST", body: JSON.stringify(body) });
}

export function prepareDeposit(body) {
  return request("/donations/prepare", { method: "POST", body: JSON.stringify(body) });
}

export function prepareVerify(campaignId, body) {
  return request(`/milestones/${campaignId}/prepare-verify`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitVerify(campaignId, body) {
  return request(`/milestones/${campaignId}/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitRelease(campaignId, body) {
  return request(`/milestones/${campaignId}/release`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export { API_URL };
