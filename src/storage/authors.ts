import { database } from "./database";
import type { NavigationState } from "../viewer/navigation";

/** Someone's nickname as last seen, and when they chose it, so a relayed older file can't undo a rename. */
export interface Author { id: string; name: string; since: number }
/** This device's author ID, and the names known for every author, this device's own included. */
export interface Authors { me: string; known: Map<string, Author> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isAuthorId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

// Crockford's letters: no I, L, O or U, so a tag can't be misread as 1 or 0.
const TAG_LETTERS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Four letters and digits from the ID, like "A32F", which tell two people with one name apart. */
export function authorTag(id: string) {
  let bits = parseInt(id.slice(0, 5), 16);
  let tag = "";
  for (let i = 0; i < 4; i++, bits >>= 5) tag = TAG_LETTERS[bits & 31] + tag;
  return tag;
}

/** Authors from a file, or undefined when the list is malformed. */
export function readAuthors(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) return;
  const seen = new Set<string>(), authors: Author[] = [];
  for (const input of value) {
    if (typeof input !== "object" || input === null || !isAuthorId(input.id) || seen.has(input.id) ||
        typeof input.name !== "string" || input.name.length > 100 || !input.name.trim() || /[\u0000-\u001f]/.test(input.name) ||
        !Number.isSafeInteger(input.since) || input.since < 0) return;
    seen.add(input.id);
    authors.push({ id: input.id, name: input.name.trim(), since: input.since });
  }
  return authors;
}

/** Keep each author's most recently chosen name. */
export function mergeAuthors(known: Author[], incoming: Author[]) {
  const merged = new Map(known.map((author) => [author.id, author]));
  for (const author of incoming)
    if ((merged.get(author.id)?.since ?? -1) < author.since) merged.set(author.id, author);
  return [...merged.values()];
}

const request = <T>(store: IDBObjectStore, key: string) => store.get(key) as IDBRequest<T | undefined>;

/** Learn the names in a shared file or backup, inside the caller's transaction. */
export function rememberAuthors(settings: IDBObjectStore, incoming: Author[]) {
  if (!incoming.length) return;
  const known = request<Author[]>(settings, "authors");
  known.onsuccess = () => settings.put(mergeAuthors(known.result ?? [], incoming), "authors");
}

export const learnAuthors = (incoming: Author[]) =>
  settingsTransaction<void>((settings) => rememberAuthors(settings, incoming));

async function settingsTransaction<T>(run: (store: IDBObjectStore, done: (value: T) => void) => void,
  stores: string[] = ["settings"]) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    let result: T;
    run(tx.objectStore("settings"), (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
  });
}

/** The device's ID is made on first use; the nickname from Settings names it. */
export const loadAuthors = () => settingsTransaction<Authors>((settings, done) => {
  const id = request<string>(settings, "author-id");
  const name = request<string>(settings, "share-name");
  const since = request<number>(settings, "share-name-since");
  const authors = request<Author[]>(settings, "authors");
  authors.onsuccess = () => {
    const me = id.result ?? crypto.randomUUID();
    if (!id.result) settings.put(me, "author-id");
    const known = new Map((authors.result ?? []).map((author) => [author.id, author]));
    // Your own name is always the one in Settings; without one you share anonymously.
    const nickname = name.result?.trim();
    if (nickname) known.set(me, { id: me, name: nickname, since: since.result ?? 0 });
    else known.delete(me);
    done({ me, known });
  };
});

/** Renaming keeps the same author, so everything already shared takes the new name. */
export const saveNickname = (name: string) => settingsTransaction<void>((settings) => {
  settings.put(name, "share-name");
  settings.put(Date.now(), "share-name-since");
});

const authored = (state: NavigationState, id: string) =>
  [...state.markers, ...state.routes].some((item) => item.addedBy === id || item.updatedBy === id);

/** A backup restored on a new phone brings its owner's identity along, unless this
 * device has already added or changed something under its own. True when the device is now the backup's owner. */
export const adoptAuthor = (id: string) => settingsTransaction<boolean>((settings, done) => {
  const current = request<string>(settings, "author-id");
  current.onsuccess = () => {
    if (current.result === id) return done(true);
    if (!current.result) {
      settings.put(id, "author-id");
      return done(true);
    }
    const states = settings.transaction.objectStore("navigation").getAll() as IDBRequest<NavigationState[]>;
    states.onsuccess = () => {
      if (states.result.some((state) => authored(state, current.result!))) return done(false);
      settings.put(id, "author-id");
      done(true);
    };
  };
}, ["settings", "navigation"]);
