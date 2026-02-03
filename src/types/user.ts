export interface User {
    id: string;
    email: string;
    username: string;
    location: string;
    createdAt: Date;
    lastUsernameChange?: Date | null;
    avatarUrl?: string | null; // Custom avatar URL, if null uses generated avatar
}