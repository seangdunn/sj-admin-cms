// Rewrites extension-less requests (e.g. /login) to their real .html file
// (/login.html) before CloudFront looks them up in the S3 origin. Next.js
// static export (output: 'export') emits a flat <route>.html per page
// (app/login/page.tsx -> out/login.html) rather than directory+index.html,
// so a clean-URL request needs this rewrite to resolve at all — without it,
// every route but "/" 404s on direct load/refresh (client-side navigation
// from within the app still works regardless, since that never hits
// CloudFront). Copied verbatim from sj-web-studio-clean's infra — generic
// logic, no site-specific exceptions.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Already has a file extension (.html, .css, .js, .png, .json, ...) —
  // leave every real asset request (including _next/static/*) untouched.
  if (uri.includes(".")) {
    return request;
  }

  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else {
    request.uri = uri + ".html";
  }

  return request;
}
