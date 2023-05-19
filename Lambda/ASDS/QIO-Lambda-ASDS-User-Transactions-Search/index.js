'use strict';
//
//  QIO-Lambda-ASDS-User-Transactions-Search()
//
//  Created by Thomas Purnell-Fisher
//  Copyright © 2018-2019 Flow Capital, LLC. All rights reserved.
//
//  Description: 
//  Input: userId & query
//  Output: transaction array
//

const qlib = require("./QuantaLib/FIO-QuantaLib");
const _ = require("lodash");

exports.handler = qlib.log.rollbar.lambdaHandler((event, context, callback) => {
    qlib.log.setRollbarEnv(context.functionName);
    console.log(context.functionName + '() EVENT =\n' + JSON.stringify(event));

    if (_.isNil(event.userId)) callback(null, "User context required");
    let filterQuery = "userid: '" + event.userId + "'";
    let query = _.isUndefined(event.query) ? event.args.query : event.query;
    if (_.isNil(query)) callback(null, 'Query required.');
    else qlib.cs.performTransactionSearch(query, filterQuery, (err, res) => {
        if (err) callback(err);
        else if (res.hits.found == 0) callback(null, []);
        else callback(null, _.map(res.hits.hit, transformSearchResult));
    });
});

function transformSearchResult(hit) {
    let out = {};
    _.forOwn(hit.fields, (value, key) => {
        if (key == 'fiocategoryid') { key = 'fioCategoryId' } // get the casing right
        out[key] = value[0];
    });
    return out;
}
