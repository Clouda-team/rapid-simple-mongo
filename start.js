/**
 * New node file
 */
var Mongodb = require("mongodb");
var MongoClient = Mongodb.MongoClient;
var querystring = require("querystring");
var EventEmitter = require('events').EventEmitter;
var _extend = require('util')._extend;
var inherits = require('util').inherits;
var inspect = require('util').inspect;
var log = GLOBAL.log || console;

if(log == console){
	log.dev = console.log;
}

/** 
 * format an object to the uriString;
 * 
 * the Reference of MongoDB connection URI
 * [http://docs.mongodb.org/manual/reference/connection-string/]
 * 
 * to use the url from returns , make sure the value of the option [uri_decode_auth] for the MongoClient.connect(urlStr,option) is true;
 * 
 * @param {Object}
 * @return {String} 
 * 		format : mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]
 */
var connectObjToUri = function(obj){
	var uriStr = "mongodb://";
	var hostStr;
	// process the default values;
	
	if(typeof(obj) == "object"){
		obj.host = obj.host || "localhost";
		obj.dbname = obj.dbname || "test";
	}
	
	if(obj.username !== undefined){
		uriStr += encodeURIComponent(obj.username);
		if(obj.password){
			uriStr += ":" + encodeURIComponent(obj.password);
		}
		uriStr += "@";
	}
	
	if(Array.isArray(obj.hosts) === true){
		hostStr = [];
		obj.hosts.forEach(function(item){
			var str = ""
			if(item.host){
				str = item.host;
				if(item.port != undefined){
					str += ":" + item.port;
				}
			}
			hostStr.push(str);
		});
		
		uriStr += hostStr.join(",");
		
	}else if(obj.host){
		uriStr += obj.host;
		if(obj.port != undefined){
			uriStr += ":" + obj.port;
		}
	}
	
	uriStr += "/" + obj.dbname;
	
	if(obj.opts){
		uriStr += "?" + querystring.stringify(obj.opts);
	}
	
	return uriStr;
}

/**
 * 短链代理..
 * 由于多数公共数据库都有连接数及空闲时间限制,
 * 所以直接使用mongodb driver需要做重连控制与认证控制
 * 这里直接对以上行为进行包装处理.自动进行连接及重连控制.
 * 
 * 基本策略:
 * 	1. 无查询时不连接
 *  2. 有查询结果时不断开
 *  3. 空闲超时自动断开
 *  4. 重连时自动认证
 *  5. 只有最常用的数据操作方法.
 */

var sortAgent = function(dburl,opts){
	
	opts = opts || {};
	
	var idle = opts.idle || 1000 * 30;	// 空闲时间. 超时将自动关闭连接.
	var waitingCount = 0;
	var db = null , isConnect = false , isConnecting = false;
	var __dburl = "";
	
	var operations = [];
	var collectionCache = {};
	
	var idleTimer = false;
	var me = this;
	
	switch(typeof(dburl)){
		case "string" :
			__dburl = dburl;
			break;
		case "object" :
			// 如果是object,表示未使用url的方式, 需要转为dburl
			__dburl = connectObjToUri(dburl);
			break;
		default:
			throw new Error("dburl mast be a connection uri or connection object");
	}
	var reconnect = 0;
	var connect = this.__connect = function(){
		
		if(isConnecting == true || isConnect == true){
			// 连接中,或已有连接,则跳过.
			return;
		}
		
		isConnecting = true;
		
		MongoClient.connect(__dburl,opts || {} ,function(err,_db){
			
			if(err){
				isConnecting = false;
				
				if(reconnect++ < 10){
					log.err("reconnect : " + err.message + ", " + reconnect);
					setTimeout(connect,4000);
				}else{
					me.emit("error",err);
				}
				return;
			}
			
			log.info("connect to mongodb, %s" , __dburl);
			isConnect = true;
			isConnecting = false;
			reconnect = 0;
			db = _db;
			setImmediate(doJob);
		});
	};
	
	var close = this.__close = function(){
		log.info("close!!");
		db.close();
		for(var key in collectionCache){
			delete collectionCache[key];
		}
		db = isConnect = idleTimer = false;
	};
	
	var doJob = function(){
		
		// 无工作内容,等待超时
		if(operations.length != 0){
		
			// 无连接,等待连接;
			if(isConnect != true){
				connect();
				return;
			}
			
			debugger;
			// 有工作,有连接..干活.
			var cname , collection , args;
			// 一但执行就直接从数组中移除.
			while(item = operations.pop()){
				
				log.dev( "do job , \n\t %s \n", inspect(item) );
				
				cname = item.cname;
				collection = collectionCache[cname];
				
				if(!collection){
					collection = collectionCache[cname] = db.collection(cname);
				}
				
				args = item.args.concat((function(cb){
					// 代理回调方法, 用于记数及关闭db连接
					return function(err,rs){
						
						waitingCount--;
						
						log.dev("execute ok!! [%d]" , waitingCount);
						
						cb.apply(null,arguments);
						
						if(waitingCount <= 0 && idleTimer == false){
							log.info("waiting idle!");
							idleTimer = setTimeout(function(){
								close();
							},idle);
						}
					};
				})(item.cb));
				
				// create async;
				setImmediate((function(type,collection,args){
					collection[type].apply(collection,args);
				})(item.type,collection,args));
				
				waitingCount++;
			}
			
			return;
		}
	};
	
	this.getDbUrl = function(){
		return __dburl;
	};
	
	this.__done = function(){
		
	};
	
	this.__push = function(cname,type,args,cb){
		var job = {
				cname : cname,
				type : type,
				args: args,
				cb:cb
		};
		operations.push(job);
		
		clearTimeout(idleTimer);
		idleTimer = false;
		
		setImmediate(doJob);
	};
	
	EventEmitter.call(this);
};

