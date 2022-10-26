const request = require('request-promise-native')
const log = require("./log.js").log

/**
 * 
 * @param {*} rms dict including rms name, user, pw 
 * @param {string} api URL path, everything after the hostname
 * @param {*} data object to send as JSON body
 * @param {bool} logit true to log a message
 * @returns full response, or exception if error
 */
async function rmsPost(rms, api, data, logit) {
    let rv;
    try {
        let rmsUrl = `https://${rms.user}:${rms.pw}@${rms.rms}${api}`;
        let resp = await request({uri:rmsUrl, method:'POST', json:true, body:data, timeout:5000});
        if (logit) log(`rms POST ${api}`, {payload:data, resp:resp});
        rv = resp;
    } catch (e) {
        log(`rms POST ERROR ${api}`, e);
        rv = e;
    }
    return rv;
}

module.exports = { rmsPost };
