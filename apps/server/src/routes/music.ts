import { Hono } from "hono";
import { appendEgressLedgerEvent } from "../lib/egress-ledger.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

interface AuddTrack {
  artist?: string;
  title?: string;
  album?: string;
  release_date?: string;
  timecode?: string;
  song_link?: string;
  label?: string;
  apple_music?: { url?: string; artwork?: { url?: string } };
  spotify?: { external_urls?: { spotify?: string } };
  deezer?: { link?: string; album?: { cover_medium?: string } };
}

function configuredToken(): string | null {
  return process.env.AUDD_API_TOKEN?.trim() || null;
}

const music = new Hono().post("/recognize", async (c) => {
  const token = configuredToken();
  if (!token) {
    return c.json(
      {
        ok: false as const,
        error: "music_recognition_not_configured",
        message: "Music recognition is not configured on this AGICY server yet.",
      },
      503,
    );
  }

  const form = await c.req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) {
    return c.json({ ok: false as const, error: "audio field missing" }, 400);
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return c.json(
      { ok: false as const, error: "audio must be between 1 byte and 10 MB" },
      413,
    );
  }

  const request = new FormData();
  request.append("api_token", token);
  request.append("return", "apple_music,spotify,deezer");
  request.append(
    "file",
    new Blob([await audio.arrayBuffer()], { type: audio.type || "audio/wav" }),
    audio.name || "music.wav",
  );

  const destination = "https://api.audd.io/";
  let response: Response;
  try {
    response = await fetch(destination, {
      method: "POST",
      body: request,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    appendEgressLedgerEvent({
      category: "music",
      destination,
      method: "POST",
      status: null,
      requestBytes: audio.size,
      responseBytes: null,
      authorization: "service-token",
      surface: "music-recognition",
    });
    return c.json(
      { ok: false as const, error: "music_recognition_unreachable" },
      502,
    );
  }

  appendEgressLedgerEvent({
    category: "music",
    destination,
    method: "POST",
    status: response.status,
    requestBytes: audio.size,
    responseBytes: Number(response.headers?.get?.("content-length")) || null,
    authorization: "service-token",
    surface: "music-recognition",
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; result?: AuddTrack | null; error?: unknown }
    | null;
  if (!response.ok || payload?.status === "error") {
    return c.json(
      {
        ok: false as const,
        error: "music_recognition_failed",
        message: "The music provider could not identify this recording.",
      },
      502,
    );
  }
  if (!payload?.result) {
    return c.json({ ok: true as const, matched: false as const });
  }

  const track = payload.result;
  return c.json({
    ok: true as const,
    matched: true as const,
    track: {
      artist: track.artist ?? "Unknown artist",
      title: track.title ?? "Unknown track",
      album: track.album ?? null,
      releaseDate: track.release_date ?? null,
      timecode: track.timecode ?? null,
      songLink: track.song_link ?? null,
      artwork:
        track.apple_music?.artwork?.url ?? track.deezer?.album?.cover_medium ?? null,
      links: {
        appleMusic: track.apple_music?.url ?? null,
        spotify: track.spotify?.external_urls?.spotify ?? null,
        deezer: track.deezer?.link ?? null,
      },
    },
  });
});

export default music;
