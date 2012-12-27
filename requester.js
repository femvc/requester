'use strict'; 
//    ____     ____                _   _     ____          ____      ____                   
//  /\  __\  /\  __\    /'\_/`\  /\ \/\ \  /\  __`\      /\  __`\  /\  __`\    /'\_/`\      
//  \ \ \_/_ \ \ \_/_  /\      \ \ \ \ \ \ \ \ \ \_\     \ \ \ \_\ \ \ \ \ \  /\      \     
//   \ \  __\ \ \  __\ \ \ \_/\_\ \ \ \ \ \ \ \ \  __     \ \ \  __ \ \ \ \ \ \ \ \_/\_\    
//    \ \ \_/  \ \ \_/_ \ \ \\ \ \ \ \ \_/ \ \ \ \_\ \  __ \ \ \_\ \ \ \ \_\ \ \ \ \\ \ \   
//     \ \_\    \ \____/ \ \_\\ \_\ \ `\___/  \ \____/ /\_\ \ \____/  \ \_____\ \ \_\\ \_\  
//      \/_/     \/___/   \/_/ \/_/  `\/__/    \/___/  \/_/  \/___/    \/_____/  \/_/ \/_/  
//                                                                                          
//                                                                                          

/**
 * Requester请求管理器
 */

var Requester = {
    /**
     * 全局事件处理接口 注：不支持onsuccess
     *
     * @Map {'ontimeout':function(){},'onfailure':function(){}}
     */
    handler:{},
    /** 
     * 创建XMLHttpRequest对象 
     *
     * @return {XMLHttpRequest} XMLHttpRequest对象 
     * @description 使用缓存模式避免每次都检测浏览器类型
     */ 
    createOriginalXHRObject: function () {
        var me = this,
            i,
            list,
            len,
            xhr = null,
            methods = [
                function () {return new ActiveXObject('Microsoft.XMLHTTP');},
                function () {return new XMLHttpRequest();}, 
                function () {return new ActiveXObject('Msxml2.XMLHTTP');}
            ];
            
        for (i = 0, len = methods.length; i < len; i++) {
            try {
                xhr = methods[i]();
                this.createOriginalXHRObject = methods[i];
                break;
            } catch (e) {
                continue;
            }
        }
        if (!xhr) {
            throw new Error(100000,'Requester.createXHRObject() fail. Your browser not support XHR.');
        }
        
        return xhr;
    },
    /** 
     * 预置XMLHttpRequest对象 
     *
     * @return {XMLHttpRequest} XMLHttpRequest对象 
     * @description 
     */ 
    createXHRObject: function () {            
        var me = this,
            xhr = {};
        xhr.xhr = me.createOriginalXHRObject();
        xhr.eventHandlers = {};
        xhr.fire = me.creatFireHandler();
        //标示是否是本地调试
        xhr.online = (/^https?:$/i.test(window.location.protocol));
        
        return xhr;
    },
    /** 
     * 生成新的触发事件方法 
     *
     * @param {String} type 事件类型 
     */ 
    creatFireHandler: function(){
        return function (type) { 
            type = 'on' + type; 
            var xhr = this,
                handler = xhr.eventHandlers[type], 
                globelHandler = window.Requester.handler[type],
                data; 
            /**
             * 注：在这里使用了setTimeout来断开xhr的链式作用域，如果不使用setTimeout
             * 会发现在连接池开启的情况下
             * Requester.get('tpl.html','',function(){Requester.get('tpl.html','',function(){alert(1)});});
             * 永远不会执行alert(1);单步跟进会发现xhr的readyState到3就停住了。
             */
            
            // 不对事件类型进行验证 
            if (handler) { 
                if (xhr.tick) { 
                  clearTimeout(tick); 
                } 

                if (type != 'onsuccess') { 
                    window.setTimeout(function(){handler(xhr);}, 0); 
                } else { 
                    //处理获取xhr.responseText导致出错的情况,比如请求图片地址. 
                    try { 
                        xhr.xhr.responseText; 
                    } catch(error) { 
                        window.setTimeout(function(){handler(xhr);}, 0); 
                        return ; 
                    } 
                    var text = xhr.xhr.responseText.replace(/^\s+/ig, ""); 
                    if(text.indexOf('{') === 0){ 
                        //{success:true,message: 
                        //插入表单验证错误提示 
                        var JSONParser; 
                        try { 
                            JSONParser = new Function("return " + text + ";");
                            data = JSONParser();
                        } 
                        //如果json解析出错则尝试移除多于逗号再试 
                        catch (e){ 
                            JSONParser = new Function("return " + window.Requester.removeJSONExtComma(text) + ";"); 
                            data = JSONParser();
                        } 
                        
                        //更新用户状态, 注: 每次请求都会返回用户状态
                        if (bui && bui.Permission && bui.Permission.updateStatus){ 
                            bui.Permission.updateStatus(data); 
                        } 
                        
                        if ( String(data.success).replace(/\s/ig,'').toLowerCase() !== 'true' ) { 
                            // 当后端验证失败时
                            if (Requester.backendError && xhr.eventHandlers['action']) {
                                Requester.backendError(xhr, data);
                            }
                        } 
                        window.setTimeout(function(){handler(data);}, 0); 
                    }else{ 
                        window.setTimeout(function(){handler(text);}, 0); 
                    } 
                } 
            } 
            // 检查是否配置了全局事件
            else if (globelHandler) { 
                //onsuccess不支持全局事件 
                if (type == 'onsuccess') { 
                    return; 
                } 
                globelHandler(xhr); 
            }
        };
    },
    /**
     * 检测是否有空闲的XHR或创建新对象
     *
     * @after Requester
     * @comment 使用Facade外观模式修改Requester.request方法
     * 以增加路径权限判断
     */
    getValidXHR: function () {
        var me = this;
        return me.createXHRObject();
    },
    /**
     * request发送请求
     *
     * @url {String} 请求的URL
     * @options {Map} POST的参数，回调函数，MD5加密等
     */ 
    request: function (url, opt_options, xhr) {
        xhr = xhr || this.getValidXHR();
        //权限检测
        url = this.beforeRequest(url, opt_options);
        
        //有可用连接
        if (url && xhr) {
            var me = this,
                options     = opt_options || {}, 
                data        = options.data || "", 
                async       = xhr.online && !(options.async === false), 
                username    = options.username || "", 
                password    = options.password || "", 
                method      = (options.method || "GET").toUpperCase(), 
                headers     = options.headers || {}, 
                timeout     = options.timeout || 0, 
                usemd5      = options.usemd5 || false,
                tick, key, str,
                stateChangeHandler; 
                
            // 将options参数中的事件参数复制到eventHandlers对象中 
            // 这里复制所有options的成员，eventHandlers有冗余 
            // 但是不会产生任何影响，并且代码紧凑
            for (key in options) { 
                xhr.eventHandlers[key] = options[key]; 
            } 
            xhr.url = url;
            
            headers['X-Requested-With'] = 'XMLHttpRequest'; 
            
            try { 
                //提交到服务器端的参数是Map则转换为string
                if(Object.prototype.toString.call(data)==='[object Object]'){ 
                    str = [] 
                    for(key in data){
                        if (key){
                            str.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key])) 
                        }
                    }
                    data = str.join('&');
                }
                
                //使用GET方式提交
                if (method == 'GET') { 
                    if (data) { 
                        url += (url.indexOf('?') >= 0 ? ( data.substr(0,1) == '&' ? '' : '&') : '?') + data; 
                        data = null; 
                    }
                }
                else if (usemd5) {
                    data = window.Requester.encodeMD5(data);
                }
                try {
                    if (username) { 
                        xhr.xhr.open(method, url, async, username, password); 
                    } else { 
                        xhr.xhr.open(method, url, async); 
                    } 
                }
                catch (e) {
                    alert(e);
                }

        
                stateChangeHandler = Requester.fn(me.createStateChangeHandler, xhr);
                if (async) { 
                    xhr.xhr.onreadystatechange = stateChangeHandler; 
                } 
                
                // 在open之后再进行http请求头设定 
                // FIXME 是否需要添加; charset=UTF-8呢 
                if (method == 'POST') { 
                    xhr.xhr.setRequestHeader("Content-Type", 
                        (headers['Content-Type'] || "application/x-www-form-urlencoded")); 
                } 
                
                for (key in headers) { 
                    if (headers.hasOwnProperty(key)) { 
                        xhr.xhr.setRequestHeader(key, headers[key]); 
                    } 
                } 
                
                xhr.fire('beforerequest'); 
                
                if (timeout) { 
                  xhr.tick = setTimeout(function(){ 
                    xhr.xhr.onreadystatechange = window.Requester.blank; 
                    xhr.xhr.abort(); 
                    xhr.fire("timeout"); 
                  }, timeout); 
                } 
                xhr.xhr.send(data);

                if (!async) { 
                    stateChangeHandler.call(xhr); 
                } 
            } catch (ex) { 
                xhr.fire('failure'); 
            } 
        }
    },
    /** 
     * readyState发生变更时调用 
     *
     * @ignore 
     */ 
    createStateChangeHandler: function() { 
        var xhr = this;//window.console.log(xhr.readyState);
        if (xhr.xhr.readyState == 4) { 
            try { 
                var stat = xhr.xhr.status; 
            } catch (ex) { 
                // 在请求时，如果网络中断，Firefox会无法取得status 
                xhr.fire('failure'); 
                return; 
            } 
            
            xhr.fire(stat); 
            
            // http://www.never-online.net/blog/article.asp?id=261 
                // case 12002: // Server timeout 
                // case 12029: // dropped connections 
                // case 12030: // dropped connections 
                // case 12031: // dropped connections 
                // case 12152: // closed by server 
                // case 13030: // status and statusText are unavailable 
                
            // IE error sometimes returns 1223 when it
            // should be 204, so treat it as success 
            if ((stat >= 200 && stat < 300) 
                || stat == 304 
                || stat == 1223) { 
                xhr.fire('success'); 
            } else { 
                if (stat === 0 && !xhr.online) {
                    xhr.fire('success'); 
                }
                else {
                    if (stat === 0 && window.console && window.console.log) {
                        window.console.error('XHR Error: Cross domain, cannot access: %s.',xhr.url);
                    }
                    xhr.fire('failure'); 
                }
            } 
            
            /* 
             * NOTE: Testing discovered that for some bizarre reason, on Mozilla, the 
             * JavaScript <code>XmlHttpRequest.onreadystatechange</code> handler 
             * function maybe still be called after it is deleted. The theory is that the 
             * callback is cached somewhere. Setting it to null or an empty function does 
             * seem to work properly, though. 
             *
             * On IE, there are two problems: Setting onreadystatechange to null (as 
             * opposed to an empty function) sometimes throws an exception. With 
             * particular (rare) versions of jscript.dll, setting onreadystatechange from 
             * within onreadystatechange causes a crash. Setting it from within a timeout 
             * fixes this bug (see issue 1610). 
             *
             * End result: *always* set onreadystatechange to an empty function (never to 
             * null). Never set onreadystatechange from within onreadystatechange (always 
             * in a setTimeout()). 
             *
            window.setTimeout(function() { 
                // 避免内存泄露. 
                // 由new Function改成不含此作用域链的 window.Requester.blank 函数, 
                // 以避免作用域链带来的隐性循环引用导致的IE下内存泄露. By rocy 2011-01-05 . 
                xhr.onreadystatechange = window.Requester.blank; 
                if (xhr.eventHandlers['async']) { 
                    xhr = null; 
                } 
            }, 0); */
            
            if (window.Requester.checkQue) {
                window.setTimeout(window.Requester.checkQue, 0);
            }
        } 
    },
    /**
     * encodeMD5加密提交的数据
     *
     * @data {String} 需要加密的paramString
     * @return {String} 加密后的paramString
     */ 
    encodeMD5: function (data) {
        var paramstr = Base64.encode(data).replace(/\+/g,'*');
        var md5 = String(MD5.encode(paramstr)).toUpperCase();
        paramstr = paramstr.split('');
        paramstr.reverse();

        return 'result=' + md5 + paramstr.join('');
    }
};
/**
 * 不含任何作用域的空函数
 */
