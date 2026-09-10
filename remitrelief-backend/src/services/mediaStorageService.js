/**
 * Provider-neutral media boundary.
 *
 * Phase 4 registers already-hosted development URLs only. A future S3 or
 * Cloudinary adapter can implement `store()` without changing campaign logic.
 */
export function createMediaStorageService(adapter = externalUrlAdapter) {
  return {
    async register(input) {
      return adapter.store(input);
    },
  };
}

const externalUrlAdapter = {
  async store(input) {
    return {
      url: input.url,
      type: input.type,
      altText: input.altText,
      sortOrder: input.sortOrder,
      isCover: input.isCover,
    };
  },
};

export const mediaStorageService = createMediaStorageService();
