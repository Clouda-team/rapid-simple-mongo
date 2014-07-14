/**
 * New node file
 */
var dboper = require("../start.js");
var log = require("rapid-log")({LEVEL:"INFO"});
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
					cb.apply(null,args);
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
	var ac = new asyncAllDone();
	ac.finish = update;
	for(var i=0; i < 50; i++){
		tt.insert("demo",{a:300, b:i + 100},ac.run(function(err){
			log.info("insert on done! ");
		}));
	}
};

var update = function(){
	var ac = new asyncAllDone();
	for(var i=0; i < 50; i++){
		tt.update("demo",{ b : i + 100 },{$set:{
			'mod' : i % 3
		}},ac.run(function(err){
			log.info("update on done! ");
		}));
	}
	ac.finish = find;
}

var find = function(){

	var ac = new asyncAllDone();
	var acsave = new asyncAllDone();
	acsave.doneList = [];
	
	acsave.finish = function(){
		log.info("save done! [%d] [%s]",acsave.doneList.length, acsave.doneList.join(","));
	}
	ac.sum = 0;
	for(var i=0;i<3;i++){
		tt.find("demo",{mod:i},ac.run(function(err,rs){
		
			if(err){
				log.err(err.stack || err);
				return;
			}
			ac.sum += rs.length;
			log.info("find result [%d] check this [%s]" , rs.length, inspect(rs[0]));
		
			rs.forEach(function(item){
			
				var id = item["_id"].toString();
				
				item.foreach = true;
				
				tt.save("demo",item,acsave.run(function(err){
					acsave.doneList.push(id);
				}));
				
			});
			
		}));
	}
	
	ac.finish = end.bind(ac);
}

var end = function(){

	log.info("find mod, sum:" , this.sum);
	
	tt.remove("demo",{b:{$ne:100}},function(err){
	
		log.info("remove all done! waiting 15s and execute the findOne");
		
		setTimeout(function(){
			tt.findOne("demo",{b:100},function(err,item){
				log.info("all done!  last result for 'findOne' :  %s" , inspect(item));
			});
		},1000 * 15);
		
	});
}