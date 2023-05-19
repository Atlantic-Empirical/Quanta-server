'use strict';
//
//  QIO-Lambda-ASDS-Item-FreshToken()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: Used by AppSync to give the client a new token when a user has been unlinked by bank
//  Input: .userId & .item_id
//  Output:  just returns the token or an empty string
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");
const qplaid = require('./QuantaPlaid/FIO-Plaid');

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
     qlib.log.setRollbarEnv(context.functionName);
   console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isEmpty(event.item_id) || _.isEmpty(event.userId)) callback(null, 'Invalid context.');
    else {
        qlib.persist.pullItem(event.item_id, (err, item) => {
            if (err) callback(err);
            else if (_.isEmpty(item)) callback(null, "No matching Item");
            else if (item.userId != event.userId) callback('Item not associated with user.');
            else qplaid.createPublicToken(item.access_token, callback);
        });
    }
});
