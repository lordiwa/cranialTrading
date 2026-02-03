export interface Contact {
    id: string;
    userId: string;
    username: string;
    email: string;
    location: string;
    avatarUrl?: string | null;
    savedAt: Date;
}