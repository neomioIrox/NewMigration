// Rewrites URLs inside legacy rich-HTML content (products.Description) so it
// works on the new site. Division of responsibility (user decision 2026-07-15):
//
//   href (navigation): the SITE's router owns old-URL handling — the migration
//     must NOT translate old URLs to new-site routes. hrefs are kept
//     byte-identical; the only change is absolutizing relative ones against
//     the old site base so they are full, well-formed links.
//
//   src (inline rendering): the migration's data problem — legacy image paths
//     (images/<file>, /images/, ../images/, *.kupat.org.il/images/) point at
//     the old server's flat dir and would 404, so they are rewritten to the
//     S3 copy (verified under 2020/01/). Other srcs (youtube/vimeo iframes,
//     bare filenames) are left untouched.
//
// Bases are overridable via opts or env so domains can change per environment.

const DEFAULT_OLD_SITE_BASE="https://www.kupat.org.il";
const DEFAULT_IMAGES_BASE="https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01";

function stripTrailingSlash(u){return String(u).replace(/\/+$/,"");}

// Percent-encode a legacy filename unless it is already percent-encoded.
function encodeFilename(name){
  if(/%[0-9A-Fa-f]{2}/.test(name)) return name;
  return name.split("/").map(encodeURIComponent).join("/");
}

// src -> S3 for the legacy flat images dir only.
function rewriteSrc(url,imagesBase){
  var m=url.match(/^(?:\.\.\/|\/)?images\/(.+)$/i)
       ||url.match(/^https?:\/\/[^\/]*kupat\.org\.il\/images\/(.+)$/i);
  return m?imagesBase+"/"+encodeFilename(m[1]):null;
}

// href -> full link on the old site; URL content itself is never changed.
function rewriteHref(url,oldSiteBase){
  if(/^(https?:|#|mailto:|tel:|javascript:|data:)/i.test(url)) return null;
  var rest=url.replace(/^(\.\.\/|\.\/)+/,"").replace(/^\/+/,"");
  return oldSiteBase+"/"+rest;
}

function rewriteContentUrls(html,opts){
  if(!html) return html;
  var oldSiteBase=stripTrailingSlash((opts&&opts.oldSiteBaseUrl)||process.env.OLD_SITE_BASE_URL||DEFAULT_OLD_SITE_BASE);
  var imagesBase=stripTrailingSlash((opts&&opts.imagesBaseUrl)||process.env.LEGACY_IMAGES_BASE_URL||DEFAULT_IMAGES_BASE);
  return String(html).replace(/(src|href)(\s*=\s*)(["'])([^"']*)\3/gi,function(full,attr,eq,quote,rawUrl){
    var url=rawUrl.trim();
    if(!url) return full;
    var rewritten=attr.toLowerCase()==="src"?rewriteSrc(url,imagesBase):rewriteHref(url,oldSiteBase);
    return rewritten===null?full:attr+eq+quote+rewritten+quote;
  });
}

module.exports={rewriteContentUrls};
