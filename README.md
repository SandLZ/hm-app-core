#
使用

## 服务

### Storage

- set \(key , value\)

- get \(key\)

- remove \(key\)

- clear \(\)

### HttpAuth

支持 POST、PUT、GET、DELETE等请求方式，支持自动刷新TOKEN.

请求示例：

```js
angular.module('base.services')
.factory('WXService', function (HttpAuth, $q) {
return {
requestWXConfigParams: requestWXConfigParams
};

function requestWXConfigParams() {
var url = window.location.href.split('#')[0];
var deffered = $q.defer();
HttpAuth.get(
'http://192.168.8.68:8080/' + 'wxconfig?url=' + url
).success(function (data) {
if (data && data.data) {
deffered.resolve(data.data);
} else if (data) {
deffered.reject(data.msg);
}
}).error(function (error) {
deffered.reject(error);
});
return deffered.promise;
}

});

```

### Conf

将HMConfig 放到Conf中.

```js
angular.module('hmAppCore')
.constant('Conf', HMConfig);
```


