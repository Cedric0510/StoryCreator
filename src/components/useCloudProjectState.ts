import { useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";

import {
  CloudAccessLevel,
  CloudAccessRow,
  CloudLogRow,
  PlatformProfileRow,
  PlatformRole,
  CloudProfileRow,
  CloudProjectRow,
} from "@/components/author-studio-types";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export function useCloudProjectState(setStatusMessage: (message: string) => void) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const supabaseProjectRef = useMemo(() => {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!rawUrl) return "n/a";
    try {
      return new URL(rawUrl).hostname.split(".")[0];
    } catch {
      return rawUrl;
    }
  }, []);

  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [cloudEditingLockUserId, setCloudEditingLockUserId] = useState<string | null>(null);
  const [cloudProjectUpdatedAt, setCloudProjectUpdatedAt] = useState<string | null>(null);
  const [cloudLatestUpdatedAt, setCloudLatestUpdatedAt] = useState<string | null>(null);
  const [cloudAccessLevel, setCloudAccessLevel] = useState<CloudAccessLevel | null>(null);
  const [cloudAccessRows, setCloudAccessRows] = useState<CloudAccessRow[]>([]);
  const [cloudProfiles, setCloudProfiles] = useState<Record<string, CloudProfileRow>>({});
  const [cloudLogs, setCloudLogs] = useState<CloudLogRow[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRow[]>([]);
  const [platformRole, setPlatformRole] = useState<PlatformRole>("reader");
  const [platformProfiles, setPlatformProfiles] = useState<PlatformProfileRow[]>([]);
  const [shareEmailInput, setShareEmailInput] = useState("");
  const [shareAccessLevel, setShareAccessLevel] = useState<"read" | "write">("write");

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    const refreshOwnPlatformRole = async (user: User | null) => {
      if (!supabase || !user) {
        setPlatformRole("reader");
        return;
      }

      const { data, error } = await supabase
        .from("author_profiles")
        .select("platform_role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setStatusMessage(`Erreur role plateforme: ${error.message}`);
        setPlatformRole("reader");
        return;
      }

      if (!data) {
        setStatusMessage(
          "Profil utilisateur introuvable. Contacte un administrateur pour finaliser ton acces.",
        );
        setPlatformRole("reader");
        return;
      }

      const role =
        data?.platform_role === "admin"
          ? "admin"
          : data?.platform_role === "author"
            ? "author"
            : "reader";
      setPlatformRole(role);
    };

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatusMessage(`Erreur session Supabase: ${error.message}`);
        }
        setAuthUser(data.session?.user ?? null);
        if (data.session?.user) {
          await refreshOwnPlatformRole(data.session.user);
        } else {
          setPlatformRole("reader");
          setPlatformProfiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        await refreshOwnPlatformRole(session.user);
      } else {
        setPlatformRole("reader");
        setPlatformProfiles([]);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setStatusMessage, supabase]);

  return {
    supabase,
    supabaseProjectRef,
    authLoading,
    authUser,
    authEmailInput,
    authPasswordInput,
    cloudBusy,
    cloudProjectId,
    cloudOwnerId,
    cloudEditingLockUserId,
    cloudProjectUpdatedAt,
    cloudLatestUpdatedAt,
    cloudAccessLevel,
    cloudAccessRows,
    cloudProfiles,
    cloudLogs,
    cloudProjects,
    platformRole,
    platformProfiles,
    shareEmailInput,
    shareAccessLevel,
    setAuthEmailInput,
    setAuthPasswordInput,
    setCloudBusy,
    setCloudProjectId,
    setCloudOwnerId,
    setCloudEditingLockUserId,
    setCloudProjectUpdatedAt,
    setCloudLatestUpdatedAt,
    setCloudAccessLevel,
    setCloudAccessRows,
    setCloudProfiles,
    setCloudLogs,
    setCloudProjects,
    setPlatformRole,
    setPlatformProfiles,
    setShareEmailInput,
    setShareAccessLevel,
  };
}
