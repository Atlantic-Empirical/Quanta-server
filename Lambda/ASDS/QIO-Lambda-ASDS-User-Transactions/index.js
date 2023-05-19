'use strict';
//
//  QIO-Lambda-ASDS-User-Transactions()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: .userId Optional: .transaction_ids[], .includeAccounts
//  Output: transaction array
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));
    let includeAccounts = _.isUndefined(event.includeAccounts) ? false : event.includeAccounts;
    if (_.isNil(event.maid))
        qlib.persist.pullUserTransactions(event.userId, event.transaction_ids, includeAccounts, callback);
    else
        qlib.persist.pullAccountTransactions(event.maid, callback);
});
