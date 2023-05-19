'use strict';

// QIO-Util-CSV

// const _ = require("lodash");
// const json2csv = require("json2csv").parse;

// // const fieldsForIncomeStreamObj = ['payeeNameSlug', 'payeeNameFriendly', 'identifiedIn', 'periodSize', 'streamType', 'periodsPerYear',
// //     'transactionCount', 'category_id', 'fioCategoryId', 'dates', 'dateDistribution', 'amountDistribution', 'tids'
// // ];

// module.exports = {
//     objToCsv: (arr, callback, fieldsToInclude) => _objToCsv(arr, callback, fieldsToInclude)
// };

// function _objToCsv(arr, callback, fieldsToInclude) {
//     let opts = (_.isNil(fieldsToInclude) || _.isEmpty(fieldsToInclude)) ? {} : { fieldsToInclude };
//     let out = json2csv(arr, opts);
//     console.log("\n" + out);
//     if (callback) callback(null, out);
// }
