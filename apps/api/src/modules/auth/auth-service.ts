import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { StoredUser, UserRepository } from "./user-repository.js";

export class AuthError extends Error {
  constructor(public readonly code: "DUPLICATE_EMAIL" | "INVALID_CREDENTIALS" | "INVALID_TOKEN") {
    super(code);
  }
}

export function publicUser(user: StoredUser) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function isDuplicateEmail(error: unknown) {
  return error instanceof Error && (error.message === "DUPLICATE_EMAIL" || "code" in error && error.code === "P2002");
}

export class AuthService {
  private readonly key: Uint8Array;

  constructor(private readonly users: UserRepository, secret: string) {
    if (secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
    this.key = new TextEncoder().encode(secret);
  }

  async register(input: { name: string; email: string; password: string }) {
    const passwordHash = await hash(input.password, 12);
    try {
      return publicUser(await this.users.create({ name: input.name, email: input.email, passwordHash }));
    } catch (error) {
      if (isDuplicateEmail(error)) throw new AuthError("DUPLICATE_EMAIL");
      throw error;
    }
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await compare(input.password, user.passwordHash))) throw new AuthError("INVALID_CREDENTIALS");

    const accessToken = await new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("dealership-api")
      .setAudience("dealership-web")
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.key);

    return { accessToken, tokenType: "Bearer", expiresIn: 900, user: publicUser(user) };
  }

  async currentUser(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: "dealership-api", audience: "dealership-web", algorithms: ["HS256"] });
      if (!payload.sub) throw new AuthError("INVALID_TOKEN");
      const user = await this.users.findById(payload.sub);
      if (!user) throw new AuthError("INVALID_TOKEN");
      return publicUser(user);
    } catch {
      throw new AuthError("INVALID_TOKEN");
    }
  }
}
