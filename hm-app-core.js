/**
 * @ClassName hm-app-core
 * @Author zliu
 * @Version 0.0.2
 * @Date 2018/2/6
 * @Email zliu@handsmap.cn
 */
// http-auth 提供authService
(function () {
  'use strict';
  angular.module('http-auth-interceptor-buffer', []).factory('httpBuffer', [
    '$injector',
    function ($injector) {
      var buffer = [];
      var $http;
      function retryHttpRequest(config, deferred) {
        function successCallback(response) {
          deferred.resolve(response);
        }
        function errorCallback(response) {
          deferred.reject(response);
        }
        $http = $http || $injector.get('$http');
        $http(config).then(successCallback, errorCallback);
      }
      return {
        append: function (config, deferred) {
          return buffer.push({
            config: config,
            deferred: deferred
          });
        },
        rejectAll: function (reason) {
          if (reason) {
            for (var i = 0; i < buffer.length; ++i) {
              buffer[i].deferred.reject(reason);
            }
          }
          buffer = [];
        },
        retryAll: function (updater) {
          console.log(buffer);
          for (var i = 0; i < buffer.length; ++i) {
            var _cfg = updater(buffer[i].config);
            if (_cfg !== false)
              retryHttpRequest(_cfg, buffer[i].deferred);
          }
          buffer = [];
        }
      };
    }
  ]);
}());
(function () {
  'use strict';
  angular.module('http-auth-interceptor', ['http-auth-interceptor-buffer']).factory('authService', [
    '$rootScope',
    'httpBuffer',
    function ($rootScope, httpBuffer) {
      return {
        loginConfirmed: function (data, configUpdater) {
          var updater = configUpdater || function (config) {
              return config;
            };
          $rootScope.$broadcast('event:auth-loginConfirmed', data);
          httpBuffer.retryAll(updater);
        },
        loginCancelled: function (data, reason) {
          httpBuffer.rejectAll(reason);
          $rootScope.$broadcast('event:auth-loginCancelled', data);
        }
      };
    }
  ]).config([
    '$httpProvider',
    function ($httpProvider) {
      $httpProvider.interceptors.push([
        '$rootScope',
        '$q',
        'httpBuffer',
        function ($rootScope, $q, httpBuffer) {
          return {
            request: function (config) {
              // delete Authorization
              if (config.url != undefined && config.url.indexOf('authenticate') > -1) {
                if (config.headers && config.headers.hasOwnProperty('Authorization')) {
                  delete config.headers['Authorization'];
                }
              }
              return config;
            },
            responseError: function (rejection) {
              var config = rejection.config || {};
              if (!config.ignoreAuthModule) {
                switch (rejection.status) {
                case 401:
                  var deferred = $q.defer();
                  var bufferLength = httpBuffer.append(config, deferred);
                  if (config.url.indexOf('authenticate') > -1) {
                    // 登录接口401 不处理 返回原请求
                    console.log('\u767b\u5f55\u63a5\u53e3401 \u4e0d\u5904\u7406 \u8fd4\u56de\u539f\u8bf7\u6c42');
                    return deferred.promise;
                  }
                  if (bufferLength === 1)
                    $rootScope.$broadcast('event:auth-loginRequired', rejection);
                  return deferred.promise;
                case 403:
                  var deferred = $q.defer();
                  var bufferLength = httpBuffer.append(config, deferred);
                  if (bufferLength === 1)
                    $rootScope.$broadcast('event:auth-forbidden', rejection);
                  return deferred.promise;  // $rootScope.$broadcast('event:auth-forbidden', rejection);
                                            // break;
                }
              }
              // otherwise, default behaviour
              return $q.reject(rejection);
            }
          };
        }
      ]);
    }
  ]);
}());
// hmAppCore 注入拦截器
angular.module('hmAppCore', [
  'ionic',
  'http-auth-interceptor'
]).run([
  '$ionicPlatform',
  function ($ionicPlatform) {
    $ionicPlatform.ready(function () {
      if (window.cordova && window.cordova.plugins.Keyboard) {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
        // Don't remove this line unless you know what you are doing. It stops the viewport
        // from snapping when text inputs are focused. Ionic handles this internally for
        // a much nicer keyboard experience.
        cordova.plugins.Keyboard.disableScroll(true);
      }
      if (window.StatusBar) {
        StatusBar.styleDefault();
      }
    });
  }
]);
// 检查常量定义
if (HMConfig != null) {
  // 判断是否需要自动刷新Token
  if (!HMConfig.hasOwnProperty('AUTOREFRSHTOKEN')) {
    HMConfig.AUTOREFRSHTOKEN = false;
  }
  angular.module('hmAppCore').constant('Conf', HMConfig);
}
// service
// Storage 存储
angular.module('hmAppCore').factory('Storage', function () {
  return {
    set: function (key, data) {
      return window.localStorage.setItem(key, window.JSON.stringify(data));
    },
    get: function (key) {
      return window.JSON.parse(window.localStorage.getItem(key));
    },
    remove: function (key) {
      return window.localStorage.removeItem(key);
    },
    clear: function () {
      window.localStorage.clear();
    }
  };
});
// 网络请求
angular.module('hmAppCore').factory('HttpAuth', [
  '$rootScope',
  'Storage',
  'authService',
  '$q',
  '$http',
  function ($rootScope, Storage, authService, $q, $http) {
    initJWTListener();
    var authHttp = {};
    var AUTH_PREFIX = 'Bearer ';
    var extendHeaders = function (config) {
      if (config.length == 2) {
        config = {
          timeout: 30000,
          headers: {}
        };
      }
      config.timeout = 30000;
      if (!config.hasOwnProperty('headers')) {
        config.headers = { Authorization: '' };
      }
      if (getJwtToken()) {
        config.headers.Authorization = AUTH_PREFIX + getJwtToken();
      }
      return config;
    };
    angular.forEach([
      'get',
      'delete',
      'head',
      'jsonp'
    ], function (name) {
      authHttp[name] = function (url, config) {
        config = config || {};
        config = extendHeaders(config);
        return $http[name](url, config);
      };
    });
    angular.forEach([
      'post',
      'put'
    ], function (name) {
      authHttp[name] = function (url, data, config) {
        config = config || { 'Content-Type': 'application/json' };
        var headers = { headers: config };
        headers = extendHeaders(headers);
        return $http[name](url, data, headers);
      };
    });
    return authHttp;
    function initJWTListener() {
      $rootScope.$on('event:auth-loginConfirmed', function (event, data) {
        // 获取token成功
        console.log('loginConfirmed');
      });
      $rootScope.$on('event:auth-loginRequired', function (event, data) {
        if (HMConfig.AUTOREFRSHTOKEN) {
          // 开启自动刷新token功能
          // 401
          refreshToken().then(function (token) {
            setJwtToken(token);
            authService.loginConfirmed('success', function (config) {
              config.headers['Authorization'] = AUTH_PREFIX + token;
              return config;
            });
          }, function (error) {
            console.log(error);
          });
        }
      });
      $rootScope.$on('event:auth-forbidden', function (event, data) {
        // 403
        // 检查存储的token是否为空 空的话请求token 否则不处理
        var token = getJwtToken();
        if (null == token || token == undefined) {
          refreshToken().then(function (token) {
            setJwtToken(token);
            authService.loginConfirmed('success', function (config) {
              config.headers['Authorization'] = AUTH_PREFIX + token;
              return config;
            });
          }, function (error) {
            console.log(error);
          });
        }
      });
    }
    function refreshToken() {
      var userName = HMConfig.USERNAME;
      var userPwd = HMConfig.USERPWD;
      var params = {
          username: userName,
          password: userPwd,
          rememberMe: true
        };
      var deffered = $q.defer();
      authHttp.post(HMConfig.GATEWAYURL + 'api/authenticate', JSON.stringify(params)).success(function (data) {
        if (data && data.id_token) {
          deffered.resolve(data.id_token);
        } else if (data) {
          deffered.reject(data);
        }
      }).error(function (error) {
        deffered.reject(error);
      });
      return deffered.promise;
    }
    function setJwtToken(token) {
      if (token)
        Storage.set(HMConfig.TOKENID, token);
    }
    function getJwtToken() {
      return Storage.get(HMConfig.TOKENID);
    }
  }
]);
// BlankCtrl
angular.module('hmAppCore').controller('BlankCtrl', [
  '$scope',
  '$ionicHistory',
  function ($scope, $ionicHistory) {
    $scope.goBack = function () {
      $ionicHistory.goBack();
    };
  }
]);