"use strict";

var app = angular.module('app', []);

app.directive('pgpKey', function () {
    return {
        require: 'ngModel',
        link: function(scope, elm, attrs, ctrl) {
            ctrl.$parsers.unshift(function(viewValue) {
                try {
                    var private_key = openpgp.read_privateKey(viewValue)
                    ctrl.$setValidity('key', true);
                    return viewValue;
                } catch (err) {
                    ctrl.$setValidity('key', false);
                    return undefined;
                }
            });
        }
    };
});

app.directive('timeAgo', ['$timeout', function(timeout) {
    return {
        restrict: 'AC',
        scope: {'datetime': '@'},
        link: function(scope, element, attrs) {
            var tm;

            scope.$watch('datetime', function(datetime) {
                timeout.cancel(tm);

                if (!datetime || !moment(datetime)) {
                    element.text('never');
                }

                var update = function() {
                    element.text(moment(datetime).fromNow());
                    tm = timeout(update, 60000);
                };

                element.bind('$destroy', function() {
                    timeout.cancel(tm);
                });

                update();
            });
        }
    };
}]);

app.factory('dropbox', ['$q', '$http', function(q, http) {
    var ready = q.defer();
    var url = window.location.origin + window.location.pathname;

    var db_name = 'pwdb.json';
    var storage_name = 'jspw:db'
    var last_sync = 'jspw:last_sync'

    var syncPasswordDB = function(scope) {
        var db = q.defer();
        window.dropboxClient.readFile(db_name, function(error, file) {
            if (error) {
                db.reject(error);
            } else {
                db.resolve(file);
                window.localStorage[storage_name] = file;
                window.localStorage[last_sync] = moment().toString();
            }
            scope.$apply();
        });
        return db.promise;
    };

    var lastSync = function() {
        return window.localStorage[last_sync];
    };

    var putPasswordDB = function(scope, new_db) {
        var db = q.defer();
        window.dropboxClient.writeFile(db_name, new_db, function(error, status) {
            if (error) {
                db.reject(error);
            } else {
                db.resolve(status);
                window.localStorage[storage_name] = new_db;
            }
            scope.$apply();
        });
        return db.promise;
    };

    var resolved_account = null;
    var getAccountInfo = function(scope) {
        var account_info = q.defer();
        if (resolved_account) {
            account_info.resolve(resolved_account);
            return account_info.promise;
        }
        window.dropboxClient.getAccountInfo(function(error, info) {
            if (error) {
                account_info.reject(error);
            } else {
                resolved_account = info;
                account_info.resolve(info);
            }
            scope.$apply();
        });
        return account_info.promise;
    };

    var dropbox = {
        getAccountInfo: getAccountInfo,
        syncPasswordDB: syncPasswordDB,
        putPasswordDB: putPasswordDB,
        lastSync: lastSync
    };
    return dropbox;
}]);

var DropboxController = ['$scope', '$location', 'dropbox', function(scope, location, dropbox) {
    scope.dropbox = dropbox;

    scope.account_info = {email: 'loading…'};
    dropbox.getAccountInfo(scope).then(function(info) {
        scope.account_info = info;
    });
}];

app.factory('pkey', [function() {
    openpgp.init();

    var storage_name = 'jspw:pkey'
    var key = window.localStorage[storage_name];

    var saveKey = function(value) {
        key = value;
        window.localStorage[storage_name] = value;
    };

    var pkey = {
        key: function() { return key; },
        saveKey: saveKey
    };
    return pkey;
}]);

var KeyController = ['$scope', '$location', 'pkey', function(scope, location, pkey) {
    scope.key = pkey.key();

    scope.saved = false;
    scope.changed = false;

    scope.$watch('key', function(newVal, oldVal) {
        if (oldVal != newVal) {
            scope.saved = false;
            scope.changed = true;
        }
    });

    scope.save = function() {
        pkey.saveKey(scope.key);
        scope.saved = true;
    };
}];

