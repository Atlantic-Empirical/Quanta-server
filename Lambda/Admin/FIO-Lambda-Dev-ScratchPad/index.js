// FIO-Lambda-Dev-ScratchPad

'use strict';
const _ = require("lodash");
const _async = require("async");
const qlib = require("./QuantaLib/FIO-QuantaLib");
const qfin = require('./QuantaFin/FIO-QuantaFin');
const q_plaid = require("./QuantaPlaid/FIO-Plaid");
// const flowNotif = require("./TestModules/flowNotif");
// const uuidv4 = require('uuid/v4');
// const q_util = require("./QuantaLib/Util/FIO-Util-ObjectStuff");
const appRoot = process.cwd();
const Moment = require(appRoot + "/ThirdParty/moment/moment-timezone-with-data-2012-2022");
const MomentRange = require(appRoot + "/ThirdParty/moment-range/moment-range");
const moment = MomentRange.extendMoment(Moment);

exports.handler = (event, context, callback) => {

    qlib.notifs.flowNotify(event.userId, event.yesterday, callback);

    // qlib.persist.pullAllUserTransactions(event.userId, (err, res) => {
    //     if (err) callback(err);
    //     else qfin.spending.buildSpendingSummary(res, (err, res) => callback(err, 'done'));
    // });

    // qlib.persist.pullItem(event.item_id, (err, item) => {
    //     if (err) callback(err);
    //     else qlib.persist.pullItemAccounts(item.item_id, (err, staleAccounts) => {
    //         if (err) callback(err);
    //         else {
    //             item.accounts = staleAccounts;
    //             q_plaid.getAccountsForItem(event.access_token, event.item_id, event.userId, (err, freshAccounts) => {
    //                 if (err) callback(err);
    //                 else qlib.persist.mergeFreshAccountInfoForItem(item, freshAccounts, callback);
    //             });
    //         }
    //     });
    // });

    // qlib.persist.pullAccountTransactions("fdeea68d-7c94-41ce-8f29-3d8817128a30", callback);
    // q_plaid.pullTransactionsForItem(event.item_id, event.access_token, event.userId, callback, 'range', '2019-03-01', '2019-05-10');

    // q_plaid.updateInstitution('ins_10', callback);

    // qlib.ddb.scan('FIO-Table-Items', (err, res) => {
    //     if (err) callback(err);
    //     else {
    //         let out = _.chain(res).map('institution_id').uniq().value();
    //         callback(null, out);
    //     }
    // }, undefined, undefined, undefined, 'institution_id');

    // q_plaid.getInstitution("ins_10", (err, res) => {
    //     if (err) callback(err);
    //     else {
    //         delete res.logo;
    //         qlib.persist.putInstitution(res, callback);
    //     }
    // });

    // qlib.persist.promoCodeAttemptUse("quanta-free-forever", "us-east-1:f9e3188e-1fa2-4cc1-99a5-8cce10227293", callback);

    // createPromoCode(callback);
};

function createPromoCode(callback) {
    let pc = {
        promoCode: "quanta-free-forever",
        createdTimestamp: Date.now(),
        createdDate: moment().format('YYYY-MM-DD'),
        grantUntilDate: "2119-12-31",
        // grantDurationDays: -1,
        disabled: false,
        codeRetireTimestamp: 0,
        codeRetireDate: "2119-07-01",
        useCountLimit: 0,
        useCount: 0
    };
    qlib.persist.putPromoCode(pc, callback);
}
