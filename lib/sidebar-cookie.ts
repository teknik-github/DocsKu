/**
 * Cookie remembering a collapsed dashboard sidebar. Lives outside the client
 * shell: a "use client" module's exports are client references on the server,
 * not values, so the panel layout could not read the cookie name from there.
 */
export const SIDEBAR_COOKIE = "docsku_sidebar";