var DecodeController = ['$scope', '$location', 'pkey', 'dropbox', '$timeout', function(scope, location, pkey, dropbox, timeout) {
    if (!pkey.key()) {
        location.path('/key');
    };

    var getPublicKey = function() {
        var key = openpgp.read_privateKey(pkey.key())[0]
        return openpgp.read_publicKey(key.extractPublicKey());
    };

    var encrypt_json = function(data) {
        return openpgp.write_encrypted_message(getPublicKey(), JSON.stringify(data));
    };

    var encrypt = function(data) {
        var keys = _.keys(data).sort();
        var values = [];
        _.each(keys, function(key) {
            values.push(encrypt_json(data[key]));
        });
        keys = encrypt_json(keys);
        return JSON.stringify({keys: keys, values: values});
    };

    scope.ago = dropbox.lastSync();

    scope.sync = function() {
        dropbox.syncPasswordDB(scope).then(function(data) {
            scope.encryptedDB = JSON.parse(data);
            scope.ago = dropbox.lastSync();
        }, function(error) {
            if (error.status === 404) {
                var empty = encrypt({});
                dropbox.putPasswordDB(scope, empty).then(function() {
                    scope.encryptedDB = JSON.parse(empty);
                })
            }
        });
    };
    scope.sync();

    scope.$watch('passphrase', function() {
        scope.invalid = false;
    });

    var update_list = function() {
        var sorted = _.keys(scope.decryptedDB).sort();
        var list = [];
        _.each(sorted, function(key) {
            list.push({name: key, data: scope.decryptedDB[key]});
        });
        scope.decrypted_list = list;
    };

    var update_selected_list = function() {
        var sorted = _.keys(scope.selected_item.data).sort();
        var list = [];
        _.each(sorted, function(key) {
            list.push({name: key, value: scope.selected_item.data[key]});
        });
        scope.selected_item.list = list;
    };

    var quit_edition = function() {
        scope.editing = false;
        scope.adding = false;
        delete scope.old_name;
        delete scope.old_item;
        update_list();
        if (scope.selected_item) {
            scope.selected_item.data = scope.decryptedDB[scope.selected_item.name];
            update_selected_list();
        }
    };

    /* Scope */

    scope.search = '';

    scope.decrypt = function() {
        if (!scope.passphrase) {
            return;
        }
        scope.private_key = openpgp.read_privateKey(pkey.key())[0];
        scope.invalid = !scope.private_key.decryptSecretMPIs(scope.passphrase);
        if (scope.invalid) {
            return;
        }
        var keys = scope.decrypt_json(scope.encryptedDB.keys);
        var db = {};
        _.each(keys, function(key, index) {
            db[key] = scope.encryptedDB.values[index];
        });
        scope.decryptedDB = db;
        update_list();
    };

    scope.decrypt_json = function(data) {
        var msg = openpgp.read_message(data)[0];
        var sess_key = msg.sessionKeys[0];
        var keymat = {
            key: scope.private_key,
            keymaterial: scope.private_key.subKeys[0]
        };
        keymat.keymaterial.decryptSecretMPIs(scope.passphrase);
        return JSON.parse(msg.decrypt(keymat, sess_key));
    };

    scope.lock = function() {
        delete scope.decrypted_list;
        delete scope.passphrase;
        delete scope.decryptedDB;
    };

    scope.select = function(item) {
        quit_edition();
        if (typeof item.data === 'string') {
            item.data = scope.decrypt_json(item.data);
        }
        scope.selected_item = item;
        update_selected_list();
    };

    scope.deselect = function() {
        delete scope.selected_item;
    };

    scope.delete = function() {
        var name = scope.selected_item.name;
        if (window.confirm('Are you sure you want to delete the information for "' + name + '"?') === true) {
            delete scope.decryptedDB[name];
            update_list();
            scope.deselect();
        }
    };

    scope.edit = function() {
        scope.editing = true;
        scope.old_name = scope.selected_item.name;
        scope.old_item = JSON.stringify(scope.selected_item);
    };

    scope.add = function() {
        scope.editing = true;
        scope.adding = true;
        scope.selected_item = {name: '', list: [{name: '', value: ''}]};
    };

    scope.add_pair = function() {
        if (!scope.editing) {
            return;
        }
        scope.selected_item.list.push({name: '', value: ''});
    };

    scope.save = function() {
        if (scope.old_name && scope.old_name != scope.selected_item.name) {
            delete scope.decryptedDB[scope.old_name];
        };

        var data = {};
        _.each(scope.selected_item.list, function(item) {
            if (item.name.length && item.value.length) {
                data[item.name] = item.value;
            }
        });
        scope.decryptedDB[scope.selected_item.name] = data;
        quit_edition();

        var enc = encrypt(scope.decryptedDB);
        dropbox.putPasswordDB(scope, enc).then(function() {
            scope.encryptedDB = JSON.parse(enc);
        })
    };

    scope.cancel = function() {
        if (scope.old_item) {
            var old_item = JSON.parse(scope.old_item);
            scope.decryptedDB[old_item.name] = old_item.data;
        } else {
            delete scope.selected_item;
        }
        quit_edition();
    };
}];

app.config(['$routeProvider', function(routeProvider) {
    routeProvider
        .when('/key', {
            templateUrl: 'key.html',
            controller: 'KeyController'
        })
        .otherwise({
            templateUrl: 'decode.html',
            controller: 'DecodeController'
        })
}]);

angular.bootstrap(document, ['app']);
