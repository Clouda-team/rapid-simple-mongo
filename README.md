#rapid-simple-mongo

> simple to use the mongodb 

##What is this?
用于rapid框架的mongodb插件, 由于在公共集群中的持久链接会造成集群资源的额外开销,多数公共数据库都有连接数及空闲时间限制,所以在直接使用mongodb driver并复用db对像时driver的自动重连逻辑稳定性较差(特别是在需要认证的情况下.),基于以上情况,这里提供一个简易包装处理.以短链方式操作db,用于完成一般性的数据操作任务,只提供常用的find,findOne,insert,remove,update,save,count等几个方法.
##API

###simpleMongo.getAgent(dburl,opts);
创建一个由dburl指定的db的连接对像. 返回ClientAgent

dburl {string} mongodb的connect string. 具体请参照 [MongoDB Connection URI](http://docs.mongodb.org/manual/reference/connection-string/).

opts {object} 配置信息, 基于MongoClient.connect(dbur,opts)的opts对像.具有connect的opts的全部属性,并增加用于限制空闲时间的idle属性,单位为毫秒.默认为30秒



###simpleMongo.connect(dburl,cb);
将直接调用原始的 mongoClient.connect(dburl,cb);

###simpleMongo.getMongodb();
直接返回require("mongodb")的原始对像.

###ClientAgent
查询对像,具有以下几个一般查询方法.
####ClientAgent.find(collectionName,selector,[opts],callback);
####ClientAgent.findOne(collectionName,selector,[opts],callback);
####ClientAgent.insert(collectionName,docs,[opts],callback);
####ClientAgent.update(collectionName,selector,[opts],opts,callback);
####ClientAgent.remove(collectionName,selector,[opts],callback);
####ClientAgent.save(collectionName,doc,[opts],callback);
####ClientAgent.count(collectionName,doc,[opts],callback);
