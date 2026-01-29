/**
 * HTTP Routes for Guardian API
 *
 * - GET /api/guardian/status - Current status
 * - POST /api/guardian/toggle - Toggle ON/OFF
 * - GET /api/guardian/stats - Statistics
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { MoltbotPluginApi } from "moltbot/plugin-sdk";
import type { GuardianPipe } from "../guardian-pipe.js";
import { isGuardianEnabled, setGuardianEnabled } from "../commands/guardian-cmd.js";

/**
 * Read request body as JSON
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch {
                resolve({});
            }
        });
    });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data, null, 2));
}

/**
 * Register all HTTP routes
 */
export function registerGuardianHttpRoutes(
    api: MoltbotPluginApi,
    pipe: GuardianPipe
): void {
    // GET /api/guardian/status
    api.registerHttpRoute({
        path: "/api/guardian/status",
        handler: async (req, res) => {
            if (req.method !== "GET") {
                sendJson(res, { error: "Method not allowed" }, 405);
                return;
            }

            sendJson(res, {
                enabled: isGuardianEnabled(),
                pipeEnabled: pipe.isEnabled(),
                version: "1.0.0",
            });
        },
    });

    // POST /api/guardian/toggle
    api.registerHttpRoute({
        path: "/api/guardian/toggle",
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, { error: "Method not allowed" }, 405);
                return;
            }

            const body = await readJsonBody(req);
            const enabled = body.enabled;

            if (typeof enabled === "boolean") {
                setGuardianEnabled(enabled);
                pipe.setEnabled(enabled);
                sendJson(res, {
                    success: true,
                    enabled: isGuardianEnabled(),
                });
            } else {
                sendJson(res, { error: "Missing or invalid 'enabled' field" }, 400);
            }
        },
    });

    // GET /api/guardian/stats
    api.registerHttpRoute({
        path: "/api/guardian/stats",
        handler: async (req, res) => {
            if (req.method !== "GET") {
                sendJson(res, { error: "Method not allowed" }, 405);
                return;
            }

            // TODO: Implement actual stats from database
            sendJson(res, {
                enabled: isGuardianEnabled(),
                today: {
                    total: 0,
                    blocked: 0,
                    passed: 0,
                    blockRate: 0,
                },
                stages: {
                    regex: { blocked: 0 },
                    pattern: { blocked: 0 },
                    guardian: { blocked: 0, errors: 0 },
                    parser: { blocked: 0, parseErrors: 0 },
                },
            });
        },
    });

    // POST /api/guardian/validate (manual test endpoint)
    api.registerHttpRoute({
        path: "/api/guardian/validate",
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, { error: "Method not allowed" }, 405);
                return;
            }

            const body = await readJsonBody(req);
            const text = body.text;

            if (typeof text !== "string" || text.trim() === "") {
                sendJson(res, { error: "Missing or invalid 'text' field" }, 400);
                return;
            }

            const result = await pipe.validate({ text });
            sendJson(res, result);
        },
    });

    api.logger.info("[guardian] HTTP routes registered: /api/guardian/*");
}
