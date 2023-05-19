'use strict';
//
//  QIO-Lambda-ASDS-Accounts-Hide()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: Used by AppSync 
//  Input: .userId & either account_ids or masterAccountIds
//  Output: bool
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isEmpty(event.userId) || (_.isNil(event.args.account_ids) && _.isNil(event.args.masterAccountIds))) {
        console.log("Bad context");
        callback(null, false);
    }
    else qlib.persist.setAccountHidden(event.userId, (err, res) => {
        if (err) callback(null, false);
        else callback(null, true);
    }, event.args.account_ids, event.args.masterAccountIds, event.args.hiddenState);
});