/**
 * 仅支持常用的增删改查.
 */
sortAgent.prototype = _extend({
	find:function(cname,selector,opts,cb){
		
		
		var _cb = cb || opts || selector;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [selector,opts];
			}else if(_cb == opts){
				args = [selector];
			}else{
				args = [];
			}
			
			this.__push(cname,"find",args,function(err,rs){
				
				if(err){
					_cb(err);
					return;
				}
				
				rs.toArray(_cb);
			});
			
		}else{
			throw new Error("missing arguments!");
		}
		
		
	},
	findOne:function(cname,selector,opts,cb){
		var _cb = cb || opts || selector;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [selector,opts];
			}else if(_cb == opts){
				args = [selector];
			}else{
				args = [];
			}
			
			this.__push(cname,"findOne", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	},
	insert:function(cname,doc,opts,cb){
		var _cb = cb || opts;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [doc,opts];
			}else if(_cb == opts){
				args = [doc];
			}
			
			this.__push(cname,"insert", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	},
	remove:function(cname,selector,opts,cb){
		var _cb = cb || opts;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [selector,opts];
			}else if(_cb == opts){
				args = [selector];
			}
			
			this.__push(cname,"remove", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	},
	save:function(cname,docs,opts,cb){
		var _cb = cb || opts;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [docs,opts];
			}else if(_cb == opts){
				args = [docs];
			}
			
			this.__push(cname,"save", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	},
	update:function(cname,selector,doc,opts,cb){
		var _cb = cb || opts;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [selector,doc,opts];
			}else if(_cb == opts){
				args = [selector,doc];
			}else{
				throw new Error("missing arguments!");
			}
			
			this.__push(cname,"update", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	},
	count:function(cname,selector,opts,cb){
		var _cb = cb || opts;
		var args;
		
		if(_cb instanceof Function){
			
			if(_cb == cb){
				args = [selector,opts];
			}else if(_cb == opts){
				args = [selector];
			}
			
			this.__push(cname,"count", args , _cb);
			
		}else{
			throw new Error("missing arguments!");
		}
	}
},EventEmitter.prototype);
	
var exports = {
		// 包装一个短链查询的agent.
		getAgent:function(dburl,opts){
			return new sortAgent(dburl,opts);
		},
		//原始包装
		connect:function(dbUrl,cb){
			MongoClient.connect(dbUrl,cb);
		},
		getMongodb:function(){
			return Mongodb;
		}
};

if(GLOBAL.rapid){
	rapid.plugin.define("rapid-simple-mongo",["rapid-log"],function(mylog,cb){
		log = mylog;
		cb(null,exports);
	});
}else{
	module.exports = exports;
}


