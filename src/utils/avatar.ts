/**
 * Get avatar URL for a user - uses custom URL if provided, otherwise generates one
 * @param username - The username to generate avatar for (used as seed for generated avatar)
 * @param size - Image size in pixels (default: 40)
 * @param customAvatarUrl - Optional custom avatar URL (if user uploaded one)
 * @returns URL string for the avatar image
 */
export const getAvatarUrlForUser = (username: string, size = 40, customAvatarUrl?: string | null): string => {
  if (customAvatarUrl) {
    return customAvatarUrl;
  }
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username)}&size=${size}`;
};
