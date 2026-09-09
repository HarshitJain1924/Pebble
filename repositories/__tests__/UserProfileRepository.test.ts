import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PROFILE,
  PROFILE_STORAGE_KEY,
  UserProfileRepository,
} from "@/repositories/UserProfileRepository";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const storage = AsyncStorage as typeof AsyncStorage;

beforeEach(async () => {
  await storage.clear();
  jest.restoreAllMocks();
});

describe("UserProfileRepository", () => {
  describe("loading", () => {
    it("returns defaults when profile is missing", async () => {
      const profile = await UserProfileRepository.getProfile();

      expect(profile).toEqual(DEFAULT_PROFILE);
    });

    it("loads a valid persisted profile unchanged", async () => {
      await storage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({ name: "Ada", email: "ada@example.com", avatar: "🚀" }),
      );

      const profile = await UserProfileRepository.getProfile();

      expect(profile).toEqual({
        name: "Ada",
        email: "ada@example.com",
        avatar: "🚀",
      });
    });

    it("falls back to defaults on malformed JSON", async () => {
      await storage.setItem(PROFILE_STORAGE_KEY, "{not valid json");

      const profile = await UserProfileRepository.getProfile();

      expect(profile).toEqual(DEFAULT_PROFILE);
    });

    it("falls back to defaults when the persisted value is not an object", async () => {
      await storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify([1, 2, 3]));

      const profile = await UserProfileRepository.getProfile();

      expect(profile).toEqual(DEFAULT_PROFILE);
    });

    it("normalizes invalid field types", async () => {
      await storage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({
          name: 123,
          email: null,
          avatar: { id: "avatar_zen" },
        }),
      );

      const profile = await UserProfileRepository.getProfile();

      expect(profile.name).toBe(DEFAULT_PROFILE.name);
      expect(profile.email).toBe(DEFAULT_PROFILE.email);
      expect(profile.avatar).toBe(DEFAULT_PROFILE.avatar);
    });

    it("falls back to the default name when it is empty or whitespace", async () => {
      await storage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({ name: "   ", email: "keep@me", avatar: "🔥" }),
      );

      const profile = await UserProfileRepository.getProfile();

      expect(profile.name).toBe(DEFAULT_PROFILE.name);
      expect(profile.email).toBe("keep@me");
      expect(profile.avatar).toBe("🔥");
    });

    it("preserves unknown top-level fields on read", async () => {
      await storage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({
          name: "Ada",
          email: "ada@example.com",
          avatar: "🚀",
          futureField: "keep-me",
        }),
      );

      const profile: any = await UserProfileRepository.getProfile();

      expect(profile.futureField).toBe("keep-me");
    });
  });

  describe("saving", () => {
    it("normalizes before persisting", async () => {
      await UserProfileRepository.saveProfile({
        name: "",
        email: "ada@example.com",
        avatar: "🚀",
      });

      const persisted = JSON.parse(
        (await storage.getItem(PROFILE_STORAGE_KEY))!,
      );
      expect(persisted.name).toBe(DEFAULT_PROFILE.name);
      expect(persisted.email).toBe("ada@example.com");
    });
  });

  describe("updates", () => {
    it("partial update preserves unrelated fields", async () => {
      await UserProfileRepository.saveProfile({
        name: "Ada",
        email: "ada@example.com",
        avatar: "🚀",
      });

      const updated = await UserProfileRepository.updateProfile({
        avatar: "🔥",
      });

      expect(updated).toEqual({
        name: "Ada",
        email: "ada@example.com",
        avatar: "🔥",
      });

      const persisted = await UserProfileRepository.getProfile();
      expect(persisted.email).toBe("ada@example.com");
      expect(persisted.avatar).toBe("🔥");
    });

    it("normalizes invalid patch values against defaults", async () => {
      const updated = await UserProfileRepository.updateProfile({
        name: 99 as any,
        email: "ada@example.com",
      });

      expect(updated.name).toBe(DEFAULT_PROFILE.name);
      expect(updated.email).toBe("ada@example.com");
    });

    it("concurrent updates do not lose unrelated changes", async () => {
      const a = UserProfileRepository.updateProfile({ name: "Ada" });
      const b = UserProfileRepository.updateProfile({ avatar: "🔥" });
      await Promise.all([a, b]);

      const persisted = await UserProfileRepository.getProfile();
      expect(persisted.name).toBe("Ada");
      expect(persisted.avatar).toBe("🔥");
    });
  });
});