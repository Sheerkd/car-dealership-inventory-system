export type Role = "USER" | "ADMIN";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export type NewUser = Pick<StoredUser, "name" | "email" | "passwordHash">;

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  create(input: NewUser): Promise<StoredUser>;
}
