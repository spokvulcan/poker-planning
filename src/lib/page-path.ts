/**
 * The request header that carries the path of the page a request is for, so
 * a server render can send someone back to it: Next gives a layout no
 * pathname, so the proxy (src/proxy.ts) puts it on the request. The
 * dashboard's gate reads it to send a visitor to sign in, coming back to the
 * page they asked for.
 */
export const PAGE_PATH_HEADER = "x-page-path";
