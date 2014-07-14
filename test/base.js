/**
 * New node file
 */
var dboper = require("../start.js");
var log = require("rapid-log")();
var inspect = require('util').inspect;

var asyncAllDone = function(){
	this.__count = 0;
	this.finish = function(){};
}

asyncAllDone.prototype = {
	run:function(cb){
		var me = this;
		me.__count ++;
		log.info("waiting count: %d" , me.__count);
		return function(){
			var args = arguments;
			//create async
			setImmediate(function(){
				try{
					cb.call(null,args);
				}finally{
					me.__count --;
					if(me.__count == 0 ){
						//create async;
						setImmediate(function(){
							me.finish && me.finish.call(null);
						});
					}
				}
			});

		}
	}
}

//var a1 = new asyncAllDone();
//
//var complete = 0 , t;
//for(var i= 0 ;i <100;i++){
//	t = (1000 * 10) * Math.random(); 	// 乱序分布在10秒内完成
//	log.info("after %d run %d  !",t  / 1000, i);
//	setTimeout(a1.run(function(i){
//		log.info(complete++ , i );
//	}), t , i);
//}
//
//a1.finish = function(){
//	log.info("a1 done, %d", complete);
//};
//return;

var tt = dboper.getAgent({},{
	idle:1000 * 10
});

tt.on("error",function(err){
	log.info("what ?? isn't work??? " + err.stack);
});

tt.remove("demo",{},function(err){
	log.info("remove all done!");
	insert();
});


var insert = function(){
	var inscb = new asyncAllDone();
	for(var i=0;i<10;i++){
		tt.insert("demo",{a:300, b:i + 100},inscb.run(function(err){
			log.info("insert on done! ");
		}));
	}
	
	inscb.done = function(){
		log.info("insert all done!");
		tt.find("demo",{},function(err,rs){
			log.info("find out ! \n\t %s \n ", inspect(rs));
		});
	}
};

var up = 0, uptimer = null;

uptimer = setInterval(function(){
	
	if(up >= 10){
		clearInterval(uptimer);
		setTimeout(function(){
			tt.find("demo",{},function(err,rs){
				log.info("reconnect and find out ! \n\t %s \n ", inspect(rs));
			});
		},1000 * 20);
	}

	tt.update("demo",{},{"$set":{
		e:"update!! " + up++
	}},{multi:true},function(err){
		log.info("update done!");
		tt.find("demo",{},function(err,rs){
			log.info("find out ! \n\t %s \n ", inspect(rs));
		});
	});
},1000 * 5);

log.info("working...");0
return;