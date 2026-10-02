export type UserRole = 'ADMIN' | 'STAFF';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponseDTO {
  user: UserDTO;
  token: string;
  expiresIn: string;
}
