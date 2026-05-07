import type { Prisma } from "@prisma/client";

export const USERS: Prisma.UserCreateManyInput[] = [
  { email: "admin@wind", name: "Admin User", role: "ADMIN" },
  { email: "aow@wind", name: "อ้อ บัญชี", role: "ACCOUNTANT" },
  { email: "nim@wind", name: "นิ้ม การเงิน", role: "ACCOUNTANT" },
  { email: "viewer1@wind", name: "Viewer One", role: "VIEWER" },
  { email: "viewer2@wind", name: "Viewer Two", role: "VIEWER" },
];
