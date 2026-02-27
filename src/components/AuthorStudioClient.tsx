"use client";

import dynamic from "next/dynamic";

const AuthorStudioAppNoSSR = dynamic(
  () => import("@/components/AuthorStudioApp").then((module) => module.AuthorStudioApp),
  {
    ssr: false,
    loading: () => <main style={{ padding: 24 }}>Chargement du studio...</main>,
  },
);

export function AuthorStudioClient() {
  return <AuthorStudioAppNoSSR />;
}

