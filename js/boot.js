(function() {
    var scripts = ['openpgp.min', 'angular', 'moment.min', 'underscore.min', 'app'];

    var load_scripts = function() {
        if (scripts.length) {
            var script = document.createElement('script');
            script.setAttribute('type', 'text/javascript');
            script.setAttribute('src', 'js/' + scripts.shift() + '.js');
            script.onload = load_scripts;
            document.body.appendChild(script);
        } else {
            angular.bootstrap(document, ['app']);
        }
    };

    var boot = function() {
        var url = window.location.origin + window.location.pathname;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + 'app-key', false);
        xhr.send(null);
        var client = new Dropbox.Client({key: xhr.responseText.trim()});
        var driver = client.authDriver(new Dropbox.AuthDriver.Redirect({
            receiverUrl: url
        }));

        client.authenticate(function(err, client) {
            if (!err) {
                window.dropboxClient = client;
                load_scripts();
            }
        });
    };

    if (document.readyState === 'complete') {
        setTimeout(boot);
    } else {
        document.addEventListener("DOMContentLoaded", boot, false);
    }
})();
