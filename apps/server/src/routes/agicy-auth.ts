import { deviceTokenSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  AgicyDeviceFlowError,
  agicyPlatformUrl,
  pollAgicyDeviceToken,
  requestAgicyDeviceCode,
} from "../lib/agicy-platform.js";
import {
  getAgicySession,
  invalidateAgicySession,
  setAgicySession,
} from "../lib/agicy-session.js";
import { applyAgicySttDefaults } from "../lib/agicy-stt-defaults.js";
import { isTrustedRendererOrigin } from "../lib/trusted-origin.js";

const agicyAuth = new Hono()
  .use("*", async (c, next) => {
    if (!isTrustedRendererOrigin(c.req.header("origin"))) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  })
  .get("/status", async (c) => {
    const session = getAgicySession();
    return c.json({
      authenticated: !!session,
      user: session?.user ?? null,
      verified: true,
    });
  })
  .post("/device/code", async (c) => {
    try {
      const code = await requestAgicyDeviceCode();
      return c.json({
        device_code: code.device_code,
        user_code: code.user_code,
        verification_uri: code.verification_url,
        verification_uri_complete: code.verification_url.includes("user_code=")
          ? code.verification_url
          : `${code.verification_url}${code.verification_url.includes("?") ? "&" : "?"}user_code=${encodeURIComponent(code.user_code)}`,
        expires_in: code.expires_in,
        interval: code.interval,
      });
    } catch {
      return c.json(
        {
          error:
            "AGICY cloud sign-in is temporarily unavailable. You can keep using search and local voice, then retry sign-in later.",
        },
        503,
      );
    }
  })
  .post("/device/token", zValidator("json", deviceTokenSchema), async (c) => {
    const { device_code } = c.req.valid("json");
    try {
      const token = await pollAgicyDeviceToken(device_code);
      const user = token.user;
      if (!user?.id || !user.email) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      const now = Date.now();
      setAgicySession({
        token: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_in ? now + token.expires_in * 1000 : null,
        issuedAt: token.expires_in ? now : null,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: null,
        },
      });
      applyAgicySttDefaults();
      return c.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: null,
        },
      });
    } catch (err) {
      if (err instanceof AgicyDeviceFlowError) {
        if (err.code === "authorization_pending") {
          return c.json({ error: err.code }, 202);
        }
        if (err.code === "slow_down") return c.json({ error: err.code }, 429);
        if (err.code === "access_denied")
          return c.json({ error: err.code }, 403);
        if (err.code === "expired_token")
          return c.json({ error: err.code }, 410);
        if (err.code === "invalid_grant")
          return c.json({ error: err.code }, 400);
      }
      throw err;
    }
  })
  .post("/sign-out", async (c) => {
    invalidateAgicySession();
    return c.json({ ok: true, host: agicyPlatformUrl() });
  });

export default agicyAuth;