Requester.blank = function(){};
/** 
 * 为对象绑定方法和作用域
 * @param {Function|String} handler 要绑定的函数，或者一个在作用域下可用的函
数名
 * @param {Object} obj 执行运行时this，如果不传入则运行时this为函数本身
 * @param {args* 0..n} args 函数执行时附加到执行时函数前面的参数
 *
 * @returns {Function} 封装后的函数
 */
Requester.fn = function(func, scope){
    if(Object.prototype.toString.call(func)==='[object String]'){func=scope[func];}
    if(Object.prototype.toString.call(func)!=='[object Function]'){ throw 'Error "Requester.fn()": "func" is null';}
    var xargs = arguments.length > 2 ? [].slice.call(arguments, 2) : null;
    return function () {
        var fn = '[object String]' == Object.prototype.toString.call(func) ? scope[func] : func,
            args = (xargs) ? xargs.concat([].slice.call(arguments, 0)) : arguments;
        return fn.apply(scope || fn, args);
    };
};
window.Requester = Requester;

/**
 * 移除JSON字符串中多余的逗号如{'a':[',],}',],}
 *
 * @param {string} JSON字符串
 * @return {string} 处理后的JSON字符串
 */
Requester.removeJSONExtComma = function(str) {
    var i,
        j,
        len,
        list,
        c,
        notValue = null,
        preQuot = null,
        lineNum;

    list = String(str).split('');
    for (i = 0, len = list.length; i < len; i++) {
        c = list[i];
        //单引或双引
        if (/^[\'\"]$/.test(c)) {
            if (notValue === null && preQuot === null) {
                notValue = false;
                preQuot = i;
                continue;
            }
            //值
            if (!notValue) {
                //前面反斜杠个数
                lineNum = 0;
                for (j = i - 1; j > -1; j--) {
                    if (list[j] === '\\') {lineNum++;}
                    else { j = -1; }
                }
                //个数为偶数且和开始引号相同
                //结束引号
                if (lineNum % 2 === 0) {
                    if (list[preQuot] === c) {
                        notValue = true;
                        preQuot = -1;
                    }
                }
            }
            //非值
            else {
                //开始引号
                if (preQuot == -1) {
                    preQuot = i;
                    notValue = false;
                }
                //结束引号
                else if (list[preQuot] === c) {
                    notValue = true;
                    preQuot = -1;
                }
            }
        }
        //逗号
        else if (c === ']' || c === '}') {
            //非值
            if (notValue) {
                for (j = i - 1; j > -1; j--) {
                    if (/^[\t\r\n\s ]+$/.test(list[j])) {continue;}
                    else { if (list[j] === ',') list[j] = ''; break; }
                }
            }
        }
    }
    return list.join('').replace(/\n/g,'').replace(/\r/g,'');
};

/**
 * 发送Requester请求
 * @function
 * @grammar Requester.get(url, data[, onsuccess])
 * @param {string}     url         发送请求的url地址
 * @param {string}     data         发送的数据
 * @param {Function} [onsuccess] 请求成功之后的回调函数，function(XMLHttpRequest xhr, string responseText)
 * @meta standard
 * @see Requester.request
 * 
 * @returns {XMLHttpRequest}     发送请求的XMLHttpRequest对象
 */
Requester.get     = function (url, data, onsuccess, action, async) {return Requester.request(url, {'onsuccess': onsuccess,'method': 'GET','data': data,'action': action,'async': async});};
Requester.head    = function (url, data, onsuccess, action, async) {return Requester.request(url, {'onsuccess': onsuccess,'method': 'HEAD','data': data,'action': action,'async': async});};
Requester.post    = function (url, data, onsuccess, action, async) {return Requester.request(url, {'onsuccess': onsuccess,'method': 'POST','data': data,'action': action,'async': async});};
Requester.postMD5 = function (url, data, onsuccess, action, async) {return Requester.request(url, {'onsuccess': onsuccess,'method': 'POST','data': data,'action': action,'async': async,'usemd5': true});};

/*============================================
 * 请求返回自动校验
 ============================================*/
/**
 * 当后端验证失败时自动调用
 *
 * @data {Map} XHR返回的responseText
 * @return {void}
 */
Requester.backendError = function (xhr, data) {
    if (window.bui && bui.Control && bui.Control.getByFormName){
        var errorMap = data.message.field, 
            key, input,formMap={}; 
 
        for (key in errorMap) { 
            input = bui.Control.getByFormName(key, xhr.eventHandlers['action']); 
 
            if (input) { 
                //input.errorMessage = errorMap[key]; 
                //UIManager.validate(input, 'backendError,this'); 
                //input.errorMessage = null; 
                hideError(input.main); 
                showError(input.main,errorMap[key]); 
            } 
        } 
    }
};


/*============================================
 * Requester扩展 - XHR请求池
 ============================================*/
Requester.pool =  [];
Requester.poolsize = 20;
/**
 * 来不及执行的XHR请求队列
 *
 * @after Requester
 */
Requester.que = [];
/**
 * 修改XHR的request方法
 *
 * @after Requester
 */
Requester.sendRequest = Requester.request;
Requester.request = function(url, opt_options){
    //将请求放进队列
    this.que.push({'url':url,'options':opt_options});
    this.checkQue();
};
    


/**
 * checkQue检查队列是否有等待的任务
 *
 * @return {void} 
 */ 
Requester.checkQue = function () {
    var me = Requester,
        req,
        xhr = me.getValidXHR();
    if (xhr) {
        req = me.que.pop();
        if (req && req.url && req.options) {
            me.sendRequest(req.url, req.options, xhr);
        }
    }
};
/**
 * 检测是否有空闲的XHR或创建新对象
 *
 * @after Requester
 * @comment 使用Facade外观模式修改Requester.request方法
 * 以增加路径权限判断
 */
Requester.getValidXHR = function () {
    var me = this,
        i,
        list,
        len,
        xhr = null;
    //找出空闲XHR对象
    for (i = 0, len = me.pool.length; i < len; i++) {
        if (me.pool[i].xhr.readyState == 0 || me.pool[i].xhr.readyState == 4) {
            xhr = me.pool[i];
            xhr.xhr.abort();
            break;
        }
    }
    //假如没有空闲对象且请求池未满，则继续新建
    if (xhr == null && me.pool.length < me.poolsize) {
        xhr = me.createXHRObject();
        me.pool.push(xhr);
    }

    return xhr;
};


/*============================================
 * 发送JSONP请求
 * 
 * @public
 * @param {url String} 请求的地址
 * @param {data String|Object} 发送的参数
 * @param {onsuccess String} 回调函数
 * @param {action String|Object} 发送请求的Action
 * @return {void} 
 ============================================*/

/** 
 * JSONP回调接口MAP 
 */  
Requester.proxy = {};  
Requester.JSONP = function (url, data, onsuccess, action) {
    var me = this,
    //获取可用JSONP对象, 不存在则自动生成
    proxy = me.getValidProxy(action);
    
    proxy['action'] = action;
    proxy['onsuccess'] = onsuccess;
    proxy['status'] = 'send';
    document.getElementById(proxy['id']).src = url + '?rand='+Math.random()+'&callback=Requester.proxy["'+proxy['id']+'"].callback';  
};
/**
 * 返回可用JSONP对象
 * 
 * @private
 * @return {Object}
 */
Requester.getValidProxy = function() {
    var me = this;
    return me.createProxy();
};
/**
 * 工厂模式创建JSONP对象
 *
 * @param {id String} 唯一标识
 * @return {void} 
 */
Requester.createProxy = function(id){
    //this->window.Requester
    var me = this,
        proxy = {};

    proxy.id = id || (new Date()).getTime() + '' + Math.random();
    proxy.status = 'finished';
    proxy.callback = me.creatProxyCallback();
    
    var script = document.createElement('script');       
    script.id = proxy.id;
    script.type = 'text/javascript';
    script.charset = 'utf-8';
    document.getElementsByTagName('head')[0].appendChild(script);
    script = null;

    Requester.proxy[proxy.id] = proxy;

    return proxy;
};
/**
 * 工厂模式创建JSONP对象回调接口
 *
 * @return {void} 
 */
Requester.creatProxyCallback = function(){
    return function(data) {
        //this->JSONP Object
        var proxy = this,
            errorMap,
            key, 
            input, 
            formMap = {}; 

        proxy.status="finished";
        
        //当后端验证失败时, 调用系统验证接口
        if (data && proxy.action && String(data.success).replace(/\s/ig,'').toLowerCase() !== 'true' ) { 
            if (Requester.backendError) {
                Requester.backendError(data);
            }
        } 
        
        //调用用户传入的回调接口
        if (proxy.onsuccess) {
            proxy.onsuccess(data);
        }
    }
};

/*============================================
 * Requester扩展模块 - JSONP请求池
 ============================================*/
/**
 * 返回可用JSONP对象
 * 
 * @private
 * @return {id String} 唯一标识
 */
Requester.getValidProxy = function() {
    var me = this,
        i,
        proxy = null,
        script;
    
    //查找可用JSONP对象
    for (i in me.proxy) {
        if (i && me.proxy[i] && me.proxy[i].status == 'finished') {
            script = document.getElementById(i);
            if (script && window.addEventListener) {
                script.parentNode.removeChild(script);
                proxy = me.createProxy(i);
            }
            break;
        }
    }
    
    return (proxy || me.createProxy());
};
