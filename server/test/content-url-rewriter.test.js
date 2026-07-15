// Run: node --test server/test/
// Division of responsibility (user decision 2026-07-15):
//   href (navigation) = the SITE's router owns old-URL handling. The migration
//     must NOT map old URLs to new-site routes. Keep hrefs byte-identical,
//     except absolutizing relative ones against the OLD site base so they are
//     full links.
//   src (inline rendering) = the migration's data problem. Legacy images are
//     rewritten to the S3 copy of the old flat images dir, else they 404.
const test=require("node:test");
const assert=require("node:assert");
const {rewriteContentUrls}=require("../src/engine/content-url-rewriter");

const OPTS={
  oldSiteBaseUrl:"https://www.kupat.org.il",
  imagesBaseUrl:"https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01"
};

// ---- src: legacy images -> S3 ----

test("rewrites relative image src to S3 base with encoded filename",function(){
  const html='<img alt="" src="images/באנר והסירותי2.jpg" style="width: 750px;" />';
  const out=rewriteContentUrls(html,OPTS);
  assert.ok(out.includes('src="https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01/%D7%91%D7%90%D7%A0%D7%A8%20%D7%95%D7%94%D7%A1%D7%99%D7%A8%D7%95%D7%AA%D7%992.jpg"'),out);
  assert.ok(!out.includes('src="images/'),out);
});

test("rewrites /images/ and ../images/ src variants",function(){
  const out=rewriteContentUrls('<img src="/images/a.png"><img src="../images/b.png">',OPTS);
  assert.ok(out.includes('src="https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01/a.png"'),out);
  assert.ok(out.includes('src="https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01/b.png"'),out);
});

test("rewrites absolute kupat.org.il /images/ src to S3",function(){
  const out=rewriteContentUrls('<img src="https://www.kupat.org.il/images/pic.jpg">',OPTS);
  assert.equal(out,'<img src="https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01/pic.jpg">');
});

test("does not double-encode already percent-encoded filenames",function(){
  const out=rewriteContentUrls('<img src="images/%D7%9B%D7%A4%D7%A8%D7%95%D7%AA.png">',OPTS);
  assert.ok(out.includes("/2020/01/%D7%9B%D7%A4%D7%A8%D7%95%D7%AA.png"),out);
  assert.ok(!out.includes("%25D7"),out);
});

test("leaves youtube/vimeo iframe srcs untouched",function(){
  const html='<iframe src="https://www.youtube.com/embed/MDeOTTMjb9w"></iframe><iframe src="https://player.vimeo.com/video/225089811"></iframe>';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

test("leaves bare-filename src untouched (not under images/)",function(){
  const html='<img src="הרב שטרן.png">';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

// ---- href: keep exactly as the old site, absolutize relative only ----

test("keeps absolute DonationPage href byte-identical (params and &amp; preserved)",function(){
  const html='<a href="https://www.kupat.org.il/views/DonationPage?pid=2308&amp;DonSum=100&amp;dontype=fixed&amp;PayNum=30">תרמו</a>';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

test("absolutizes relative href against old site base, preserving query verbatim",function(){
  const out=rewriteContentUrls('<a href="views/DonationPage?pid=17&amp;DonSum=50">x</a>',OPTS);
  assert.ok(out.includes('href="https://www.kupat.org.il/views/DonationPage?pid=17&amp;DonSum=50"'),out);
});

test("absolutizes root-relative and ../ hrefs",function(){
  const out=rewriteContentUrls('<a href="/views/Page.aspx?x=1">a</a><a href="../views/Other.aspx">b</a>',OPTS);
  assert.ok(out.includes('href="https://www.kupat.org.il/views/Page.aspx?x=1"'),out);
  assert.ok(out.includes('href="https://www.kupat.org.il/views/Other.aspx"'),out);
});

test("relative href to images/ becomes full old-site link (href is navigation, not rendering)",function(){
  const out=rewriteContentUrls('<a href="images/שטר.jpg">צפו</a>',OPTS);
  assert.ok(out.includes('href="https://www.kupat.org.il/images/שטר.jpg"'),out);
});

test("linked banner: href kept identical, inner img src rewritten to S3",function(){
  const html='<a href="https://www.kupat.org.il/views/DonationPage?pid=2308&amp;DonSum=100"><img src="images/באנר והסירותי2.jpg" /></a>';
  const out=rewriteContentUrls(html,OPTS);
  assert.ok(out.includes('href="https://www.kupat.org.il/views/DonationPage?pid=2308&amp;DonSum=100"'),out);
  assert.ok(out.includes("/2020/01/%D7%91%D7%90%D7%A0%D7%A8"),out);
});

test("leaves external hrefs untouched",function(){
  const html='<a href="https://www.inn.co.il/News/News.aspx/419203">news</a><a href="https://vimeo.com/225089811">v</a>';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

test("leaves non-DonationPage kupat.org.il hrefs untouched",function(){
  const html='<a href="https://www.kupat.org.il/views/SomePage.aspx?x=1">x</a>';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

test("leaves anchor, mailto, tel and javascript hrefs untouched",function(){
  const html='<a href="#top">t</a><a href="mailto:a@b.c">m</a><a href="tel:1800394747">p</a>';
  assert.equal(rewriteContentUrls(html,OPTS),html);
});

test("handles single-quoted attributes",function(){
  const out=rewriteContentUrls("<img src='images/a.png'><a href='views/DonationPage?pid=5'>x</a>",OPTS);
  assert.ok(out.includes("https://kupat-hair-data.s3.us-west-2.amazonaws.com/2020/01/a.png"),out);
  assert.ok(out.includes("https://www.kupat.org.il/views/DonationPage?pid=5"),out);
});

test("returns null/empty input unchanged",function(){
  assert.equal(rewriteContentUrls(null,OPTS),null);
  assert.equal(rewriteContentUrls("",OPTS),"");
});

test("uses default options when opts omitted",function(){
  const out=rewriteContentUrls('<img src="images/a.png"><a href="views/x.aspx">l</a>');
  assert.ok(out.includes("kupat-hair-data.s3.us-west-2.amazonaws.com"),out);
  assert.ok(out.includes('href="https://www.kupat.org.il/views/x.aspx"'),out);
});
