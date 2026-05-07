"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "./api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ACCOUNTANT" | "VIEWER";
}

export function useUser() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ user: AuthUser }>("/api/v1/auth/me")
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { user, loading };
}
