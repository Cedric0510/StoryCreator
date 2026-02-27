import { NextRequest, NextResponse } from "next/server";

function toBoolean(value: string | undefined, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function unauthorizedResponse() {
  return new NextResponse("Acces restreint", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CadaRium Author Studio"',
    },
  });
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const basicAuthEnabled = toBoolean(process.env.ENABLE_HTTP_BASIC, false);
  if (!basicAuthEnabled) {
    return NextResponse.next();
  }

  const expectedUser = process.env.BETA_HTTP_BASIC_USER;
  const expectedPass = process.env.BETA_HTTP_BASIC_PASS;

  if (!expectedUser || !expectedPass) {
    return new NextResponse(
      "Configuration manquante: BETA_HTTP_BASIC_USER/BETA_HTTP_BASIC_PASS.",
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  try {
    const base64Credentials = header.slice("Basic ".length).trim();
    const decoded = atob(base64Credentials);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex <= 0) {
      return unauthorizedResponse();
    }

    const providedUser = decoded.slice(0, separatorIndex);
    const providedPass = decoded.slice(separatorIndex + 1);

    if (providedUser !== expectedUser || providedPass !== expectedPass) {
      return unauthorizedResponse();
    }

    return NextResponse.next();
  } catch {
    return unauthorizedResponse();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
