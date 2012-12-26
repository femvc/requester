requester
=========

功能强大的ajax异步请求管理库。

    function doit() {
        //注: test.json -> {"message":{},"success":"true","result":[]}
        Requester.get('ajax/test.json','',function(data){
            alert(data.success)
        });
    
        //注: 跨域会导致请求出错
        Requester.get('http://www.5imemo.com/other/ajax/jsonp.php','',function(data){alert(data.success)});
        
        //注: 跨域会导致请求出错
        Requester.JSONP('http://www.5imemo.com/other/ajax/jsonp.php','',function(data){  
            alert(data.id)
        });
    }
