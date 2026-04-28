export interface UserProfile {
    display_name: string;
    full_name: string;
    avatar_url: string;
    bio: string;
    location: string;
    website: string;
    country_code: string;
    phone: string;
}

export interface UserRole {
    id: string;
    name: string;
}

export interface UserData {
    id: string;
    email: string;
    profile: UserProfile;
    token_version: number;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    roles: UserRole[];
}

export interface Profile {
  avatar_url?: string;
  bio?: string;
  country_code?: string;
  display_name?: string;
  full_name?: string;
  location?: string;
  phone?: string;
  website?: string;
}
export interface Data {
  email?: string;
  profile?: Profile;
  roles?: Role[];
  id: string;
}
export interface Role {
  id?: number;
  name?: string;
}

export interface UserMetaCardProps {
  message?: string;
  status?: boolean;
  data?: Data;
  openEdit?: boolean;
}