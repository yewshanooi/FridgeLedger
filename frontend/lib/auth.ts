import { supabase } from "./supabase";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export async function getSession(): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "User",
    createdAt: user.created_at,
  };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "User",
    createdAt: user.created_at,
  };
}

export async function signup(
  name: string,
  email: string,
  password: string
): Promise<{ user: AuthUser; needsConfirmation: boolean }> {
  if (!email.toLowerCase().endsWith("@gmail.com")) {
    throw new Error("Only Gmail addresses (@gmail.com) are allowed.");
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign up failed. Please try again.");

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
      name,
      createdAt: data.user.created_at,
    },
    needsConfirmation: !data.session,
  };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function updateProfile(updates: { name: string }): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { name: updates.name },
  });
  if (error) throw new Error(error.message);
}
