import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProgressReporter } from "../../scripts/lib/progress-reporter.js";

describe("ProgressReporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("v13 path (notifications progress API available)", () => {
    let mockNotification;

    beforeEach(() => {
      mockNotification = { update: vi.fn() };
      globalThis.ui.notifications.update = vi.fn();
      globalThis.ui.notifications.info = vi.fn(() => mockNotification);
    });

    afterEach(() => {
      delete globalThis.ui.notifications.update;
    });

    it("start() calls ui.notifications.info with progress: true", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      expect(ui.notifications.info).toHaveBeenCalledWith(
        "Processing tokens",
        { progress: true }
      );
    });

    it("update() calls notification.update with fraction pct and message", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      reporter.update(3, "Token 3 of 10");
      expect(mockNotification.update).toHaveBeenCalledWith({
        pct: expect.closeTo(0.3, 5),
        message: "Token 3 of 10"
      });
    });

    it("finish() calls notification.update with pct 1.0", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      reporter.finish();
      expect(mockNotification.update).toHaveBeenCalledWith({ pct: 1.0 });
    });

    it("finish() clears internal notification reference (subsequent update is no-op)", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      reporter.finish();
      mockNotification.update.mockClear();
      // After finish, update should be a no-op
      reporter.update(5, "Should not call");
      expect(mockNotification.update).not.toHaveBeenCalled();
    });

    it("update() clamps pct to max 1.0 when current > total", () => {
      const reporter = new ProgressReporter();
      reporter.start(5, "Processing");
      reporter.update(10, "Overflow");
      expect(mockNotification.update).toHaveBeenCalledWith({
        pct: 1.0,
        message: "Overflow"
      });
    });
  });

  describe("v12 path (SceneNavigation fallback)", () => {
    beforeEach(() => {
      delete globalThis.ui.notifications.update;
      globalThis.SceneNavigation = {
        displayProgressBar: vi.fn()
      };
    });

    afterEach(() => {
      delete globalThis.SceneNavigation;
    });

    it("start() calls SceneNavigation.displayProgressBar with pct: 0", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      expect(SceneNavigation.displayProgressBar).toHaveBeenCalledWith({
        label: "Processing tokens",
        pct: 0
      });
    });

    it("update() calls SceneNavigation.displayProgressBar with integer pct", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      reporter.update(3, "Token 3 of 10");
      expect(SceneNavigation.displayProgressBar).toHaveBeenCalledWith({
        label: "Token 3 of 10",
        pct: 30
      });
    });

    it("finish() calls SceneNavigation.displayProgressBar with pct: 100", () => {
      const reporter = new ProgressReporter();
      reporter.start(10, "Processing tokens");
      reporter.finish();
      expect(SceneNavigation.displayProgressBar).toHaveBeenCalledWith({
        label: "",
        pct: 100
      });
    });

    it("update() clamps pct to max 100 when current > total", () => {
      const reporter = new ProgressReporter();
      reporter.start(5, "Processing");
      reporter.update(10, "Overflow");
      expect(SceneNavigation.displayProgressBar).toHaveBeenCalledWith({
        label: "Overflow",
        pct: 100
      });
    });
  });
});
