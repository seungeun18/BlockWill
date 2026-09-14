const API_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8001"
).replace(/\/$/, "");

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

type AuthResponse = {
  user: AuthUser;
};

type MessageResponse = {
  message: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = LoginPayload & {
  name: string;
};

export class AuthApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const detail = (data as { detail?: unknown }).detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const firstError = detail[0];

    if (
      firstError &&
      typeof firstError === "object" &&
      typeof (firstError as { msg?: unknown }).msg === "string"
    ) {
      return (firstError as { msg: string }).msg.replace(
        /^Value error,\s*/,
        "",
      );
    }
  }

  return fallback;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new AuthApiError(
      "인증 서버에 연결할 수 없습니다. 백엔드 서버를 확인해주세요.",
      0,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AuthApiError(
      getErrorMessage(data, "요청을 처리하지 못했습니다."),
      response.status,
    );
  }

  return data as T;
}

export async function signupUser(
  payload: SignupPayload,
): Promise<AuthUser> {
  const response = await request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.user;
}

export async function loginUser(
  payload: LoginPayload,
): Promise<AuthUser> {
  const response = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.user;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await request<AuthResponse>("/api/auth/me", {
    method: "GET",
  });

  return response.user;
}

export async function logoutUser(): Promise<string> {
  const response = await request<MessageResponse>("/api/auth/logout", {
    method: "POST",
  });

  return response.message;
}