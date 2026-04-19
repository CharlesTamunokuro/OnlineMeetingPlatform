import { describe, expect, it } from "vitest";
import { validatePasswordStrength, isValidEmail, isValidDisplayName, generateVerificationToken } from "./auth-utils";

describe("Auth Utilities", () => {
  describe("validatePasswordStrength", () => {
    it("should reject password less than 8 characters", () => {
      const result = validatePasswordStrength("Pass1!");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters long");
    });

    it("should reject password without uppercase letter", () => {
      const result = validatePasswordStrength("password123!");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one uppercase letter");
    });

    it("should reject password without lowercase letter", () => {
      const result = validatePasswordStrength("PASSWORD123!");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one lowercase letter");
    });

    it("should reject password without number", () => {
      const result = validatePasswordStrength("Password!");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one number");
    });

    it("should reject password without special character", () => {
      const result = validatePasswordStrength("Password123");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one special character");
    });

    it("should accept strong password", () => {
      const result = validatePasswordStrength("MyPassword123!");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept password with various special characters", () => {
      const specialChars = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "-", "=", "[", "]", "{", "}", ";", "'", ":", "\\", "|", ",", ".", "<", ">", "/", "?"];
      
      specialChars.forEach(char => {
        const password = `MyPassword123${char}`;
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true, `Should accept password with ${char}`);
      });
    });
  });

  describe("isValidEmail", () => {
    it("should accept valid email", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("john.doe@company.co.uk")).toBe(true);
      expect(isValidEmail("test+tag@domain.com")).toBe(true);
    });

    it("should reject invalid email", () => {
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("invalid@")).toBe(false);
      expect(isValidEmail("@domain.com")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
    });

    it("should reject email exceeding max length", () => {
      const longEmail = "a".repeat(310) + "@example.com";
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe("isValidDisplayName", () => {
    it("should accept valid display name", () => {
      expect(isValidDisplayName("John Doe")).toBe(true);
      expect(isValidDisplayName("Jane")).toBe(true);
      expect(isValidDisplayName("A".repeat(100))).toBe(true);
    });

    it("should reject display name less than 2 characters", () => {
      expect(isValidDisplayName("J")).toBe(false);
      expect(isValidDisplayName("")).toBe(false);
      expect(isValidDisplayName("  ")).toBe(false);
    });

    it("should reject display name exceeding max length", () => {
      expect(isValidDisplayName("A".repeat(101))).toBe(false);
    });
  });

  describe("generateVerificationToken", () => {
    it("should generate a token", () => {
      const token = generateVerificationToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should generate unique tokens", () => {
      const token1 = generateVerificationToken();
      const token2 = generateVerificationToken();
      expect(token1).not.toBe(token2);
    });

    it("should generate hex tokens", () => {
      const token = generateVerificationToken();
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });
  });
});
