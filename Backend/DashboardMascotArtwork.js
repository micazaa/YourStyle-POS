// Public, approved mascot artwork bundled at 180px; no Drive request at runtime.
function getDashboardMascotArtwork(id) {
  const assets = {"1DZIkmEWEym2yUuSz3SQVTeVB5RC_y6QC":"happy","1m12gLMUqZpm0qxGFYRa6ESDqeR70PFo_":"excited","1rXtA2BSOMAOgeTCDQsLslOztqLUC4JdR":"confident","1y_9t13eiMlF35zEl4VcgHdEBLWLqFvpc":"surprised","19gvGD0_fzdNHrJcAx8sI-sU3AovxM1nA":"thinking","1LI3Zq8oWGlTtSBQifO5bwo49NXZeib5j":"worried","1YspQq4CF-ZsDs9Rm_ahJmUi0E29_ALwf":"sad","1M8H9C7XI8ba58qyfT9Ze6V2Oo-x13_ro":"sleepy","1kUM3SJnCSqwc1brkdAXkC-FZul5cV96f":"celebrating","1r7aKywZeXR_q1aI0jDzBWAETCl7T3ymH":"angry","181GGtAKegSaiX758xqpXl8Ss9Ubs0QqE":"embarrassed","17_yUJ8zMdTnbynsA4pZH2Sq7b-IjQdhW":"confused","1RWtc1IU-8xCTqOHjOrMYK5GmOATmfhtT":"proud","1gqEn8fbXz95_SQeY4O0TTYeL1a2rLL5B":"relieved","14okIa9E4pu2FB_v-1xPBgw3unZ59KGFC":"focused","1zBULw64n0cqu1Qq4CUnEolRKKRdqSUYV":"curious","1AjVYFAA-upmcCd3Hq_6mrNsl4LvUGjb_":"apologetic","1o55BePCHgWS18KHEL66Fc5LeeFDtA0zD":"grateful","1FH7n53IHK7pmvkAsRqPI9D3L1mwl-nwt":"frustrated","1MpLShUwkHQegvIp6XqMePT4N5d2LYbXP":"determined"};
  if (!id) {
    const day = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd');
    const elapsed = Math.round((Date.parse(day+'T00:00:00Z')-Date.UTC(2026,10,18))/86400000);
    const ids = Object.keys(assets);
    id = ids[((elapsed % ids.length) + ids.length) % ids.length];
    if (Number(Utilities.formatDate(new Date(), 'Asia/Manila', 'HH')) >= 12) {
      id = ids.find(key => assets[key] === 'sad');
    }
  }
  if (!Object.prototype.hasOwnProperty.call(assets,id)) throw new Error('Unknown mascot.');
  return {id:id,src:HtmlService.createHtmlOutputFromFile('Frontend/Assets/DashboardMascots/'+assets[id]).getContent().trim()};
}
