const request = require('request-promise-native')
const log = require("./log.js").log

async function rmsPost(rms, api, data, logit) {
    let rv;
    try {
        let rmsUrl = `https://${rms.user}:${rms.pw}@${rms.rms}${api}`;
        let resp = await request({uri:rmsUrl, method:'POST', json:true, body:data, timeout:5000});
        if (logit) log(`rms POST ${api}`, resp);
        rv = resp;
    } catch (e) {
        log(`rms POST ERROR ${api}`, e);
        rv = e;
    }
    return rv;
}

module.exports = { rmsPost };
