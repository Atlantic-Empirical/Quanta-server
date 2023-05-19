// FIO-Admin-Tables

'use strict';
const AWS = require('aws-sdk');
const _ = require('lodash');
const _async = require('async');
const q_ddb = require("../AWS/FIO-AWS-DDb");

module.exports = {

    recreateTables: (tableFriendlyNames, callback) => _recreateTables(tableFriendlyNames, callback),

};

function _recreateTables(tableFriendlyNames, callback) {
    if (!_.isArray(tableFriendlyNames)) tableFriendlyNames = [tableFriendlyNames];
    let os = _.map(tableFriendlyNames, FN => ({ tableName: tableNameForFriendlyString(FN), createParams: createParamsFor(FN) }));
    _async.each(os, (o, cb_each) =>
        q_ddb.deleteTable(o.tableName, (err, success) => {
            if (err) {
                console.log("ERROR deleteTable failed for " + o.tableName + " err: " + err); // Don't try to create if delete errored
                cb_each(err);
            }
            else q_ddb.createTable(o.createParams, cb_each);
        }), callback
    );
}

function tableNameForFriendlyString(friendly) {

    switch (friendly) {

        case 'Transactions':
            return 'FAC-Transactions';

        case 'Items':
            return 'FIO-Table-Items';

        case 'Accounts':
            return 'FIO-Table-Accounts';

        case 'User Flow':
            return 'FIO-Table-User-Flow';

        case 'PushDeviceTokens':
            return 'NP-Push-Device-Tokens';

        case 'Webhooks':
            return 'FAC-Webhooks';

        case 'User Map':
            return 'FIO-Table-UserMap';

        case 'User Details':
            return 'FIO-Table-User-Details';

        case 'Nightly Analytics':
            return 'FIO-Table-Analytics-Nightly';

        default:
            return '*** NOT MATCHED ***';
    }
}

function createParamsFor(friendly) {

    switch (friendly) {

        case 'Transactions':
            return createTableParams_FAC_Transactions(friendly);

        case 'Items':
            return createTableParams_Items(friendly);

        case 'Accounts':
            return createTableParams_Accounts(friendly);

        case 'User Flow':
            return createTableParams_UserFlow(friendly);

        case 'PushDeviceTokens':
            return createTableParams_NP_PushDeviceTokens(friendly);

        case 'Webhooks':
            return createTableParams_Webhooks(friendly);

        case 'User Details':
            return createTableParams_UserDetails(friendly);

        case 'User Map':
            return createTableParams_UserMap(friendly);

        case 'Nightly Analytics':
            return createTableParams_AnalyticsNightly(friendly);
    }
}

function createTableParams_FAC_Transactions(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" }, // Partition key
            { AttributeName: "transaction_id", KeyType: "RANGE" } // Sort key
        ],
        AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "transaction_id", AttributeType: "S" },
            { AttributeName: "date", AttributeType: "S" },
            { AttributeName: "item_id", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
                IndexName: 'userId-index',
                KeySchema: [
                    { AttributeName: 'userId', KeyType: "HASH" }
                ],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'item_id-index',
                KeySchema: [
                    { AttributeName: 'item_id', KeyType: "HASH" }
                ],
                Projection: {
                    ProjectionType: "INCLUDE",
                    NonKeyAttributes: ["userId", "transaction_id", "masterAccountId", "date"]
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ]
    };
}

function createTableParams_Accounts(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "masterAccountId", KeyType: "HASH" }, // Partition Key
        ],
        AttributeDefinitions: [
            { AttributeName: "masterAccountId", AttributeType: "S" },
            { AttributeName: "item_id", AttributeType: "S" },
            { AttributeName: "userId", AttributeType: "S" },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
                IndexName: 'userId-index',
                KeySchema: [{
                    AttributeName: 'userId',
                    KeyType: "HASH"
                }],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'item_id-index',
                KeySchema: [
                    { AttributeName: 'item_id', KeyType: "HASH" }
                ],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ]
    };
}

