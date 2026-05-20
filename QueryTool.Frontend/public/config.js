
(function () {
    //  Default environment
    var ENVIRONMENT = "development"; // will be overridden by HOST_MAP if host matches

    //  Hostname → environment mapping
    var HOST_MAP = {
        development: ["localhost:5173", "127.0.0.1:5173"],
        staging: ["query2.adhesionwealth.com"],
        production: ["query2.adhesionwealth.com"]
    };

    // Environment-specific endpoint definitions
    var ENDPOINTS = {
        development: {
            frontends: { primary: "http://localhost:5173" },
            apis: { primary: "http://localhost:5149" }
        },
        staging: {
            frontends: { primary: "https://query2.adhesionwealth.com" },
            apis: { primary: "https://queryapi2.adhesionwealth.com" }
        },
        production: {
            frontends: { primary: "https://query2.adhesionwealth.com" },
            apis: { primary: "https://queryapi2.adhesionwealth.com" }
        }
    };

    // Resolve environment automatically from hostname
    var host = (typeof window !== "undefined" && window.location ? window.location.host : "");
    var resolvedEnv = ENVIRONMENT;
    Object.keys(HOST_MAP).forEach(function (env) {
        if (HOST_MAP[env].some(function (h) { return h.toLowerCase() === host.toLowerCase(); })) {
            resolvedEnv = env;
        }
    });

    // Export runtime config to window
    window.__RUNTIME_CONFIG__ = {
        ENVIRONMENT: resolvedEnv,
        ENDPOINTS: ENDPOINTS
    };
})();
