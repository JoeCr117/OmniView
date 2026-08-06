import { describe, expect, it } from "vitest";

import { ApiError } from "./http";
import { serverMessage } from "./serverMessage";

describe("serverMessage", () => {
  it("unwraps django-ninja's detail field from an ApiError's message", () => {
    const error = new ApiError(422, 'API /api/x failed: 422 {"detail":"bad payload"}');
    expect(serverMessage(error)).toBe("bad payload");
  });

  it("falls back to the raw message when the body has no detail field", () => {
    const error = new ApiError(500, 'API /api/x failed: 500 {"other":"nope"}');
    expect(serverMessage(error)).toBe('API /api/x failed: 500 {"other":"nope"}');
  });

  it("falls back to the raw message when the body is not JSON", () => {
    const error = new ApiError(503, "API /api/x failed: 503 Service Unavailable");
    expect(serverMessage(error)).toBe("API /api/x failed: 503 Service Unavailable");
  });

  it("returns the message verbatim when there is no body at all", () => {
    const error = new Error("network error");
    expect(serverMessage(error)).toBe("network error");
  });

  it("stringifies a non-Error thrown value", () => {
    expect(serverMessage("boom")).toBe("boom");
  });

  it("does not mistake curly braces inside the detail text for a nested body", () => {
    const error = new ApiError(400, 'API /api/x failed: 400 {"detail":"expected {a, b}"}');
    expect(serverMessage(error)).toBe("expected {a, b}");
  });
});