function createTableParams_Items(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "item_id", KeyType: "HASH" }, // Partition Key
        ],
        AttributeDefinitions: [
            { AttributeName: "institution_id", AttributeType: "S" },
            { AttributeName: "item_id", AttributeType: "S" },
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "link_session_id", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
                IndexName: 'userId-item_id-index',
                KeySchema: [{
                        AttributeName: 'userId',
                        KeyType: "HASH"
                    },
                    {
                        AttributeName: 'item_id',
                        KeyType: "RANGE"
                    }
                ],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'institution_id-index',
                KeySchema: [{
                    AttributeName: 'institution_id',
                    KeyType: "HASH"
                }],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'userId-index',
                KeySchema: [{
                    AttributeName: 'userId',
                    KeyType: "HASH"
                }],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'link_session_id-index',
                KeySchema: [{
                    AttributeName: 'link_session_id',
                    KeyType: "HASH"
                }],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ]
    };
}

function createTableParams_UserFlow(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" }, // Partition key
            { AttributeName: "periodId", KeyType: "RANGE" } // Sort key
        ],
        AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "periodId", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
            IndexName: 'userId-windowSize-index',
            KeySchema: [
                { AttributeName: 'userId', KeyType: "HASH" },
                { AttributeName: 'windowSize', KeyType: "RANGE" }
            ],
            AttributeDefinitions: [
                { AttributeName: "windowSize", AttributeType: "N" }
            ],
            Projection: { ProjectionType: "ALL" },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        }]
    };
}

function createTableParams_NP_PushDeviceTokens(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "tokenPlatform", KeyType: "HASH" }, // Partition key
            { AttributeName: "userId", KeyType: "RANGE" } // Sort key
        ],
        AttributeDefinitions: [
            { AttributeName: "tokenPlatform", AttributeType: "N" },
            { AttributeName: "userId", AttributeType: "S" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
            IndexName: 'userId-index',
            KeySchema: [{
                AttributeName: 'userId',
                KeyType: "HASH"
            }],
            Projection: {
                ProjectionType: "ALL"
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        }]
    };
}

function createTableParams_Webhooks(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "item_id", KeyType: "HASH" }, // Partition key
            { AttributeName: "timestamp", KeyType: "RANGE" } // Sort key
        ],
        AttributeDefinitions: [
            { AttributeName: "item_id", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "N" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
            IndexName: 'item_id-index',
            KeySchema: [{
                AttributeName: 'item_id',
                KeyType: "HASH"
            }],
            Projection: {
                ProjectionType: "ALL"
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        }]
    };
}

function createTableParams_UserDetails(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" }, // Partition Key
            { AttributeName: "objectTypeId", KeyType: "RANGE" } // Sort Key
        ],
        AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "objectTypeId", AttributeType: "N" }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
                IndexName: 'userId-index',
                KeySchema: [
                    { AttributeName: 'userId', KeyType: "HASH" }
                ],
                Projection: {
                    ProjectionType: "ALL"
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            },
            {
                IndexName: 'original_transaction_id-userId-index',
                KeySchema: [
                    { AttributeName: 'original_transaction_id', KeyType: "HASH" }
                ],
                Projection: {
                    ProjectionType: "INCLUDE",
                    NonKeyAttributes: ["userId", "objectTypeId", "original_transaction_id"]
                },
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            }
        ]
    };
}

function createTableParams_UserMap(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        GlobalSecondaryIndexes: [{
            IndexName: 'sub-index',
            KeySchema: [{
                AttributeName: 'sub',
                KeyType: "HASH"
            }],
            Projection: {
                ProjectionType: "ALL"
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        }]
    };
}

function createTableParams_AnalyticsNightly(friendly) {
    return {
        TableName: tableNameForFriendlyString(friendly),
        BillingMode: "PAY_PER_REQUEST",
        SSESpecification: { Enabled: true },
        KeySchema: [
            { AttributeName: "date", KeyType: "HASH" } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: "date", AttributeType: "S" },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };
}
