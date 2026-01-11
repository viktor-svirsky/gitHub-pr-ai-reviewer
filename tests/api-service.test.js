// Tests for APIService

// Load modules using CommonJS require
const { CONFIG } = require("../extension/scripts/utils/constants.js");
const { helpers } = require("../extension/scripts/utils/helpers.js");

// Make CONFIG and helpers available globally for the API service
global.CONFIG = CONFIG;
global.helpers = helpers;

// Mock settingsService
global.settingsService = {
  getApiKey: jest.fn(),
  getValue: jest.fn(),
};

// Load the API service
const { APIService } = require("../extension/scripts/services/api-service.js");

describe("APIService", () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    global.resetChromeStorage();
    service = new APIService();
    global.fetch = jest.fn();
  });

  describe("constructor", () => {
    it("should initialize with correct defaults", () => {
      expect(service.apiUrl).toBe(CONFIG.OPENROUTER_API_URL);
      expect(service.timeout).toBe(CONFIG.API_TIMEOUT_MS);
      expect(service.maxRetries).toBe(CONFIG.MAX_RETRIES);
      expect(service.retryDelay).toBe(CONFIG.RETRY_DELAY_MS);
      expect(service.activeRequests).toBeInstanceOf(Map);
    });
  });

  describe("buildPrompt", () => {
    const prInfo = {
      owner: "testowner",
      repo: "testrepo",
      prNumber: 123,
      title: "Test PR",
      description: "Test description",
    };

    const files = [
      { filename: "file1.js", status: "modified", additions: 10, deletions: 5 },
      { filename: "file2.js", status: "added", additions: 50, deletions: 0 },
    ];

    const diff = "test diff content";

    it("should build a complete prompt", () => {
      const prompt = service.buildPrompt(prInfo, diff, files);

      expect(prompt).toContain(prInfo.owner);
      expect(prompt).toContain(prInfo.repo);
      expect(prompt).toContain(prInfo.title);
      expect(prompt).toContain(prInfo.description);
      expect(prompt).toContain("file1.js");
      expect(prompt).toContain("file2.js");
      expect(prompt).toContain(diff);
    });

    it("should include file information", () => {
      const prompt = service.buildPrompt(prInfo, diff, files);

      expect(prompt).toContain("file1.js (modified, +10/-5)");
      expect(prompt).toContain("file2.js (added, +50/-0)");
    });

    it("should handle PR without description", () => {
      const prInfoNoDesc = { ...prInfo, description: "" };
      const prompt = service.buildPrompt(prInfoNoDesc, diff, files);

      expect(prompt).toContain("No description provided");
    });

    it("should truncate long diff", () => {
      const longDiff = "a".repeat(CONFIG.MAX_DIFF_LENGTH + 1000);
      const prompt = service.buildPrompt(prInfo, longDiff, files);

      expect(prompt.length).toBeLessThan(longDiff.length + 1000);
      expect(prompt).toContain("[... diff truncated ...]");
    });

    it("should include review instructions", () => {
      const prompt = service.buildPrompt(prInfo, diff, files);

      expect(prompt).toContain("Summary");
      expect(prompt).toContain("Key Issues");
      expect(prompt).toContain("Suggestions");
      expect(prompt).toContain("severity");
    });

    it("should format as valid prompt", () => {
      const prompt = service.buildPrompt(prInfo, diff, files);

      expect(prompt).toContain("# Pull Request Review");
      expect(prompt).toContain("## PR Information");
      expect(prompt).toContain("## Files Changed");
      expect(prompt).toContain("## Full Diff");
    });

    it("should handle empty files array", () => {
      const prompt = service.buildPrompt(prInfo, diff, []);

      expect(prompt).toBeDefined();
      expect(prompt).toContain("## Files Changed");
    });

    it("should handle empty diff", () => {
      const prompt = service.buildPrompt(prInfo, "", files);

      expect(prompt).toBeDefined();
      expect(prompt).toContain("## Full Diff");
    });
  });

  describe("parseReview", () => {
    const files = [
      { filename: "file1.js", status: "modified" },
      { filename: "file2.js", status: "added" },
    ];

    it("should parse JSON format review", () => {
      const jsonReview = JSON.stringify({
        summary: "Test summary",
        comments: [
          {
            filename: "file1.js",
            line: 10,
            severity: "major",
            body: "Test comment",
          },
        ],
      });

      const result = service.parseReview(jsonReview, files);

      expect(result.summary).toBe("Test summary");
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].filename).toBe("file1.js");
    });

    it("should extract JSON from markdown code blocks", () => {
      const markdownReview = `
Here is the review:
\`\`\`json
{
  "summary": "Test summary",
  "comments": []
}
\`\`\`
      `;

      const result = service.parseReview(markdownReview, files);

      expect(result.summary).toBe("Test summary");
      expect(result.comments).toEqual([]);
    });

    it("should fallback to text parsing for non-JSON", () => {
      const textReview = "This is a text review";

      const result = service.parseReview(textReview, files);

      expect(result.summary).toBeDefined();
      expect(result.comments).toBeInstanceOf(Array);
    });

    it("should handle empty review text", () => {
      const result = service.parseReview("", files);

      expect(result.summary).toBeDefined();
      expect(result.comments).toBeInstanceOf(Array);
    });

    it("should handle malformed JSON gracefully", () => {
      const malformedJson = '{ "summary": "test", invalid }';

      const result = service.parseReview(malformedJson, files);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe("parseTextReview", () => {
    const files = [
      { filename: "file1.js", status: "modified" },
      { filename: "file2.js", status: "added" },
    ];

    it("should extract summary from text", () => {
      const reviewText = `
Summary: This is the overall assessment.

Some other content here.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.summary).toContain("overall assessment");
    });

    it("should parse file mentions", () => {
      const reviewText = `
file: file1.js
This is a comment about file1.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments.length).toBeGreaterThan(0);
      expect(result.comments[0].filename).toBe("file1.js");
    });

    it("should parse filepath:line format", () => {
      const reviewText = `
file1.js:42
This is a comment at line 42
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments.length).toBeGreaterThan(0);
      expect(result.comments[0].filename).toBe("file1.js");
      expect(result.comments[0].line).toBe(42);
    });

    it("should parse line numbers", () => {
      const reviewText = `
file: file1.js
line: 100
This is a comment.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments[0].line).toBe(100);
    });

    it("should parse severity levels", () => {
      const reviewText = `
file: file1.js
Severity: critical
This is a critical issue.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments[0].severity).toBe("critical");
    });

    it("should map severity aliases", () => {
      const reviewText = `
file: file1.js
Severity: high
This is important.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments[0].severity).toBe("critical");
    });

    it("should handle multiple comments", () => {
      const reviewText = `
file: file1.js
First comment.

file: file2.js
Second comment.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments).toHaveLength(2);
    });

    it("should create general comment if no structured comments found", () => {
      const reviewText = "Just some general feedback without structure.";

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].filename).toBe(files[0].filename);
    });

    it("should trim comment bodies", () => {
      const reviewText = `
file: file1.js

   Comment with extra whitespace

      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments[0].body).not.toMatch(/^\s+/);
      expect(result.comments[0].body).not.toMatch(/\s+$/);
    });

    it("should handle empty review text", () => {
      const result = service.parseTextReview("", files);

      expect(result.summary).toBe("Code review completed");
      expect(result.comments).toEqual([]);
    });

    it("should extract first paragraph as summary if no explicit summary", () => {
      // Note: avoid words like "summary", "overview", "assessment" in test text
      // as they trigger the regex-based extraction
      const reviewText = `This is the first paragraph with important details.

More content here.

file: file1.js
Comment about file1.`;

      const result = service.parseTextReview(reviewText, files);

      expect(result.summary).toContain("first paragraph");
    });

    it("should default severity to minor", () => {
      const reviewText = `
file: file1.js
Comment without severity.
      `;

      const result = service.parseTextReview(reviewText, files);

      expect(result.comments[0].severity).toBe("minor");
    });
  });

  describe("makeRequest", () => {
    const apiKey = "test-api-key";
    const model = "test-model";
    const prompt = "test prompt";

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should make POST request to OpenRouter API", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "test response" } }],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await service.makeRequest(apiKey, model, prompt);

      expect(global.fetch).toHaveBeenCalledWith(
        CONFIG.OPENROUTER_API_URL,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          }),
        })
      );
    });

    it("should include correct request body", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "test response" } }],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await service.makeRequest(apiKey, model, prompt);

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe(model);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toBe(prompt);
      expect(body.temperature).toBe(CONFIG.DEFAULT_TEMPERATURE);
      expect(body.max_tokens).toBe(CONFIG.DEFAULT_MAX_TOKENS);
    });

    it("should return response data", async () => {
      const mockData = {
        choices: [{ message: { content: "test response" } }],
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockData),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.makeRequest(apiKey, model, prompt);

      expect(result).toEqual(mockData);
    });

    it("should throw error for non-OK response", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: jest.fn().mockResolvedValue("Error message"),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(service.makeRequest(apiKey, model, prompt)).rejects.toThrow();
    });

    it("should track active requests", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "test" } }],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const promise = service.makeRequest(apiKey, model, prompt);

      expect(service.activeRequests.size).toBeGreaterThan(0);

      await promise;

      expect(service.activeRequests.size).toBe(0);
    });

    it("should handle abort signal", async () => {
      const abortController = new AbortController();
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "test" } }],
        }),
      };

      global.fetch.mockImplementation((url, options) => {
        expect(options.signal).toBeDefined();
        return Promise.resolve(mockResponse);
      });

      await service.makeRequest(apiKey, model, prompt, abortController.signal);

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("getReview", () => {
    const prInfo = {
      owner: "testowner",
      repo: "testrepo",
      prNumber: 123,
      title: "Test PR",
      description: "Test description",
    };

    const diff = "test diff";
    const files = [{ filename: "file1.js", status: "modified", additions: 10, deletions: 5 }];

    beforeEach(() => {
      settingsService.getApiKey.mockResolvedValue("test-api-key");
      settingsService.getValue.mockResolvedValue("test-model");
    });

    it("should throw error if no API key", async () => {
      settingsService.getApiKey.mockResolvedValue(null);

      await expect(service.getReview(prInfo, diff, files)).rejects.toThrow(
        CONFIG.MESSAGES.ERROR_NO_API_KEY
      );
    });

    it("should use default model if not configured", async () => {
      settingsService.getValue.mockResolvedValue(null);

      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Test",
                  comments: [],
                }),
              },
            },
          ],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await service.getReview(prInfo, diff, files);

      const callArgs = global.fetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe(CONFIG.DEFAULT_MODEL);
    });

    it("should return structured review", async () => {
      const mockReview = {
        summary: "Test summary",
        comments: [{ filename: "file1.js", body: "Test comment", severity: "minor" }],
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(mockReview) } }],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await service.getReview(prInfo, diff, files);

      expect(result.summary).toBe(mockReview.summary);
      expect(result.comments).toHaveLength(1);
    });

    it("should throw error if no content in response", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: {} }],
        }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(service.getReview(prInfo, diff, files)).rejects.toThrow(
        CONFIG.MESSAGES.ERROR_NO_CONTENT
      );
    });

    it("should retry on failure", async () => {
      const mockReview = {
        summary: "Test",
        comments: [],
      };

      global.fetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(mockReview) } }],
        }),
      });

      const result = await service.getReview(prInfo, diff, files);

      expect(result.summary).toBe(mockReview.summary);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("cancelAll", () => {
    it("should cancel all active requests", () => {
      const mockController1 = { abort: jest.fn() };
      const mockController2 = { abort: jest.fn() };

      service.activeRequests.set("req1", mockController1);
      service.activeRequests.set("req2", mockController2);

      service.cancelAll();

      expect(mockController1.abort).toHaveBeenCalled();
      expect(mockController2.abort).toHaveBeenCalled();
      expect(service.activeRequests.size).toBe(0);
    });

    it("should handle empty active requests", () => {
      expect(() => service.cancelAll()).not.toThrow();
    });
  });

  describe("getActiveRequestCount", () => {
    it("should return number of active requests", () => {
      expect(service.getActiveRequestCount()).toBe(0);

      service.activeRequests.set("req1", {});
      expect(service.getActiveRequestCount()).toBe(1);

      service.activeRequests.set("req2", {});
      expect(service.getActiveRequestCount()).toBe(2);
    });
  });
});
