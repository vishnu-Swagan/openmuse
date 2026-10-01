type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type SavedSession = { token: string; expiresAt: number };

export function browserSessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function sessionStore(apiUrl: string, storage = browserSessionStorage()) {
  const key = `openmuse.session:${apiUrl}`;
  return {
    read(now = Date.now()): SavedSession | undefined {
      try {
        const session = JSON.parse(storage?.getItem(key) || "null");
        if (
          typeof session?.token === "string" &&
          session.token &&
          Number.isFinite(session.expiresAt) &&
          session.expiresAt > now
        )
          return session;
        storage?.removeItem(key);
      } catch {
        try {
          storage?.removeItem(key);
        } catch {
          /* Storage is unavailable. */
        }
      }
      return undefined;
    },
    save(session: SavedSession) {
      try {
        storage?.setItem(
          key,
          JSON.stringify({ token: session.token, expiresAt: session.expiresAt }),
        );
      } catch {
        /* Sign-in still works when browser storage is blocked. */
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* Storage is unavailable. */
      }
    },
  };
}
